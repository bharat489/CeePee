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
  Reports overview, laid out like Jira's Reports tab: a KPI strip (completed,
  updated, created, due soon in 7 days), three donuts (by status, by type, by
  assignee), then creation trend, cycle time, lead time and completion trend
  charts with axes and hover values. The classic reports (burndown, velocity,
  cumulative flow, control chart …) sit below, one click away.
-->
<script lang="ts">
  import activity from '@hcengineering/activity'
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
  import { Component } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { icon } from '../projects/icons'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const DAY = 86_400_000
  const iq = createQuery()
  const sq = createQuery()
  let issues: Issue[] = []
  let statuses: IssueStatus[] = []
  $: iq.query(tracker.class.Issue, { space: currentSpace }, (r) => { issues = r }, { limit: 5000 })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: cat = new Map(statuses.map((s) => [s._id, s.category]))
  const bucketOf = (c: Ref<any> | undefined): 'todo' | 'doing' | 'done' => (c === task.statusCategory.Won || c === task.statusCategory.Lost ? 'done' : c === task.statusCategory.Active ? 'doing' : 'todo')
  $: live = issues.filter((i) => i.archived !== true)
  $: bucket = (i: Issue): 'todo' | 'doing' | 'done' => bucketOf(cat.get(i.status))

  // ---- status history: when each issue started and finished --------------------------
  let startAt = new Map<Ref<Issue>, number>()
  let doneAt = new Map<Ref<Issue>, number>()
  let loadedFor: Ref<Project> | undefined
  async function loadHistory (space: Ref<Project>): Promise<void> {
    if (statuses.length === 0) return
    const msgs = await client.findAll(activity.class.DocUpdateMessage, { objectClass: tracker.class.Issue, space, action: 'update' }, { limit: 20000, sort: { createdOn: SortingOrder.Ascending } })
    const s = new Map<Ref<Issue>, number>()
    const d = new Map<Ref<Issue>, number>()
    for (const m of msgs) {
      if (m.attributeUpdates?.attrKey !== 'status') continue
      const to = m.attributeUpdates.set[0] as Ref<IssueStatus>
      const b = bucketOf(cat.get(to))
      const id = m.objectId as Ref<Issue>
      const at = m.createdOn ?? m.modifiedOn
      if (b === 'doing' && !s.has(id)) s.set(id, at)
      if (b === 'done') d.set(id, at)
      else d.delete(id)
    }
    startAt = s
    doneAt = d
    loadedFor = space
  }
  $: if (statuses.length > 0 && loadedFor !== currentSpace) void loadHistory(currentSpace)
  // an issue that is done but has no recorded transition (imported, or created done) counts from its last change
  const finishedAt = (i: Issue): number | undefined => (bucket(i) === 'done' ? doneAt.get(i._id) ?? i.modifiedOn : undefined)

  // ---- people --------------------------------------------------------------------------
  let people = new Map<Ref<Person>, string>()
  $: void (async () => {
    const ids = Array.from(new Set(live.map((i) => i.assignee).filter((x): x is Ref<Person> => x != null))).filter((id) => !people.has(id))
    if (ids.length === 0) return
    const ps = await client.findAll(contact.class.Person, { _id: { $in: ids } })
    const next = new Map(people)
    for (const p of ps) next.set(p._id, formatName(p.name))
    people = next
  })()

  // ---- KPIs ---------------------------------------------------------------------------------
  $: now = Date.now()
  $: kpis = [
    { n: live.filter((i) => (finishedAt(i) ?? 0) >= now - 7 * DAY).length, l: 'completed in the last 7 days', ic: 'check', tone: 'green' },
    { n: live.filter((i) => i.modifiedOn >= now - 7 * DAY).length, l: 'updated in the last 7 days', ic: 'edit', tone: 'grey' },
    { n: live.filter((i) => (i.createdOn ?? 0) >= now - 7 * DAY).length, l: 'created in the last 7 days', ic: 'created', tone: 'grey' },
    { n: live.filter((i) => bucket(i) !== 'done' && i.dueDate != null && i.dueDate >= now && i.dueDate <= now + 7 * DAY).length, l: 'due in the next 7 days', ic: 'due', tone: 'red' }
  ]

  // ---- donuts ---------------------------------------------------------------------------------
  const C = { blue: '#388bff', green: '#94c748', purple: '#9f8fef', orange: '#f38a3f', teal: '#2898bd', red: '#f15b50', grey: '#8590a2', lime: '#6cc24a' }
  const PAL = [C.blue, C.green, C.purple, C.orange, C.teal, C.red, C.grey, C.lime]
  interface Slice { label: string, n: number, color: string }
  let byStatus: Slice[] = []
  let byType: Slice[] = []
  let byAssignee: Slice[] = []
  $: byStatus = [
    { label: 'Done', n: live.filter((i) => bucket(i) === 'done').length, color: C.blue },
    { label: 'To Do', n: live.filter((i) => bucket(i) === 'todo').length, color: C.green },
    { label: 'In Progress', n: live.filter((i) => bucket(i) === 'doing').length, color: C.purple }
  ]
  const kindLabel = (i: Issue): string => (i.kind === tracker.taskTypes.Epic ? 'Epic' : i.kind === tracker.taskTypes.Initiative ? 'Initiative' : i.requestType != null ? 'Request' : i.parents.length > 0 ? 'Sub-task' : 'Issue')
  $: byType = group(live, kindLabel)
  $: byAssignee = group(live, (i) => (i.assignee != null ? people.get(i.assignee) ?? '…' : 'Unassigned'))
  function group (list: Issue[], f: (i: Issue) => string): Slice[] {
    const m = new Map<string, number>()
    for (const i of list) m.set(f(i), (m.get(f(i)) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, n], k) => ({ label, n, color: label === 'Unassigned' ? C.orange : PAL[k % PAL.length] }))
  }
  function arc (start: number, end: number): string {
    const r = 42
    const a0 = start * 2 * Math.PI - Math.PI / 2
    const a1 = Math.min(end, 0.99999) * 2 * Math.PI - Math.PI / 2
    return `M${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)} A${r} ${r} 0 ${end - start > 0.5 ? 1 : 0} 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)}`
  }

  // ---- trend charts ------------------------------------------------------------------------------
  const W = 520
  const H = 230
  const M = { l: 46, r: 14, t: 14, b: 46 }
  interface Pt { label: string, value: number, at: number }
  const dayKey = (t: number): string => new Date(t).toISOString().slice(0, 10)
  function daily (times: number[]): Pt[] {
    const m = new Map<string, number>()
    for (const t of times) m.set(dayKey(t), (m.get(dayKey(t)) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14).map(([label, value]) => ({ label, value, at: new Date(label).getTime() }))
  }
  function dailyAvg (pairs: Array<{ at: number, days: number }>): Pt[] {
    const m = new Map<string, number[]>()
    for (const p of pairs) m.set(dayKey(p.at), [...(m.get(dayKey(p.at)) ?? []), p.days])
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14).map(([label, vals]) => ({ label, value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, at: new Date(label).getTime() }))
  }
  $: created = daily(live.map((i) => i.createdOn ?? i.modifiedOn))
  $: completed = daily(live.map((i) => finishedAt(i)).filter((x): x is number => x !== undefined))
  $: cycle = dailyAvg(live.map((i) => ({ at: finishedAt(i), start: startAt.get(i._id) ?? i.createdOn ?? i.modifiedOn })).filter((x): x is { at: number, start: number } => x.at !== undefined).map((x) => ({ at: x.at, days: Math.max(0, (x.at - x.start) / DAY) })))
  $: lead = dailyAvg(live.map((i) => ({ at: finishedAt(i), start: i.createdOn ?? i.modifiedOn })).filter((x): x is { at: number, start: number } => x.at !== undefined).map((x) => ({ at: x.at, days: Math.max(0, (x.at - x.start) / DAY) })))
  function ticks (max: number): number[] {
    if (max <= 0) return [0, 1]
    const raw = max / 4
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? mag
    const out: number[] = []
    for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v * 100) / 100)
    return out
  }
  const yOf = (v: number, max: number): number => M.t + (H - M.t - M.b) * (1 - v / max)
  const xOf = (k: number, n: number): number => M.l + ((W - M.l - M.r) / Math.max(1, n)) * (k + 0.5)
  const short = (label: string): string => label.slice(5)
  let hover: { key: string, k: number } | undefined
  const tone = (t: string): string => (t === 'green' ? C.lime : t === 'red' ? C.red : C.grey)
  let classic = false
  let donuts: Array<{ t: string, s: Slice[] }> = []
  $: donuts = [{ t: 'Work items by status', s: byStatus }, { t: 'Work items by type', s: byType }, { t: 'Work items by assignee', s: byAssignee }]
  let charts: Array<{ id: string, t: string, pts: Pt[], kind: 'bar' | 'line', y: string, x: string }> = []
  $: charts = [{ id: 'created', t: 'Work item creation trend', pts: created, kind: 'bar', y: 'Count of work items', x: 'Work item creation date' }, { id: 'cycle', t: 'Work item cycle time', pts: cycle, kind: 'line', y: 'Average issue cycle time (days)', x: 'Work item completed date' }, { id: 'lead', t: 'Work item lead time', pts: lead, kind: 'line', y: 'Average issue lead time (days)', x: 'Work item completed date' }, { id: 'done', t: 'Work item completion trend', pts: completed, kind: 'bar', y: 'Count of work items', x: 'Work item completed date' }]
