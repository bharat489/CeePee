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
  Settings → Notifications & reminders (personal). Quiet hours hold in-app
  pop-ups and sounds; muted projects send nothing at all; reminder thresholds
  drive the due-soon and SLA reminders; pending "remind me" entries can be
  cancelled. Browser push and email toggles live on the Notifications page.
-->
<script lang="ts">
  import core, { getCurrentAccount, SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue, type NotifyPrefs, type Project, type Reminder } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  const client = getClient()
  const me = getCurrentAccount().uuid
  const pq = createQuery()
  const rq = createQuery()
  const prq = createQuery()
  let prefs: NotifyPrefs | undefined
  let projects: Project[] = []
  let reminders: Reminder[] = []
  let issues = new Map<string, Issue>()
  pq.query(tracker.class.NotifyPrefs, { user: me }, (r) => { prefs = r[0] })
  prq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  rq.query(tracker.class.Reminder, { user: me, fired: { $ne: true } }, (r) => { reminders = r; void loadIssues(r) }, { sort: { at: SortingOrder.Ascending } })
  async function loadIssues (list: Reminder[]): Promise<void> {
    const ids = list.map((r) => r.issue).filter((id) => !issues.has(id))
    if (ids.length === 0) return
    const found = await client.findAll(tracker.class.Issue, { _id: { $in: ids } })
    const next = new Map(issues)
    for (const i of found) next.set(i._id, i)
    issues = next
  }
  const DEFAULTS = { quietFrom: undefined as number | undefined, quietTo: undefined as number | undefined, tzOffset: -new Date().getTimezoneOffset(), mutedProjects: [] as Project['_id'][], remindDueDays: 1, remindSlaHours: 4, remindOverdue: true }
  $: cur = { ...DEFAULTS, ...(prefs ?? {}) }
  async function save (patch: Partial<NotifyPrefs>): Promise<void> {
    const data = { ...cur, ...patch, user: me, tzOffset: -new Date().getTimezoneOffset() }
    if (prefs === undefined) await client.createDoc(tracker.class.NotifyPrefs, core.space.Workspace, data as any)
    else await client.update(prefs, data as any)
    try {
      if (data.quietFrom !== undefined && data.quietTo !== undefined) localStorage.setItem('ceepee.quietHours', JSON.stringify({ from: data.quietFrom, to: data.quietTo }))
      else localStorage.removeItem('ceepee.quietHours')
    } catch {}
  }
  $: quietOn = cur.quietFrom !== undefined && cur.quietTo !== undefined
  const HOURS = Array.from({ length: 24 }, (_, h) => h)
  const fmtH = (h: number): string => `${String(h).padStart(2, '0')}:00`
  const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<div class="hulyComponent">
  <div class="np">
    <header class="np__head">
      <span class="np__title"><Label label={tracker.string.NotificationPrefs} /></span>
      <span class="muted">Which channels (inbox, browser push, email, sound) each event uses is on the Notifications page. This page is about when and how much.</span>
    </header>

    <section class="card motion-rise" style="--i: 0">
      <div class="card__head"><span class="card__title"><Label label={tracker.string.QuietHours} /></span><label class="check"><input type="checkbox" checked={quietOn} on:change={(e) => { void save(e.currentTarget.checked ? { quietFrom: 22, quietTo: 8 } : { quietFrom: undefined, quietTo: undefined }) }} /> on</label></div>
      <p class="muted">Between these hours no pop-ups appear and no sounds play in the app. Everything still lands in your inbox. Your device's own Do Not Disturb governs OS push.</p>
      {#if quietOn}
        <div class="row">
          <label class="knob">from <select class="input" value={cur.quietFrom} on:change={(e) => { void save({ quietFrom: Number(e.currentTarget.value) }) }}>{#each HOURS as h}<option value={h}>{fmtH(h)}</option>{/each}</select></label>
          <label class="knob">to <select class="input" value={cur.quietTo} on:change={(e) => { void save({ quietTo: Number(e.currentTarget.value) }) }}>{#each HOURS as h}<option value={h}>{fmtH(h)}</option>{/each}</select></label>
          <span class="muted">your time zone (UTC{cur.tzOffset >= 0 ? '+' : ''}{cur.tzOffset / 60})</span>
        </div>
      {/if}
    </section>

    <section class="card motion-rise" style="--i: 1">
      <span class="card__title"><Label label={tracker.string.MutedProjects} /></span>
      <p class="muted">Nothing from a muted project reaches you: no inbox items, push, email or reminders. Mentions included.</p>
      <div class="chips">
        {#each projects as p (p._id)}
          <label class="chip" class:chip--on={cur.mutedProjects.includes(p._id)}><input type="checkbox" checked={cur.mutedProjects.includes(p._id)} on:change={() => { void save({ mutedProjects: cur.mutedProjects.includes(p._id) ? cur.mutedProjects.filter((x) => x !== p._id) : [...cur.mutedProjects, p._id] }) }} />{p.name}</label>
        {/each}
      </div>
    </section>

    <section class="card motion-rise" style="--i: 2">
      <span class="card__title"><Label label={tracker.string.Reminders} /></span>
      <div class="row">
        <label class="knob">Remind me about my issues due within <select class="input" value={cur.remindDueDays} on:change={(e) => { void save({ remindDueDays: Number(e.currentTarget.value) }) }}><option value={0}>off</option><option value={1}>1 day</option><option value={2}>2 days</option><option value={3}>3 days</option><option value={7}>a week</option></select></label>
      </div>
      <div class="row">
        <label class="knob">Remind me about my requests breaching SLA within <select class="input" value={cur.remindSlaHours} on:change={(e) => { void save({ remindSlaHours: Number(e.currentTarget.value) }) }}><option value={0}>off</option><option value={1}>1 hour</option><option value={4}>4 hours</option><option value={8}>8 hours</option><option value={24}>a day</option></select></label>
      </div>
      <p class="muted">Reminders arrive in your inbox (and as push where enabled), once per issue. The daily email digest, when mail is configured, also lists what is due and stale.</p>
    </section>

    <section class="card motion-rise" style="--i: 3">
      <span class="card__title">Pending "remind me" reminders</span>
      {#each reminders as r (r._id)}
        {@const i = issues.get(r.issue)}
        <div class="rem">
          <span class="rem__at">{fmt(r.at)}</span>
          <button class="lnk" on:click={() => { if (i !== undefined) showPanel(view.component.EditDoc, i._id, i._class, 'content') }}>{i !== undefined ? `${i.identifier} ${i.title}` : '…'}</button>
          {#if r.note}<span class="muted">· {r.note}</span>{/if}
          <button class="lnk lnk--bad" on:click={() => { void client.remove(r) }}>cancel</button>
        </div>
      {/each}
      {#if reminders.length === 0}<p class="muted">None. Use "Remind me…" on any issue.</p>{/if}
    </section>
  </div>
</div>

<style lang="scss">
  .np { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem 2rem; max-width: 56rem; overflow: auto; }
  .np__head { display: flex; flex-direction: column; gap: 0.2rem; }
  .np__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); line-height: 1.5; }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .check, .knob { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; font-size: 0.8125rem; cursor: pointer; color: var(--theme-content-color); input { display: none; } &--on { border-color: var(--negative-button-default); background: color-mix(in srgb, var(--negative-button-default) 12%, transparent); color: var(--theme-caption-color); } }
  .rem { display: flex; align-items: baseline; gap: 0.6rem; padding: 0.35rem 0; border-top: 1px solid var(--theme-divider-color); font-size: 0.8125rem; }
  .rem__at { min-width: 11rem; color: var(--theme-trans-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.8125rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { margin-left: auto; color: var(--negative-button-default); font-size: 0.75rem; } }
</style>
