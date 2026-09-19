<!--
// Copyright © 2026 Qicky Globaltech Private Limited
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<!--
  Automation administration: every rule in the workspace with its project,
  state and last error; the queue of waiting and retrying actions; failed
  runs of the last week. Switch rules off, retry or cancel deliveries, and
  jump to the project's own automation page.
-->
<script lang="ts">
  import core, { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type AutomationJob, type AutomationRule, type AutomationRun, type Project } from '@hcengineering/tracker'
  import { getCurrentLocation, navigate, Toggle } from '@hcengineering/ui'

  import { recordAudit } from '../../audit'
  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import { ago, DAY } from './sections'

  const client = getClient()
  const rq = createQuery()
  const pq = createQuery()
  const jq = createQuery()
  const runq = createQuery()
  let rules: AutomationRule[] = []
  let projects: Project[] = []
  let jobs: AutomationJob[] = []
  let failedRuns: AutomationRun[] = []
  rq.query(tracker.class.AutomationRule, {}, (r) => { rules = r }, { sort: { name: SortingOrder.Ascending } })
  pq.query(tracker.class.Project, {}, (r) => { projects = r })
  jq.query(tracker.class.AutomationJob, { state: { $in: ['waiting', 'retry', 'failed'] } }, (r) => { jobs = r }, { sort: { runAt: SortingOrder.Ascending }, limit: 300 })
  runq.query(tracker.class.AutomationRun, { ok: false, at: { $gte: Date.now() - 7 * DAY } }, (r) => { failedRuns = r }, { sort: { at: SortingOrder.Descending }, limit: 100 })
  const projectOf = (space: Ref<Project>): Project | undefined => projects.find((p) => p._id === space)
  const projectName = (r: AutomationRule): string => (r.global === true ? 'All projects' : projectOf(r.space)?.identifier ?? '—')
  let search = ''
  let only: 'all' | 'on' | 'off' | 'failing' = 'all'
  $: shown = rules.filter((r) => (search.trim() === '' || `${r.name} ${projectName(r)}`.toLowerCase().includes(search.trim().toLowerCase())) && (only === 'all' || (only === 'on' && r.enabled) || (only === 'off' && !r.enabled) || (only === 'failing' && (r.lastError ?? null) !== null)))
  $: waiting = jobs.filter((j) => j.state === 'waiting')
  $: retrying = jobs.filter((j) => j.state === 'retry')
  $: failed = jobs.filter((j) => j.state === 'failed')
  $: failingRules = rules.filter((r) => (r.lastError ?? null) !== null)

  async function setEnabled (r: AutomationRule, on: boolean): Promise<void> {
    await client.update(r, { enabled: on })
    void recordAudit(on ? 'automation.enabled' : 'automation.disabled', r._id, `${r.name} (${projectName(r)})`)
  }
  async function disableFailing (): Promise<void> {
    if (failingRules.length === 0 || !confirm(`Switch off ${failingRules.length} failing rule${failingRules.length === 1 ? '' : 's'}?`)) return
    for (const r of failingRules) if (r.enabled) await setEnabled(r, false)
  }
  async function retryAll (): Promise<void> {
    for (const j of failed) await client.update(j, { state: 'retry', attempts: 0, runAt: Date.now(), lastError: null })
    void recordAudit('automation.retryAll', String(failed.length))
  }
  async function cancelAll (): Promise<void> {
    if (!confirm(`Cancel ${waiting.length + retrying.length} queued actions?`)) return
    for (const j of [...waiting, ...retrying]) await client.update(j, { state: 'cancelled', doneAt: Date.now() })
    void recordAudit('automation.cancelAll', String(waiting.length + retrying.length))
  }
  function open (r: AutomationRule): void {
    const loc = getCurrentLocation()
    navigate({ path: [loc.path[0], loc.path[1], 'tracker', r.global === true ? (projects[0]?._id ?? '') : r.space, 'automation'] })
  }
  const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<div class="kpis">
  <div class="kpi"><span class="kpi__n">{rules.filter((r) => r.enabled).length}<span class="kpi__of">/{rules.length}</span></span><span class="kpi__l">rules enabled</span></div>
  <div class="kpi" class:kpi--bad={failingRules.length > 0}><span class="kpi__n">{failingRules.length}</span><span class="kpi__l">rules with a last error</span></div>
  <div class="kpi"><span class="kpi__n">{waiting.length}</span><span class="kpi__l">waiting (delayed actions)</span></div>
  <div class="kpi" class:kpi--bad={retrying.length > 0}><span class="kpi__n">{retrying.length}</span><span class="kpi__l">retrying deliveries</span></div>
  <div class="kpi" class:kpi--bad={failed.length > 0}><span class="kpi__n">{failed.length}</span><span class="kpi__l">gave up after 5 attempts</span></div>
  <div class="kpi" class:kpi--bad={failedRuns.length > 0}><span class="kpi__n">{failedRuns.length}</span><span class="kpi__l">failed runs in 7 days</span></div>
</div>

