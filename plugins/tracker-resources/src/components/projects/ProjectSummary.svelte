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
  Project summary: status overview donut, priority breakdown, types of work,
  team workload, the running sprint, what is due this week, recently updated
  work and quick links. Every number is a live count from the project.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const dispatch = createEventDispatcher()
  const iq = createQuery()
  const sq = createQuery()
  const spq = createQuery()
  const mq = createQuery()
  const eq = createQuery()
  let issues: Issue[] = []
  let statuses: IssueStatus[] = []
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  let employees: Employee[] = []
  $: iq.query(tracker.class.Issue, { space: currentSpace }, (r) => { issues = r }, { limit: 5000 })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: spq.query(tracker.class.Sprint, { space: currentSpace }, (r) => { sprints = r })
  $: mq.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  const DAY = 86_400_000

  $: cat = new Map(statuses.map((s) => [s._id, s.category]))
  $: bucket = (i: Issue): 'todo' | 'doing' | 'done' => { const c = cat.get(i.status); return c === task.statusCategory.Won || c === task.statusCategory.Lost ? 'done' : c === task.statusCategory.Active ? 'doing' : 'todo' }
  $: live = issues.filter((i) => i.archived !== true)
  $: open = live.filter((i) => bucket(i) !== 'done')
  $: counts = { todo: live.filter((i) => bucket(i) === 'todo').length, doing: live.filter((i) => bucket(i) === 'doing').length, done: live.filter((i) => bucket(i) === 'done').length }
  $: total = live.length
  $: donePct = total === 0 ? 0 : Math.round((counts.done / total) * 100)
  const PRIO: Array<{ p: IssuePriority, l: string, c: string }> = [{ p: IssuePriority.Urgent, l: 'Urgent', c: '#ef4444' }, { p: IssuePriority.High, l: 'High', c: '#f97316' }, { p: IssuePriority.Medium, l: 'Medium', c: '#eab308' }, { p: IssuePriority.Low, l: 'Low', c: '#22c55e' }, { p: IssuePriority.NoPriority, l: 'None', c: '#94a3b8' }]
  $: byPrio = PRIO.map((x) => ({ ...x, n: open.filter((i) => i.priority === x.p).length }))
  $: maxPrio = Math.max(1, ...byPrio.map((x) => x.n))
  $: kinds = [{ l: 'Issues', n: open.filter((i) => i.kind !== tracker.taskTypes.Epic && i.kind !== tracker.taskTypes.Initiative).length }, { l: 'Epics', n: open.filter((i) => i.kind === tracker.taskTypes.Epic).length }, { l: 'Initiatives', n: open.filter((i) => i.kind === tracker.taskTypes.Initiative).length }, { l: 'Requests', n: open.filter((i) => i.requestType != null).length }].filter((k) => k.n > 0)
  $: nameOf = new Map(employees.map((e) => [e._id as Ref<Person>, formatName(e.name)]))
  $: workload = Array.from(open.reduce((m, i) => { const k = i.assignee != null ? nameOf.get(i.assignee) ?? '—' : 'Unassigned'; m.set(k, (m.get(k) ?? 0) + 1); return m }, new Map<string, number>()).entries()).map(([l, n]) => ({ l, n })).sort((a, b) => b.n - a.n).slice(0, 8)
  $: maxLoad = Math.max(1, ...workload.map((w) => w.n))
  $: sprint = sprints.find((s) => s.state === 'active')
  $: sprintItems = sprint !== undefined ? live.filter((i) => i.sprint === sprint?._id) : []
  $: sprintDone = sprintItems.filter((i) => bucket(i) === 'done').length
  $: dueSoon = open.filter((i) => i.dueDate != null && i.dueDate < Date.now() + 7 * DAY).sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0)).slice(0, 8)
  $: overdue = open.filter((i) => i.dueDate != null && i.dueDate < Date.now()).length
  $: recent = [...live].sort((a, b) => b.modifiedOn - a.modifiedOn).slice(0, 8)
  $: nextMilestone = milestones.filter((m) => m.targetDate > Date.now()).sort((a, b) => a.targetDate - b.targetDate)[0]
  const arc = (start: number, end: number): string => {
    const r = 40
    const a0 = start * 2 * Math.PI - Math.PI / 2
    const a1 = end * 2 * Math.PI - Math.PI / 2
    const x0 = 50 + r * Math.cos(a0); const y0 = 50 + r * Math.sin(a0)
    const x1 = 50 + r * Math.cos(a1); const y1 = 50 + r * Math.sin(a1)
    return `M${x0} ${y0} A${r} ${r} 0 ${end - start > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
  }
  const open_ = (i: Issue): void => { showPanel(view.component.EditDoc, i._id, i._class, 'content') }
  const fmt = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const ago = (t: number): string => { const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago` }
