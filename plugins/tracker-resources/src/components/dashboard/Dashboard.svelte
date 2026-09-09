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
  Dashboards: as many as you like, each a list of widgets. Private by
  default; share one and everyone sees it. Wallboard mode goes full screen
  and refreshes every minute, for the TV by the team.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import core, { generateId, SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Dashboard, type DashboardWidget, type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Label } from '@hcengineering/ui'
  import { onDestroy } from 'svelte'

  import tracker from '../../plugin'
  import Widget from './Widget.svelte'

  const client = getClient()
  const me = getCurrentEmployee()
  const query = createQuery()
  const projectQuery = createQuery()
  let dashboards: Dashboard[] = []
  let projects: Project[] = []
  query.query(tracker.class.Dashboard, {}, (r) => { dashboards = r.filter((d) => d.owner === me || d.shared) }, { sort: { createdOn: SortingOrder.Ascending } })
  projectQuery.query(tracker.class.Project, {}, (r) => { projects = r })

  const DEFAULT: DashboardWidget[] = [
    { id: 'w1', type: 'mine' },
    { id: 'w2', type: 'due' },
    { id: 'w3', type: 'stale' },
    { id: 'w4', type: 'sprints' },
    { id: 'w5', type: 'workload' },
    { id: 'w6', type: 'decisions' }
  ]
  let selectedId: Ref<Dashboard> | 'default' = 'default'
  $: selected = selectedId === 'default' ? undefined : dashboards.find((d) => d._id === selectedId)
  $: widgets = selected?.widgets ?? DEFAULT
  $: canEdit = selected !== undefined && selected.owner === me

  let editing = false
  async function createDashboard (fromDefault = true): Promise<void> {
    const name = prompt('Dashboard name', 'My dashboard')
    if (name === null || name.trim() === '') return
    const id = await client.createDoc(tracker.class.Dashboard, core.space.Workspace, {
      name: name.trim(),
      owner: me,
      shared: false,
      widgets: fromDefault ? DEFAULT.map((w) => ({ ...w, id: generateId() })) : []
    })
    selectedId = id
    editing = true
  }
  async function save (ws: DashboardWidget[]): Promise<void> {
    if (selected === undefined) return
    await client.update(selected, { widgets: ws })
  }
  async function rename (): Promise<void> {
    if (selected === undefined) return
    const name = prompt('Dashboard name', selected.name)
    if (name === null || name.trim() === '') return
    await client.update(selected, { name: name.trim() })
  }
  async function remove (): Promise<void> {
    if (selected === undefined || !confirm(`Delete "${selected.name}"?`)) return
    await client.remove(selected)
    selectedId = 'default'
    editing = false
  }
  function move (idx: number, dir: -1 | 1): void {
    const ws = [...widgets]
    const j = idx + dir
    if (j < 0 || j >= ws.length) return
    ;[ws[idx], ws[j]] = [ws[j], ws[idx]]
    void save(ws)
  }
  function removeWidget (idx: number): void {
    void save(widgets.filter((_, k) => k !== idx))
  }

  // ---- add widget ----------------------------------------------------------
  const LIBRARY: Array<{ type: string, label: string, hint: string }> = [
    { type: 'mine', label: 'Assigned to me', hint: 'Open issues by priority, top of the list first' },
    { type: 'due', label: 'Due soon', hint: 'Mine due within N days' },
    { type: 'stale', label: 'Gone quiet', hint: 'Open issues untouched for N days' },
    { type: 'sprints', label: 'Active sprints', hint: 'Progress of every active sprint' },
    { type: 'workload', label: 'Workload', hint: 'Open issues per person' },
    { type: 'decisions', label: 'Decisions', hint: 'Latest decision records' },
    { type: 'query', label: 'Query results', hint: 'Any query-language expression' },
    { type: 'pie', label: 'Breakdown', hint: 'Donut by status, priority, assignee or project' },
    { type: 'cvr', label: 'Created vs resolved', hint: 'Daily lines for the last N days' },
    { type: 'sla', label: 'SLA at risk', hint: 'Open issues breaching within N hours' },
    { type: 'activity', label: 'Recent activity', hint: 'Latest changes across issues' },
    { type: 'hours', label: 'Hours this week', hint: 'Logged time per person' }
  ]
  let adding = false
  let newType = 'query'
  let newTitle = ''
  let newText = 'assignee = me AND status != done'
  let newField = 'status'
  let newDays = 30
  let newHours = 24
  let newProject: Ref<Project> | '' = ''
  function addWidget (): void {
    const params: Record<string, any> = {}
    if (newTitle.trim() !== '') params.title = newTitle.trim()
    if (newType === 'query') params.text = newText
    if (newType === 'pie') {
      params.field = newField
      if (newProject !== '') params.project = newProject
    }
    if (newType === 'cvr') {
      params.days = newDays
      if (newProject !== '') params.project = newProject
    }
    if (newType === 'due' || newType === 'stale') params.days = newDays
    if (newType === 'sla') params.hours = newHours
    void save([...widgets, { id: generateId(), type: newType, params }])
    adding = false
    newTitle = ''
  }

  // ---- wallboard -----------------------------------------------------------
  let wall = false
  let tick = 0
  let timer: ReturnType<typeof setInterval> | undefined
  function toggleWall (): void {
    wall = !wall
    if (wall) {
      void document.documentElement.requestFullscreen?.()
      timer = setInterval(() => { tick++ }, 60_000)
    } else {
      if (document.fullscreenElement != null) void document.exitFullscreen()
      if (timer !== undefined) clearInterval(timer)
    }
  }
  onDestroy(() => {
    if (timer !== undefined) clearInterval(timer)
  })
  const titleOf = (w: DashboardWidget): string => (w.params?.title as string | undefined) ?? LIBRARY.find((l) => l.type === w.type)?.label ?? w.type
