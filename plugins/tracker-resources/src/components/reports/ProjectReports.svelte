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
  Reports for a project: sprint burndown, velocity, cumulative flow.

  All three are derived from data the platform already keeps -- every status
  change is an activity message with the new value and a timestamp -- so
  nothing new is written and history is available retroactively. Charts are
  plain SVG; a charting library would triple the bundle for three pictures.

  Sizing uses story points when any issue in the set has them, otherwise
  issue count. Mixed sets are sized in points (unpointed issues count as 0),
  which is what a team that has started pointing expects.
-->
<script lang="ts">
  import activity from '@hcengineering/activity'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Project, type Sprint } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const sprintQuery = createQuery()
  const statusQuery = createQuery()

  let sprints: Sprint[] = []
  let statuses: IssueStatus[] = []

  statusQuery.query(tracker.class.IssueStatus, {}, (r) => {
    statuses = r
  })
  $: sprintQuery.query(
    tracker.class.Sprint,
    { space: currentSpace },
    (r) => {
      sprints = r
    },
    { sort: { startDate: SortingOrder.Descending } }
  )
  $: category = new Map(statuses.map((s) => [s._id, s.category]))

  const DAY = 86_400_000
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

  // ---- status history --------------------------------------------------
  interface Change {
    id: Ref<Issue>
    at: number
    status: Ref<IssueStatus>
  }
  async function history (ids: Set<Ref<Issue>>, since?: number): Promise<Change[]> {
    if (ids.size === 0) return []
    const msgs = await client.findAll(
      activity.class.DocUpdateMessage,
      {
        objectClass: tracker.class.Issue,
        action: 'update',
        ...(since !== undefined ? { createdOn: { $gte: since } } : { objectId: { $in: Array.from(ids) } })
      },
      { limit: 10000 }
    )
    return msgs
      .filter(
        (m) =>
          ids.has(m.objectId as Ref<Issue>) &&
          m.attributeUpdates?.attrKey === 'status' &&
          (m.attributeUpdates?.set.length ?? 0) > 0
      )
      .map((m) => ({
        id: m.objectId as Ref<Issue>,
        at: m.createdOn ?? m.modifiedOn,
        status: m.attributeUpdates?.set[0] as Ref<IssueStatus>
      }))
      .sort((a, b) => a.at - b.at)
  }
  // The status an issue held at time t. An issue that never changed status
  // has held its current one since creation. Before an issue's first
  // recorded change its status is unknown, and treated as not done.
  function statusAt (issue: Issue, byIssue: Map<Ref<Issue>, Change[]>, t: number): Ref<IssueStatus> | undefined {
    const list = byIssue.get(issue._id)
    if (list === undefined) return issue.status
    let s: Ref<IssueStatus> | undefined
    for (const c of list) if (c.at <= t) s = c.status
    return s
  }
  function group (changes: Change[]): Map<Ref<Issue>, Change[]> {
    const m = new Map<Ref<Issue>, Change[]>()
    for (const c of changes) m.set(c.id, [...(m.get(c.id) ?? []), c])
    return m
  }

  // ---- burndown ---------------------------------------------------------
  let selected: Ref<Sprint> | undefined
  $: if (selected === undefined && sprints.length > 0) {
    selected = (sprints.find((s) => s.state === 'active') ?? sprints[0])._id
  }
  $: sprint = sprints.find((s) => s._id === selected)

  interface Burndown {
    days: number[]
    ideal: number[]
    actual: number[]
    total: number
    unit: 'pts' | 'issues'
  }
  let burndown: Burndown | undefined
  let burnBusy = false

  async function computeBurndown (s: Sprint): Promise<void> {
    burnBusy = true
    try {
      const issues = await client.findAll(tracker.class.Issue, { sprint: s._id })
      const usePts = issues.some((i) => (i.storyPoints ?? 0) > 0)
      const size = (i: Issue): number => (usePts ? i.storyPoints ?? 0 : 1)
      const byIssue = group(await history(new Set(issues.map((i) => i._id))))
      const start = startOfDay(s.startDate)
      const end = startOfDay(s.endDate)
      const today = startOfDay(Date.now())
      const days: number[] = []
      for (let d = start; d <= end; d += DAY) days.push(d)
      const total = issues.reduce((a, i) => a + size(i), 0)
      const span = Math.max(1, (end - start) / DAY)
      const ideal = days.map((d) => Math.max(0, total * (1 - (d - start) / DAY / span)))
      const actual = days
        .filter((d) => d <= today)
        .map((d) => {
          const eod = d + DAY - 1
          return issues
            .filter((i) => (i.createdOn ?? 0) <= eod)
            .reduce((a, i) => a + (isDone(statusAt(i, byIssue, eod)) ? 0 : size(i)), 0)
        })
      burndown = { days, ideal, actual, total, unit: usePts ? 'pts' : 'issues' }
    } finally {
      burnBusy = false
    }
  }
  $: if (sprint !== undefined && statuses.length > 0) void computeBurndown(sprint)

  // ---- velocity ---------------------------------------------------------
  let velocity: Array<{ name: string, value: number, unit: 'pts' | 'issues' }> = []
  async function computeVelocity (list: Sprint[]): Promise<void> {
    const done = list
      .filter((s) => s.state === 'completed')
      .sort((a, b) => a.endDate - b.endDate)
      .slice(-8)
    const out: typeof velocity = []
    for (const s of done) {
      const issues = await client.findAll(tracker.class.Issue, { sprint: s._id })
      const usePts = issues.some((i) => (i.storyPoints ?? 0) > 0)
      out.push({
        name: s.name,
        unit: usePts ? 'pts' : 'issues',
        value: issues.filter((i) => isDone(i.status)).reduce((a, i) => a + (usePts ? i.storyPoints ?? 0 : 1), 0)
      })
    }
    velocity = out
  }
  $: if (statuses.length > 0) void computeVelocity(sprints)
  $: avgVelocity = velocity.length > 0 ? velocity.reduce((a, v) => a + v.value, 0) / velocity.length : 0

  // ---- cumulative flow (last 30 days, whole project) -------------------
  interface Cfd {
    days: number[]
    todo: number[]
    active: number[]
    done: number[]
  }
  let cfd: Cfd | undefined
  async function computeCfd (space: Ref<Project>): Promise<void> {
    const today = startOfDay(Date.now())
    const since = today - 29 * DAY
    const issues = await client.findAll(tracker.class.Issue, { space }, { limit: 3000 })
    const ids = new Set(issues.map((i) => i._id))
    const byIssue = group(await history(ids, since))
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
        const st = statusAt(i, byIssue, eod)
        if (isDone(st)) n++
        else if (isActive(st)) a++
        else t++
      }
      todo.push(t)
      active.push(a)
      done.push(n)
    }
    cfd = { days, todo, active, done }
  }
  $: if (statuses.length > 0) void computeCfd(currentSpace)

  // ---- svg helpers ------------------------------------------------------
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
    const down = bottom
      .map((v, i) => `L${x(i, n).toFixed(1)},${y(v, max).toFixed(1)}`)
      .reverse()
      .join(' ')
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
</script>