</script>

<div class="ro">
  <div class="kpis">
    {#each kpis as k (k.l)}
      <div class="kpi"><span class="kpi__ic kpi__ic--{k.tone}">{@html icon(k.ic)}</span><div class="kpi__t"><b>{k.n} work item{k.n === 1 ? '' : 's'}</b><span>{k.l}</span></div></div>
    {/each}
  </div>

  <div class="row3">
    {#each donuts as card (card.t)}
      {@const total = card.s.reduce((a, x) => a + x.n, 0)}
      <section class="card">
        <h3 class="card__t">{card.t}</h3>
        <div class="donut">
          <svg viewBox="0 0 100 100" class="donut__svg" role="img">
            <circle cx="50" cy="50" r="42" class="donut__track" />
            {#each card.s.filter((x) => x.n > 0) as x, k (x.label)}
              {@const before = card.s.filter((y) => y.n > 0).slice(0, k).reduce((a, y) => a + y.n, 0)}
              <path d={arc(before / Math.max(1, total), (before + x.n) / Math.max(1, total))} stroke={x.color} class="donut__seg"><title>{x.label}: {x.n}</title></path>
            {/each}
            <text x="50" y="48" text-anchor="middle" class="donut__n">{total}</text>
            <text x="50" y="60" text-anchor="middle" class="donut__l">Total value</text>
          </svg>
          <ul class="legend">{#each card.s as x (x.label)}<li><i class="dot" style="background: {x.color}" />{x.label}</li>{/each}</ul>
        </div>
      </section>
    {/each}
  </div>

  <div class="row2">
    {#each charts as ch (ch.id)}
      {@const max = Math.max(1, ...ch.pts.map((p) => p.value))}
      {@const tk = ticks(max)}
      {@const top = tk[tk.length - 1]}
      {@const n = ch.pts.length}
      <section class="card card--chart">
        <h3 class="card__t">{ch.t}</h3>
        {#if n === 0}
          <p class="empty">No data yet{ch.id === 'created' ? '' : ' — complete a work item and it shows up here'}.</p>
        {:else}
          <div class="chart-wrap">
            <svg viewBox="0 0 {W} {H}" class="chart" role="img" on:mouseleave={() => { hover = undefined }}>
              {#each tk as v}
                <line x1={M.l} x2={W - M.r} y1={yOf(v, top)} y2={yOf(v, top)} class="grid" />
                <text x={M.l - 8} y={yOf(v, top) + 4} text-anchor="end" class="ax">{v}</text>
              {/each}
              <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} class="axis" />
              <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} class="axis" />
              {#if ch.kind === 'bar'}
                {#each ch.pts as p, k (p.label)}
                  {@const bw = Math.min(56, ((W - M.l - M.r) / n) * 0.66)}
                  <rect x={xOf(k, n) - bw / 2} y={yOf(p.value, top)} width={bw} height={H - M.b - yOf(p.value, top)} class="bar" class:bar--hover={hover?.key === ch.id && hover.k === k} on:mouseenter={() => { hover = { key: ch.id, k } }} />
                {/each}
              {:else}
                <polyline points={ch.pts.map((p, k) => `${xOf(k, n)},${yOf(p.value, top)}`).join(' ')} class="line" />
                {#each ch.pts as p, k (p.label)}
                  <circle cx={xOf(k, n)} cy={yOf(p.value, top)} r="4" class="pt" class:pt--hover={hover?.key === ch.id && hover.k === k} on:mouseenter={() => { hover = { key: ch.id, k } }} />
                {/each}
              {/if}
              {#each ch.pts as p, k (p.label)}
                <text x={xOf(k, n)} y={H - M.b + 16} text-anchor="middle" class="ax">{n > 8 ? short(p.label) : p.label}</text>
              {/each}
              <text x={(W + M.l - M.r) / 2} y={H - 8} text-anchor="middle" class="ax ax--title">{ch.x}</text>
              <text transform="translate(12 {(H - M.b + M.t) / 2}) rotate(-90)" text-anchor="middle" class="ax ax--title">{ch.y}</text>
              {#if hover?.key === ch.id && ch.pts[hover.k] !== undefined}
                {@const p = ch.pts[hover.k]}
                {@const hx = Math.min(W - 120, Math.max(M.l, xOf(hover.k, n) - 40))}
                {@const hy = Math.max(M.t, yOf(p.value, top) - 52)}
                <g class="tip"><rect x={hx} y={hy} width="110" height="42" rx="4" /><text x={hx + 10} y={hy + 17} class="tip__t">{p.label}</text><rect x={hx + 10} y={hy + 25} width="9" height="9" rx="1.5" class="tip__sw" /><text x={hx + 25} y={hy + 33} class="tip__v">{p.value}</text></g>
              {/if}
            </svg>
          </div>
        {/if}
      </section>
    {/each}
  </div>

  <section class="card card--classic">
    <button class="classic__btn" on:click={() => { classic = !classic }}><span class="ph-chev" class:ph-chev--open={classic}>{@html icon('chevron')}</span>Classic reports · burndown, velocity, cumulative flow, sprint report, control chart, time in status, two-dimensional statistics and more</button>
    {#if classic}
      <div class="classic__body"><Component is={tracker.component.ProjectReports} props={{ currentSpace, space: currentSpace }} /></div>
    {/if}
  </section>
</div>

<style lang="scss">
  .ro { --j-text: #172b4d; --j-sub: #626f86; --j-link: #0c66e4; --j-border: rgba(9, 30, 66, 0.14); --j-surface: #fff; --j-track: #dcdfe4; --j-grid: #dcdfe4;
    display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.5rem 2rem; overflow: auto; color: var(--j-text); }
  :global(.theme-dark) .ro { --j-text: #b6c2cf; --j-sub: #8c9bab; --j-link: #579dff; --j-border: #38414a; --j-surface: #22272b; --j-track: #38414a; --j-grid: #38414a; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
  .kpi { display: flex; align-items: center; gap: 0.9rem; padding: 1.1rem 1.25rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); }
  .kpi__ic { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: 0.25rem; background: #f1f2f4; color: #44546f; :global(svg) { width: 1.1rem; height: 1.1rem; } &--green { background: #dcfff1; color: #1f845a; } &--red { background: #ffeceb; color: #c9372c; } }
  :global(.theme-dark) .kpi__ic { background: #2c333a; color: #b6c2cf; &--green { background: #164b35; color: #7ee2b8; } &--red { background: #5d1f1a; color: #fd9891; } }
  .kpi__t { display: flex; flex-direction: column; b { font-size: 1rem; font-weight: 600; color: var(--j-text); } span { font-size: 0.8125rem; color: var(--j-sub); } }
  .row3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); gap: 1rem; }
  .row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(28rem, 1fr)); gap: 1rem; }
  .card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem 1.5rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); min-width: 0; &--chart { padding-bottom: 0.75rem; } &--classic { padding: 0.5rem 0.75rem; } }
  .card__t { margin: 0; font-size: 1rem; font-weight: 600; color: var(--j-text); }
  .donut { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
  .donut__svg { width: 14rem; height: 14rem; max-width: 100%; }
  .donut__track { fill: none; stroke: var(--j-track); stroke-width: 14; }
  .donut__seg { fill: none; stroke-width: 14; transition: stroke-width 0.15s ease; &:hover { stroke-width: 16; } }
  .donut__n { fill: var(--j-text); font-size: 20px; font-weight: 700; }
  .donut__l { fill: var(--j-text); font-size: 8px; }
  .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.35rem 1rem; margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; font-weight: 600; color: var(--j-sub); li { display: inline-flex; align-items: center; gap: 0.4rem; } }
  .dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; }
  .empty { margin: 0; font-size: 0.875rem; color: var(--j-sub); }
  .chart-wrap { width: 100%; }
  .chart { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--j-grid); stroke-width: 1; }
  .axis { stroke: var(--j-sub); stroke-width: 1; }
  .ax { fill: var(--j-sub); font-size: 11px; &--title { font-weight: 600; font-size: 11px; } }
  .bar { fill: #388bff; transition: fill 0.12s ease; &--hover, &:hover { fill: #1d7afc; } }
  .line { fill: none; stroke: #388bff; stroke-width: 2; stroke-linejoin: round; }
  .pt { fill: #388bff; stroke: var(--j-surface); stroke-width: 2; &--hover, &:hover { r: 5.5; } }
  .tip rect:first-child { fill: var(--j-surface); stroke: var(--j-border); filter: drop-shadow(0 2px 6px rgba(9, 30, 66, 0.2)); }
  .tip__t { fill: var(--j-sub); font-size: 11px; }
  .tip__sw { fill: #388bff; }
  .tip__v { fill: var(--j-text); font-size: 12px; font-weight: 600; }
  .classic__btn { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 0.5rem; border: none; background: transparent; color: var(--j-sub); font: inherit; font-size: 0.875rem; font-weight: 500; text-align: left; cursor: pointer; &:hover { color: var(--j-link); } }
  .ph-chev { display: inline-flex; transition: transform 0.15s ease; transform: rotate(-90deg); :global(svg) { width: 1rem; height: 1rem; } &--open { transform: none; } }
  .classic__body { min-height: 30rem; }
</style>