</script>

<div class="sm">
  <div class="sm__grid">
    <section class="card motion-rise" style="--i: 0">
      <div class="card__head"><span class="card__title">Status overview</span><button class="lnk" on:click={() => { dispatch('go', 'list') }}>View all</button></div>
      <div class="donut">
        <svg viewBox="0 0 100 100" class="donut__svg">
          {#if total > 0}
            {@const t = counts.todo / total}
            {@const d = counts.doing / total}
            <circle cx="50" cy="50" r="40" class="donut__bg" />
            {#if counts.todo > 0}<path d={arc(0, t)} class="donut__seg donut__seg--todo" />{/if}
            {#if counts.doing > 0}<path d={arc(t, t + d)} class="donut__seg donut__seg--doing" />{/if}
            {#if counts.done > 0}<path d={arc(t + d, 1)} class="donut__seg donut__seg--done" />{/if}
          {:else}<circle cx="50" cy="50" r="40" class="donut__bg" />{/if}
          <text x="50" y="47" text-anchor="middle" class="donut__n">{total}</text>
          <text x="50" y="60" text-anchor="middle" class="donut__l">total work</text>
        </svg>
        <ul class="legend">
          <li><i class="sw" style="background: #94a3b8" />To do <b>{counts.todo}</b></li>
          <li><i class="sw" style="background: #3b82f6" />In progress <b>{counts.doing}</b></li>
          <li><i class="sw" style="background: #22c55e" />Done <b>{counts.done}</b> <span class="muted">{donePct}%</span></li>
        </ul>
      </div>
    </section>

    <section class="card motion-rise" style="--i: 1">
      <div class="card__head"><span class="card__title">Priority breakdown</span><span class="muted">open work</span></div>
      {#each byPrio as p (p.l)}
        <div class="bar"><span class="bar__l">{p.l}</span><span class="track"><span class="fill" style="width: {(p.n / maxPrio) * 100}%; background: {p.c}" /></span><span class="bar__n">{p.n}</span></div>
      {/each}
    </section>

    <section class="card motion-rise" style="--i: 2">
      <div class="card__head"><span class="card__title">Team workload</span><span class="muted">{overdue > 0 ? `${overdue} overdue` : 'nothing overdue'}</span></div>
      {#each workload as w (w.l)}
        <div class="bar"><span class="bar__l bar__l--wide">{w.l}</span><span class="track"><span class="fill fill--brand" style="width: {(w.n / maxLoad) * 100}%" /></span><span class="bar__n">{w.n}</span></div>
      {/each}
      {#if workload.length === 0}<p class="muted">No open work.</p>{/if}
    </section>

    <section class="card motion-rise" style="--i: 3">
      <div class="card__head"><span class="card__title">Types of work</span></div>
      {#each kinds as k (k.l)}<div class="kv"><span>{k.l}</span><b>{k.n}</b></div>{/each}
      {#if kinds.length === 0}<p class="muted">Nothing open.</p>{/if}
      {#if nextMilestone}<div class="kv kv--top"><span>Next milestone</span><b>{nextMilestone.label} · {fmt(nextMilestone.targetDate)}</b></div>{/if}
    </section>

    <section class="card motion-rise" style="--i: 4">
      <div class="card__head"><span class="card__title">{sprint !== undefined ? sprint.name : 'Sprint'}</span><button class="lnk" on:click={() => { dispatch('go', 'sprints') }}>Sprints</button></div>
      {#if sprint !== undefined}
        <span class="muted">{fmt(sprint.startDate)} → {fmt(sprint.endDate)} · {Math.max(0, Math.ceil((sprint.endDate - Date.now()) / DAY))} days left{sprint.goal ? ` · ${sprint.goal}` : ''}</span>
        <div class="bar"><span class="bar__l">Done</span><span class="track track--big"><span class="fill fill--brand" style="width: {sprintItems.length === 0 ? 0 : (sprintDone / sprintItems.length) * 100}%" /></span><span class="bar__n">{sprintDone}/{sprintItems.length}</span></div>
      {:else}<p class="muted">No sprint running. Start one from the Sprints tab.</p>{/if}
    </section>

    <section class="card motion-rise" style="--i: 5">
      <div class="card__head"><span class="card__title">Due this week</span><button class="lnk" on:click={() => { dispatch('go', 'calendar') }}>Calendar</button></div>
      {#each dueSoon as i (i._id)}<button class="row" on:click={() => { open_(i) }}><span class="row__id">{i.identifier}</span><span class="row__t">{i.title}</span><span class="row__m" class:row__m--late={(i.dueDate ?? 0) < Date.now()}>{fmt(i.dueDate ?? 0)}</span></button>{/each}
      {#if dueSoon.length === 0}<p class="muted">Clear runway.</p>{/if}
    </section>

    <section class="card card--wide motion-rise" style="--i: 6">
      <div class="card__head"><span class="card__title">Recent activity</span></div>
      {#each recent as i (i._id)}<button class="row" on:click={() => { open_(i) }}><span class="row__id">{i.identifier}</span><span class="row__t">{i.title}</span><span class="row__m">{statuses.find((s) => s._id === i.status)?.name ?? ''} · {ago(i.modifiedOn)}</span></button>{/each}
      {#if recent.length === 0}<p class="muted">Nothing yet. Create the first issue from the List tab.</p>{/if}
    </section>
  </div>
</div>

<style lang="scss">
  .sm { padding: 1rem 1.25rem; overflow: auto; }
  .sm__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 0.9rem; }
  .card { position: relative; display: flex; flex-direction: column; gap: 0.45rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); min-width: 0; &::before { content: ''; position: absolute; left: 0.9rem; right: 0.9rem; top: 0; height: 3px; border-radius: 0 0 3px 3px; background: var(--accent-gradient); } &--wide { grid-column: 1 / -1; } }
  .card__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .card__title { font-weight: 700; color: var(--theme-caption-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } }
  .muted { margin: 0; font-size: 0.75rem; color: var(--theme-trans-color); }
  .donut { display: flex; align-items: center; gap: 1rem; }
  .donut__svg { width: 8rem; height: 8rem; flex-shrink: 0; }
  .donut__bg { fill: none; stroke: var(--theme-button-pressed); stroke-width: 12; }
  .donut__seg { fill: none; stroke-width: 12; stroke-linecap: butt; &--todo { stroke: #94a3b8; } &--doing { stroke: #3b82f6; } &--done { stroke: #22c55e; } }
  .donut__n { fill: var(--theme-caption-color); font-size: 18px; font-weight: 800; }
  .donut__l { fill: var(--theme-trans-color); font-size: 7px; }
  .legend { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); li { display: flex; align-items: center; gap: 0.4rem; } b { color: var(--theme-caption-color); } }
  .sw { display: inline-block; width: 0.65rem; height: 0.65rem; border-radius: 2px; }
  .bar { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--theme-content-color); }
  .bar__l { width: 4.5rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &--wide { width: 8rem; } }
  .bar__n { width: 2rem; text-align: right; font-weight: 600; color: var(--theme-caption-color); }
  .track { flex: 1; height: 0.5rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; &--big { height: 0.7rem; } }
  .fill { display: block; height: 100%; border-radius: inherit; transition: width var(--motion-slow) var(--ease-enter); &--brand { background: var(--accent-gradient); } }
  .kv { display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } &--top { margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid var(--theme-divider-color); } }
  .row { display: flex; align-items: baseline; gap: 0.5rem; width: 100%; padding: 0.3rem 0.4rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); } }
  .row__id { flex-shrink: 0; font-size: 0.68rem; font-weight: 600; color: var(--accent-brand-ink); }
  .row__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row__m { flex-shrink: 0; font-size: 0.7rem; color: var(--theme-trans-color); &--late { color: var(--negative-button-default); font-weight: 600; } }
</style>
