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
  Dashboard: the first screen of the day.

  Six fixed widgets rather than a gadget builder. What people configure on a
  Jira dashboard is, nearly always, the same six things -- what is mine, what
  is due, what has stalled, how the sprint is going, who is loaded, what was
  decided. Building those well beats a widget marketplace nobody curates.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Decision, type Issue, type IssueStatus, type Project, type Sprint } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  const client = getClient()
  const me = getCurrentEmployee()
  const DAY = 86_400_000
  const STALE_DAYS = 7

  const statusQuery = createQuery()
  const mineQuery = createQuery()
  const sprintQuery = createQuery()
  const projectQuery = createQuery()
  const decisionQuery = createQuery()

  let statuses: IssueStatus[] = []
  let mine: Issue[] = []
  let activeSprints: Sprint[] = []
  let projects: Project[] = []
  let decisions: Decision[] = []

  statusQuery.query(tracker.class.IssueStatus, {}, (r) => {
    statuses = r
  })
  projectQuery.query(tracker.class.Project, {}, (r) => {
    projects = r
  })
  sprintQuery.query(tracker.class.Sprint, { state: 'active' }, (r) => {
    activeSprints = r
  })
  decisionQuery.query(
    tracker.class.Decision,
    {},
    (r) => {
      decisions = r
    },
    { limit: 5, sort: { modifiedOn: SortingOrder.Descending } }
  )

  $: openIds = statuses
    .filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost)
    .map((s) => s._id)
  $: doneIds = statuses
    .filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost)
    .map((s) => s._id)
  $: if (openIds.length > 0) {
    mineQuery.query(
      tracker.class.Issue,
      { assignee: me, status: { $in: openIds } },
      (r) => {
        mine = r
      },
      { limit: 300 }
    )
  }
  $: projectName = new Map(projects.map((p) => [p._id, p.name]))
  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))

  function rank (p: IssuePriority): number {
    return p === IssuePriority.NoPriority ? 99 : p
  }
  const priorityLabel: Record<IssuePriority, string> = {
    [IssuePriority.Urgent]: 'Urgent',
    [IssuePriority.High]: 'High',
    [IssuePriority.Medium]: 'Medium',
    [IssuePriority.Low]: 'Low',
    [IssuePriority.NoPriority]: 'None'
  }
  const priorities = [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.NoPriority]

  $: next = [...mine]
    .sort((a, b) => {
      const pr = rank(a.priority) - rank(b.priority)
      if (pr !== 0) return pr
      return (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER)
    })
    .slice(0, 6)
  $: byPriority = priorities.map((p) => ({ p, n: mine.filter((i) => i.priority === p).length }))
  $: maxPriority = Math.max(1, ...byPriority.map((b) => b.n))
  $: dueSoon = mine
    .filter((i) => i.dueDate != null && i.dueDate < Date.now() + 7 * DAY)
    .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
    .slice(0, 6)

  // ---- one-shot loads that are too broad for a live query ---------------
  let stale: Issue[] = []
  let workload: Array<{ name: string, n: number }> = []
  let progress: Array<{ sprint: Sprint, done: number, total: number }> = []

  async function loadStaleAndWorkload (open: Ref<IssueStatus>[]): Promise<void> {
    stale = await client.findAll(
      tracker.class.Issue,
      { status: { $in: open }, modifiedOn: { $lt: Date.now() - STALE_DAYS * DAY } },
      { limit: 6, sort: { modifiedOn: SortingOrder.Ascending } }
    )
    const assigned = await client.findAll(tracker.class.Issue, { status: { $in: open }, assignee: { $ne: null } }, { limit: 2000 })
    const counts = new Map<Ref<Person>, number>()
    for (const i of assigned) if (i.assignee != null) counts.set(i.assignee, (counts.get(i.assignee) ?? 0) + 1)
    const ids = Array.from(counts.keys())
    const people = ids.length > 0 ? await client.findAll(contact.class.Person, { _id: { $in: ids } }) : []
    const name = new Map(people.map((p) => [p._id, formatName(p.name)]))
    workload = ids
      .map((id) => ({ name: name.get(id) ?? '—', n: counts.get(id) ?? 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
  }
  $: if (openIds.length > 0) void loadStaleAndWorkload(openIds)
  $: maxLoad = Math.max(1, ...workload.map((w) => w.n))

  async function loadProgress (sprints: Sprint[], done: Ref<IssueStatus>[]): Promise<void> {
    const out: typeof progress = []
    for (const s of sprints) {
      const issues = await client.findAll(tracker.class.Issue, { sprint: s._id })
      out.push({ sprint: s, total: issues.length, done: issues.filter((i) => done.includes(i.status)).length })
    }
    progress = out
  }
  $: if (statuses.length > 0) void loadProgress(activeSprints, doneIds)

  function open (issue: Issue): void {
    showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
  }
  function openDecision (d: Decision): void {
    showPanel(view.component.EditDoc, d._id, d._class, 'content')
  }
  function daysLeft (s: Sprint): number {
    return Math.max(0, Math.ceil((s.endDate - Date.now()) / DAY))
  }
  function ago (ts: number): string {
    const d = Math.floor((Date.now() - ts) / DAY)
    return d <= 0 ? 'today' : d === 1 ? '1d' : d + 'd'
  }
  function due (ts: number): string {
    const d = Math.ceil((ts - Date.now()) / DAY)
    return d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`
  }
</script>

<div class="dash">
  <header class="dash__head">
    <span class="dash__title"><Label label={tracker.string.Dashboard} /></span>
    <span class="dash__sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
  </header>

  <!-- 1. What is mine -->
  <section class="card motion-rise" style="--i: 0">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.MyIssues} /></span>
      <span class="card__n">{mine.length}</span>
    </div>
    <div class="bars">
      {#each byPriority as b (b.p)}
        <div class="bar-row">
          <span class="bar-row__label">{priorityLabel[b.p]}</span>
          <span class="bar-row__track"><span class="bar-row__fill" style="width: {(b.n / maxPriority) * 100}%" /></span>
          <span class="bar-row__n">{b.n}</span>
        </div>
      {/each}
    </div>
    {#each next as i, idx (i._id)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { open(i) }}>
        <span class="row__id">{i.identifier}</span>
        <span class="row__title">{i.title}</span>
        <span class="row__meta">{statusName.get(i.status) ?? ''}</span>
      </button>
    {/each}
    {#if mine.length === 0}<p class="muted"><Label label={tracker.string.NothingAssigned} /></p>{/if}
  </section>

  <!-- 2. What is due -->
  <section class="card motion-rise" style="--i: 1">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.DueSoon} /></span>
      <span class="card__n">{dueSoon.length}</span>
    </div>
    {#each dueSoon as i, idx (i._id)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { open(i) }}>
        <span class="row__id">{i.identifier}</span>
        <span class="row__title">{i.title}</span>
        <span class="row__meta" class:row__meta--late={(i.dueDate ?? 0) < Date.now()}>{due(i.dueDate ?? 0)}</span>
      </button>
    {/each}
    {#if dueSoon.length === 0}<p class="muted"><Label label={tracker.string.NothingDue} /></p>{/if}
  </section>

  <!-- 3. What has stalled -->
  <section class="card motion-rise" style="--i: 2">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.GoneQuiet} /></span>
      <span class="card__n">{STALE_DAYS}d+</span>
    </div>
    {#each stale as i, idx (i._id)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { open(i) }}>
        <span class="row__id">{i.identifier}</span>
        <span class="row__title">{i.title}</span>
        <span class="row__meta">{ago(i.modifiedOn)}</span>
      </button>
    {/each}
    {#if stale.length === 0}<p class="muted"><Label label={tracker.string.NothingStale} /></p>{/if}
  </section>

  <!-- 4. How the sprints are going -->
  <section class="card motion-rise" style="--i: 3">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.ActiveSprint} /></span>
      <span class="card__n">{progress.length}</span>
    </div>
    {#each progress as p (p.sprint._id)}
      <div class="sprint">
        <div class="sprint__head">
          <span class="sprint__name">{p.sprint.name}</span>
          <span class="sprint__meta">{projectName.get(p.sprint.space) ?? ''} · {daysLeft(p.sprint)} <Label label={tracker.string.DaysLeft} /></span>
        </div>
        <span class="bar-row__track bar-row__track--wide">
          <span class="bar-row__fill" style="width: {p.total === 0 ? 0 : (p.done / p.total) * 100}%" />
        </span>
        <span class="sprint__n">{p.done} / {p.total}</span>
      </div>
    {/each}
    {#if progress.length === 0}<p class="muted"><Label label={tracker.string.NoActiveSprint} /></p>{/if}
  </section>

  <!-- 5. Who is loaded -->
  <section class="card motion-rise" style="--i: 4">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.Workload} /></span>
    </div>
    <div class="bars">
      {#each workload as w (w.name)}
        <div class="bar-row">
          <span class="bar-row__label bar-row__label--wide">{w.name}</span>
          <span class="bar-row__track"><span class="bar-row__fill bar-row__fill--blue" style="width: {(w.n / maxLoad) * 100}%" /></span>
          <span class="bar-row__n">{w.n}</span>
        </div>
      {/each}
    </div>
    {#if workload.length === 0}<p class="muted"><Label label={tracker.string.NothingAssigned} /></p>{/if}
  </section>

  <!-- 6. What was decided -->
  <section class="card motion-rise" style="--i: 5">
    <div class="card__head">
      <span class="card__title"><Label label={tracker.string.Decisions} /></span>
    </div>
    {#each decisions as d, idx (d._id)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { openDecision(d) }}>
        <span class="row__title">{d.title}</span>
        <span class="row__meta">{ago(d.modifiedOn)}</span>
      </button>
    {/each}
    {#if decisions.length === 0}<p class="muted"><Label label={tracker.string.NoDecisions} /></p>{/if}
  </section>
</div>

<style lang="scss">
  .dash {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 1rem;
    padding: 1rem 1.25rem;
    overflow: auto;
  }
  .dash__head {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  .dash__title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .dash__sub {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.9rem 1rem;
    min-width: 0;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    background: var(--theme-panel-color);
  }
  .card__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .card__title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .card__n {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .muted {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.5rem;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .bar-row__label {
    width: 4rem;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    &--wide {
      width: 8rem;
    }
  }
  .bar-row__track {
    flex: 1;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--theme-button-pressed);
    overflow: hidden;
    &--wide {
      height: 0.5rem;
    }
  }
  .bar-row__fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent-brand);
    transition: width var(--motion-slow) var(--ease-enter);
    &--blue {
      background: var(--primary-button-default);
    }
  }
  .bar-row__n {
    width: 1.5rem;
    text-align: right;
    color: var(--theme-caption-color);
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0.35rem 0.4rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
    }
  }
  .row__id {
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--theme-trans-color);
  }
  .row__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row__meta {
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--theme-trans-color);
    &--late {
      color: var(--negative-button-default);
      font-weight: 600;
    }
  }
  .sprint {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.25rem 0.6rem;
    padding: 0.35rem 0;
  }
  .sprint__head {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }
  .sprint__name {
    font-weight: 500;
    color: var(--theme-caption-color);
  }
  .sprint__meta {
    font-size: 0.7rem;
    color: var(--theme-trans-color);
  }
  .sprint__n {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
</style>
