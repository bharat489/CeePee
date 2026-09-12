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
  Dashboards: as many as you like, each a list of widgets from a library
  of twenty kinds. Every widget takes a project and a query-language filter.
  Private by default; share one and everyone sees it. Export a dashboard
  as JSON to hand it to another workspace; duplicate to branch from it.
  Wallboard mode goes full screen and refreshes every minute.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import core, { generateId, SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Dashboard, type DashboardWidget, type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Label, showPopup } from '@hcengineering/ui'
  import { onDestroy } from 'svelte'

  import tracker from '../../plugin'
  import Widget from './Widget.svelte'
  import Subscriptions from '../query/Subscriptions.svelte'

  const client = getClient()
  const me = getCurrentEmployee()
  const query = createQuery()
  const projectQuery = createQuery()
  let dashboards: Dashboard[] = []
  let projects: Project[] = []
  query.query(tracker.class.Dashboard, {}, (r) => { dashboards = r.filter((d) => d.owner === me || d.shared) }, { sort: { createdOn: SortingOrder.Ascending } })
  projectQuery.query(tracker.class.Project, {}, (r) => { projects = r })

  const DEFAULT: DashboardWidget[] = [
    { id: 'w1', type: 'mine' }, { id: 'w2', type: 'due' }, { id: 'w3', type: 'stale' }, { id: 'w4', type: 'sprints' }, { id: 'w5', type: 'workload' }, { id: 'w6', type: 'decisions' }
  ]
  let selectedId: Ref<Dashboard> | 'default' = 'default'
  $: selected = selectedId === 'default' ? undefined : dashboards.find((d) => d._id === selectedId)
  $: widgets = selected?.widgets ?? DEFAULT
  $: canEdit = selected !== undefined && selected.owner === me

  const LIBRARY: Array<{ type: string, label: string, hint: string, knobs: string[] }> = [
    { type: 'mine', label: 'Assigned to me', hint: 'Open issues by priority', knobs: ['limit'] },
    { type: 'due', label: 'Due soon', hint: 'Due within N days', knobs: ['days', 'limit', 'everyone'] },
    { type: 'stale', label: 'Gone quiet', hint: 'Open, untouched for N days', knobs: ['days', 'limit'] },
    { type: 'recent', label: 'Recently created', hint: 'Newest issues', knobs: ['days', 'limit'] },
    { type: 'sprints', label: 'Active sprints', hint: 'Progress of active sprints', knobs: [] },
    { type: 'burndown', label: 'Sprint burndown', hint: 'Active sprint, remaining vs ideal', knobs: [] },
    { type: 'countdown', label: 'Countdown', hint: 'Days to milestones and sprint ends', knobs: ['limit'] },
    { type: 'workload', label: 'Workload', hint: 'Open issues per person', knobs: ['limit'] },
    { type: 'decisions', label: 'Decisions', hint: 'Latest decision records', knobs: ['limit'] },
    { type: 'query', label: 'Query results', hint: 'Any query-language expression', knobs: ['text', 'limit'] },
    { type: 'pie', label: 'Breakdown', hint: 'Donut by a field', knobs: ['field', 'includeDone'] },
    { type: 'two-dim', label: 'Two-dimensional statistics', hint: 'Field × field counts', knobs: ['x', 'y', 'includeDone'] },
    { type: 'cvr', label: 'Created vs resolved', hint: 'Daily lines for N days', knobs: ['days'] },
    { type: 'avg-age', label: 'Average age', hint: 'Average age of open issues over N days', knobs: ['days'] },
    { type: 'sla', label: 'SLA at risk', hint: 'Breaching within N hours', knobs: ['hours', 'limit'] },
    { type: 'labels', label: 'Top labels', hint: 'Most used labels on open issues', knobs: ['limit'] },
    { type: 'heatmap', label: 'Created by weekday', hint: 'When work arrives', knobs: ['days'] },
    { type: 'csat', label: 'Satisfaction', hint: 'Ratings from the service desk', knobs: [] },
    { type: 'time-in-status', label: 'Time in status', hint: 'Average days per status over N days', knobs: ['days', 'limit'] },
    { type: 'goals', label: 'Goals', hint: 'Progress of every goal', knobs: [] },
    { type: 'ideas', label: 'Top ideas', hint: 'Highest RICE score, still open', knobs: ['limit'] },
    { type: 'activity', label: 'Recent activity', hint: 'Latest changes', knobs: ['limit'] },
    { type: 'hours', label: 'Hours this week', hint: 'Logged time per person', knobs: [] },
    { type: 'text', label: 'Note', hint: 'Free text for the team', knobs: ['text'] },
    { type: 'links', label: 'Links', hint: 'Bookmarks, one per line: label | url', knobs: ['items'] }
  ]
  const FIELDS = [{ id: 'status', label: 'status' }, { id: 'priority', label: 'priority' }, { id: 'assignee', label: 'assignee' }, { id: 'project', label: 'project' }, { id: 'kind', label: 'type' }, { id: 'category', label: 'to do / in progress / done' }]
  const titleOf = (w: DashboardWidget): string => (w.params?.title as string | undefined) ?? LIBRARY.find((l) => l.type === w.type)?.label ?? w.type
  const knobsOf = (t: string): string[] => LIBRARY.find((l) => l.type === t)?.knobs ?? []

  // ---- dashboards -----------------------------------------------------------
  let editing = false
  async function createDashboard (fromDefault = true): Promise<void> {
    const name = prompt('Dashboard name', 'My dashboard')
    if (name === null || name.trim() === '') return
    selectedId = await client.createDoc(tracker.class.Dashboard, core.space.Workspace, { name: name.trim(), owner: me, shared: false, widgets: fromDefault ? DEFAULT.map((w) => ({ ...w, id: generateId() })) : [] })
    editing = true
  }
  async function duplicate (): Promise<void> {
    const src = selected
    const name = prompt('Name for the copy', `${src?.name ?? 'Default'} (copy)`)
    if (name === null || name.trim() === '') return
    selectedId = await client.createDoc(tracker.class.Dashboard, core.space.Workspace, { name: name.trim(), owner: me, shared: false, widgets: widgets.map((w) => ({ ...w, id: generateId() })) })
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
  function exportJson (): void {
    const blob = new Blob([JSON.stringify({ name: selected?.name ?? 'Default', widgets: widgets.map(({ type, params }) => ({ type, params })) }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(selected?.name ?? 'dashboard').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function importJson (e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f === undefined) return
    try {
      const j = JSON.parse(await f.text()) as { name?: string, widgets?: Array<{ type: string, params?: Record<string, any> }> }
      if (!Array.isArray(j.widgets)) throw new Error('no widgets')
      selectedId = await client.createDoc(tracker.class.Dashboard, core.space.Workspace, { name: (j.name ?? f.name).slice(0, 60), owner: me, shared: false, widgets: j.widgets.map((w) => ({ id: generateId(), type: String(w.type), params: w.params ?? {} })) })
    } catch (err: any) {
      alert('Could not import: ' + String(err?.message ?? err))
    }
  }

  // ---- widget editor (add + gear) ----------------------------------------------
  let editIdx: number | undefined // index being edited, -1 = adding
  let draft: { type: string, params: Record<string, any> } = { type: 'query', params: {} }
  function startAdd (): void {
    draft = { type: 'query', params: { text: 'assignee = me AND status != done' } }
    editIdx = -1
  }
  function startEdit (idx: number): void {
    draft = { type: widgets[idx].type, params: { ...(widgets[idx].params ?? {}) } }
    editIdx = idx
  }
  function commit (): void {
    const params: Record<string, any> = {}
    for (const [k, v] of Object.entries(draft.params)) if (v !== '' && v !== undefined && v !== null) params[k] = v
    const ws = [...widgets]
    if (editIdx === -1) ws.push({ id: generateId(), type: draft.type, params })
    else if (editIdx !== undefined) ws[editIdx] = { ...ws[editIdx], type: draft.type, params }
    void save(ws)
    editIdx = undefined
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
</script>

<div class="dash" class:dash--wall={wall}>
  <header class="dash__head">
    <div class="dash__left">
      <select class="select" bind:value={selectedId}>
        <option value="default">Default</option>
        {#each dashboards as d (d._id)}<option value={d._id}>{d.name}{d.shared ? ' · shared' : ''}</option>{/each}
      </select>
      <span class="dash__sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
    </div>
    <div class="dash__tools">
      {#if selected === undefined}
        <Button kind={'ghost'} icon={IconAdd} label={tracker.string.NewDashboard} on:click={() => { void createDashboard(true) }} />
        <Button kind={'ghost'} label={tracker.string.Duplicate} on:click={duplicate} />
      {:else if canEdit}
        <Button kind={editing ? 'primary' : 'ghost'} label={editing ? tracker.string.Done : tracker.string.Edit} on:click={() => { editing = !editing; editIdx = undefined }} />
        {#if editing}
          <Button kind={'ghost'} label={tracker.string.Rename} on:click={rename} />
          <Button kind={'ghost'} label={selected.shared ? tracker.string.Unshare : tracker.string.Share} on:click={() => { void client.update(selected, { shared: !selected.shared }) }} />
          <Button kind={'ghost'} label={tracker.string.Duplicate} on:click={duplicate} />
          <Button kind={'ghost'} label={tracker.string.Delete} on:click={remove} />
          <Button kind={'ghost'} icon={IconAdd} label={tracker.string.NewDashboard} on:click={() => { void createDashboard(false) }} />
        {/if}
      {:else}
        <Button kind={'ghost'} label={tracker.string.Duplicate} on:click={duplicate} />
      {/if}
      <Button kind={'ghost'} label={tracker.string.ExportJson} on:click={exportJson} />
      <label class="import"><input type="file" accept="application/json" on:change={importJson} /><Label label={tracker.string.ImportJson} /></label>
      <Button kind={'ghost'} label={wall ? tracker.string.ExitWallboard : tracker.string.Wallboard} on:click={toggleWall} />
      <Button kind={'ghost'} label={tracker.string.EmailSchedule} disabled={selected === undefined} on:click={() => { if (selected !== undefined) showPopup(Subscriptions, { kind: 'dashboard', dashboard: selected._id, name: selected.name }, 'top') }} />
    </div>
  </header>

  {#if editing && canEdit}
    <section class="addbar motion-pop">
      {#if editIdx === undefined}
        <Button kind={'primary'} icon={IconAdd} label={tracker.string.AddWidget} on:click={startAdd} />
        <span class="addbar__hint">{LIBRARY.length} widget kinds. Every widget takes a project and a query filter.</span>
      {:else}
        <div class="addbar__form">
          <select class="select" bind:value={draft.type}>{#each LIBRARY as l (l.type)}<option value={l.type}>{l.label}</option>{/each}</select>
          <input class="input" placeholder="Title (optional)" bind:value={draft.params.title} />
          <select class="select" bind:value={draft.params.project}><option value="">all projects</option>{#each projects as p (p._id)}<option value={p._id}>{p.name}</option>{/each}</select>
          <input class="input input--wide" placeholder="filter, e.g. priority >= high AND labels = bug" bind:value={draft.params.filter} />
          {#if knobsOf(draft.type).includes('text')}<input class="input input--wide" placeholder={draft.type === 'query' ? 'assignee = me AND status != done' : 'Text'} bind:value={draft.params.text} />{/if}
          {#if knobsOf(draft.type).includes('items')}<textarea class="input input--wide" rows="3" placeholder="Runbook | https://…&#10;Status page | https://…" bind:value={draft.params.items} />{/if}
          {#if knobsOf(draft.type).includes('field')}<select class="select" bind:value={draft.params.field}>{#each FIELDS as f (f.id)}<option value={f.id}>by {f.label}</option>{/each}</select>{/if}
          {#if knobsOf(draft.type).includes('x')}<select class="select" bind:value={draft.params.x}>{#each FIELDS as f (f.id)}<option value={f.id}>columns: {f.label}</option>{/each}</select><select class="select" bind:value={draft.params.y}>{#each FIELDS as f (f.id)}<option value={f.id}>rows: {f.label}</option>{/each}</select>{/if}
          {#if knobsOf(draft.type).includes('days')}<label class="knob"><input class="input input--n" type="number" min="1" bind:value={draft.params.days} /> days</label>{/if}
          {#if knobsOf(draft.type).includes('hours')}<label class="knob"><input class="input input--n" type="number" min="1" bind:value={draft.params.hours} /> hours</label>{/if}
          {#if knobsOf(draft.type).includes('limit')}<label class="knob"><input class="input input--n" type="number" min="1" bind:value={draft.params.limit} /> rows</label>{/if}
          {#if knobsOf(draft.type).includes('includeDone')}<label class="knob"><input type="checkbox" bind:checked={draft.params.includeDone} /> include done</label>{/if}
          {#if knobsOf(draft.type).includes('everyone')}<label class="knob"><input type="checkbox" bind:checked={draft.params.everyone} /> everyone, not just me</label>{/if}
          <Button kind={'primary'} label={editIdx === -1 ? tracker.string.Add : tracker.string.Save} on:click={commit} />
          <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editIdx = undefined }} />
        </div>
        <span class="addbar__hint">{LIBRARY.find((l) => l.type === draft.type)?.hint}</span>
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
              <button class="tool" title="Edit" on:click={() => { startEdit(idx) }}>⚙</button>
              <button class="tool" title="Move up" on:click={() => { move(idx, -1) }}>↑</button>
              <button class="tool" title="Move down" on:click={() => { move(idx, 1) }}>↓</button>
              <button class="tool tool--x" title="Remove" on:click={() => { removeWidget(idx) }}>×</button>
            </span>
          {/if}
        </div>
        {#key tick + JSON.stringify(w.params ?? {})}
          <Widget type={w.type} params={w.params ?? {}} {tick} {wall} />
        {/key}
      </section>
    {/each}
  </div>
  {#if selected === undefined}<p class="muted"><Label label={tracker.string.DefaultDashboardHint} /></p>{/if}
</div>

<style lang="scss">
  .dash { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; overflow: auto; height: 100%;
    &--wall { background: #0b0c0f; color: #fff; .card { background: #15171c; border-color: #23262e; } .card__title { font-size: 1.1rem; } }
  }
  .dash__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .dash__left { display: flex; align-items: baseline; gap: 0.75rem; }
  .dash__sub { font-size: 0.8125rem; color: var(--theme-trans-color); }
  .dash__tools { display: flex; gap: 0.25rem; flex-wrap: wrap; align-items: center; }
  .select, .input { padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; }
  .select { font-weight: 600; }
  .input--wide { min-width: 20rem; font-family: var(--mono-font, ui-monospace, Menlo, monospace); font-size: 0.8125rem; }
  .input--n { width: 4rem; }
  .knob { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .import { display: inline-flex; align-items: center; padding: 0.35rem 0.7rem; border-radius: 0.4rem; font-size: 0.875rem; color: var(--theme-content-color); cursor: pointer; &:hover { background: var(--theme-button-hovered); } input { display: none; } }
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
