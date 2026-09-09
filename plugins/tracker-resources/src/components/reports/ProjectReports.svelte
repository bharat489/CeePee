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
  Reports for a project.

  Twelve reports, all derived from data the platform already keeps: issues,
  and the activity messages written for every status/sprint change. Nothing
  new is written; history is available retroactively. Charts are plain SVG.

  History-based reports (control chart, created vs resolved, resolution
  time, sprint report) read the last 180 days of activity.
-->
<script lang="ts">
  import activity from '@hcengineering/activity'
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, MilestoneStatus, type Component as TComponent, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const DAY = 86_400_000
  const HISTORY_DAYS = 180

  // ---- reference data ----------------------------------------------------
  const sprintQuery = createQuery()
  const statusQuery = createQuery()
  const milestoneQuery = createQuery()
  const componentQuery = createQuery()
  let sprints: Sprint[] = []
  let statuses: IssueStatus[] = []
  let milestones: Milestone[] = []
  let components: TComponent[] = []
  statusQuery.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: sprintQuery.query(tracker.class.Sprint, { space: currentSpace }, (r) => { sprints = r }, { sort: { startDate: SortingOrder.Descending } })
  $: milestoneQuery.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r }, { sort: { targetDate: SortingOrder.Ascending } })
  $: componentQuery.query(tracker.class.Component, { space: currentSpace }, (r) => { components = r })
  $: category = new Map(statuses.map((s) => [s._id, s.category]))
  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))

  function startOfDay (t: number): number {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  function isDone (st: Ref<IssueStatus> | undefined): boolean {
    const c = st !== undefined ? category.get(st) : undefined
    return c === task.statusCategory.Won || c === task.statusCategory.Lost
  }
  function isActive (st: Ref<IssueStatus> | undefined): boolean {
    return st !== undefined && category.get(st) === task.statusCategory.Active
  }

  // ---- issues + history (loaded once per project) ------------------------
  let issues: Issue[] = []
  let loaded: Ref<Project> | undefined
  interface Change {
    id: Ref<Issue>
    field: string
    at: number
    value: string | null
  }
  let history: Change[] = []
  let byIssue = new Map<Ref<Issue>, Change[]>()
  let names = new Map<Ref<Person>, string>()
  let loading = false

  async function load (space: Ref<Project>): Promise<void> {
    loading = true
    try {
      issues = await client.findAll(tracker.class.Issue, { space }, { limit: 5000 })
      const ids = new Set(issues.map((i) => i._id))
      const since = Date.now() - HISTORY_DAYS * DAY
      const msgs = await client.findAll(
        activity.class.DocUpdateMessage,
        { objectClass: tracker.class.Issue, action: 'update', createdOn: { $gte: since } },
        { limit: 50000, sort: { createdOn: SortingOrder.Ascending } }
      )
      history = msgs
        .filter((m) => ids.has(m.objectId as Ref<Issue>) && m.attributeUpdates !== undefined && ['status', 'sprint', 'assignee'].includes(m.attributeUpdates.attrKey))
        .map((m) => ({
          id: m.objectId as Ref<Issue>,
          field: m.attributeUpdates?.attrKey ?? '',
          at: m.createdOn ?? m.modifiedOn,
          value: (m.attributeUpdates?.set[0] as string | null | undefined) ?? null
        }))
      const map = new Map<Ref<Issue>, Change[]>()
      for (const c of history) map.set(c.id, [...(map.get(c.id) ?? []), c])
      byIssue = map
      const pids = Array.from(new Set(issues.map((i) => i.assignee).filter((a): a is Ref<Person> => a != null)))
      const people = pids.length > 0 ? await client.findAll(contact.class.Person, { _id: { $in: pids } }) : []
      names = new Map(people.map((p) => [p._id, formatName(p.name)]))
      loaded = space
    } finally {
      loading = false
    }
  }
  $: if (statuses.length > 0 && loaded !== currentSpace && !loading) void load(currentSpace)

  // status held at time t; unknown before the first recorded change
  function statusAt (i: Issue, t: number): Ref<IssueStatus> | undefined {
    const list = (byIssue.get(i._id) ?? []).filter((c) => c.field === 'status')
    if (list.length === 0) return i.status
    let s: Ref<IssueStatus> | undefined
    for (const c of list) if (c.at <= t) s = c.value as Ref<IssueStatus>
    return s
  }
  // first moment the issue reached a done status (within the history window)
  function doneAt (i: Issue): number | undefined {
    if (!isDone(i.status)) return undefined
    const list = (byIssue.get(i._id) ?? []).filter((c) => c.field === 'status')
    for (const c of list) if (isDone(c.value as Ref<IssueStatus>)) return c.at
    return list.length === 0 ? i.createdOn : undefined
  }
  function firstActiveAt (i: Issue): number | undefined {
    const list = (byIssue.get(i._id) ?? []).filter((c) => c.field === 'status')
    for (const c of list) if (isActive(c.value as Ref<IssueStatus>)) return c.at
    return undefined
  }

  // ---- report selection ---------------------------------------------------
  type ReportId = 'burndown' | 'velocity' | 'cfd' | 'sprint' | 'control' | 'cvr' | 'restime' | 'stats' | 'time' | 'epic' | 'version' | 'csat'
  const reports: Array<{ id: ReportId, label: string }> = [
    { id: 'burndown', label: 'Burndown' },
    { id: 'velocity', label: 'Velocity' },
    { id: 'cfd', label: 'Cumulative flow' },
    { id: 'sprint', label: 'Sprint report' },
    { id: 'control', label: 'Control chart' },
    { id: 'cvr', label: 'Created vs resolved' },
    { id: 'restime', label: 'Resolution time' },
    { id: 'stats', label: 'Statistics' },
    { id: 'time', label: 'Time tracking' },
    { id: 'epic', label: 'Epic burndown' },
    { id: 'version', label: 'Version report' },
    { id: 'csat', label: 'Satisfaction' }
  ]
  let report: ReportId = 'burndown'

  let selectedSprint: Ref<Sprint> | undefined
  $: if (selectedSprint === undefined && sprints.length > 0) selectedSprint = (sprints.find((s) => s.state === 'active') ?? sprints[0])._id
  $: sprint = sprints.find((s) => s._id === selectedSprint)
  let selectedMilestone: Ref<Milestone> | undefined
  $: if (selectedMilestone === undefined && milestones.length > 0) selectedMilestone = (milestones.find((m) => m.status === MilestoneStatus.InProgress) ?? milestones[0])._id
  $: milestone = milestones.find((m) => m._id === selectedMilestone)
  $: epics = issues.filter((i) => i.kind === tracker.taskTypes.Epic)
  let selectedEpic: Ref<Issue> | undefined
  $: if (selectedEpic === undefined && epics.length > 0) selectedEpic = epics[0]._id
  $: epic = epics.find((e) => e._id === selectedEpic)
  let window = 30
  let statsField: 'status' | 'priority' | 'assignee' | 'component' | 'kind' | 'milestone' | 'sprint' = 'status'
  let statsOpenOnly = true

  const size = (i: Issue, usePts: boolean): number => (usePts ? i.storyPoints ?? 0 : 1)
  const usePoints = (list: Issue[]): boolean => list.some((i) => (i.storyPoints ?? 0) > 0)

  // ---- 1. burndown ---------------------------------------------------------
  interface Burn {
    days: number[]
    ideal: number[]
    actual: number[]
    total: number
    unit: string
  }
  function burndownFor (list: Issue[], start: number, end: number): Burn {
    const pts = usePoints(list)
    const today = startOfDay(Date.now())
    const days: number[] = []
    for (let d = start; d <= end; d += DAY) days.push(d)
    if (days.length === 0) days.push(start)
    const total = list.reduce((a, i) => a + size(i, pts), 0)
    const span = Math.max(1, (end - start) / DAY)
    const ideal = days.map((d) => Math.max(0, total * (1 - (d - start) / DAY / span)))
    const actual = days
      .filter((d) => d <= today)
      .map((d) => {
        const eod = d + DAY - 1
        return list.filter((i) => (i.createdOn ?? 0) <= eod).reduce((a, i) => a + (isDone(statusAt(i, eod)) ? 0 : size(i, pts)), 0)
      })
    return { days, ideal, actual, total, unit: pts ? 'pts' : 'issues' }
  }
  $: burndown = sprint !== undefined && loaded !== undefined ? burndownFor(issues.filter((i) => i.sprint === sprint._id), startOfDay(sprint.startDate), startOfDay(sprint.endDate)) : undefined
  $: epicBurn = epic !== undefined && loaded !== undefined ? burndownFor(issues.filter((i) => i.attachedTo === epic._id), startOfDay(epic.createdOn ?? epic.modifiedOn), Math.max(startOfDay(Date.now()), epic.dueDate != null ? startOfDay(epic.dueDate) : 0)) : undefined

  // ---- 2. velocity ---------------------------------------------------------
  $: velocity = sprints
    .filter((s) => s.state === 'completed')
    .sort((a, b) => a.endDate - b.endDate)
    .slice(-8)
    .map((s) => {
      const list = issues.filter((i) => i.sprint === s._id)
      const pts = usePoints(list)
      return { name: s.name, value: list.filter((i) => isDone(i.status)).reduce((a, i) => a + size(i, pts), 0), unit: pts ? 'pts' : 'issues' }
    })
  $: avgVelocity = velocity.length > 0 ? velocity.reduce((a, v) => a + v.value, 0) / velocity.length : 0

  // ---- 3. cumulative flow --------------------------------------------------
  $: cfd = ((): { days: number[], todo: number[], active: number[], done: number[] } | undefined => {
    if (loaded === undefined) return undefined
    const today = startOfDay(Date.now())
    const since = today - (window - 1) * DAY
    const days: number[] = []
    for (let d = since; d <= today; d += DAY) days.push(d)
    const todo: number[] = []
    const active: number[] = []
    const done: number[] = []
    for (const d of days) {
      const eod = d + DAY - 1
      let t = 0
      let a = 0
      let n = 0
      for (const i of issues) {
        if ((i.createdOn ?? 0) > eod) continue
        const st = statusAt(i, eod)
        if (isDone(st)) n++
        else if (isActive(st)) a++
        else t++
      }
      todo.push(t)
      active.push(a)
      done.push(n)
    }
    return { days, todo, active, done }
  })()

  // ---- 4. sprint report ----------------------------------------------------
  $: sprintReport = ((): { completed: Issue[], open: Issue[], carried: Issue[], added: Issue[] } | undefined => {
    if (sprint === undefined || loaded === undefined) return undefined
    const inSprint = issues.filter((i) => i.sprint === sprint._id)
    const completed = inSprint.filter((i) => isDone(i.status))
    const open = inSprint.filter((i) => !isDone(i.status))
    // carried: sprint field changed away from this sprint after it started
    const carried = issues.filter((i) => {
      const list = (byIssue.get(i._id) ?? []).filter((c) => c.field === 'sprint')
      for (let k = 1; k < list.length; k++) if (list[k - 1].value === sprint._id && list[k].value !== sprint._id && list[k].at >= sprint.startDate) return true
      return false
    })
    const added = inSprint.filter((i) => {
      const list = (byIssue.get(i._id) ?? []).filter((c) => c.field === 'sprint')
      const last = list[list.length - 1]
      return last !== undefined && last.value === sprint._id && last.at > sprint.startDate + DAY
    })
    return { completed, open, carried, added }
  })()

  $: sprintGroups = sprintReport === undefined ? [] : [
    { title: 'Completed', list: sprintReport.completed },
    { title: 'Not completed', list: sprintReport.open },
    { title: 'Carried over', list: sprintReport.carried },
    { title: 'Added after start', list: sprintReport.added }
  ]

  // ---- 5. control chart ----------------------------------------------------
  interface Cycle {
    issue: Issue
    done: number
    days: number
  }
  $: cycles = ((): Cycle[] => {
    const out: Cycle[] = []
    const since = Date.now() - window * DAY
    for (const i of issues) {
      const d = doneAt(i)
      if (d === undefined || d < since) continue
      const start = firstActiveAt(i) ?? i.createdOn ?? d
      out.push({ issue: i, done: d, days: Math.max(0, (d - start) / DAY) })
    }
    return out.sort((a, b) => a.done - b.done)
  })()
  $: cycleAvg = cycles.length > 0 ? cycles.reduce((a, c) => a + c.days, 0) / cycles.length : 0
  $: cycleMedian = cycles.length > 0 ? [...cycles].sort((a, b) => a.days - b.days)[Math.floor(cycles.length / 2)].days : 0
  function rolling (list: Cycle[], n = 5): number[] {
    return list.map((_, i) => {
      const slice = list.slice(Math.max(0, i - n + 1), i + 1)
      return slice.reduce((a, c) => a + c.days, 0) / slice.length
    })
  }

  // ---- 6. created vs resolved ---------------------------------------------
  $: cvr = ((): { days: number[], created: number[], resolved: number[] } | undefined => {
    if (loaded === undefined) return undefined
    const today = startOfDay(Date.now())
    const since = today - (window - 1) * DAY
    const days: number[] = []
    for (let d = since; d <= today; d += DAY) days.push(d)
    const created = days.map(() => 0)
    const resolved = days.map(() => 0)
    const idx = (t: number): number => Math.floor((startOfDay(t) - since) / DAY)
    for (const i of issues) {
      const c = i.createdOn
      if (c !== undefined && c >= since) created[idx(c)]++
      const d = doneAt(i)
      if (d !== undefined && d >= since) resolved[idx(d)]++
    }
    return { days, created, resolved }
  })()

  // ---- 7. resolution time --------------------------------------------------
  const BUCKETS = [
    { label: '< 1d', max: 1 },
    { label: '1–3d', max: 3 },
    { label: '3–7d', max: 7 },
    { label: '1–2w', max: 14 },
    { label: '2–4w', max: 30 },
    { label: '> 4w', max: Infinity }
  ]
  $: resTimes = issues
    .map((i) => {
      const d = doneAt(i)
      return d !== undefined && d >= Date.now() - window * DAY && i.createdOn !== undefined ? (d - i.createdOn) / DAY : undefined
    })
    .filter((x): x is number => x !== undefined)
  $: resBuckets = BUCKETS.map((b, k) => ({ ...b, n: resTimes.filter((t) => t < b.max && (k === 0 || t >= BUCKETS[k - 1].max)).length }))
  $: resAvg = resTimes.length > 0 ? resTimes.reduce((a, b) => a + b, 0) / resTimes.length : 0
  $: resMedian = resTimes.length > 0 ? [...resTimes].sort((a, b) => a - b)[Math.floor(resTimes.length / 2)] : 0

  // ---- 8. statistics (donut) -----------------------------------------------
  const PALETTE = ['#2b6bea', '#c0f010', '#6a45f5', '#f5a623', '#e0475b', '#2bb3a0', '#8d8f9a', '#d97ce0', '#4fb8ff', '#c9a227']
  const prioLabel: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'None' }
  $: statsRows = ((): Array<{ label: string, n: number }> => {
    const list = statsOpenOnly ? issues.filter((i) => !isDone(i.status)) : issues
    const key = (i: Issue): string => {
      switch (statsField) {
        case 'status':
          return statusName.get(i.status) ?? '—'
        case 'priority':
          return prioLabel[i.priority]
        case 'assignee':
          return i.assignee != null ? names.get(i.assignee) ?? '—' : 'Unassigned'
        case 'component':
          return components.find((c) => c._id === i.component)?.label ?? 'None'
        case 'kind':
          return i.kind === tracker.taskTypes.Epic ? 'Epic' : i.kind === tracker.taskTypes.Initiative ? 'Initiative' : 'Issue'
        case 'milestone':
          return milestones.find((m) => m._id === i.milestone)?.label ?? 'None'
        case 'sprint':
          return sprints.find((s) => s._id === i.sprint)?.name ?? 'None'
      }
    }
    const m = new Map<string, number>()
    for (const i of list) m.set(key(i), (m.get(key(i)) ?? 0) + 1)
    return Array.from(m.entries()).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n)
  })()
  $: statsTotal = statsRows.reduce((a, r) => a + r.n, 0)
  function arc (startFrac: number, endFrac: number, r = 70, cx = 90, cy = 90, w = 22): string {
    const a0 = startFrac * 2 * Math.PI - Math.PI / 2
    const a1 = endFrac * 2 * Math.PI - Math.PI / 2
    const large = endFrac - startFrac > 0.5 ? 1 : 0
    const p = (a: number, rad: number): string => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
    const ri = r - w
    return `M${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, ri)} A${ri},${ri} 0 ${large} 0 ${p(a0, ri)} Z`
  }

  // ---- 9. time tracking ----------------------------------------------------
  let timeScope: 'sprint' | 'milestone' | 'open' = 'open'
  $: timeRows = (timeScope === 'sprint' && sprint !== undefined ? issues.filter((i) => i.sprint === sprint._id) : timeScope === 'milestone' && milestone !== undefined ? issues.filter((i) => i.milestone === milestone._id) : issues.filter((i) => !isDone(i.status)))
    .filter((i) => (i.estimation ?? 0) > 0 || (i.reportedTime ?? 0) > 0)
    .sort((a, b) => (b.estimation ?? 0) - (a.estimation ?? 0))
  $: timeTotals = timeRows.reduce((a, i) => ({ est: a.est + (i.estimation ?? 0), rep: a.rep + (i.reportedTime ?? 0) }), { est: 0, rep: 0 })

  // ---- 11. version report --------------------------------------------------
  $: version = ((): { total: number, done: number, active: number, todo: number, daysLeft: number, ratePerDay: number, projected: number | undefined, warnings: string[] } | undefined => {
    if (milestone === undefined || loaded === undefined) return undefined
    const list = issues.filter((i) => i.milestone === milestone._id)
    const done = list.filter((i) => isDone(i.status)).length
    const active = list.filter((i) => isActive(i.status)).length
    const todo = list.length - done - active
    const since = Date.now() - 14 * DAY
    const recent = list.filter((i) => {
      const d = doneAt(i)
      return d !== undefined && d >= since
    }).length
    const ratePerDay = recent / 14
    const remaining = list.length - done
    const projected = ratePerDay > 0 ? Date.now() + (remaining / ratePerDay) * DAY : undefined
    const daysLeft = Math.ceil((milestone.targetDate - Date.now()) / DAY)
    const warnings: string[] = []
    if (remaining > 0 && daysLeft < 0) warnings.push(`${remaining} unresolved and the target date has passed`)
    if (projected !== undefined && projected > milestone.targetDate) warnings.push(`At the last 14 days' pace this lands ${Math.ceil((projected - milestone.targetDate) / DAY)}d late`)
    const blocked = list.filter((i) => !isDone(i.status) && (i.blockedBy?.length ?? 0) > 0).length
    if (blocked > 0) warnings.push(`${blocked} open issues are blocked`)
    const overdue = list.filter((i) => !isDone(i.status) && i.dueDate != null && i.dueDate < Date.now()).length
    if (overdue > 0) warnings.push(`${overdue} open issues are past their due date`)
    return { total: list.length, done, active, todo, daysLeft, ratePerDay, projected, warnings }
  })()

  // ---- 12. satisfaction ----------------------------------------------------
  $: csat = issues.filter((i) => typeof (i as any).csat === 'number').map((i) => (i as any).csat as number)
  $: csatAvg = csat.length > 0 ? csat.reduce((a, b) => a + b, 0) / csat.length : 0
  $: csatDist = [1, 2, 3, 4, 5].map((v) => ({ v, n: csat.filter((c) => c === v).length }))

  // ---- svg helpers --------------------------------------------------------
  const W = 640
  const H = 220
  const PAD = { l: 40, r: 12, t: 14, b: 26 }
  function x (i: number, n: number): number {
    return PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r))
  }
  function y (v: number, max: number): number {
    return PAD.t + (max <= 0 ? 1 : 1 - v / max) * (H - PAD.t - PAD.b)
  }
  function line (vals: number[], n: number, max: number): string {
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, n).toFixed(1)},${y(v, max).toFixed(1)}`).join(' ')
  }
  function band (top: number[], bottom: number[], n: number, max: number): string {
    const up = top.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, n).toFixed(1)},${y(v, max).toFixed(1)}`).join(' ')
    const down = bottom.map((v, i) => `L${x(i, n).toFixed(1)},${y(v, max).toFixed(1)}`).reverse().join(' ')
    return `${up} ${down} Z`
  }
  function fmtDay (t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  function ticks (max: number): number[] {
    if (max <= 0) return [0]
    const step = Math.max(1, Math.ceil(max / 4))
    const out: number[] = []
    for (let v = 0; v <= max; v += step) out.push(v)
    return out
  }
  function sum (a: number[], b: number[]): number[] {
    return a.map((v, i) => v + (b[i] ?? 0))
  }
  function open (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  function fmtH (h: number): string {
    return Math.round(h * 10) / 10 + 'h'
  }
</script>

<div class="reports">
  <header class="reports__head">
    <span class="reports__title"><Label label={tracker.string.Reports} /></span>
    <nav class="tabs">
      {#each reports as r (r.id)}
        <button
          class="tab"
          class:tab--active={report === r.id}
          on:click={() => {
            report = r.id
          }}
        >
          {r.label}
        </button>
      {/each}
    </nav>
    {#if ['cfd', 'control', 'cvr', 'restime'].includes(report)}
      <select class="select" bind:value={window}>
        <option value={14}>14d</option>
        <option value={30}>30d</option>
        <option value={90}>90d</option>
        <option value={180}>180d</option>
      </select>
    {/if}
  </header>

  {#if loading && loaded === undefined}
    <p class="muted">…</p>
  {/if}

  <!-- ===== Burndown ===== -->
  {#if report === 'burndown'}
    <section class="card motion-rise">
      <div class="card__head">
        <span class="card__title">Sprint burndown</span>
        {#if sprints.length > 0}
          <select class="select" bind:value={selectedSprint}>
            {#each sprints as s (s._id)}<option value={s._id}>{s.name}{s.state === 'active' ? ' •' : ''}</option>{/each}
          </select>
        {/if}
      </div>
      {#if sprints.length === 0}
        <p class="muted"><Label label={tracker.string.NoSprintsYet} /></p>
      {:else if burndown !== undefined}
        {@const max = Math.max(burndown.total, 1)}
        {@const n = burndown.days.length}
        <svg viewBox="0 0 {W} {H}" class="chart" role="img">
          {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>{/each}
          <path d={line(burndown.ideal, n, max)} class="ideal" />
          <path d={line(burndown.actual, n, max)} class="actual" />
          {#each burndown.actual as v, i}<circle cx={x(i, n)} cy={y(v, max)} r="3" class="dot" />{/each}
          <text x={PAD.l} y={H - 8} class="tick">{fmtDay(burndown.days[0])}</text>
          <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(burndown.days[n - 1])}</text>
        </svg>
        <div class="legend">
          <span><i class="sw sw--lime" />Remaining ({burndown.unit})</span>
          <span><i class="sw sw--grey" />Ideal</span>
          <span class="muted">{burndown.actual[burndown.actual.length - 1] ?? burndown.total} / {burndown.total}</span>
        </div>
      {/if}
    </section>
  {/if}

  <!-- ===== Velocity ===== -->
  {#if report === 'velocity'}
    <section class="card motion-rise">
      <div class="card__head"><span class="card__title">Velocity</span>{#if velocity.length > 0}<span class="muted">avg {avgVelocity.toFixed(1)}</span>{/if}</div>
      {#if velocity.length === 0}
        <p class="muted"><Label label={tracker.string.NoCompletedSprints} /></p>
      {:else}
        {@const max = Math.max(...velocity.map((v) => v.value), 1)}
        {@const n = velocity.length}
        {@const bw = Math.min(56, ((W - PAD.l - PAD.r) / n) * 0.6)}
        <svg viewBox="0 0 {W} {H}" class="chart" role="img">
          {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>{/each}
          {#each velocity as v, i}
            {@const cx = PAD.l + ((i + 0.5) / n) * (W - PAD.l - PAD.r)}
            <rect x={cx - bw / 2} y={y(v.value, max)} width={bw} height={H - PAD.b - y(v.value, max)} class="bar" rx="3" />
            <text x={cx} y={H - 8} class="tick" text-anchor="middle">{v.name.length > 12 ? v.name.slice(0, 11) + '…' : v.name}</text>
            <text x={cx} y={y(v.value, max) - 5} class="tick tick--strong" text-anchor="middle">{v.value}</text>
          {/each}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(avgVelocity, max)} y2={y(avgVelocity, max)} class="avg" />
        </svg>
      {/if}
    </section>
  {/if}

  <!-- ===== Cumulative flow ===== -->
  {#if report === 'cfd' && cfd !== undefined}
    {@const n = cfd.days.length}
    {@const activeTop = sum(cfd.done, cfd.active)}
    {@const todoTop = sum(activeTop, cfd.todo)}
    {@const max = Math.max(...todoTop, 1)}
    {@const zero = cfd.days.map(() => 0)}
    <section class="card motion-rise">
      <div class="card__head"><span class="card__title">Cumulative flow</span><span class="muted">{window}d</span></div>
      <svg viewBox="0 0 {W} {H}" class="chart" role="img">
        {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>{/each}
        <path d={band(todoTop, activeTop, n, max)} class="area area--todo" />
        <path d={band(activeTop, cfd.done, n, max)} class="area area--active" />
        <path d={band(cfd.done, zero, n, max)} class="area area--done" />
        <text x={PAD.l} y={H - 8} class="tick">{fmtDay(cfd.days[0])}</text>
        <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(cfd.days[n - 1])}</text>
      </svg>
      <div class="legend"><span><i class="sw sw--grey" />To do</span><span><i class="sw sw--blue" />In progress</span><span><i class="sw sw--lime" />Done</span></div>
    </section>
  {/if}

  <!-- ===== Sprint report ===== -->
  {#if report === 'sprint'}
    <section class="card motion-rise">
      <div class="card__head">
        <span class="card__title">Sprint report</span>
        {#if sprints.length > 0}
          <select class="select" bind:value={selectedSprint}>
            {#each sprints as s (s._id)}<option value={s._id}>{s.name}{s.state === 'active' ? ' •' : ''}</option>{/each}
          </select>
        {/if}
      </div>
      {#if sprintReport === undefined}
        <p class="muted"><Label label={tracker.string.NoSprintsYet} /></p>
      {:else}
        {#if sprint?.goal}<p class="goal">{sprint.goal}</p>{/if}
        <div class="kpis">
          <div class="kpi"><span class="kpi__n">{sprintReport.completed.length}</span><span class="kpi__l">completed</span></div>
          <div class="kpi"><span class="kpi__n">{sprintReport.open.length}</span><span class="kpi__l">{sprint?.state === 'completed' ? 'left in sprint' : 'not yet done'}</span></div>
          <div class="kpi"><span class="kpi__n">{sprintReport.carried.length}</span><span class="kpi__l">carried over</span></div>
          <div class="kpi"><span class="kpi__n">{sprintReport.added.length}</span><span class="kpi__l">added mid-sprint</span></div>
        </div>
        {#each sprintGroups as g (g.title)}
          {#if g.list.length > 0}
            <div class="group">
              <span class="group__title">{g.title} · {g.list.length}</span>
              {#each g.list as i (i._id)}
                <button class="row" on:click={() => { open(i) }}>
                  <span class="row__id">{i.identifier}</span><span class="row__title">{i.title}</span><span class="row__meta">{statusName.get(i.status) ?? ''}</span>
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </section>
  {/if}

  <!-- ===== Control chart ===== -->
  {#if report === 'control'}
    <section class="card motion-rise">
      <div class="card__head"><span class="card__title">Control chart</span><span class="muted">cycle time, issues resolved in the last {window}d</span></div>
      {#if cycles.length === 0}
        <p class="muted">Nothing resolved in this window.</p>
      {:else}
        {@const max = Math.max(...cycles.map((c) => c.days), 1)}
        {@const n = cycles.length}
        {@const roll = rolling(cycles)}
        <svg viewBox="0 0 {W} {H}" class="chart" role="img">
          {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}d</text>{/each}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(cycleAvg, max)} y2={y(cycleAvg, max)} class="avg" />
          <path d={line(roll, n, max)} class="roll" />
          {#each cycles as c, i}
            <circle cx={x(i, n)} cy={y(c.days, max)} r="4" class="dot dot--blue" role="button" tabindex="0" on:click={() => { open(c.issue) }} on:keydown={(e) => { if (e.key === 'Enter') open(c.issue) }}><title>{c.issue.identifier} · {c.days.toFixed(1)}d</title></circle>
          {/each}
          <text x={PAD.l} y={H - 8} class="tick">{fmtDay(cycles[0].done)}</text>
          <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(cycles[n - 1].done)}</text>
        </svg>
        <div class="legend"><span><i class="sw sw--blue" />Cycle time per issue</span><span><i class="sw sw--lime" />Rolling average</span><span class="muted">avg {cycleAvg.toFixed(1)}d · median {cycleMedian.toFixed(1)}d · {cycles.length} issues</span></div>
      {/if}
    </section>
  {/if}

  <!-- ===== Created vs resolved ===== -->
  {#if report === 'cvr' && cvr !== undefined}
    {@const n = cvr.days.length}
    {@const max = Math.max(...cvr.created, ...cvr.resolved, 1)}
    {@const tc = cvr.created.reduce((a, b) => a + b, 0)}
    {@const tr = cvr.resolved.reduce((a, b) => a + b, 0)}
    <section class="card motion-rise">
      <div class="card__head"><span class="card__title">Created vs resolved</span><span class="muted">{window}d · {tc} created · {tr} resolved · net {tc - tr >= 0 ? '+' : ''}{tc - tr}</span></div>
      <svg viewBox="0 0 {W} {H}" class="chart" role="img">
        {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>{/each}
        <path d={line(cvr.created, n, max)} class="series series--red" />
        <path d={line(cvr.resolved, n, max)} class="series series--lime" />
        <text x={PAD.l} y={H - 8} class="tick">{fmtDay(cvr.days[0])}</text>
        <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(cvr.days[n - 1])}</text>
      </svg>
      <div class="legend"><span><i class="sw sw--red" />Created</span><span><i class="sw sw--lime" />Resolved</span></div>
    </section>
  {/if}

  <!-- ===== Resolution time ===== -->
  {#if report === 'restime'}
    <section class="card motion-rise">
      <div class="card__head"><span class="card__title">Resolution time</span><span class="muted">{resTimes.length} resolved in {window}d · avg {resAvg.toFixed(1)}d · median {resMedian.toFixed(1)}d</span></div>
      {#if resTimes.length === 0}
        <p class="muted">Nothing resolved in this window.</p>
      {:else}
        {@const max = Math.max(...resBuckets.map((b) => b.n), 1)}
        {@const n = resBuckets.length}
        {@const bw = ((W - PAD.l - PAD.r) / n) * 0.6}
        <svg viewBox="0 0 {W} {H}" class="chart" role="img">
          {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>{/each}
          {#each resBuckets as b, i}
            {@const cx = PAD.l + ((i + 0.5) / n) * (W - PAD.l - PAD.r)}
            <rect x={cx - bw / 2} y={y(b.n, max)} width={bw} height={H - PAD.b - y(b.n, max)} class="bar" rx="3" />
            <text x={cx} y={H - 8} class="tick" text-anchor="middle">{b.label}</text>
            <text x={cx} y={y(b.n, max) - 5} class="tick tick--strong" text-anchor="middle">{b.n}</text>
          {/each}
        </svg>
      {/if}
    </section>
  {/if}

  <!-- ===== Statistics ===== -->
  {#if report === 'stats'}
    <section class="card motion-rise">
      <div class="card__head">
        <span class="card__title">Statistics</span>
        <div class="card__tools">
          <select class="select" bind:value={statsField}>
            <option value="status">by status</option><option value="priority">by priority</option><option value="assignee">by assignee</option><option value="component">by component</option><option value="kind">by type</option><option value="milestone">by milestone</option><option value="sprint">by sprint</option>
          </select>
          <label class="check"><input type="checkbox" bind:checked={statsOpenOnly} /> open only</label>
        </div>
      </div>
      {#if statsTotal === 0}
        <p class="muted">No issues.</p>
      {:else}
        <div class="donut">
          <svg viewBox="0 0 180 180" class="donut__svg" role="img">
            {#each statsRows as r, i}
              {@const start = statsRows.slice(0, i).reduce((a, s) => a + s.n, 0) / statsTotal}
              {@const end = start + r.n / statsTotal}
              <path d={arc(start, Math.min(end, 0.9999))} fill={PALETTE[i % PALETTE.length]}><title>{r.label}: {r.n}</title></path>
            {/each}
            <text x="90" y="86" text-anchor="middle" class="donut__n">{statsTotal}</text>
            <text x="90" y="104" text-anchor="middle" class="tick">issues</text>
          </svg>
          <ul class="donut__legend">
            {#each statsRows as r, i}
              <li><i class="sw" style="background: {PALETTE[i % PALETTE.length]}" /><span class="donut__label">{r.label}</span><span class="muted">{r.n} · {Math.round((r.n / statsTotal) * 100)}%</span></li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  <!-- ===== Time tracking ===== -->
  {#if report === 'time'}
    <section class="card motion-rise">
      <div class="card__head">
        <span class="card__title">Time tracking</span>
        <select class="select" bind:value={timeScope}>
          <option value="open">open issues</option><option value="sprint">selected sprint</option><option value="milestone">selected milestone</option>
        </select>
      </div>
      {#if timeScope === 'sprint' && sprints.length > 0}<select class="select" bind:value={selectedSprint}>{#each sprints as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>{/if}
      {#if timeScope === 'milestone' && milestones.length > 0}<select class="select" bind:value={selectedMilestone}>{#each milestones as m (m._id)}<option value={m._id}>{m.label}</option>{/each}</select>{/if}
      <div class="kpis">
        <div class="kpi"><span class="kpi__n">{fmtH(timeTotals.est)}</span><span class="kpi__l">estimated</span></div>
        <div class="kpi"><span class="kpi__n">{fmtH(timeTotals.rep)}</span><span class="kpi__l">logged</span></div>
        <div class="kpi"><span class="kpi__n" class:kpi__n--bad={timeTotals.rep > timeTotals.est}>{fmtH(Math.max(0, timeTotals.est - timeTotals.rep))}</span><span class="kpi__l">remaining</span></div>
      </div>
      <div class="bar-track"><span class="bar-fill" style="width: {timeTotals.est === 0 ? 0 : Math.min(100, (timeTotals.rep / timeTotals.est) * 100)}%" /></div>
      {#each timeRows as i (i._id)}
        <button class="row" on:click={() => { open(i) }}>
          <span class="row__id">{i.identifier}</span><span class="row__title">{i.title}</span>
          <span class="row__meta">{fmtH(i.reportedTime ?? 0)} / {fmtH(i.estimation ?? 0)}</span>
          <span class="mini-track"><span class="bar-fill" class:bar-fill--over={(i.reportedTime ?? 0) > (i.estimation ?? 0)} style="width: {(i.estimation ?? 0) === 0 ? 100 : Math.min(100, ((i.reportedTime ?? 0) / (i.estimation ?? 1)) * 100)}%" /></span>
        </button>
      {/each}
      {#if timeRows.length === 0}<p class="muted">No estimates or time logged in this scope.</p>{/if}
    </section>
  {/if}

  <!-- ===== Epic burndown ===== -->
  {#if report === 'epic'}
    <section class="card motion-rise">
      <div class="card__head">
        <span class="card__title">Epic burndown</span>
        {#if epics.length > 0}<select class="select" bind:value={selectedEpic}>{#each epics as e (e._id)}<option value={e._id}>{e.identifier} {e.title}</option>{/each}</select>{/if}
      </div>
      {#if epics.length === 0}
        <p class="muted">No epics in this project.</p>
      {:else if epicBurn !== undefined}
        {@const max = Math.max(epicBurn.total, 1)}
        {@const n = epicBurn.days.length}
        <svg viewBox="0 0 {W} {H}" class="chart" role="img">
          {#each ticks(max) as t}<line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" /><text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>{/each}
          {#if epic?.dueDate != null}<path d={line(epicBurn.ideal, n, max)} class="ideal" />{/if}
          <path d={line(epicBurn.actual, n, max)} class="actual" />
          <text x={PAD.l} y={H - 8} class="tick">{fmtDay(epicBurn.days[0])}</text>
          <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(epicBurn.days[n - 1])}</text>
        </svg>
        <div class="legend"><span><i class="sw sw--lime" />Remaining ({epicBurn.unit})</span>{#if epic?.dueDate != null}<span><i class="sw sw--grey" />Ideal to due date</span>{/if}<span class="muted">{epicBurn.actual[epicBurn.actual.length - 1] ?? epicBurn.total} / {epicBurn.total}</span></div>
      {/if}
    </section>
  {/if}

  <!-- ===== Version report ===== -->
  {#if report === 'version'}
    <section class="card motion-rise">
      <div class="card__head">
        <span class="card__title">Version report</span>
        {#if milestones.length > 0}<select class="select" bind:value={selectedMilestone}>{#each milestones as m (m._id)}<option value={m._id}>{m.label}</option>{/each}</select>{/if}
      </div>
      {#if version === undefined}
        <p class="muted">No milestones in this project.</p>
      {:else}
        <div class="kpis">
          <div class="kpi"><span class="kpi__n">{version.total === 0 ? 0 : Math.round((version.done / version.total) * 100)}%</span><span class="kpi__l">complete</span></div>
          <div class="kpi"><span class="kpi__n">{version.done}</span><span class="kpi__l">done</span></div>
          <div class="kpi"><span class="kpi__n">{version.active}</span><span class="kpi__l">in progress</span></div>
          <div class="kpi"><span class="kpi__n">{version.todo}</span><span class="kpi__l">to do</span></div>
          <div class="kpi"><span class="kpi__n" class:kpi__n--bad={version.daysLeft < 0}>{version.daysLeft}</span><span class="kpi__l">days to target</span></div>
        </div>
        <div class="bar-track bar-track--stack">
          <span class="bar-fill" style="width: {version.total === 0 ? 0 : (version.done / version.total) * 100}%" />
          <span class="bar-fill bar-fill--blue" style="width: {version.total === 0 ? 0 : (version.active / version.total) * 100}%" />
        </div>
        <p class="muted">Pace: {version.ratePerDay.toFixed(2)} issues/day over 14d{#if version.projected !== undefined} · projected completion {new Date(version.projected).toLocaleDateString()}{/if}</p>
        {#if version.warnings.length > 0}
          <ul class="warnings">{#each version.warnings as w}<li>{w}</li>{/each}</ul>
        {:else}
          <p class="ok">On track.</p>
        {/if}
      {/if}
    </section>
  {/if}

  <!-- ===== Satisfaction ===== -->
  {#if report === 'csat'}
    <section class="card motion-rise">
      <div class="card__head"><span class="card__title">Customer satisfaction</span><span class="muted">{csat.length} ratings</span></div>
      {#if csat.length === 0}
        <p class="muted">No ratings yet. Requests submitted through the service desk ask for one when resolved.</p>
      {:else}
        <div class="kpis"><div class="kpi"><span class="kpi__n">{csatAvg.toFixed(2)}</span><span class="kpi__l">average of 5</span></div></div>
        {#each csatDist.reverse() as d (d.v)}
          <div class="bar-row"><span class="bar-row__label">{'★'.repeat(d.v)}</span><span class="bar-track"><span class="bar-fill" style="width: {(d.n / csat.length) * 100}%" /></span><span class="muted">{d.n}</span></div>
        {/each}
      {/if}
    </section>
  {/if}
</div>

<style lang="scss">
  .reports { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; overflow: auto; }
  .reports__head { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .reports__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .tab {
    padding: 0.35rem 0.7rem; border: 1px solid transparent; border-radius: 999px; background: transparent;
    color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; transition: var(--transition-interactive);
    &:hover { background: var(--theme-button-hovered); }
    &--active { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--theme-caption-color); }
  }
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); min-width: 0; max-width: 64rem; }
  .card__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .card__tools { display: flex; align-items: center; gap: 0.6rem; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .ok { margin: 0; font-size: 0.8125rem; color: var(--accent-brand-ink); }
  .goal { margin: 0; font-size: 0.875rem; color: var(--theme-dark-color); }
  .select { padding: 0.25rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; max-width: 20rem; }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .chart { width: 100%; height: auto; overflow: visible; }
  .grid { stroke: var(--theme-divider-color); stroke-width: 1; }
  .tick { fill: var(--theme-trans-color); font-size: 11px; }
  .tick--strong { fill: var(--theme-caption-color); font-weight: 600; }
  .ideal { fill: none; stroke: var(--theme-trans-color); stroke-width: 1.5; stroke-dasharray: 4 4; }
  .actual { fill: none; stroke: var(--accent-brand); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: draw 900ms var(--ease-enter) forwards; }
  .roll { fill: none; stroke: var(--accent-brand); stroke-width: 2; }
  .series { fill: none; stroke-width: 2.5; stroke-linejoin: round; &--red { stroke: #e0475b; } &--lime { stroke: var(--accent-brand); } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .dot { fill: var(--accent-brand); &--blue { fill: var(--primary-button-default); cursor: pointer; } }
  .bar { fill: var(--primary-button-default); transform-origin: bottom; animation: grow var(--motion-slow) var(--ease-enter) both; }
  @keyframes grow { from { transform: scaleY(0); } }
  .avg { stroke: var(--accent-brand); stroke-width: 1.5; stroke-dasharray: 3 3; }
  .area { stroke: none; opacity: 0.85; &--todo { fill: var(--theme-button-pressed); } &--active { fill: var(--primary-button-default); } &--done { fill: var(--accent-brand); } }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.75rem; color: var(--theme-dark-color); span { display: inline-flex; align-items: center; gap: 0.35rem; } }
  .sw { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; background: var(--theme-trans-color); &--lime { background: var(--accent-brand); } &--grey { background: var(--theme-trans-color); } &--blue { background: var(--primary-button-default); } &--red { background: #e0475b; } }
  .kpis { display: flex; flex-wrap: wrap; gap: 1.5rem; }
  .kpi { display: flex; flex-direction: column; }
  .kpi__n { font-size: 1.5rem; font-weight: 700; color: var(--theme-caption-color); &--bad { color: var(--negative-button-default); } }
  .kpi__l { font-size: 0.75rem; color: var(--theme-trans-color); }
  .group { display: flex; flex-direction: column; margin-top: 0.4rem; }
  .group__title { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--theme-dark-color); padding: 0.3rem 0.4rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.35rem 0.4rem; border: none; border-radius: 0.375rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .row__id { flex-shrink: 0; font-size: 0.7rem; color: var(--theme-trans-color); }
  .row__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row__meta { flex-shrink: 0; font-size: 0.7rem; color: var(--theme-trans-color); }
  .bar-track { display: flex; flex: 1; height: 0.5rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; &--stack { height: 0.6rem; } }
  .mini-track { display: flex; width: 6rem; height: 0.35rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; flex-shrink: 0; }
  .bar-fill { display: block; height: 100%; background: var(--accent-brand); transition: width var(--motion-slow) var(--ease-enter); &--blue { background: var(--primary-button-default); } &--over { background: var(--negative-button-default); } }
  .bar-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8125rem; }
  .bar-row__label { width: 5rem; color: #f5a623; letter-spacing: 0.05em; }
  .warnings { margin: 0; padding: 0.5rem 0.75rem 0.5rem 1.5rem; border: 1px solid #f5a623; border-radius: 0.5rem; color: var(--theme-content-color); font-size: 0.8125rem; }
  .donut { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
  .donut__svg { width: 12rem; height: 12rem; }
  .donut__n { fill: var(--theme-caption-color); font-size: 22px; font-weight: 700; }
  .donut__legend { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8125rem; li { display: flex; align-items: center; gap: 0.5rem; } }
  .donut__label { min-width: 8rem; color: var(--theme-content-color); }
</style>
