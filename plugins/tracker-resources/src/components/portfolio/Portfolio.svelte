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
  Portfolio: every project on one page with its health (open, done, overdue,
  SLA breaches, stale, active sprint, next milestone), and Goals with key
  results whose progress comes from the epics linked to them, or is set by
  hand.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import core, { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { MilestoneStatus, type Goal, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, getCurrentLocation, IconAdd, Label, navigate, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  const client = getClient()
  const me = getCurrentEmployee()
  const DAY = 86_400_000
  const pq = createQuery()
  const sq = createQuery()
  const gq = createQuery()
  const eq = createQuery()
  const mq = createQuery()
  const spq = createQuery()
  let projects: Project[] = []
  let statuses: IssueStatus[] = []
  let goals: Goal[] = []
  let employees: Employee[] = []
  let milestones: Milestone[] = []
  let sprints: Sprint[] = []
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r }, { sort: { name: SortingOrder.Ascending } })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  gq.query(tracker.class.Goal, {}, (r) => { goals = r }, { sort: { createdOn: SortingOrder.Ascending } })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  mq.query(tracker.class.Milestone, { status: { $nin: [MilestoneStatus.Completed, MilestoneStatus.Canceled] } }, (r) => { milestones = r.filter((m) => m.archived !== true) })
  spq.query(tracker.class.Sprint, { state: 'active' }, (r) => { sprints = r })
  $: doneIds = new Set(statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id))
  $: nameOf = new Map(employees.map((e) => [e._id as Ref<Person>, formatName(e.name)]))

  // ---- project health --------------------------------------------------------------
  let issues: Issue[] = []
  $: if (statuses.length > 0) void client.findAll(tracker.class.Issue, { archived: { $ne: true } }, { limit: 20000 }).then((r) => { issues = r })
  interface Row {
    p: Project
    total: number
    open: number
    done: number
    overdue: number
    sla: number
    stale: number
    urgent: number
    sprint?: Sprint
    milestone?: Milestone
    health: 'good' | 'warn' | 'bad'
  }
  $: rows = projects.map((p): Row => {
    const list = issues.filter((i) => i.space === p._id)
    const open = list.filter((i) => !doneIds.has(i.status))
    const now = Date.now()
    const overdue = open.filter((i) => i.dueDate != null && i.dueDate < now).length
    const sla = open.filter((i) => i.slaDue != null && i.slaDue < now).length
    const stale = open.filter((i) => i.modifiedOn < now - 14 * DAY).length
    const urgent = open.filter((i) => i.priority === 1).length
    const bad = sla > 0 || overdue > Math.max(3, open.length * 0.2)
    const warn = overdue > 0 || stale > Math.max(3, open.length * 0.3) || urgent > 3
    return { p, total: list.length, open: open.length, done: list.length - open.length, overdue, sla, stale, urgent, sprint: sprints.find((s) => s.space === p._id), milestone: milestones.filter((m) => m.space === p._id).sort((a, b) => a.targetDate - b.targetDate)[0], health: bad ? 'bad' : warn ? 'warn' : 'good' }
  })
  $: epics = issues.filter((i) => i.kind === tracker.taskTypes.Epic)

  // ---- goals -----------------------------------------------------------------
  function epicProgress (e: Issue): number {
    const children = issues.filter((i) => i.attachedTo === e._id)
    if (children.length === 0) return doneIds.has(e.status) ? 100 : 0
    return Math.round((children.filter((i) => doneIds.has(i.status)).length / children.length) * 100)
  }
  function goalProgress (g: Goal): number {
    if (g.progress !== undefined) return g.progress
    const linked = g.epics.map((id) => epics.find((e) => e._id === id)).filter((e): e is Issue => e !== undefined)
    const fromEpics = linked.length > 0 ? linked.reduce((a, e) => a + epicProgress(e), 0) / linked.length : undefined
    const fromKrs = g.keyResults.length > 0 ? g.keyResults.reduce((a, k) => a + (k.target > 0 ? Math.min(100, (k.current / k.target) * 100) : 0), 0) / g.keyResults.length : undefined
    if (fromEpics !== undefined && fromKrs !== undefined) return Math.round((fromEpics + fromKrs) / 2)
    return Math.round(fromEpics ?? fromKrs ?? 0)
  }
  let editing: Goal | undefined | null = null
  let d = blankGoal()
  function blankGoal (): { name: string, description: string, owner: Ref<Employee> | '', targetDate: string, status: Goal['status'], manual: boolean, progress: number, keyResults: Goal['keyResults'], projects: Ref<Project>[], epics: Ref<Issue>[] } {
    return { name: '', description: '', owner: me, targetDate: '', status: 'on-track', manual: false, progress: 0, keyResults: [], projects: [], epics: [] }
  }
  function edit (g?: Goal): void {
    editing = g
    d = g === undefined ? blankGoal() : { name: g.name, description: g.description ?? '', owner: g.owner, targetDate: g.targetDate != null ? new Date(g.targetDate).toISOString().slice(0, 10) : '', status: g.status, manual: g.progress !== undefined, progress: g.progress ?? 0, keyResults: g.keyResults.map((k) => ({ ...k })), projects: [...g.projects], epics: [...g.epics] }
  }
  async function save (): Promise<void> {
    if (d.name.trim() === '') return
    const data = { name: d.name.trim(), description: d.description.trim() || undefined, owner: (d.owner === '' ? me : d.owner) as Ref<Employee>, targetDate: d.targetDate !== '' ? new Date(d.targetDate).getTime() : null, status: d.status, progress: d.manual ? Math.min(100, Math.max(0, Number(d.progress) || 0)) : undefined, keyResults: d.keyResults.filter((k) => k.text.trim() !== '').map((k) => ({ text: k.text.trim(), current: Number(k.current) || 0, target: Number(k.target) || 0, unit: k.unit?.trim() || undefined })), projects: d.projects, epics: d.epics }
    if (editing === undefined) await client.createDoc(tracker.class.Goal, core.space.Workspace, data)
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (g: Goal): Promise<void> {
    if (!confirm(`Delete goal "${g.name}"?`)) return
    await client.remove(g)
  }
  const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  function openProject (p: Project): void {
    const loc = getCurrentLocation()
    navigate({ path: [loc.path[0], loc.path[1], 'tracker', p._id, 'issues'] })
  }
  function openIssue (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  const fmt = (t: number | null | undefined): string => (t == null ? '' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  const ownerName = (g: Goal): string => nameOf.get(g.owner as Ref<Person>) ?? ''
  const STATUS: Array<{ v: Goal['status'], l: string }> = [{ v: 'on-track', l: 'On track' }, { v: 'at-risk', l: 'At risk' }, { v: 'off-track', l: 'Off track' }, { v: 'done', l: 'Done' }]
</script>

<div class="pf">
  <header class="pf__head">
    <span class="pf__title"><Label label={tracker.string.Portfolio} /></span>
    <span class="muted">{rows.length} projects · {rows.reduce((a, r) => a + r.open, 0)} open issues · {rows.filter((r) => r.health === 'bad').length} need attention</span>
  </header>

  <section class="card motion-rise" style="--i: 0">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th class="th th--l">Project</th><th class="th">Health</th><th class="th">Open</th><th class="th">Done</th><th class="th">Overdue</th><th class="th">SLA breach</th><th class="th">Stale 14d</th><th class="th">Urgent</th><th class="th th--l">Active sprint</th><th class="th th--l">Next milestone</th></tr></thead>
        <tbody>
          {#each rows as r, idx (r.p._id)}
            <tr class="motion-rise" style="--i: {Math.min(idx, 12)}">
              <td class="td td--l"><button class="lnk lnk--strong" on:click={() => { openProject(r.p) }}>{r.p.name}</button> <span class="muted">{r.p.identifier}</span></td>
              <td class="td"><span class="dot dot--{r.health}" title={r.health} /></td>
              <td class="td">{r.open}</td>
              <td class="td"><span class="track"><span class="fill" style="width: {r.total === 0 ? 0 : (r.done / r.total) * 100}%" /></span> {r.total === 0 ? 0 : Math.round((r.done / r.total) * 100)}%</td>
              <td class="td" class:td--bad={r.overdue > 0}>{r.overdue}</td>
              <td class="td" class:td--bad={r.sla > 0}>{r.sla}</td>
              <td class="td">{r.stale}</td>
              <td class="td">{r.urgent}</td>
              <td class="td td--l">{r.sprint !== undefined ? `${r.sprint.name} · ends ${fmt(r.sprint.endDate)}` : '—'}</td>
              <td class="td td--l">{r.milestone !== undefined ? `${r.milestone.label} · ${fmt(r.milestone.targetDate)}` : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card motion-rise" style="--i: 1">
    <div class="card__head"><span class="card__title"><Label label={tracker.string.Goals} /></span><Button kind={'primary'} icon={IconAdd} label={tracker.string.NewGoal} on:click={() => { edit(undefined) }} /></div>
    <p class="muted">Progress comes from the epics linked to a goal (share of their sub-issues done) and from key results, or is set by hand.</p>

    {#if editing !== null}
      <div class="editor motion-pop">
        <div class="row">
          <input class="input input--w" placeholder="Goal, e.g. Cut onboarding time in half" bind:value={d.name} />
          <select class="input" bind:value={d.owner}>{#each employees as e (e._id)}<option value={e._id}>{formatName(e.name)}</option>{/each}</select>
          <input class="input" type="date" bind:value={d.targetDate} />
          <select class="input" bind:value={d.status}>{#each STATUS as s}<option value={s.v}>{s.l}</option>{/each}</select>
        </div>
        <textarea class="input" rows="2" placeholder="Why it matters" bind:value={d.description} />
        <div class="box"><b>Key results</b>
          {#each d.keyResults as k, i}
            <div class="row"><input class="input input--w" placeholder="Metric, e.g. Median time to first value" bind:value={k.text} /><input class="input input--n" type="number" placeholder="now" bind:value={k.current} /> / <input class="input input--n" type="number" placeholder="target" bind:value={k.target} /><input class="input input--s" placeholder="unit" bind:value={k.unit} /><button class="lnk lnk--bad" on:click={() => { d.keyResults = d.keyResults.filter((_, j) => j !== i) }}>remove</button></div>
          {/each}
          <button class="lnk" on:click={() => { d.keyResults = [...d.keyResults, { text: '', current: 0, target: 100 }] }}>+ key result</button>
        </div>
        <div class="box"><b>Projects</b><div class="chips">{#each projects as p (p._id)}<label class="chip" class:chip--on={d.projects.includes(p._id)}><input type="checkbox" checked={d.projects.includes(p._id)} on:change={() => { d.projects = toggleIn(d.projects, p._id) }} />{p.identifier}</label>{/each}</div></div>
        <div class="box"><b>Epics that deliver it</b><div class="chips">{#each epics.filter((e) => d.projects.length === 0 || d.projects.includes(e.space)) as e (e._id)}<label class="chip" class:chip--on={d.epics.includes(e._id)}><input type="checkbox" checked={d.epics.includes(e._id)} on:change={() => { d.epics = toggleIn(d.epics, e._id) }} />{e.identifier} {e.title.slice(0, 40)}</label>{/each}</div>{#if epics.length === 0}<span class="muted">No epics yet.</span>{/if}</div>
        <div class="row"><label class="check"><input type="checkbox" bind:checked={d.manual} /> set progress by hand</label>{#if d.manual}<input class="input input--n" type="number" min="0" max="100" bind:value={d.progress} /> %{/if}</div>
        <div class="row row--end"><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} /><Button kind={'primary'} label={tracker.string.Save} disabled={d.name.trim() === ''} on:click={() => { void save() }} /></div>
      </div>
    {/if}

    <div class="goals">
      {#each goals as g, idx (g._id)}
        {@const pct = goalProgress(g)}
        <div class="goal motion-rise" style="--i: {idx}">
          <div class="goal__head"><span class="goal__name">{g.name}</span><span class="pill pill--{g.status}">{STATUS.find((s) => s.v === g.status)?.l}</span></div>
          {#if g.description}<span class="muted">{g.description}</span>{/if}
          <div class="goal__prog"><span class="track track--wide"><span class="fill" style="width: {pct}%" /></span><span class="goal__pct">{pct}%</span></div>
          <span class="muted">{ownerName(g)}{g.targetDate != null ? ` · due ${fmt(g.targetDate)}` : ''}{g.progress !== undefined ? ' · manual progress' : ''}</span>
          {#if g.keyResults.length > 0}<ul class="krs">{#each g.keyResults as k}<li><span class="krs__t">{k.text}</span><span class="muted">{k.current} / {k.target}{k.unit ? ` ${k.unit}` : ''}</span></li>{/each}</ul>{/if}
          {#if g.epics.length > 0}<div class="chips">{#each g.epics.map((id) => epics.find((e) => e._id === id)).filter((e) => e !== undefined) as e (e?._id)}<button class="chip" on:click={() => { if (e !== undefined) openIssue(e) }}>{e?.identifier} · {epicProgress(e)}%</button>{/each}</div>{/if}
          <div class="goal__tools"><button class="lnk" on:click={() => { edit(g) }}>edit</button><button class="lnk lnk--bad" on:click={() => { void remove(g) }}>delete</button></div>
        </div>
      {/each}
      {#if goals.length === 0 && editing === null}<p class="muted">No goals yet.</p>{/if}
    </div>
  </section>
</div>

<style lang="scss">
  .pf { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; overflow: auto; }
  .pf__head { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
  .pf__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); min-width: 0; }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .table-wrap { overflow-x: auto; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); text-align: center; white-space: nowrap; &--l { text-align: left; } }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .td { color: var(--theme-content-color); font-variant-numeric: tabular-nums; &--bad { color: var(--negative-button-default); font-weight: 600; } }
  .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; &--good { background: var(--accent-brand); } &--warn { background: #f5a623; } &--bad { background: var(--negative-button-default); } }
  .track { display: inline-block; width: 4rem; height: 0.4rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; vertical-align: middle; &--wide { flex: 1; width: auto; height: 0.5rem; } }
  .fill { display: block; height: 100%; background: var(--accent-brand); transition: width var(--motion-slow) var(--ease-enter); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } &--strong { font-size: 0.8125rem; font-weight: 600; color: var(--theme-caption-color); } }
  .editor { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px dashed var(--accent-brand); border-radius: 0.6rem; }
  .row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--theme-content-color); &--end { justify-content: flex-end; } }
  .input { padding: 0.35rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--w { flex: 1; min-width: 12rem; } &--n { width: 5rem; } &--s { width: 6rem; } }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; }
  .box { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8125rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.75rem; cursor: pointer; input { display: none; } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .goals { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 0.75rem; }
  .goal { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.75rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; }
  .goal__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .goal__name { font-weight: 600; color: var(--theme-caption-color); }
  .goal__prog { display: flex; align-items: center; gap: 0.5rem; }
  .goal__pct { font-size: 0.8125rem; font-weight: 600; color: var(--theme-caption-color); }
  .goal__tools { display: flex; gap: 0.6rem; }
  .pill { padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--on-track { background: var(--accent-brand-soft); } &--at-risk { background: color-mix(in srgb, #f5a623 25%, transparent); } &--off-track { background: var(--negative-button-default); color: #fff; } &--done { background: var(--accent-brand); color: #1a2400; } }
  .krs { margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; color: var(--theme-content-color); li { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.15rem 0; border-top: 1px solid var(--theme-divider-color); } }
  .krs__t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
