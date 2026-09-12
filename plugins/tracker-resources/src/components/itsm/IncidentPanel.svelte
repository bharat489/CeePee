<!--
// Copyright © 2026 Hardcore Engineering Inc.
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
  Incident and change management on one issue.
  Incident: severity, a running timeline, a post-mortem once resolved.
  Change: risk, the change window, and a warning when it overlaps a freeze
  window (the server refuses to start it, owners excepted).
  Any issue can be marked as an incident or a change from here.
-->
<script lang="ts">
  import { formatName, getCurrentEmployee } from '@hcengineering/contact'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue, type Project, type RequestType } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let issue: Issue
  export let readonly = false

  const client = getClient()
  const pq = createQuery()
  const rq = createQuery()
  let project: Project | undefined
  let requestType: RequestType | undefined
  $: pq.query(tracker.class.Project, { _id: issue.space }, (r) => { project = r[0] })
  $: if (issue.requestType != null) rq.query(tracker.class.RequestType, { _id: issue.requestType }, (r) => { requestType = r[0] })
  else requestType = undefined
  $: isIncident = issue.severity !== undefined || requestType?.kind === 'incident'
  $: isChange = issue.risk !== undefined || issue.changeStart != null || requestType?.kind === 'change'
  const SEV = [{ v: 1, l: 'Sev 1 · outage' }, { v: 2, l: 'Sev 2 · major' }, { v: 3, l: 'Sev 3 · minor' }, { v: 4, l: 'Sev 4 · low' }]
  const RISK: Array<{ v: 'low' | 'medium' | 'high', l: string }> = [{ v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }]
  let entry = ''
  let postmortem = issue.postmortem ?? ''
  $: postmortem = issue.postmortem ?? postmortem
  const toLocal = (t: number | null | undefined): string => (t == null ? '' : new Date(t - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16))
  const fromLocal = (s: string): number | null => (s === '' ? null : new Date(s).getTime())
  $: frozen = (project?.freezeWindows ?? []).filter((w) => {
    const s0 = issue.changeStart ?? Date.now()
    const e0 = issue.changeEnd ?? s0
    return w.start <= e0 && w.end >= s0
  })
  async function clearIncident (): Promise<void> {
    await client.update(issue, { severity: undefined } as any)
  }
  async function setRisk (v: string): Promise<void> {
    await client.update(issue, { risk: v as Issue['risk'] })
  }
  async function clearChange (): Promise<void> {
    await client.update(issue, { risk: undefined, changeStart: null, changeEnd: null } as any)
  }
  async function addEntry (): Promise<void> {
    if (entry.trim() === '') return
    const me = getCurrentEmployee()
    await client.update(issue, { timeline: [...(issue.timeline ?? []), { at: Date.now(), text: entry.trim(), by: me }] } as any)
    entry = ''
  }
  const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<div class="ip">
  {#if !isIncident && !isChange}
    {#if !readonly}
      <div class="mark"><Button kind={'ghost'} label={tracker.string.Incident} on:click={() => { void client.update(issue, { severity: 3 }) }} /><Button kind={'ghost'} label={tracker.string.Change} on:click={() => { void client.update(issue, { risk: 'medium' }) }} /><span class="muted">mark as…</span></div>
    {/if}
  {/if}

  {#if isIncident}
    <div class="row"><span class="lbl">Severity</span>
      <select class="select" disabled={readonly} value={issue.severity ?? 3} on:change={(e) => { void client.update(issue, { severity: Number(e.currentTarget.value) }) }}>{#each SEV as s}<option value={s.v}>{s.l}</option>{/each}</select>
      {#if !readonly}<button class="lnk" on:click={() => { void clearIncident() }}>not an incident</button>{/if}
    </div>
    <div class="row row--col"><span class="lbl">Timeline</span>
      <ul class="tl">{#each issue.timeline ?? [] as t}<li><span class="tl__at">{fmt(t.at)}</span><span>{t.text}</span></li>{/each}</ul>
      {#if !readonly}<div class="compose"><input class="input" placeholder="What happened / what was done…" bind:value={entry} on:keydown={(e) => { if (e.key === 'Enter') void addEntry() }} /><button class="lnk" on:click={() => { void addEntry() }}>add</button></div>{/if}
    </div>
    <div class="row row--col"><span class="lbl">Post-mortem</span>
      <textarea class="input input--area" placeholder="Impact, root cause, what we change so it does not happen again." disabled={readonly} bind:value={postmortem} on:blur={() => { if (postmortem !== (issue.postmortem ?? '')) void client.update(issue, { postmortem }) }} />
    </div>
  {/if}

  {#if isChange}
    <div class="row"><span class="lbl">Risk</span>
      <select class="select" disabled={readonly} value={issue.risk ?? 'medium'} on:change={(e) => { void setRisk(e.currentTarget.value) }}>{#each RISK as r}<option value={r.v}>{r.l}</option>{/each}</select>
      {#if !readonly}<button class="lnk" on:click={() => { void clearChange() }}>not a change</button>{/if}
    </div>
    <div class="row"><span class="lbl">Window</span>
      <input class="input" type="datetime-local" disabled={readonly} value={toLocal(issue.changeStart)} on:change={(e) => { void client.update(issue, { changeStart: fromLocal(e.currentTarget.value) }) }} />
      <span class="muted">→</span>
      <input class="input" type="datetime-local" disabled={readonly} value={toLocal(issue.changeEnd)} on:change={(e) => { void client.update(issue, { changeEnd: fromLocal(e.currentTarget.value) }) }} />
    </div>
    {#if frozen.length > 0}<p class="warn">⚠ Overlaps a change freeze: {frozen.map((w) => `${w.reason} (${fmt(w.start)} → ${fmt(w.end)})`).join('; ')}. Only an owner can start it.</p>{/if}
    {#if issue.approval !== undefined && issue.approval.state !== 'approved'}<p class="muted">Waiting for approval before it can start.</p>{/if}
  {/if}
</div>

<style lang="scss">
  .ip { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .mark { display: flex; align-items: center; gap: 0.3rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; &--col { flex-direction: column; align-items: stretch; gap: 0.3rem; } }
  .lbl { min-width: 5rem; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .select, .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--area { min-height: 4rem; resize: vertical; } }
  .muted { margin: 0; font-size: 0.75rem; color: var(--theme-trans-color); }
  .warn { margin: 0; padding: 0.4rem 0.6rem; border-radius: 0.4rem; background: color-mix(in srgb, #f5a623 18%, transparent); color: #b8860b; font-size: 0.75rem; }
  .tl { margin: 0; padding: 0; list-style: none; li { display: flex; gap: 0.6rem; padding: 0.2rem 0; border-top: 1px solid var(--theme-divider-color); } }
  .tl__at { min-width: 8rem; color: var(--theme-trans-color); font-size: 0.75rem; }
  .compose { display: flex; gap: 0.4rem; align-items: center; .input { flex: 1; } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } }
</style>
