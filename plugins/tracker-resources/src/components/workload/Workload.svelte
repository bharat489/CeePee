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
  Workload: who has how much open work in each of the coming weeks, against the
  capacity set for them. Open issues are placed by due date, sprint end or
  milestone; leave from HR reduces the week's capacity; overloaded weeks are red.
  Click a cell to see the issues behind it.
-->
<script lang="ts">
  import contact, { formatName, type Employee } from '@hcengineering/contact'
  import { type Ref } from '@hcengineering/core'
  import hr, { type Request as LeaveRequest, type RequestType, type TzDate } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Capacity, type CapacityDefaults, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import {
    DAY,
    formatAmount,
    leaveDaysInWeek,
    planWorkload,
    totalsOf,
    utilisationClass,
    weekLabel,
    weeksFrom,
    type PersonRow,
    type Unit,
    type WorkItem
  } from './lib/workload'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const hasHr = hierarchy.hasClass(hr.class.Request)

  // ---- controls
  let weeksCount = 8
  let unit: Unit = 'hours'
  let project: Ref<Project> | '' = ''
  let onlyOverloaded = false
  let offset = 0 // weeks from today
  $: weeks = weeksFrom(Date.now() + offset * 7 * DAY, weeksCount)

  // ---- data
  const sq = createQuery()
  const eq = createQuery()
  const pq = createQuery()
  const spq = createQuery()
  const mq = createQuery()
  const cq = createQuery()
  const dq = createQuery()
  const iq = createQuery()
  const lq = createQuery()
  const tq = createQuery()
  let statuses: IssueStatus[] = []
  let employees: Employee[] = []
  let projects: Project[] = []
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  let capacities: Capacity[] = []
  let defaultsDoc: CapacityDefaults | undefined
  let issues: Issue[] = []
  let leaves: LeaveRequest[] = []
  let leaveTypes: RequestType[] = []
  let loaded = false

  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  spq.query(tracker.class.Sprint, {}, (r) => { sprints = r })
  mq.query(tracker.class.Milestone, {}, (r) => { milestones = r })
  cq.query(tracker.class.Capacity, {}, (r) => { capacities = r })
  dq.query(tracker.class.CapacityDefaults, {}, (r) => { defaultsDoc = r[0] })
  if (hasHr) {
    lq.query(hr.class.Request, {}, (r) => { leaves = r })
    tq.query(hr.class.RequestType, {}, (r) => { leaveTypes = r })
  }
  $: openIds = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  $: if (openIds.length > 0) {
    iq.query(
      tracker.class.Issue,
      { status: { $in: openIds }, ...(project !== '' ? { space: project } : {}) },
      (r) => { issues = r; loaded = true },
      { limit: 5000 }
    )
  }

  $: defaults = {
    hoursPerWeek: defaultsDoc?.hoursPerWeek ?? 40,
    pointsPerWeek: defaultsDoc?.pointsPerWeek,
    overloadThreshold: defaultsDoc?.overloadThreshold ?? 1,
    unestimatedHours: defaultsDoc?.unestimatedHours ?? 8
  }
  $: sprintEnd = new Map(sprints.map((s) => [s._id, s.endDate]))
  $: milestoneEnd = new Map(milestones.map((m) => [m._id, m.targetDate]))
  $: employeeById = new Map(employees.map((e) => [e._id as string, e]))

  $: items = issues.map((i): WorkItem => {
    const remaining = (i.remainingTime ?? 0) > 0 ? i.remainingTime : Math.max(0, (i.estimation ?? 0) - (i.reportedTime ?? 0))
    const unestimated = (i.estimation ?? 0) === 0 && (i.remainingTime ?? 0) === 0
    return {
      _id: i._id,
      identifier: i.identifier,
      title: i.title,
      space: i.space,
      assignee: (i.assignee as string | null) ?? null,
      hours: unestimated ? defaults.unestimatedHours : remaining,
      points: i.storyPoints ?? 0,
      unestimated,
      dueDate: i.dueDate ?? null,
      startDate: i.startDate ?? null,
      sprintEnd: i.sprint != null ? sprintEnd.get(i.sprint) ?? null : null,
      milestoneEnd: i.milestone != null ? milestoneEnd.get(i.milestone) ?? null : null
    }
  })

  const tzToUtc = (d: TzDate): number => Date.UTC(d.year, d.month, d.day)
  $: leave = (() => {
    const map = new Map<string, number[]>()
    const away = new Set(leaveTypes.filter((t) => t.value < 0).map((t) => t._id))
    for (const r of leaves) {
      if (!away.has(r.type)) continue
      const from = tzToUtc(r.tzDate)
      const to = tzToUtc(r.tzDueDate)
      const days = map.get(r.attachedTo as string) ?? weeks.map(() => 0)
      weeks.forEach((w, i) => { days[i] += leaveDaysInWeek(from, to, w) })
      map.set(r.attachedTo as string, days)
    }
    return map
  })()

  $: rows = planWorkload(items, capacities as any, defaults, weeks, unit, leave)
  $: shown = onlyOverloaded ? rows.filter((r) => r.overloadedWeeks > 0) : rows
  $: totals = totalsOf(rows, weeks.length)
  $: overloadedPeople = rows.filter((r) => r.employee !== null && r.overloadedWeeks > 0).length
  $: unassignedCount = rows.find((r) => r.employee === null)?.weeks.reduce((a, c) => a + c.items.length, 0) ?? 0

  const nameOf = (r: PersonRow): string => {
    if (r.employee === null) return 'Unassigned'
    const e = employeeById.get(r.employee)
    return e !== undefined ? formatName(e.name) : '…'
  }
  const initials = (r: PersonRow): string => nameOf(r).split(' ').map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase()

  // ---- details of one cell
  let selected: { row: PersonRow, week: number } | undefined
  function pick (row: PersonRow, week: number): void {
    selected = selected?.row === row && selected.week === week ? undefined : { row, week }
  }
  function open (it: WorkItem): void {
    showPanel(view.component.EditDoc, it._id as Ref<Issue>, tracker.class.Issue, 'content')
  }
  const projectKey = (id: string): string => projects.find((p) => p._id === id)?.identifier ?? ''
  const pct = (r: number): string => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '∞')
