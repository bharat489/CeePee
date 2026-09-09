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
  Cross-project roadmap. One timeline for every project: milestones, sprints
  and dated epics as bars, today as a line. Below it, capacity for the next
  weeks (assigned estimate vs available hours, with approved leave taken
  out) and the dependencies that cross project lines -- the ones nobody's
  single-project board can see.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import hr from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { MilestoneStatus, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  const client = getClient()
  const DAY = 86_400_000
  const pq = createQuery()
  const mq = createQuery()
  const sq = createQuery()
  const stq = createQuery()
  let projects: Project[] = []
  let milestones: Milestone[] = []
  let sprints: Sprint[] = []
  let statuses: IssueStatus[] = []
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  mq.query(tracker.class.Milestone, {}, (r) => { milestones = r.filter((m) => (m as any).archived !== true) }, { sort: { targetDate: SortingOrder.Ascending } })
  sq.query(tracker.class.Sprint, { state: { $ne: 'completed' } }, (r) => { sprints = r })
  stq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: openIds = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)

  let months = 6
  $: from = ((): number => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return d.getTime()
  })()
  $: to = from + months * 30.5 * DAY
  const W = 1000
  const ROW = 26
  const LABEL = 180
  $: px = (t: number): number => LABEL + ((Math.min(Math.max(t, from), to) - from) / (to - from)) * (W - LABEL)
  $: monthTicks = ((): number[] => {
    const out: number[] = []
    const d = new Date(from)
    while (d.getTime() < to) {
      out.push(d.getTime())
      d.setMonth(d.getMonth() + 1)
    }
    return out
  })()

  // epics with dates
  let epics: Issue[] = []
  $: void client.findAll(tracker.class.Issue, { kind: tracker.taskTypes.Epic, dueDate: { $ne: null } }, { limit: 500 }).then((r) => { epics = r })

  interface Bar {
    key: string
    label: string
    start: number
    end: number
    kind: 'milestone' | 'sprint' | 'epic'
    done?: boolean
    open: () => void
  }
  interface ProjectRow {
    project: Project
    bars: Bar[]
  }
  $: rowsByProject = projects.map((p): ProjectRow => {
    const bars: Bar[] = []
    for (const m of milestones.filter((m) => m.space === p._id)) {
      const end = m.targetDate
      const start = m.startDate ?? end - 30 * DAY
      if (end < from || start > to) continue
      bars.push({ key: m._id, label: m.label, start, end, kind: 'milestone', done: m.status === MilestoneStatus.Completed, open: () => { showPanel(view.component.EditDoc, m._id, m._class, 'content') } })
    }
    for (const s of sprints.filter((s) => s.space === p._id)) {
      if (s.endDate < from || s.startDate > to) continue
      bars.push({ key: s._id, label: s.name, start: s.startDate, end: s.endDate, kind: 'sprint', open: () => {} })
    }
    for (const e of epics.filter((e) => e.space === p._id)) {
      const end = e.dueDate ?? 0
      const start = e.startDate ?? e.createdOn ?? end - 30 * DAY
      if (end < from || start > to) continue
      bars.push({ key: e._id, label: `${e.identifier} ${e.title}`, start, end, kind: 'epic', done: !openIds.includes(e.status), open: () => { showPanel(view.component.EditDoc, e._id, e._class, 'content') } })
    }
    return { project: p, bars: bars.sort((a, b) => a.start - b.start) }
  }).filter((r) => r.bars.length > 0)
  $: totalRows = rowsByProject.reduce((a, r) => a + r.bars.length + 1, 0)
  $: H = 40 + totalRows * ROW

  // ---- capacity -----------------------------------------------------------
  let weeks = 2
  interface Cap {
    id: Ref<Person>
    name: string
    assigned: number
    available: number
    leaveDays: number
  }
  let capacity: Cap[] = []
  async function loadCapacity (ws: number, open: Ref<IssueStatus>[]): Promise<void> {
    if (open.length === 0) return
    const start = Date.now()
    const end = start + ws * 7 * DAY
    const active = sprints.filter((s) => s.state === 'active').map((s) => s._id)
    const list = await client.findAll(tracker.class.Issue, { status: { $in: open }, assignee: { $ne: null } }, { limit: 5000 })
    const relevant = list.filter((i) => (i.dueDate != null && i.dueDate <= end) || (i.sprint != null && active.includes(i.sprint)))
    const assigned = new Map<Ref<Person>, number>()
    for (const i of relevant) if (i.assignee != null) assigned.set(i.assignee, (assigned.get(i.assignee) ?? 0) + Math.max(0, (i.estimation ?? 0) - (i.reportedTime ?? 0)))
    const ids = Array.from(assigned.keys())
    if (ids.length === 0) {
      capacity = []
      return
    }
    const people = await client.findAll(contact.class.Person, { _id: { $in: ids } })
    let workdays = 0
    for (let t = start; t < end; t += DAY) {
      const dow = new Date(t).getDay()
      if (dow !== 0 && dow !== 6) workdays++
    }
    // approved leave from HR, per person, overlapping the window
    const leave = new Map<Ref<Person>, number>()
    try {
      const requests = await client.findAll(hr.class.Request, {}, { limit: 2000 })
      for (const r of requests) {
        const a = new Date(r.tzDate.year, r.tzDate.month, r.tzDate.day).getTime()
        const b = new Date(r.tzDueDate.year, r.tzDueDate.month, r.tzDueDate.day).getTime() + DAY
        const s = Math.max(a, start)
        const e = Math.min(b, end)
        if (e <= s) continue
        let d = 0
        for (let t = s; t < e; t += DAY) {
          const dow = new Date(t).getDay()
          if (dow !== 0 && dow !== 6) d++
        }
        const who = r.attachedTo as unknown as Ref<Person>
        leave.set(who, (leave.get(who) ?? 0) + d)
      }
    } catch {
      // HR not enabled: no leave subtracted
    }
    capacity = people
      .map((p) => ({ id: p._id, name: formatName(p.name), assigned: assigned.get(p._id) ?? 0, leaveDays: leave.get(p._id) ?? 0, available: Math.max(0, workdays - (leave.get(p._id) ?? 0)) * 8 }))
      .sort((a, b) => b.assigned / Math.max(1, b.available) - a.assigned / Math.max(1, a.available))
  }
  $: void loadCapacity(weeks, openIds)

  // ---- cross-project dependencies -----------------------------------------
  let crossDeps: Array<{ issue: Issue, blockers: Issue[] }> = []
  async function loadDeps (open: Ref<IssueStatus>[]): Promise<void> {
    if (open.length === 0) return
    const list = await client.findAll(tracker.class.Issue, { status: { $in: open }, blockedBy: { $exists: true } }, { limit: 3000 })
    const withBlockers = list.filter((i) => (i.blockedBy?.length ?? 0) > 0)
    const ids = Array.from(new Set(withBlockers.flatMap((i) => (i.blockedBy ?? []).map((b) => b._id as Ref<Issue>))))
    const blockers = ids.length > 0 ? await client.findAll(tracker.class.Issue, { _id: { $in: ids } }) : []
    const byId = new Map(blockers.map((b) => [b._id, b]))
    crossDeps = withBlockers
      .map((i) => ({ issue: i, blockers: (i.blockedBy ?? []).map((b) => byId.get(b._id as Ref<Issue>)).filter((b): b is Issue => b !== undefined && b.space !== i.space && open.includes(b.status)) }))
      .filter((d) => d.blockers.length > 0)
  }
  $: void loadDeps(openIds)
  $: projectName = new Map(projects.map((p) => [p._id, p.identifier]))
  function open (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  function fmtMonth (t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
</script>

<div class="rm">
  <header class="rm__head">
    <span class="rm__title"><Label label={tracker.string.Roadmap} /></span>
    <select class="select" bind:value={months}><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></select>
  </header>

  <section class="card motion-rise" style="--i: 0">
    {#if rowsByProject.length === 0}
      <p class="muted">Nothing dated in this window. Give milestones a target date, epics a due date, or plan a sprint.</p>
    {:else}
      <div class="tl-wrap">
        <svg viewBox="0 0 {W} {H}" class="tl" style="min-width: {Math.max(720, months * 160)}px">
          {#each monthTicks as t}
            <line x1={px(t)} x2={px(t)} y1="18" y2={H} class="tl__grid" />
            <text x={px(t) + 4} y="12" class="tl__tick">{fmtMonth(t)}</text>
          {/each}
          <line x1={px(Date.now())} x2={px(Date.now())} y1="18" y2={H} class="tl__today" />
          {#each rowsByProject as r, ri}
            {@const y0 = 30 + rowsByProject.slice(0, ri).reduce((a, x) => a + x.bars.length + 1, 0) * ROW}
            <text x="4" y={y0 + 14} class="tl__project">{r.project.name}</text>
            {#each r.bars as b, bi (b.key)}
              {@const y = y0 + (bi + 1) * ROW}
              <text x="12" y={y + 15} class="tl__label"><title>{b.label}</title>{b.label.length > 26 ? b.label.slice(0, 25) + '…' : b.label}</text>
              <rect x={px(b.start)} y={y + 5} width={Math.max(3, px(b.end) - px(b.start))} height={b.kind === 'sprint' ? 8 : 14} rx="4" class="bar bar--{b.kind}" class:bar--done={b.done === true} role="button" tabindex="0" on:click={b.open} on:keydown={(e) => { if (e.key === 'Enter') b.open() }}><title>{b.label}</title></rect>
            {/each}
          {/each}
        </svg>
      </div>
      <div class="legend"><span><i class="sw sw--milestone" />Milestone</span><span><i class="sw sw--sprint" />Sprint</span><span><i class="sw sw--epic" />Epic (dated)</span><span><i class="sw sw--today" />Today</span></div>
    {/if}
  </section>

  <div class="two">
    <section class="card motion-rise" style="--i: 1">
      <div class="card__head"><span class="card__title"><Label label={tracker.string.Capacity} /></span><select class="select" bind:value={weeks}><option value={1}>1 week</option><option value={2}>2 weeks</option><option value={4}>4 weeks</option></select></div>
      <p class="muted">Remaining estimate on issues due in the window or in an active sprint, against 8h × working days, minus approved leave.</p>
      {#each capacity as c (c.id)}
        {@const pct = c.available === 0 ? 100 : (c.assigned / c.available) * 100}
        <div class="cap">
          <span class="cap__name">{c.name}</span>
          <span class="track"><span class="fill" class:fill--over={pct > 100} class:fill--warn={pct > 85 && pct <= 100} style="width: {Math.min(100, pct)}%" /></span>
          <span class="cap__n">{Math.round(c.assigned)}h / {Math.round(c.available)}h{#if c.leaveDays > 0} · {c.leaveDays}d leave{/if}</span>
        </div>
      {/each}
      {#if capacity.length === 0}<p class="muted">No estimated work due in this window.</p>{/if}
    </section>

    <section class="card motion-rise" style="--i: 2">
      <div class="card__head"><span class="card__title"><Label label={tracker.string.CrossProjectDependencies} /></span><span class="muted">{crossDeps.length}</span></div>
      {#each crossDeps as d (d.issue._id)}
        <div class="dep">
          <button class="dep__issue" on:click={() => { open(d.issue) }}><span class="dep__id">{d.issue.identifier}</span>{d.issue.title}</button>
          <span class="dep__arrow">blocked by</span>
          {#each d.blockers as b (b._id)}
            <button class="dep__blocker" on:click={() => { open(b) }}>{b.identifier} <span class="muted">{projectName.get(b.space) ?? ''}</span></button>
          {/each}
        </div>
      {/each}
      {#if crossDeps.length === 0}<p class="muted">No open issue is blocked by another project.</p>{/if}
    </section>
  </div>
</div>

<style lang="scss">
  .rm { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; overflow: auto; }
  .rm__head { display: flex; align-items: center; justify-content: space-between; }
  .rm__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .select { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); min-width: 0; }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 1rem; }
  .tl-wrap { overflow-x: auto; }
  .tl { width: 100%; height: auto; }
  .tl__grid { stroke: var(--theme-divider-color); }
  .tl__tick { fill: var(--theme-trans-color); font-size: 11px; }
  .tl__today { stroke: var(--accent-brand); stroke-width: 2; }
  .tl__project { fill: var(--theme-caption-color); font-size: 12px; font-weight: 700; }
  .tl__label { fill: var(--theme-dark-color); font-size: 11px; }
  .bar { cursor: pointer; transition: opacity var(--motion-fast); &:hover { opacity: 0.8; } &--milestone { fill: var(--primary-button-default); } &--sprint { fill: var(--theme-trans-color); } &--epic { fill: #6a45f5; } &--done { fill: var(--accent-brand); } }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.75rem; color: var(--theme-dark-color); span { display: inline-flex; align-items: center; gap: 0.35rem; } }
  .sw { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; &--milestone { background: var(--primary-button-default); } &--sprint { background: var(--theme-trans-color); } &--epic { background: #6a45f5; } &--today { background: var(--accent-brand); } }
  .cap { display: grid; grid-template-columns: 9rem 1fr auto; align-items: center; gap: 0.6rem; font-size: 0.8125rem; }
  .cap__name { color: var(--theme-caption-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cap__n { font-size: 0.75rem; color: var(--theme-trans-color); white-space: nowrap; }
  .track { height: 0.5rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent-brand); transition: width var(--motion-slow) var(--ease-enter); &--warn { background: #f5a623; } &--over { background: var(--negative-button-default); } }
  .dep { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; padding: 0.3rem 0; border-top: 1px solid var(--theme-divider-color); font-size: 0.8125rem; }
  .dep__issue, .dep__blocker { border: none; background: transparent; padding: 0.1rem 0.3rem; border-radius: 0.3rem; color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .dep__id { margin-right: 0.3rem; font-size: 0.7rem; color: var(--theme-trans-color); }
  .dep__arrow { font-size: 0.7rem; color: var(--theme-trans-color); }
  .dep__blocker { border: 1px solid var(--theme-divider-color); }
</style>
