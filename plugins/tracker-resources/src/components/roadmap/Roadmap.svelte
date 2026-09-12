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
  Cross-project roadmap. One timeline for every project: milestones, sprints
  and dated epics as bars, today as a line. Below it, capacity for the next
  weeks and the dependencies that cross project lines.

  Scenario mode ("what if"): shift any bar by days, change the hours per
  week and the team size behind a project, and see the projected finish
  (remaining estimate ÷ capacity, working days only) against every target.
  Original bars stay as ghosts. Apply writes the new dates; Discard forgets.
  Scenarios live in this browser until applied or discarded.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import hr from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { MilestoneStatus, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount } from 'svelte'

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
  mq.query(tracker.class.Milestone, {}, (r) => { milestones = r.filter((m) => m.archived !== true) }, { sort: { targetDate: SortingOrder.Ascending } })
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

  // epics with dates, and every open issue (for projections)
  let epics: Issue[] = []
  let openIssues: Issue[] = []
  $: void client.findAll(tracker.class.Issue, { kind: tracker.taskTypes.Epic, dueDate: { $ne: null } }, { limit: 500 }).then((r) => { epics = r })
  $: if (openIds.length > 0) void client.findAll(tracker.class.Issue, { status: { $in: openIds } }, { limit: 5000 }).then((r) => { openIssues = r })

  // ---- scenario ---------------------------------------------------------------
  let scenario = false
  let shifts: Record<string, number> = {}
  let hoursPerWeek = 40
  let teamOverride: Record<string, number> = {}
  const KEY = 'ceepee.roadmap.scenario'
  onMount(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw !== null) {
        const j = JSON.parse(raw)
        shifts = j.shifts ?? {}
        hoursPerWeek = j.hoursPerWeek ?? 40
        teamOverride = j.teamOverride ?? {}
        scenario = Object.values(shifts).some((v) => v !== 0) || Object.keys(teamOverride).length > 0 || hoursPerWeek !== 40
      }
    } catch {}
  })
  $: {
    try {
      localStorage.setItem(KEY, JSON.stringify({ shifts, hoursPerWeek, teamOverride }))
    } catch {}
  }
  const shiftOf = (key: string): number => (scenario ? shifts[key] ?? 0 : 0)
  function shift (key: string, d: number): void {
    shifts = { ...shifts, [key]: (shifts[key] ?? 0) + d }
  }
  function startOfToday (): number {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  function addWorkdays (fromT: number, n: number): number {
    let t = fromT
    let k = 0
    while (k < n) {
      t += DAY
      const dow = new Date(t).getDay()
      if (dow !== 0 && dow !== 6) k++
    }
    return t
  }
  interface Projection {
    finish: number
    remaining: number
    people: number
    unestimated: number
  }
  function project (list: Issue[], space: Ref<Project>): Projection | undefined {
    if (list.length === 0) return undefined
    const est = list.reduce((a, i) => a + Math.max(0, (i.estimation ?? 0) - (i.reportedTime ?? 0)), 0)
    const unestimated = list.filter((i) => (i.estimation ?? 0) === 0).length
    const remaining = est + unestimated * 8
    const people = teamOverride[space] ?? Math.max(1, new Set(list.map((i) => i.assignee).filter((a) => a != null)).size)
    const perDay = Math.max(1, people * ((scenario ? hoursPerWeek : 40) / 5))
    return { finish: addWorkdays(startOfToday(), Math.ceil(remaining / perDay)), remaining, people, unestimated }
  }

  interface Bar {
    key: string
    label: string
    start: number
    end: number
    origStart: number
    origEnd: number
    kind: 'milestone' | 'sprint' | 'epic'
    done?: boolean
    projection?: Projection
    open: () => void
    apply: (days: number) => Promise<void>
  }
  interface ProjectRow {
    project: Project
    bars: Bar[]
  }
  $: rowsByProject = projects.map((p): ProjectRow => {
    const bars: Bar[] = []
    for (const m of milestones.filter((m) => m.space === p._id)) {
      const origEnd = m.targetDate
      const origStart = m.startDate ?? origEnd - 30 * DAY
      const d = shiftOf(m._id) * DAY
      if (origEnd + d < from || origStart + d > to) continue
      bars.push({
        key: m._id,
        label: m.label,
        start: origStart + d,
        end: origEnd + d,
        origStart,
        origEnd,
        kind: 'milestone',
        done: m.status === MilestoneStatus.Completed,
        projection: m.status === MilestoneStatus.Completed ? undefined : project(openIssues.filter((i) => i.milestone === m._id), p._id),
        open: () => { showPanel(view.component.EditDoc, m._id, m._class, 'content') },
        apply: async (days) => { await client.update(m, { targetDate: m.targetDate + days * DAY, ...(m.startDate != null ? { startDate: m.startDate + days * DAY } : {}) }) }
      })
    }
    for (const s of sprints.filter((s) => s.space === p._id)) {
      const d = shiftOf(s._id) * DAY
      if (s.endDate + d < from || s.startDate + d > to) continue
      bars.push({
        key: s._id,
        label: s.name,
        start: s.startDate + d,
        end: s.endDate + d,
        origStart: s.startDate,
        origEnd: s.endDate,
        kind: 'sprint',
        projection: project(openIssues.filter((i) => i.sprint === s._id), p._id),
        open: () => {},
        apply: async (days) => { await client.update(s, { startDate: s.startDate + days * DAY, endDate: s.endDate + days * DAY }) }
      })
    }
    for (const e of epics.filter((e) => e.space === p._id)) {
      const origEnd = e.dueDate ?? 0
      const origStart = e.startDate ?? e.createdOn ?? origEnd - 30 * DAY
      const d = shiftOf(e._id) * DAY
      if (origEnd + d < from || origStart + d > to) continue
      bars.push({
        key: e._id,
        label: `${e.identifier} ${e.title}`,
        start: origStart + d,
        end: origEnd + d,
        origStart,
        origEnd,
        kind: 'epic',
        done: !openIds.includes(e.status),
        projection: openIds.includes(e.status) ? project(openIssues.filter((i) => i.attachedTo === e._id), p._id) : undefined,
        open: () => { showPanel(view.component.EditDoc, e._id, e._class, 'content') },
        apply: async (days) => { await client.update(e, { dueDate: (e.dueDate ?? 0) + days * DAY, ...(e.startDate != null ? { startDate: e.startDate + days * DAY } : {}) }) }
      })
    }
    return { project: p, bars: bars.sort((a, b) => a.start - b.start) }
  }).filter((r) => r.bars.length > 0)
  $: totalRows = rowsByProject.reduce((a, r) => a + r.bars.length + 1, 0)
  $: H = 40 + totalRows * ROW
  $: allBars = rowsByProject.flatMap((r) => r.bars.map((b) => ({ ...b, projectName: r.project.name, space: r.project._id })))
  $: atRisk = allBars.filter((b) => b.projection !== undefined && b.projection.finish > b.end).length
  $: pendingShifts = Object.entries(shifts).filter(([, v]) => v !== 0).length

  async function applyScenario (): Promise<void> {
    const changes = allBars.filter((b) => (shifts[b.key] ?? 0) !== 0)
    if (changes.length === 0 || !confirm(`Write ${changes.length} new date${changes.length === 1 ? '' : 's'} to the real milestones, sprints and epics?`)) return
    for (const b of changes) await b.apply(shifts[b.key])
    shifts = {}
  }
  function discard (): void {
    shifts = {}
    teamOverride = {}
    hoursPerWeek = 40
    scenario = false
  }
  function setTeam (space: Ref<Project>, e: Event): void {
    const v = Number((e.currentTarget as HTMLInputElement).value)
    const next = { ...teamOverride }
    if (Number.isNaN(v) || v <= 0) delete next[space]
    else next[space] = v
    teamOverride = next
  }

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
    const perDay = (scenario ? hoursPerWeek : 40) / 5
    capacity = people
      .map((p) => ({ id: p._id, name: formatName(p.name), assigned: assigned.get(p._id) ?? 0, leaveDays: leave.get(p._id) ?? 0, available: Math.max(0, workdays - (leave.get(p._id) ?? 0)) * perDay }))
      .sort((a, b) => b.assigned / Math.max(1, b.available) - a.assigned / Math.max(1, a.available))
  }
  $: void loadCapacity(weeks, openIds), scenario, hoursPerWeek

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
  function fmtDate (t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  const daysBetween = (a: number, b: number): number => Math.round((b - a) / DAY)
</script>

<div class="rm">
  <header class="rm__head">
    <span class="rm__title"><Label label={tracker.string.Roadmap} /></span>
    <div class="rm__tools">
      <select class="select" bind:value={months}><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></select>
      <Button kind={scenario ? 'primary' : 'ghost'} label={tracker.string.Scenario} on:click={() => { scenario = !scenario }} />
      {#if atRisk > 0}<span class="risk">⚠ {atRisk} projected to miss target</span>{/if}
    </div>
  </header>

  {#if scenario}
    <section class="card card--scenario motion-pop">
      <div class="card__head">
        <span class="card__title">What if…</span>
        <div class="card__tools">
          <label class="knob">hours / week per person <input class="input input--n" type="number" min="1" max="80" bind:value={hoursPerWeek} /></label>
          <Button kind={'primary'} label={tracker.string.Apply} disabled={pendingShifts === 0} on:click={() => { void applyScenario() }} />
          <Button kind={'ghost'} label={tracker.string.Discard} on:click={discard} />
        </div>
      </div>
      <p class="muted">Projected finish = remaining estimate (unestimated issues count as 8h) ÷ team hours per working day. Team size defaults to the people assigned; override it per project. Nothing is written until you Apply.</p>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th class="th th--l">Project</th><th class="th th--l">Item</th><th class="th">Team</th><th class="th">Shift</th><th class="th">Target</th><th class="th">Projected</th><th class="th">Slack</th></tr></thead>
          <tbody>
            {#each rowsByProject as r (r.project._id)}
              {#each r.bars as b, bi (b.key)}
                <tr class:tr--late={b.projection !== undefined && b.projection.finish > b.end}>
                  <td class="td td--l">{#if bi === 0}<b>{r.project.name}</b>{/if}</td>
                  <td class="td td--l"><span class="kind kind--{b.kind}" />{b.label}</td>
                  <td class="td">{#if bi === 0}<input class="input input--n" type="number" min="1" placeholder={String(b.projection?.people ?? '')} value={teamOverride[r.project._id] ?? ''} on:change={(e) => { setTeam(r.project._id, e) }} />{/if}</td>
                  <td class="td td--shift">
                    <button class="mini" on:click={() => { shift(b.key, -7) }}>◀7</button><button class="mini" on:click={() => { shift(b.key, -1) }}>◀</button>
                    <span class="shift" class:shift--on={(shifts[b.key] ?? 0) !== 0}>{(shifts[b.key] ?? 0) > 0 ? '+' : ''}{shifts[b.key] ?? 0}d</span>
                    <button class="mini" on:click={() => { shift(b.key, 1) }}>▶</button><button class="mini" on:click={() => { shift(b.key, 7) }}>7▶</button>
                  </td>
                  <td class="td">{fmtDate(b.end)}</td>
                  <td class="td">{#if b.projection !== undefined}{fmtDate(b.projection.finish)} <span class="muted">({Math.round(b.projection.remaining)}h · {b.projection.people}p)</span>{:else}—{/if}</td>
                  <td class="td td--slack">{#if b.projection !== undefined}{daysBetween(b.projection.finish, b.end) >= 0 ? '+' : ''}{daysBetween(b.projection.finish, b.end)}d{/if}</td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

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
              {#if scenario && (b.start !== b.origStart || b.end !== b.origEnd)}
                <rect x={px(b.origStart)} y={y + 5} width={Math.max(3, px(b.origEnd) - px(b.origStart))} height={b.kind === 'sprint' ? 8 : 14} rx="4" class="bar bar--ghost" />
              {/if}
              <rect x={px(b.start)} y={y + 5} width={Math.max(3, px(b.end) - px(b.start))} height={b.kind === 'sprint' ? 8 : 14} rx="4" class="bar bar--{b.kind}" class:bar--done={b.done === true} role="button" tabindex="0" on:click={b.open} on:keydown={(e) => { if (e.key === 'Enter') b.open() }}><title>{b.label}</title></rect>
              {#if b.projection !== undefined && b.projection.finish >= from && b.projection.finish <= to}
                <path d="M{px(b.projection.finish)},{y + 4} l5,8 l-5,8 l-5,-8 z" class="proj" class:proj--late={b.projection.finish > b.end}><title>projected {fmtDate(b.projection.finish)}</title></path>
              {/if}
            {/each}
          {/each}
        </svg>
      </div>
      <div class="legend"><span><i class="sw sw--milestone" />Milestone</span><span><i class="sw sw--sprint" />Sprint</span><span><i class="sw sw--epic" />Epic (dated)</span><span><i class="sw sw--today" />Today</span><span><i class="sw sw--proj" />Projected finish</span>{#if scenario}<span><i class="sw sw--ghost" />Before scenario</span>{/if}</div>
    {/if}
  </section>

  <div class="two">
    <section class="card motion-rise" style="--i: 1">
      <div class="card__head"><span class="card__title"><Label label={tracker.string.Capacity} /></span><select class="select" bind:value={weeks}><option value={1}>1 week</option><option value={2}>2 weeks</option><option value={4}>4 weeks</option></select></div>
      <p class="muted">Remaining estimate on issues due in the window or in an active sprint, against {scenario ? hoursPerWeek / 5 : 8}h × working days, minus approved leave.</p>
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
  .rm__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .rm__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .rm__tools { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .risk { font-size: 0.8125rem; font-weight: 600; color: #b8860b; }
  .select, .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .input--n { width: 4.5rem; }
  .knob { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); min-width: 0; &--scenario { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .card__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
  .card__tools { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 1rem; }
  .tl-wrap, .tbl-wrap { overflow-x: auto; }
  .tl { width: 100%; height: auto; }
  .tl__grid { stroke: var(--theme-divider-color); }
  .tl__tick { fill: var(--theme-trans-color); font-size: 11px; }
  .tl__today { stroke: var(--accent-brand); stroke-width: 2; }
  .tl__project { fill: var(--theme-caption-color); font-size: 12px; font-weight: 700; }
  .tl__label { fill: var(--theme-dark-color); font-size: 11px; }
  .bar { cursor: pointer; transition: opacity var(--motion-fast), x var(--motion-base) var(--ease-standard); &:hover { opacity: 0.8; } &--milestone { fill: var(--primary-button-default); } &--sprint { fill: var(--theme-trans-color); } &--epic { fill: #6a45f5; } &--done { fill: var(--accent-brand); } &--ghost { fill: none; stroke: var(--theme-trans-color); stroke-dasharray: 3 3; pointer-events: none; } }
  .proj { fill: var(--accent-brand); stroke: var(--theme-panel-color); &--late { fill: var(--negative-button-default); } }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.75rem; color: var(--theme-dark-color); span { display: inline-flex; align-items: center; gap: 0.35rem; } }
  .sw { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; &--milestone { background: var(--primary-button-default); } &--sprint { background: var(--theme-trans-color); } &--epic { background: #6a45f5; } &--today { background: var(--accent-brand); } &--proj { background: var(--accent-brand); transform: rotate(45deg) scale(0.8); } &--ghost { border: 1px dashed var(--theme-trans-color); background: transparent; } }
  .tbl { border-collapse: collapse; font-size: 0.8125rem; min-width: 100%; }
  .th, .td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); text-align: center; white-space: nowrap; &--l { text-align: left; } }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--theme-dark-color); }
  .td { color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .td--shift { display: flex; align-items: center; justify-content: center; gap: 0.2rem; }
  .td--slack { font-weight: 600; }
  .tr--late .td--slack { color: var(--negative-button-default); }
  .kind { display: inline-block; width: 0.5rem; height: 0.5rem; margin-right: 0.4rem; border-radius: 2px; &--milestone { background: var(--primary-button-default); } &--sprint { background: var(--theme-trans-color); } &--epic { background: #6a45f5; } }
  .mini { padding: 0.1rem 0.35rem; border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.7rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .shift { min-width: 2.6rem; font-variant-numeric: tabular-nums; color: var(--theme-trans-color); &--on { color: var(--theme-caption-color); font-weight: 600; } }
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