</script>

<div class="wl">
  <header class="wl__head">
    <div class="wl__title">
      <span class="wl__ic">{@html icon('users')}</span>
      <div>
        <h1>Workload</h1>
        <p class="muted">Open work per person and week against their capacity. Due date, then sprint end, then milestone decide the week; HR leave lowers capacity.</p>
      </div>
    </div>
    <div class="wl__kpis">
      <div class="kpi" class:kpi--bad={overloadedPeople > 0}><b>{overloadedPeople}</b><span>overloaded</span></div>
      <div class="kpi"><b>{rows.filter((r) => r.employee !== null).length}</b><span>people with work</span></div>
      <div class="kpi" class:kpi--warn={unassignedCount > 0}><b>{unassignedCount}</b><span>unassigned items</span></div>
    </div>
  </header>

  <div class="wl__bar">
    <div class="seg">
      {#each [4, 8, 12] as n}
        <button class="seg__b" class:seg__b--on={weeksCount === n} on:click={() => { weeksCount = n }}>{n} weeks</button>
      {/each}
    </div>
    <div class="seg">
      <button class="seg__b" class:seg__b--on={unit === 'hours'} on:click={() => { unit = 'hours' }}>Hours</button>
      <button class="seg__b" class:seg__b--on={unit === 'points'} on:click={() => { unit = 'points' }}>Points</button>
    </div>
    <div class="seg">
      <button class="seg__b" on:click={() => { offset -= weeksCount }} title="Earlier">‹</button>
      <button class="seg__b" class:seg__b--on={offset === 0} on:click={() => { offset = 0 }}>Today</button>
      <button class="seg__b" on:click={() => { offset += weeksCount }} title="Later">›</button>
    </div>
    <select class="sel" bind:value={project}>
      <option value="">All projects</option>
      {#each projects as p (p._id)}<option value={p._id}>{p.identifier} · {p.name}</option>{/each}
    </select>
    <label class="chk"><input type="checkbox" bind:checked={onlyOverloaded} /> only overloaded</label>
    <span class="muted grow">Threshold {Math.round(defaults.overloadThreshold * 100)}% · unestimated items count as {defaults.unestimatedHours}h · set capacity under Settings → Capacity</span>
  </div>

  {#if !loaded}
    <div class="empty muted">Loading work…</div>
  {:else if shown.length === 0}
    <div class="empty">
      <b>{onlyOverloaded ? 'Nobody is overloaded in this range.' : 'No open work in this range.'}</b>
      <span class="muted">Issues need a due date, a sprint or a milestone to appear in a week.</span>
    </div>
  {:else}
    <div class="wl__scroll">
      <table class="grid">
        <thead>
          <tr>
            <th class="grid__person">Person</th>
            <th class="grid__num">Total</th>
            {#each weeks as w, i (w.start)}
              <th class="grid__week" class:grid__week--now={offset === 0 && i === 0}>
                <span>{weekLabel(w)}</span>
                <span class="muted tiny">{formatAmount(totals[i].assigned, unit)} / {formatAmount(totals[i].available, unit)}{#if totals[i].overloaded > 0} · {totals[i].overloaded} over{/if}</span>
              </th>
            {/each}
            <th class="grid__num">No date</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as r (r.employee ?? '__none')}
            <tr class:grid__row--none={r.employee === null}>
              <td class="grid__person">
                <span class="av" class:av--none={r.employee === null}>{r.employee === null ? '—' : initials(r)}</span>
                <span class="who">
                  <b>{nameOf(r)}</b>
                  <span class="muted tiny">
                    {#if r.employee === null}work nobody owns yet{:else}{formatAmount(r.capacity !== undefined ? (unit === 'hours' ? r.capacity.hoursPerWeek : r.capacity.pointsPerWeek ?? defaults.pointsPerWeek ?? 0) : (unit === 'hours' ? defaults.hoursPerWeek : defaults.pointsPerWeek ?? 0), unit)}/week{#if (r.capacity?.allocation ?? 1) < 1} · {Math.round((r.capacity?.allocation ?? 1) * 100)}% allocated{/if}{#if r.overloadedWeeks > 0} · <span class="bad">{r.overloadedWeeks} week{r.overloadedWeeks === 1 ? '' : 's'} over</span>{/if}{/if}
                  </span>
                </span>
              </td>
              <td class="grid__num"><b>{formatAmount(r.assigned, unit)}</b>{#if r.employee !== null}<span class="muted tiny"> / {formatAmount(r.available, unit)}</span>{/if}</td>
              {#each r.weeks as c, i}
                <td class="grid__cell">
                  <button
                    class="cell cell--{r.employee === null ? 'none' : utilisationClass(c, defaults.overloadThreshold)}"
                    class:cell--on={selected?.row === r && selected.week === i}
                    disabled={c.items.length === 0}
                    title={r.employee === null ? `${c.items.length} unassigned` : `${pct(c.ratio)} · ${c.items.length} item${c.items.length === 1 ? '' : 's'}${c.leaveDays > 0 ? ` · ${c.leaveDays}d leave` : ''}`}
                    on:click={() => { pick(r, i) }}
                  >
                    <span class="cell__bar" style="width:{Math.min(100, Math.round((c.available > 0 ? c.assigned / c.available : c.assigned > 0 ? 1.5 : 0) * 100))}%"></span>
                    <span class="cell__txt">{c.assigned > 0 ? formatAmount(c.assigned, unit) : ''}{#if c.leaveDays > 0}<span class="cell__leave" title="on leave">✈</span>{/if}</span>
                  </button>
                </td>
              {/each}
              <td class="grid__num">
                {#if r.unscheduled.length > 0}
                  <button class="lnk" on:click={() => { pick(r, -1) }}>{r.unscheduled.length}</button>
                {:else}<span class="muted">0</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if selected !== undefined}
    {@const list = selected.week < 0 ? selected.row.unscheduled : selected.row.weeks[selected.week].items}
    <section class="detail">
      <div class="detail__head">
        <b>{nameOf(selected.row)}</b>
        <span class="muted">· {selected.week < 0 ? 'no date' : `week of ${weekLabel(weeks[selected.week])}`} · {list.length} item{list.length === 1 ? '' : 's'}</span>
        <button class="lnk grow-r" on:click={() => { selected = undefined }}>close</button>
      </div>
      <ul class="detail__list">
        {#each list as it (it._id)}
          <li>
            <button class="detail__item" on:click={() => { open(it) }}>
              <span class="key">{it.identifier}</span>
              <span class="ttl">{it.title}</span>
              <span class="muted tiny">{projectKey(it.space)}{#if it.unestimated} · no estimate{/if}{#if it.dueDate != null} · due {new Date(it.dueDate).toLocaleDateString()}{/if}</span>
              <span class="amt">{formatAmount(unit === 'hours' ? it.hours : it.points, unit)}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style lang="scss">
  .wl { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.25rem 1.5rem; height: 100%; overflow: auto; }
  .wl__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .wl__title { display: flex; gap: 0.75rem; align-items: flex-start; h1 { margin: 0; font-size: 1.35rem; color: var(--theme-caption-color); } p { margin: 0.2rem 0 0; max-width: 46rem; } }
  .wl__ic { display: inline-flex; margin-top: 0.3rem; color: var(--accent-brand); :global(svg) { width: 1.4rem; height: 1.4rem; } }
  .wl__kpis { display: flex; gap: 0.6rem; }
  .kpi { display: flex; flex-direction: column; align-items: center; min-width: 6rem; padding: 0.5rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); b { font-size: 1.25rem; color: var(--theme-caption-color); } span { font-size: 0.7rem; color: var(--theme-dark-color); } &--bad b { color: var(--negative-button-default); } &--warn b { color: #b45309; } }
  .wl__bar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; overflow: hidden; }
  .seg__b { border: none; background: transparent; padding: 0.35rem 0.7rem; font: inherit; font-size: 0.8rem; color: var(--theme-content-color); cursor: pointer; &--on { background: var(--theme-button-hovered); color: var(--theme-caption-color); font-weight: 600; } }
  .sel { padding: 0.35rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-panel-color); color: var(--theme-content-color); font: inherit; font-size: 0.8rem; }
  .chk { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--theme-content-color); }
  .muted { color: var(--theme-dark-color); font-size: 0.8rem; }
  .tiny { font-size: 0.7rem; }
  .grow { flex: 1; text-align: right; }
  .bad { color: var(--negative-button-default); }
  .empty { display: flex; flex-direction: column; gap: 0.25rem; padding: 3rem 1rem; text-align: center; border: 1px dashed var(--theme-divider-color); border-radius: 0.75rem; }
  .wl__scroll { overflow: auto; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .grid { border-collapse: separate; border-spacing: 0; min-width: 100%; th, td { padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); vertical-align: middle; } th { position: sticky; top: 0; z-index: 1; background: var(--theme-panel-color); font-size: 0.75rem; font-weight: 600; color: var(--theme-dark-color); text-align: left; } }
  .grid__person { position: sticky; left: 0; z-index: 2; background: var(--theme-panel-color); min-width: 15rem; display: flex; align-items: center; gap: 0.5rem; }
  th.grid__person { z-index: 3; display: table-cell; }
  .grid__num { text-align: right; white-space: nowrap; min-width: 5rem; }
  .grid__week { min-width: 6.5rem; span { display: block; } &--now { color: var(--accent-brand); } }
  .grid__cell { padding: 0.3rem 0.25rem !important; }
  .grid__row--none td { background: color-mix(in srgb, var(--theme-divider-color) 25%, transparent); }
  .av { display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; background: var(--accent-brand); color: #fff; font-size: 0.7rem; font-weight: 700; flex: none; &--none { background: var(--theme-divider-color); color: var(--theme-dark-color); } }
  .who { display: flex; flex-direction: column; min-width: 0; b { color: var(--theme-caption-color); font-size: 0.875rem; } }
  .cell { position: relative; display: block; width: 100%; height: 2rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); overflow: hidden; cursor: pointer; padding: 0; font: inherit; text-align: left; &:disabled { cursor: default; opacity: 0.6; } &--on { outline: 2px solid var(--accent-brand); } }
  .cell__bar { position: absolute; inset: 0 auto 0 0; background: #86efac; transition: width 0.2s; }
  .cell--busy .cell__bar { background: #fcd34d; }
  .cell--over .cell__bar { background: #fca5a5; }
  .cell--none .cell__bar { background: var(--theme-divider-color); }
  .cell--over { border-color: #f87171; }
  .cell__txt { position: relative; display: flex; align-items: center; gap: 0.25rem; padding: 0 0.4rem; height: 100%; font-size: 0.75rem; font-weight: 600; color: var(--theme-caption-color); }
  .cell__leave { font-size: 0.7rem; opacity: 0.7; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.8rem; cursor: pointer; }
  .grow-r { margin-left: auto; }
  .detail { border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); padding: 0.75rem 1rem; }
  .detail__head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.5rem; b { color: var(--theme-caption-color); } }
  .detail__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .detail__item { display: grid; grid-template-columns: 5rem 1fr auto auto; gap: 0.6rem; align-items: center; width: 100%; padding: 0.35rem 0.5rem; border: none; border-radius: 0.4rem; background: transparent; font: inherit; color: var(--theme-content-color); text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } .key { color: var(--theme-dark-color); font-size: 0.75rem; } .ttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .amt { font-weight: 600; color: var(--theme-caption-color); } }
</style>