<div class="reports">
  <header class="reports__head">
    <span class="reports__title"><Label label={tracker.string.Reports} /></span>
  </header>

  <!-- Burndown -->
  <section class="card motion-rise" style="--i: 0">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.Burndown} /></span>
      {#if sprints.length > 0}
        <select class="select" bind:value={selected}>
          {#each sprints as s (s._id)}
            <option value={s._id}>{s.name}{s.state === 'active' ? ' •' : ''}</option>
          {/each}
        </select>
      {/if}
    </div>
    {#if sprints.length === 0}
      <p class="muted"><Label label={tracker.string.NoSprintsYet} /></p>
    {:else if burndown === undefined || burnBusy}
      <p class="muted">…</p>
    {:else}
      {@const max = Math.max(burndown.total, 1)}
      {@const n = burndown.days.length}
      <svg viewBox="0 0 {W} {H}" class="chart" role="img">
        {#each ticks(max) as t}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" />
          <text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>
        {/each}
        <path d={line(burndown.ideal, n, max)} class="ideal" />
        <path d={line(burndown.actual, n, max)} class="actual" />
        {#each burndown.actual as v, i}
          <circle cx={x(i, n)} cy={y(v, max)} r="3" class="dot" />
        {/each}
        <text x={PAD.l} y={H - 8} class="tick">{fmtDay(burndown.days[0])}</text>
        <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(burndown.days[n - 1])}</text>
      </svg>
      <div class="legend">
        <span><i class="sw sw--actual" /><Label label={tracker.string.Remaining} /> ({burndown.unit})</span>
        <span><i class="sw sw--ideal" /><Label label={tracker.string.Ideal} /></span>
        <span class="muted">
          {burndown.actual[burndown.actual.length - 1] ?? burndown.total} / {burndown.total}
        </span>
      </div>
    {/if}
  </section>

  <!-- Velocity -->
  <section class="card motion-rise" style="--i: 1">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.Velocity} /></span>
      {#if velocity.length > 0}
        <span class="muted"><Label label={tracker.string.AvgVelocity} /> {avgVelocity.toFixed(1)}</span>
      {/if}
    </div>
    {#if velocity.length === 0}
      <p class="muted"><Label label={tracker.string.NoCompletedSprints} /></p>
    {:else}
      {@const max = Math.max(...velocity.map((v) => v.value), 1)}
      {@const n = velocity.length}
      {@const bw = Math.min(56, ((W - PAD.l - PAD.r) / n) * 0.6)}
      <svg viewBox="0 0 {W} {H}" class="chart" role="img">
        {#each ticks(max) as t}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" />
          <text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>
        {/each}
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

  <!-- Cumulative flow -->
  <section class="card motion-rise" style="--i: 2">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.CumulativeFlow} /></span>
      <span class="muted">30d</span>
    </div>
    {#if cfd === undefined}
      <p class="muted">…</p>
    {:else}
      {@const n = cfd.days.length}
      {@const doneTop = cfd.done}
      {@const activeTop = sum(cfd.done, cfd.active)}
      {@const todoTop = sum(activeTop, cfd.todo)}
      {@const max = Math.max(...todoTop, 1)}
      {@const zero = cfd.days.map(() => 0)}
      <svg viewBox="0 0 {W} {H}" class="chart" role="img">
        {#each ticks(max) as t}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t, max)} y2={y(t, max)} class="grid" />
          <text x={PAD.l - 6} y={y(t, max) + 4} class="tick" text-anchor="end">{t}</text>
        {/each}
        <path d={band(todoTop, activeTop, n, max)} class="area area--todo" />
        <path d={band(activeTop, doneTop, n, max)} class="area area--active" />
        <path d={band(doneTop, zero, n, max)} class="area area--done" />
        <text x={PAD.l} y={H - 8} class="tick">{fmtDay(cfd.days[0])}</text>
        <text x={W - PAD.r} y={H - 8} class="tick" text-anchor="end">{fmtDay(cfd.days[n - 1])}</text>
      </svg>
      <div class="legend">
        <span><i class="sw sw--todo" /><Label label={tracker.string.ToDo} /></span>
        <span><i class="sw sw--active" /><Label label={tracker.string.InProgress} /></span>
        <span><i class="sw sw--done" /><Label label={tracker.string.Done} /></span>
      </div>
    {/if}
  </section>
</div>

<style lang="scss">
  .reports {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
    gap: 1rem;
    padding: 1rem 1.25rem;
    overflow: auto;
  }
  .reports__head {
    grid-column: 1 / -1;
  }
  .reports__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.9rem 1rem 0.8rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    background: var(--theme-panel-color);
    min-width: 0;
  }
  .card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .card__title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .muted {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--theme-caption-color);
    font: inherit;
    font-size: 0.8125rem;
  }
  .chart {
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .grid {
    stroke: var(--theme-divider-color);
    stroke-width: 1;
  }
  .tick {
    fill: var(--theme-trans-color);
    font-size: 11px;
  }
  .tick--strong {
    fill: var(--theme-caption-color);
    font-weight: 600;
  }
  .ideal {
    fill: none;
    stroke: var(--theme-trans-color);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
  }
  .actual {
    fill: none;
    stroke: var(--accent-brand);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 2000;
    stroke-dashoffset: 2000;
    animation: draw 900ms var(--ease-enter) forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .dot {
    fill: var(--accent-brand);
  }
  .bar {
    fill: var(--primary-button-default);
    transform-origin: bottom;
    animation: grow var(--motion-slow) var(--ease-enter) both;
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  .avg {
    stroke: var(--accent-brand);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .area {
    stroke: none;
    opacity: 0.85;
    &--todo {
      fill: var(--theme-button-pressed);
    }
    &--active {
      fill: var(--primary-button-default);
    }
    &--done {
      fill: var(--accent-brand);
    }
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    span {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
  }
  .sw {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
    &--actual,
    &--done {
      background: var(--accent-brand);
    }
    &--ideal {
      background: var(--theme-trans-color);
    }
    &--active {
      background: var(--primary-button-default);
    }
    &--todo {
      background: var(--theme-button-pressed);
    }
  }
</style>
