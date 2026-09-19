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
  Backlog, laid out like Jira's: a search box and member filter on top, one
  panel per sprint (active first, then planned) with dates, counts, Start /
  Complete and an inline editor, then the Backlog panel with "Create sprint".
  Rows show type, key, summary, epic, status chip, assignee and points; drag
  a row between panels to plan it, or use "+ Create" at the bottom of any
  panel to add work straight into that sprint. Epics and initiatives are
  containers and sub-issues follow their parent, so neither is listed.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task, { type TaskType } from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Project, type Sprint } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import { createIssueDoc } from '../../createIssueDoc'
  import tracker from '../../plugin'
  import { icon } from '../projects/icons'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const DAY = 86_400_000
  const issueQuery = createQuery()
  const epicQuery = createQuery()
  const sprintQuery = createQuery()
  const statusQuery = createQuery()
  const projectQuery = createQuery()
  const employeeQuery = createQuery()
  let issues: Issue[] = []
  let epics: Issue[] = []
  let sprints: Sprint[] = []
  let statuses: IssueStatus[] = []
  let project: Project | undefined
  let employees: Employee[] = []
  statusQuery.query(tracker.class.IssueStatus, {}, (res) => { statuses = res })
  employeeQuery.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: openIds = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  $: sprintQuery.query(tracker.class.Sprint, { space: currentSpace, state: { $ne: 'completed' } }, (res) => { sprints = res }, { sort: { startDate: SortingOrder.Ascending } })
  $: if (openIds.length > 0) {
    issueQuery.query(tracker.class.Issue, { space: currentSpace, status: { $in: openIds }, attachedTo: tracker.ids.NoParent, kind: { $nin: [tracker.taskTypes.Epic, tracker.taskTypes.Initiative] } }, (res) => { issues = res }, { sort: { rank: SortingOrder.Ascending } })
  }
  $: epicQuery.query(tracker.class.Issue, { space: currentSpace, kind: tracker.taskTypes.Epic }, (r) => { epics = r })
  $: byId = new Map(employees.map((e) => [e._id as Ref<Person>, e]))
  $: epicById = new Map(epics.map((e) => [e._id, e]))
  $: cat = new Map(statuses.map((s) => [s._id, s.category]))
  $: active = sprints.find((s) => s.state === 'active')
  $: planned = sprints.filter((s) => s.state === 'planned').sort((a, b) => a.startDate - b.startDate)
  $: lanes = [...(active !== undefined ? [active] : []), ...planned]

  // ---- filters -----------------------------------------------------------------------------------
  let search = ''
  let who = new Set<string>()
  $: assignees = Array.from(new Set(issues.map((i) => i.assignee).filter((x): x is Ref<Person> => x != null)))
  function toggleWho (k: string): void {
    const next = new Set(who)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    who = next
  }
  const matches = (i: Issue): boolean => (search.trim() === '' || `${i.identifier} ${i.title}`.toLowerCase().includes(search.trim().toLowerCase())) && (who.size === 0 || who.has(i.assignee == null ? 'unassigned' : i.assignee))
  $: visible = issues.filter(matches)
  $: backlog = visible.filter((i) => i.sprint == null)
  $: inSprint = (s: Sprint): Issue[] => visible.filter((i) => i.sprint === s._id)

  // ---- row helpers ---------------------------------------------------------------------------------
  const points = (list: Issue[]): number => list.reduce((a, i) => a + (i.storyPoints ?? 0), 0)
  const statusName = (i: Issue): string => statuses.find((s) => s._id === i.status)?.name ?? ''
  const bucket = (i: Issue): 'todo' | 'doing' | 'done' => { const c = cat.get(i.status); return c === task.statusCategory.Won || c === task.statusCategory.Lost ? 'done' : c === task.statusCategory.Active ? 'doing' : 'todo' }
  const epicOf = (i: Issue): Issue | undefined => { for (const p of i.parents) { const e = epicById.get(p.parentId); if (e !== undefined) return e } return undefined }
  const fmt = (t: number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const daysLeft = (s: Sprint): number => Math.max(0, Math.ceil((s.endDate - Date.now()) / DAY))
  const open = (issue: Issue): void => { showPanel(view.component.EditDoc, issue._id, issue._class, 'content') }

  // ---- sprint lifecycle --------------------------------------------------------------------------------
  async function move (issue: Issue, sprint: Ref<Sprint> | null): Promise<void> {
    if ((issue.sprint ?? null) === sprint) return
    await client.update(issue, { sprint })
  }
  async function start (s: Sprint): Promise<void> {
    if (active !== undefined) return
    await client.update(s, { state: 'active' })
  }
  async function complete (s: Sprint): Promise<void> {
    const next = planned.find((p) => p._id !== s._id)
    const all: Issue[] = await client.findAll(tracker.class.Issue, { space: currentSpace, sprint: s._id })
    const unfinished = all.filter((i) => bucket(i) !== 'done')
    const done = all.length - unfinished.length
    if (!confirm(`Complete "${s.name}"? ${done} done, ${unfinished.length} unfinished ${next !== undefined ? `move to "${next.name}"` : 'return to the backlog'}.`)) return
    for (const i of unfinished) await client.update(i, { sprint: next?._id ?? null })
    await client.update(s, { state: 'completed', carriedOverTo: next?._id ?? null })
  }
  let creatingSprint = false
  let sprintDraft = { name: '', goal: '', start: '', end: '' }
  function openSprintForm (): void {
    const n = sprints.length + 1
    const startAt = active !== undefined ? active.endDate : Date.now()
    sprintDraft = { name: `${project?.identifier ?? 'Sprint'} Sprint ${n}`, goal: '', start: new Date(startAt).toISOString().slice(0, 10), end: new Date(startAt + 14 * DAY).toISOString().slice(0, 10) }
    creatingSprint = true
  }
  async function createSprint (): Promise<void> {
    const startDate = new Date(sprintDraft.start).getTime()
    const endDate = new Date(sprintDraft.end).getTime()
    if (sprintDraft.name.trim() === '' || !(endDate > startDate)) return
    await client.createDoc(tracker.class.Sprint, currentSpace, { name: sprintDraft.name.trim(), goal: sprintDraft.goal.trim() === '' ? undefined : sprintDraft.goal.trim(), startDate, endDate, state: 'planned', carriedOverTo: null })
    creatingSprint = false
  }
  let editing: Ref<Sprint> | undefined
  let edit = { name: '', goal: '', start: '', end: '' }
  function startEdit (s: Sprint): void {
    edit = { name: s.name, goal: s.goal ?? '', start: new Date(s.startDate).toISOString().slice(0, 10), end: new Date(s.endDate).toISOString().slice(0, 10) }
    editing = s._id
    menuFor = undefined
  }
  async function saveEdit (s: Sprint): Promise<void> {
    const startDate = new Date(edit.start).getTime()
    const endDate = new Date(edit.end).getTime()
    if (edit.name.trim() === '' || !(endDate > startDate)) return
    await client.update(s, { name: edit.name.trim(), goal: edit.goal.trim() === '' ? undefined : edit.goal.trim(), startDate, endDate })
    editing = undefined
  }
  async function deleteSprint (s: Sprint): Promise<void> {
    menuFor = undefined
    if (!confirm(`Delete "${s.name}"? Its work items return to the backlog.`)) return
    for (const i of issues.filter((x) => x.sprint === s._id)) await client.update(i, { sprint: null })
    await client.remove(s)
  }
  let menuFor: Ref<Sprint> | undefined

  // ---- "+ Create" rows --------------------------------------------------------------------------------
  type Lane = Ref<Sprint> | 'backlog'
  let creatingIn: Lane | undefined
  let newTitle = ''
  let inputEl: HTMLInputElement | undefined
  function openCreate (lane: Lane): void {
    creatingIn = lane
    newTitle = ''
    setTimeout(() => inputEl?.focus(), 0)
  }
  async function createIssue (lane: Lane): Promise<void> {
    const title = newTitle.trim()
    if (title === '' || project === undefined) return
    const types = client.getModel().findAllSync(task.class.TaskType, { parent: project.type })
    const type: TaskType | undefined = types.find((t) => t._id === tracker.taskTypes.Issue) ?? types.find((t) => t.name === 'Issue') ?? types[0]
    if (type === undefined) return
    const status = (type.statuses[0] ?? statuses[0]?._id) as Ref<IssueStatus>
    await createIssueDoc(project, { title, status, kind: type._id, sprint: lane === 'backlog' ? null : lane })
    newTitle = ''
  }
  function onCreateKey (e: KeyboardEvent, lane: Lane): void {
    if (e.key === 'Enter') void createIssue(lane)
    if (e.key === 'Escape') creatingIn = undefined
  }

  // ---- drag and drop ----------------------------------------------------------------------------------
  let dragging: Ref<Issue> | undefined
  let over: Lane | undefined
  function onDragStart (e: DragEvent, issue: Issue): void {
    dragging = issue._id
    if (e.dataTransfer !== null) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', issue._id)
    }
  }
  async function onDrop (lane: Lane): Promise<void> {
    const id = dragging
    dragging = undefined
    over = undefined
    const issue = issues.find((i) => i._id === id)
    if (issue === undefined) return
    await move(issue, lane === 'backlog' ? null : lane)
  }
  function closeMenus (e: MouseEvent): void {
    if ((e.target as HTMLElement | null)?.closest('.bl__menu-wrap') === null) menuFor = undefined
  }