<section class="card">
  <div class="head">
    <span class="card__t">Rules across the workspace</span>
    <label class="search">{@html icon('filter')}<input placeholder="Search rules or project keys" bind:value={search} /></label>
    <select class="sel" bind:value={only}><option value="all">all</option><option value="on">enabled</option><option value="off">disabled</option><option value="failing">with errors</option></select>
    <span class="grow" />
    <button class="bbtn bbtn--warn" disabled={failingRules.length === 0} on:click={() => { void disableFailing() }}>Switch off failing rules</button>
  </div>
  {#if shown.length === 0}<p class="muted">No rules match.</p>{/if}
  {#each shown as r (r._id)}
    <div class="rule" class:rule--off={!r.enabled}>
      <span class="rule__p">{projectName(r)}</span>
      <div class="rule__m"><span class="rule__n">{r.name}</span><span class="muted">{r.trigger}{(r.at ?? '') !== '' ? ` · daily at ${r.at}` : r.trigger === 'scheduled' ? ` · every ${r.every ?? 60} min` : ''} · {r.actions.length} action{r.actions.length === 1 ? '' : 's'} · {r.runs ?? 0} runs · last {ago(r.lastRun)}{#if r.lastError} · <span class="bad">{r.lastError}</span>{/if}</span></div>
      <button class="lnk" on:click={() => { open(r) }}>open</button>
      <Toggle on={r.enabled} on:change={(e) => { void setEnabled(r, e.detail) }} />
    </div>
  {/each}
</section>

<section class="card">
  <div class="head"><span class="card__t">Queue</span><span class="grow" /><button class="bbtn" disabled={failed.length === 0} on:click={() => { void retryAll() }}>Retry all failed</button><button class="bbtn bbtn--bad" disabled={waiting.length + retrying.length === 0} on:click={() => { void cancelAll() }}>Cancel all queued</button></div>
  {#if jobs.length === 0}<p class="muted">Nothing waiting, retrying or failed.</p>{/if}
  {#each jobs as j (j._id)}
    <div class="job" class:job--bad={j.state !== 'waiting'}>
      <span class="job__s">{j.state === 'waiting' ? 'waiting' : j.state === 'retry' ? `retry ${j.attempts + 1}/${j.maxAttempts}` : 'failed'}</span>
      <span class="job__t">{j.identifier} · {j.ruleName} · {j.action.type}{#if j.lastError} · <span class="bad">{j.lastError}</span>{/if}</span>
      <span class="muted">{j.state === 'failed' ? fmt(j.doneAt ?? j.runAt) : `due ${fmt(j.runAt)}`}</span>
      {#if j.state === 'failed'}<button class="lnk" on:click={() => { void client.update(j, { state: 'retry', attempts: 0, runAt: Date.now(), lastError: null }) }}>retry</button>{:else}<button class="lnk" on:click={() => { void client.update(j, { runAt: Date.now() }) }}>run now</button><button class="lnk lnk--bad" on:click={() => { void client.update(j, { state: 'cancelled', doneAt: Date.now() }) }}>cancel</button>{/if}
    </div>
  {/each}
</section>

{#if failedRuns.length > 0}
  <section class="card">
    <div class="head"><span class="card__t">Failed runs · last 7 days</span></div>
    {#each failedRuns as run (run._id)}
      <div class="job job--bad"><span class="job__s">{fmt(run.at)}</span><span class="job__t">{run.ruleName} · {run.identifier ?? `${run.matched} matched`} · {run.actions.join(', ')}</span><span class="bad">{run.error ?? 'failed'}</span></div>
    {/each}
  </section>
{/if}

<style lang="scss">
  .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.6rem; margin-bottom: 0.9rem; }
  .kpi { display: flex; flex-direction: column; padding: 0.7rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.8rem; background: var(--theme-panel-color); &--bad .kpi__n { color: var(--negative-button-default); } }
  .kpi__n { font-size: 1.5rem; font-weight: 700; color: var(--theme-caption-color); line-height: 1.1; }
  .kpi__of { font-size: 0.9rem; color: var(--theme-dark-color); font-weight: 500; }
  .kpi__l { font-size: 0.74rem; color: var(--theme-dark-color); }
  .card { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.9rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); }
  .card__t { font-weight: 700; color: var(--theme-caption-color); }
  .head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.76rem; color: var(--theme-dark-color); }
  .bad { color: var(--negative-button-default); }
  .search { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-dark-color); min-width: 14rem; :global(svg) { width: 0.85rem; height: 0.85rem; } input { flex: 1; border: none; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.85rem; outline: none; } }
  .sel { padding: 0.35rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8rem; }
  .bbtn { padding: 0.35rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.45rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; &:hover { border-color: var(--accent-brand); } &:disabled { opacity: 0.5; cursor: default; } &--warn { color: #b45309; } &--bad { color: var(--negative-button-default); } }
  .rule { display: grid; grid-template-columns: 7rem 1fr auto auto; align-items: center; gap: 0.6rem; padding: 0.45rem 0; border-top: 1px solid var(--theme-divider-color); &--off { opacity: 0.55; } }
  .rule__p { font-size: 0.72rem; font-weight: 700; color: var(--accent-brand); }
  .rule__m { display: flex; flex-direction: column; min-width: 0; }
  .rule__n { font-weight: 600; color: var(--theme-caption-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &--bad { color: var(--negative-button-default); } }
  .job { display: grid; grid-template-columns: 7rem 1fr auto auto auto; align-items: center; gap: 0.6rem; padding: 0.35rem 0; border-top: 1px solid var(--theme-divider-color); font-size: 0.8rem; color: var(--theme-content-color); &--bad .job__s { color: var(--negative-button-default); } }
  .job__s { font-weight: 700; color: var(--theme-caption-color); }
  .job__t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 50rem) { .rule, .job { grid-template-columns: 1fr auto; } .rule__p, .job__s { grid-column: 1 / -1; } }
</style>