</script>

<div class="dash" class:dash--wall={wall}>
  <header class="dash__head">
    <div class="dash__left">
      <select class="select" bind:value={selectedId}>
        <option value="default">Default</option>
        {#each dashboards as d (d._id)}<option value={d._id}>{d.name}{d.shared ? ' · shared' : ''}{d.owner !== me ? ' · ' : ''}</option>{/each}
      </select>
      <span class="dash__sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
    </div>
    <div class="dash__tools">
      {#if selected === undefined}
        <Button kind={'ghost'} icon={IconAdd} label={tracker.string.NewDashboard} on:click={() => { void createDashboard(true) }} />
      {:else if canEdit}
        <Button kind={editing ? 'primary' : 'ghost'} label={editing ? tracker.string.Done : tracker.string.Edit} on:click={() => { editing = !editing; adding = false }} />
        {#if editing}
          <Button kind={'ghost'} label={tracker.string.Rename} on:click={rename} />
          <Button kind={'ghost'} label={selected.shared ? tracker.string.Unshare : tracker.string.Share} on:click={() => { void client.update(selected, { shared: !selected.shared }) }} />
          <Button kind={'ghost'} label={tracker.string.Delete} on:click={remove} />
          <Button kind={'ghost'} icon={IconAdd} label={tracker.string.NewDashboard} on:click={() => { void createDashboard(false) }} />
        {/if}
      {/if}
      <Button kind={'ghost'} label={wall ? tracker.string.ExitWallboard : tracker.string.Wallboard} on:click={toggleWall} />
    </div>
  </header>

  {#if editing && canEdit}
    <section class="addbar motion-pop">
      {#if !adding}
        <Button kind={'primary'} icon={IconAdd} label={tracker.string.AddWidget} on:click={() => { adding = true }} />
      {:else}
        <div class="addbar__form">
          <select class="select" bind:value={newType}>{#each LIBRARY as l (l.type)}<option value={l.type}>{l.label}</option>{/each}</select>
          <input class="input" placeholder="Title (optional)" bind:value={newTitle} />
          {#if newType === 'query'}<input class="input input--wide" placeholder="assignee = me AND status != done" bind:value={newText} />{/if}
          {#if newType === 'pie'}
            <select class="select" bind:value={newField}><option value="status">by status</option><option value="priority">by priority</option><option value="assignee">by assignee</option><option value="project">by project</option></select>
          {/if}
          {#if newType === 'pie' || newType === 'cvr'}
            <select class="select" bind:value={newProject}><option value="">all projects</option>{#each projects as p (p._id)}<option value={p._id}>{p.name}</option>{/each}</select>
          {/if}
          {#if newType === 'cvr' || newType === 'due' || newType === 'stale'}<input class="input input--n" type="number" min="1" bind:value={newDays} /> days{/if}
          {#if newType === 'sla'}<input class="input input--n" type="number" min="1" bind:value={newHours} /> hours{/if}
          <Button kind={'primary'} label={tracker.string.Add} on:click={addWidget} />
          <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { adding = false }} />
        </div>
        <span class="addbar__hint">{LIBRARY.find((l) => l.type === newType)?.hint}</span>
      {/if}
    </section>
  {/if}

  <div class="grid">
    {#each widgets as w, idx (w.id)}
      <section class="card motion-rise" style="--i: {idx}">
        <div class="card__head">
          <span class="card__title">{titleOf(w)}</span>
          {#if editing && canEdit}
            <span class="card__tools">
              <button class="tool" title="Move up" on:click={() => { move(idx, -1) }}>↑</button>
              <button class="tool" title="Move down" on:click={() => { move(idx, 1) }}>↓</button>
              <button class="tool tool--x" title="Remove" on:click={() => { removeWidget(idx) }}>×</button>
            </span>
          {/if}
        </div>
        {#key tick}
          <Widget type={w.type} params={w.params ?? {}} {tick} {wall} />
        {/key}
      </section>
    {/each}
  </div>
  {#if selected === undefined}
    <p class="muted"><Label label={tracker.string.DefaultDashboardHint} /></p>
  {/if}
</div>

<style lang="scss">
  .dash { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; overflow: auto; height: 100%;
    &--wall { background: #0b0c0f; color: #fff; .card { background: #15171c; border-color: #23262e; } .card__title { font-size: 1.1rem; } }
  }
  .dash__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .dash__left { display: flex; align-items: baseline; gap: 0.75rem; }
  .dash__sub { font-size: 0.8125rem; color: var(--theme-trans-color); }
  .dash__tools { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .select, .input { padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; }
  .select { font-weight: 600; }
  .input--wide { min-width: 20rem; font-family: var(--mono-font, ui-monospace, Menlo, monospace); font-size: 0.8125rem; }
  .input--n { width: 4rem; }
  .addbar { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 1rem; border: 1px dashed var(--accent-brand); border-radius: 0.75rem; }
  .addbar__form { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--theme-content-color); }
  .addbar__hint { font-size: 0.75rem; color: var(--theme-trans-color); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; }
  .card { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.9rem 1rem; min-width: 0; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .card__tools { display: flex; gap: 0.2rem; }
  .tool { width: 1.5rem; height: 1.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; background: transparent; color: var(--theme-dark-color); font: inherit; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--x:hover { color: var(--negative-button-default); } }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
</style>