</script>

<svelte:window on:click={closeMenus} />

<div class="bl">
  <div class="bl__tools">
    <label class="bl__search">{@html icon('filter')}<input class="bl__input" placeholder="Search backlog" bind:value={search} /></label>
    <div class="bl__avatars">
      {#each assignees.slice(0, 8) as id (id)}
        {@const e = byId.get(id)}
        <button class="av" class:av--on={who.has(id)} title={e !== undefined ? formatName(e.name) : ''} on:click={() => { toggleWho(id) }}>{#if e !== undefined}<Avatar person={e} size={'small'} name={e.name} />{/if}</button>
      {/each}
      {#if issues.some((i) => i.assignee == null)}<button class="av av--un" class:av--on={who.has('unassigned')} title="Unassigned" on:click={() => { toggleWho('unassigned') }}>?</button>{/if}
      {#if who.size > 0}<button class="lnk" on:click={() => { who = new Set() }}>Clear</button>{/if}
    </div>
    <span class="grow" />
    <span class="muted">{issues.length} open work items · {lanes.length} sprint{lanes.length === 1 ? '' : 's'}</span>
  </div>

  {#each lanes as s (s._id)}
    {@const list = inSprint(s)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <section class="panel" class:panel--active={s.state === 'active'} class:panel--over={over === s._id} on:dragover|preventDefault={() => { over = s._id }} on:dragleave={() => { if (over === s._id) over = undefined }} on:drop|preventDefault={() => { void onDrop(s._id) }}>
      <header class="panel__head">
        <div class="panel__title">
          <b>{s.name}</b>
          <span class="panel__dates">{fmt(s.startDate)} – {fmt(s.endDate)}{#if s.state === 'active'} · {daysLeft(s)} days left{/if}</span>
          <span class="chip chip--n">{list.length} work item{list.length === 1 ? '' : 's'}</span>
          {#if points(list) > 0}<span class="chip chip--pts" title="story points">{points(list)}</span>{/if}
        </div>
        <div class="panel__actions">
          <span class="counts"><i class="cnt cnt--todo">{list.filter((i) => bucket(i) === 'todo').length}</i><i class="cnt cnt--doing">{list.filter((i) => bucket(i) === 'doing').length}</i><i class="cnt cnt--done">{list.filter((i) => bucket(i) === 'done').length}</i></span>
          {#if s.state === 'active'}
            <button class="btn btn--primary" on:click={() => { void complete(s) }}>Complete sprint</button>
          {:else}
            <button class="btn btn--primary" disabled={active !== undefined || list.length === 0} title={active !== undefined ? 'Complete the running sprint first' : list.length === 0 ? 'Add work items first' : ''} on:click={() => { void start(s) }}>Start sprint</button>
          {/if}
          <span class="bl__menu-wrap">
            <button class="btn btn--icon" title="Sprint actions" on:click|stopPropagation={() => { menuFor = menuFor === s._id ? undefined : s._id }}>{@html icon('more')}</button>
            {#if menuFor === s._id}
              <div class="menu"><button class="menu__item" on:click={() => { startEdit(s) }}>Edit sprint</button><button class="menu__item menu__item--bad" on:click={() => { void deleteSprint(s) }}>Delete sprint</button></div>
            {/if}
          </span>
        </div>
      </header>
      {#if s.goal && editing !== s._id}<p class="panel__goal">{s.goal}</p>{/if}
      {#if editing === s._id}
        <div class="form">
          <input class="input" placeholder="Sprint name" bind:value={edit.name} />
          <input class="input input--w" placeholder="Sprint goal" bind:value={edit.goal} />
          <input class="input" type="date" bind:value={edit.start} /><input class="input" type="date" bind:value={edit.end} />
          <button class="btn btn--primary" on:click={() => { void saveEdit(s) }}>Save</button><button class="btn" on:click={() => { editing = undefined }}>Cancel</button>
        </div>
      {/if}
      {#if list.length === 0}<p class="panel__empty">Plan a sprint by dragging work items here, or create them below.</p>{/if}
      {#each list as i (i._id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="row" class:row--dragging={dragging === i._id} draggable="true" on:dragstart={(e) => { onDragStart(e, i) }} on:dragend={() => { dragging = undefined; over = undefined }}>
          <span class="row__grip">⋮⋮</span>
          <i class="tico" style="color: {i.parents.length > 0 ? '#6554c0' : '#388bff'}">{@html icon(i.parents.length > 0 ? 'subtask' : 'issue')}</i>
          <button class="row__key" on:click={() => { open(i) }}>{i.identifier}</button>
          <button class="row__title" on:click={() => { open(i) }}>{i.title}</button>
          {#if epicOf(i)}<span class="epic">{epicOf(i)?.title}</span>{/if}
          <span class="status status--{bucket(i)}">{statusName(i)}</span>
          <span class="row__av">{#if i.assignee != null && byId.get(i.assignee) !== undefined}{@const e = byId.get(i.assignee)}{#if e !== undefined}<Avatar person={e} size={'x-small'} name={e.name} />{/if}{:else}<span class="av__ph">?</span>{/if}</span>
          <span class="pts" class:pts--empty={!i.storyPoints}>{i.storyPoints ?? '–'}</span>
          <button class="row__move" title="Move to backlog" on:click={() => { void move(i, null) }}>⤓</button>
        </div>
      {/each}
      {#if creatingIn === s._id}
        <div class="create"><i class="tico" style="color: #388bff">{@html icon('issue')}</i><input class="create__input" placeholder="What needs to be done? Enter to create, Esc to cancel" bind:value={newTitle} bind:this={inputEl} on:keydown={(e) => { onCreateKey(e, s._id) }} on:blur={() => { if (newTitle.trim() === '') creatingIn = undefined }} /></div>
      {:else}
        <button class="create__btn" on:click={() => { openCreate(s._id) }}>+ Create</button>
      {/if}
    </section>
  {/each}

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <section class="panel panel--backlog" class:panel--over={over === 'backlog'} on:dragover|preventDefault={() => { over = 'backlog' }} on:dragleave={() => { if (over === 'backlog') over = undefined }} on:drop|preventDefault={() => { void onDrop('backlog') }}>
    <header class="panel__head">
      <div class="panel__title"><b>Backlog</b><span class="chip chip--n">{backlog.length} work item{backlog.length === 1 ? '' : 's'}</span>{#if points(backlog) > 0}<span class="chip chip--pts">{points(backlog)}</span>{/if}</div>
      <div class="panel__actions">
        <span class="counts"><i class="cnt cnt--todo">{backlog.filter((i) => bucket(i) === 'todo').length}</i><i class="cnt cnt--doing">{backlog.filter((i) => bucket(i) === 'doing').length}</i><i class="cnt cnt--done">0</i></span>
        <button class="btn" on:click={openSprintForm}>Create sprint</button>
      </div>
    </header>
    {#if creatingSprint}
      <div class="form">
        <input class="input" placeholder="Sprint name" bind:value={sprintDraft.name} />
        <input class="input input--w" placeholder="Sprint goal (optional)" bind:value={sprintDraft.goal} />
        <input class="input" type="date" bind:value={sprintDraft.start} /><input class="input" type="date" bind:value={sprintDraft.end} />
        <button class="btn btn--primary" on:click={() => { void createSprint() }}>Create</button><button class="btn" on:click={() => { creatingSprint = false }}>Cancel</button>
      </div>
    {/if}
    {#if backlog.length === 0}<p class="panel__empty">Your backlog is empty. Create the first work item below.</p>{/if}
    {#each backlog as i (i._id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="row" class:row--dragging={dragging === i._id} draggable="true" on:dragstart={(e) => { onDragStart(e, i) }} on:dragend={() => { dragging = undefined; over = undefined }}>
        <span class="row__grip">⋮⋮</span>
        <i class="tico" style="color: {i.parents.length > 0 ? '#6554c0' : '#388bff'}">{@html icon(i.parents.length > 0 ? 'subtask' : 'issue')}</i>
        <button class="row__key" on:click={() => { open(i) }}>{i.identifier}</button>
        <button class="row__title" on:click={() => { open(i) }}>{i.title}</button>
        {#if epicOf(i)}<span class="epic">{epicOf(i)?.title}</span>{/if}
        <span class="status status--{bucket(i)}">{statusName(i)}</span>
        <span class="row__av">{#if i.assignee != null && byId.get(i.assignee) !== undefined}{@const e = byId.get(i.assignee)}{#if e !== undefined}<Avatar person={e} size={'x-small'} name={e.name} />{/if}{:else}<span class="av__ph">?</span>{/if}</span>
        <span class="pts" class:pts--empty={!i.storyPoints}>{i.storyPoints ?? '–'}</span>
        {#if lanes.length > 0}<button class="row__move" title="Move to {(active ?? lanes[0]).name}" on:click={() => { void move(i, (active ?? lanes[0])._id) }}>⤒</button>{/if}
      </div>
    {/each}
    {#if creatingIn === 'backlog'}
      <div class="create"><i class="tico" style="color: #388bff">{@html icon('issue')}</i><input class="create__input" placeholder="What needs to be done? Enter to create, Esc to cancel" bind:value={newTitle} bind:this={inputEl} on:keydown={(e) => { onCreateKey(e, 'backlog') }} on:blur={() => { if (newTitle.trim() === '') creatingIn = undefined }} /></div>
    {:else}
      <button class="create__btn" on:click={() => { openCreate('backlog') }}>+ Create</button>
    {/if}
  </section>
</div>

<style lang="scss">
  .bl { --j-text: #172b4d; --j-sub: #626f86; --j-link: #0c66e4; --j-border: rgba(9, 30, 66, 0.14); --j-surface: #fff; --j-hover: rgba(9, 30, 66, 0.06); --j-panel: #f7f8f9; --j-track: #dcdfe4;
    display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem 1.5rem 2rem; overflow: auto; color: var(--j-text); }
  :global(.theme-dark) .bl { --j-text: #b6c2cf; --j-sub: #8c9bab; --j-link: #579dff; --j-border: #38414a; --j-surface: #22272b; --j-hover: rgba(255, 255, 255, 0.08); --j-panel: #1d2125; --j-track: #38414a; }
  .bl__tools { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .bl__search { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0 0.6rem; border: 1px solid var(--j-border); border-radius: 0.3rem; background: var(--j-surface); color: var(--j-sub); :global(svg) { width: 1rem; height: 1rem; } &:focus-within { border-color: var(--j-link); } }
  .bl__input { width: 14rem; padding: 0.4rem 0; border: none; background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; outline: none; }
  .bl__avatars { display: flex; align-items: center; }
  .av { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; margin-right: -0.35rem; padding: 0; border: 2px solid var(--j-surface); border-radius: 50%; background: var(--j-track); color: var(--j-sub); cursor: pointer; overflow: hidden; &:hover { z-index: 2; transform: translateY(-2px); } &--on { box-shadow: 0 0 0 2px var(--j-link); z-index: 1; } &--un { font-weight: 700; } }
  .av__ph { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--j-track); color: var(--j-sub); font-size: 0.7rem; font-weight: 700; }
  .grow { flex: 1; }
  .muted { font-size: 0.8125rem; color: var(--j-sub); }
  .lnk { margin-left: 0.75rem; border: none; background: transparent; color: var(--j-link); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { text-decoration: underline; } }
  .panel { display: flex; flex-direction: column; border: 1px solid var(--j-border); border-radius: 0.35rem; background: var(--j-panel); transition: box-shadow 0.15s ease; &--active { border-color: var(--j-link); } &--over { box-shadow: 0 0 0 3px #e9f2ff; border-color: var(--j-link); } }
  .panel__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; flex-wrap: wrap; }
  .panel__title { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; b { font-size: 0.95rem; font-weight: 600; } }
  .panel__dates { font-size: 0.8125rem; color: var(--j-sub); }
  .panel__goal { margin: -0.4rem 1rem 0.4rem; font-size: 0.8125rem; color: var(--j-sub); }
  .panel__actions { display: flex; align-items: center; gap: 0.5rem; }
  .panel__empty { margin: 0 1rem 0.5rem; padding: 0.9rem; border: 2px dashed var(--j-border); border-radius: 0.3rem; font-size: 0.8125rem; color: var(--j-sub); text-align: center; }
  .chip { padding: 0.1rem 0.5rem; border-radius: 0.25rem; font-size: 0.7rem; font-weight: 700; &--n { background: var(--j-track); color: var(--j-sub); } &--pts { background: #e9f2ff; color: var(--j-link); } }
  .counts { display: inline-flex; gap: 0.25rem; margin-right: 0.25rem; }
  .cnt { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6rem; padding: 0.1rem 0.4rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; font-style: normal; &--todo { background: #dfe1e6; color: #42526e; } &--doing { background: #deebff; color: #0747a6; } &--done { background: #e3fcef; color: #006644; } }
  .btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; border: none; border-radius: 0.25rem; background: #f1f2f4; color: var(--j-text); font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; &:hover { background: #dcdfe4; } &--primary { background: var(--j-link); color: #fff; &:hover { background: #0055cc; } } &:disabled { opacity: 0.45; cursor: not-allowed; } &--icon { padding: 0.4rem; } :global(svg) { width: 1rem; height: 1rem; } }
  :global(.theme-dark) .bl .btn { background: #2c333a; &:hover { background: #38414a; } &--primary { background: var(--j-link); color: #1d2125; } }
  .bl__menu-wrap { position: relative; }
  .menu { position: absolute; right: 0; top: calc(100% + 0.25rem); z-index: 20; display: flex; flex-direction: column; min-width: 10rem; padding: 0.3rem; border: 1px solid var(--j-border); border-radius: 0.3rem; background: var(--j-surface); box-shadow: 0 8px 12px rgba(9, 30, 66, 0.15); }
  .menu__item { padding: 0.45rem 0.7rem; border: none; border-radius: 0.25rem; background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; &:hover { background: var(--j-hover); } &--bad { color: #c9372c; } }
  .form { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin: 0 1rem 0.6rem; padding: 0.6rem; border: 1px solid var(--j-border); border-radius: 0.3rem; background: var(--j-surface); }
  .input { padding: 0.35rem 0.5rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); color: var(--j-text); font: inherit; font-size: 0.875rem; &--w { flex: 1; min-width: 12rem; } }
  .row { display: grid; grid-template-columns: auto auto auto 1fr auto auto auto auto auto; align-items: center; gap: 0.6rem; padding: 0.4rem 0.75rem; border-top: 1px solid var(--j-border); background: var(--j-surface); font-size: 0.875rem; &:hover { background: var(--j-hover); } &--dragging { opacity: 0.4; } }
  .row__grip { color: var(--j-track); font-size: 0.8rem; letter-spacing: -0.15em; cursor: grab; }
  .tico { display: inline-flex; :global(svg) { width: 1rem; height: 1rem; } }
  .row__key { padding: 0; border: none; background: transparent; color: var(--j-sub); font: inherit; font-size: 0.8125rem; cursor: pointer; white-space: nowrap; &:hover { color: var(--j-link); text-decoration: underline; } }
  .row__title { min-width: 0; padding: 0; border: none; background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; &:hover { color: var(--j-link); } }
  .epic { max-width: 10rem; padding: 0.05rem 0.45rem; border: 1px solid #c0b6f2; border-radius: 0.25rem; color: #6554c0; font-size: 0.7rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { padding: 0.15rem 0.5rem; border-radius: 0.2rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; &--todo { background: #dfe1e6; color: #42526e; } &--doing { background: #deebff; color: #0747a6; } &--done { background: #e3fcef; color: #006644; } }
  .row__av { display: inline-flex; width: 1.5rem; justify-content: center; }
  .pts { min-width: 1.5rem; padding: 0.05rem 0.4rem; border-radius: 999px; background: var(--j-track); color: var(--j-sub); font-size: 0.72rem; font-weight: 700; text-align: center; &--empty { opacity: 0.5; } }
  .row__move { width: 1.6rem; height: 1.6rem; border: none; border-radius: 0.25rem; background: transparent; color: var(--j-sub); font: inherit; cursor: pointer; opacity: 0; &:hover { background: var(--j-track); color: var(--j-text); } }
  .row:hover .row__move { opacity: 1; }
  .create { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.75rem; border-top: 1px solid var(--j-border); background: var(--j-surface); }
  .create__input { flex: 1; padding: 0.35rem 0.5rem; border: 2px solid var(--j-link); border-radius: 0.25rem; background: var(--j-surface); color: var(--j-text); font: inherit; font-size: 0.875rem; outline: none; }
  .create__btn { padding: 0.5rem 0.9rem; border: none; border-top: 1px solid var(--j-border); border-radius: 0 0 0.35rem 0.35rem; background: transparent; color: var(--j-sub); font: inherit; font-size: 0.875rem; font-weight: 500; text-align: left; cursor: pointer; &:hover { background: var(--j-hover); color: var(--j-text); } }
</style>
