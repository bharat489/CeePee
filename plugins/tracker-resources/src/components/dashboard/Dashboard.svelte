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
  Dashboards, laid out like Jira's: a title header with star, Add gadget,
  Edit, refresh and a "…" menu (switch, new, rename, duplicate, share,
  export / import, wallboard, email schedule, delete); a gadget gallery
  drawer with descriptions; a configure drawer per gadget; white gadgets on
  a grey ground with collapse / maximize / refresh / link toolbars and a
  "Last refreshed" line. Every gadget takes a project and a query filter;
  inside a project the project is implied. Wallboard goes full screen and
  refreshes every minute.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import core, { generateId, SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Dashboard, type DashboardWidget, type Project } from '@hcengineering/tracker'
  import { showPopup } from '@hcengineering/ui'
  import { onDestroy, onMount } from 'svelte'

  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import Widget from './Widget.svelte'
  import Subscriptions from '../query/Subscriptions.svelte'

  // set when the dashboard lives inside a project: gadgets default to that project
  export let currentSpace: Ref<Project> | undefined = undefined

  const client = getClient()
  const me = getCurrentEmployee()
  const query = createQuery()
  const projectQuery = createQuery()
  let dashboards: Dashboard[] = []
  let projects: Project[] = []
  query.query(tracker.class.Dashboard, {}, (r) => { dashboards = r.filter((d) => d.owner === me || d.shared) }, { sort: { createdOn: SortingOrder.Ascending } })
  projectQuery.query(tracker.class.Project, {}, (r) => { projects = r })

  const DEFAULT: DashboardWidget[] = [
    { id: 'w1', type: 'mine', params: { title: 'Assigned to me' } },
    { id: 'w2', type: 'stats', params: { title: 'Issue statistics', field: 'status' } },
    { id: 'w3', type: 'avg-age', params: { title: 'Average age chart', days: 30 } },
    { id: 'w4', type: 'filter', params: { title: 'Filter results', limit: 10 } },
    { id: 'w5', type: 'activity', params: { title: 'Activity stream', limit: 10 } },
    { id: 'w6', type: 'cvr', params: { title: 'Created vs resolved', days: 30 } }
  ]
  let selectedId: Ref<Dashboard> | 'default' = 'default'
  $: selected = selectedId === 'default' ? undefined : dashboards.find((d) => d._id === selectedId)
  $: widgets = selected?.widgets ?? DEFAULT
  $: canEdit = selected !== undefined && selected.owner === me
  // gadgets inside a project scope to it unless they name another project
  const effective = (w: DashboardWidget): Record<string, any> => ({ ...(w.params ?? {}), ...(currentSpace !== undefined && (w.params?.project === undefined || w.params?.project === '') ? { project: currentSpace } : {}) })

  const LIBRARY: Array<{ type: string, label: string, hint: string, knobs: string[], ic: string }> = [
    { type: 'mine', label: 'Assigned to me', hint: 'Open work items assigned to you, by priority', knobs: ['limit'], ic: 'people' },
    { type: 'filter', label: 'Filter results', hint: 'A table of work items matching a query: epic, type, key, summary, assignee, due, sprint', knobs: ['text', 'limit'], ic: 'list' },
    { type: 'stats', label: 'Issue statistics', hint: 'Count, percentage or bars of work items by status, assignee, priority, sprint, component, epic…', knobs: ['field', 'view', 'includeDone'], ic: 'reports' },
    { type: 'avg-age', label: 'Average age chart', hint: 'How long open work has been waiting, one bar per day', knobs: ['days'], ic: 'reports' },
    { type: 'cvr', label: 'Created vs resolved', hint: 'Work created and resolved per day over N days', knobs: ['days'], ic: 'reports' },
    { type: 'pie', label: 'Pie chart', hint: 'A donut of work items by a field', knobs: ['field', 'includeDone'], ic: 'reports' },
    { type: 'two-dim', label: 'Two-dimensional statistics', hint: 'A table of counts by two fields, with totals', knobs: ['x', 'y', 'includeDone'], ic: 'reports' },
    { type: 'activity', label: 'Activity stream', hint: 'The latest changes across work items', knobs: ['limit'], ic: 'timeline' },
    { type: 'due', label: 'Due soon', hint: 'Work due within N days', knobs: ['days', 'limit', 'everyone'], ic: 'calendar' },
    { type: 'stale', label: 'Gone quiet', hint: 'Open work untouched for N days', knobs: ['days', 'limit'], ic: 'timeline' },
    { type: 'recent', label: 'Recently created', hint: 'The newest work items', knobs: ['days', 'limit'], ic: 'created' },
    { type: 'sprints', label: 'Active sprints', hint: 'Progress of every running sprint', knobs: [], ic: 'backlog' },
    { type: 'burndown', label: 'Sprint burndown', hint: 'Remaining work in the active sprint against the ideal line', knobs: [], ic: 'reports' },
    { type: 'countdown', label: 'Countdown', hint: 'Days to milestones and sprint ends', knobs: ['limit'], ic: 'milestone' },
    { type: 'workload', label: 'Workload', hint: 'Open work per person', knobs: ['limit'], ic: 'people' },
    { type: 'query', label: 'Query results', hint: 'Any query-language expression, as a list', knobs: ['text', 'limit'], ic: 'filter' },
    { type: 'sla', label: 'SLA at risk', hint: 'Service desk work breaching within N hours', knobs: ['hours', 'limit'], ic: 'servicedesk' },
    { type: 'labels', label: 'Top labels', hint: 'The most used labels on open work', knobs: ['limit'], ic: 'fields' },
    { type: 'heatmap', label: 'Created by weekday', hint: 'When work arrives, by weekday', knobs: ['days'], ic: 'calendar' },
    { type: 'csat', label: 'Satisfaction', hint: 'Ratings from the service desk', knobs: [], ic: 'check' },
    { type: 'time-in-status', label: 'Time in status', hint: 'Average days spent in each status', knobs: ['days', 'limit'], ic: 'workflow' },
    { type: 'goals', label: 'Goals', hint: 'Progress of every goal', knobs: [], ic: 'check' },
    { type: 'ideas', label: 'Top ideas', hint: 'Highest RICE score, still open', knobs: ['limit'], ic: 'ideas' },
    { type: 'decisions', label: 'Decisions', hint: 'The latest decision records', knobs: ['limit'], ic: 'docs' },
    { type: 'hours', label: 'Hours this week', hint: 'Logged time per person', knobs: [], ic: 'timeline' },
    { type: 'text', label: 'Text', hint: 'A note for the team', knobs: ['text'], ic: 'docs' },
    { type: 'links', label: 'Links', hint: 'Bookmarks, one per line: label | url', knobs: ['items'], ic: 'link' }
  ]
  const FIELDS = [{ id: 'status', label: 'status' }, { id: 'priority', label: 'priority' }, { id: 'assignee', label: 'assignee' }, { id: 'project', label: 'project' }, { id: 'kind', label: 'type' }, { id: 'category', label: 'to do / in progress / done' }, { id: 'sprint', label: 'sprint' }, { id: 'component', label: 'component' }, { id: 'milestone', label: 'milestone' }, { id: 'epic', label: 'epic' }]
  const titleOf = (w: DashboardWidget): string => (w.params?.title as string | undefined) ?? LIBRARY.find((l) => l.type === w.type)?.label ?? w.type
  const knobsOf = (t: string): string[] => LIBRARY.find((l) => l.type === t)?.knobs ?? []

  // ---- dashboards -----------------------------------------------------------
  let editing = false
  let menuOpen = false
  async function createDashboard (fromDefault = true, name?: string): Promise<void> {
    menuOpen = false
    const n = name ?? prompt('Dashboard name', 'My dashboard')
    if (n === null || n.trim() === '') return
    selectedId = await client.createDoc(tracker.class.Dashboard, core.space.Workspace, { name: n.trim(), owner: me, shared: false, widgets: fromDefault ? DEFAULT.map((w) => ({ ...w, id: generateId() })) : [] })
    editing = true
  }
  async function duplicate (): Promise<void> {
    menuOpen = false
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
    menuOpen = false
    if (selected === undefined) return
    const name = prompt('Dashboard name', selected.name)
    if (name === null || name.trim() === '') return
    await client.update(selected, { name: name.trim() })
  }
  async function remove (): Promise<void> {
    menuOpen = false
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
    editIdx = undefined
    void save(widgets.filter((_, k) => k !== idx))
  }
  function exportJson (): void {
    menuOpen = false
    const blob = new Blob([JSON.stringify({ name: selected?.name ?? 'Default', widgets: widgets.map(({ type, params }) => ({ type, params })) }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(selected?.name ?? 'dashboard').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function importJson (e: Event): Promise<void> {
    menuOpen = false
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
  async function ensureOwn (): Promise<boolean> {
    if (selected !== undefined && canEdit) return true
    // the built-in dashboard is read-only: adding a gadget makes a personal copy first
    await createDashboard(true, selected === undefined ? 'My dashboard' : `${selected.name} (copy)`)
    return selected !== undefined
  }

  // ---- gallery + configure drawers ------------------------------------------------
  let gallery = false
  let gallerySearch = ''
  $: galleryItems = LIBRARY.filter((l) => gallerySearch.trim() === '' || `${l.label} ${l.hint}`.toLowerCase().includes(gallerySearch.trim().toLowerCase()))
  async function openGallery (): Promise<void> {
    if (!(await ensureOwn())) return
    editing = true
    editIdx = undefined
    gallery = true
  }
  async function addGadget (type: string): Promise<void> {
    const params: Record<string, any> = {}
    if (type === 'query') params.text = 'assignee = me AND status != done'
    if (type === 'stats' || type === 'pie') params.field = 'status'
    if (type === 'two-dim') { params.x = 'status'; params.y = 'assignee' }
    if (type === 'avg-age' || type === 'cvr') params.days = 30
    const ws = [...widgets, { id: generateId(), type, params }]
    await save(ws)
    startEdit(ws.length - 1)
  }
  let editIdx: number | undefined
  let draft: { type: string, params: Record<string, any> } = { type: 'query', params: {} }
  function startEdit (idx: number): void {
    draft = { type: widgets[idx].type, params: { ...(widgets[idx].params ?? {}) } }
    editIdx = idx
    gallery = false
  }
  function commit (): void {
    const params: Record<string, any> = {}
    for (const [k, v] of Object.entries(draft.params)) if (v !== '' && v !== undefined && v !== null) params[k] = v
    const ws = [...widgets]
    if (editIdx !== undefined) ws[editIdx] = { ...ws[editIdx], type: draft.type, params }
    void save(ws)
    editIdx = undefined
  }

  // ---- gadget chrome ------------------------------------------------------------------
  let collapsed = new Set<string>()
  let maxId: string | undefined
  let wtick: Record<string, number> = {}
  let refreshedAt: Record<string, number> = {}
  let loadedAt = Date.now()
  let now = Date.now()
  const nowTimer = setInterval(() => { now = Date.now() }, 30_000)
  function toggleCollapse (id: string): void {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    collapsed = next
  }
  let tick = 0
  function refreshOne (id: string): void {
    wtick = { ...wtick, [id]: (wtick[id] ?? 0) + 1 }
    refreshedAt = { ...refreshedAt, [id]: Date.now() }
  }
  function refreshAll (): void {
    tick++
    loadedAt = Date.now()
    refreshedAt = {}
    now = loadedAt
  }
  function refreshedLabel (id: string, at: number): string {
    const t = refreshedAt[id] ?? loadedAt
    const sec = Math.floor((at - t) / 1000)
    if (sec < 45) return 'just now'
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`
    return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  let copiedId: string | undefined
  async function copyLink (gadget?: string): Promise<void> {
    menuOpen = false
    const base = window.location.href.split('#')[0]
    try {
      await navigator.clipboard.writeText(gadget === undefined ? base : `${base}#gadget=${gadget}`)
      copiedId = gadget ?? 'dash'
      setTimeout(() => { copiedId = undefined }, 1500)
    } catch {}
  }
  onMount(() => {
    const m = /gadget=([^&]+)/.exec(window.location.hash)
    if (m !== null) maxId = decodeURIComponent(m[1])
  })
  let dragIdx: number | undefined
  let dropIdx: number | undefined
  function dragStart (e: DragEvent, idx: number): void {
    if (!(editing && canEdit)) {
      e.preventDefault()
      return
    }
    dragIdx = idx
    if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'move'
  }
  function dropOn (idx: number): void {
    const from = dragIdx
    dragIdx = undefined
    dropIdx = undefined
    if (from === undefined || from === idx) return
    const ws = [...widgets]
    const [m] = ws.splice(from, 1)
    ws.splice(idx, 0, m)
    void save(ws)
  }
  function setWidth (idx: number, width: 1 | 2): void {
    const ws = [...widgets]
    ws[idx] = { ...ws[idx], params: { ...(ws[idx].params ?? {}), width } }
    void save(ws)
  }
  const STAR_KEY = 'ceepee.dashboards.starred'
  let starred = new Set<string>()
  try { starred = new Set(JSON.parse(localStorage.getItem(STAR_KEY) ?? '[]') as string[]) } catch {}
  function toggleStar (): void {
    const next = new Set(starred)
    const k = String(selectedId)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    starred = next
    try { localStorage.setItem(STAR_KEY, JSON.stringify(Array.from(next))) } catch {}
  }
  $: sortedDashboards = [...dashboards].sort((a, b) => Number(starred.has(b._id)) - Number(starred.has(a._id)))

  // ---- wallboard -----------------------------------------------------------
  let wall = false
  let timer: ReturnType<typeof setInterval> | undefined
  function toggleWall (): void {
    menuOpen = false
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
    clearInterval(nowTimer)
  })
  function closeMenus (e: MouseEvent): void {
    if ((e.target as HTMLElement | null)?.closest('.dh__menu-wrap') === null) menuOpen = false
  }
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
</script>

<svelte:window on:click={closeMenus} />

<div class="dash" class:dash--wall={wall}>
  <header class="dh">
    <div class="dh__l">
      <span class="dh__crumb">Dashboards</span>
      <div class="dh__row">
        <select class="dh__title" bind:value={selectedId}>
          <option value="default">Default dashboard</option>
          {#each sortedDashboards as d (d._id)}<option value={d._id}>{starred.has(d._id) ? '★ ' : ''}{d.name}{d.shared ? ' · shared' : ''}</option>{/each}
        </select>
        <button class="ib" class:ib--star={starred.has(String(selectedId))} title="Favourite" on:click={toggleStar}>{@html icon(starred.has(String(selectedId)) ? 'starFilled' : 'star')}</button>
        <span class="dh__sub">{widgets.length} gadget{widgets.length === 1 ? '' : 's'} · {selected === undefined ? 'built in' : selected.shared ? 'shared with everyone' : selected.owner === me ? 'private' : `by someone else`} · {dateLabel}</span>
      </div>
    </div>
    <div class="dh__r">
      {#if !wall}
        <button class="btn btn--primary" on:click={() => { void openGallery() }}>{@html icon('plus')} Add gadget</button>
        {#if canEdit}<button class="btn" class:btn--on={editing} on:click={() => { editing = !editing; editIdx = undefined; gallery = false }}>{@html icon('edit')} {editing ? 'Done' : 'Edit'}</button>{/if}
      {/if}
      <button class="ib" title="Refresh all gadgets" on:click={refreshAll}>{@html icon('refresh')}</button>
      <span class="dh__menu-wrap">
        <button class="ib" title="More" on:click|stopPropagation={() => { menuOpen = !menuOpen }}>{@html icon('more')}</button>
        {#if menuOpen}
          <div class="menu">
            <button class="menu__i" on:click={() => { void createDashboard(true) }}>{@html icon('plus')} New dashboard</button>
            <button class="menu__i" on:click={duplicate}>{@html icon('copy')} Duplicate</button>
            {#if canEdit}
              <button class="menu__i" on:click={rename}>{@html icon('edit')} Rename</button>
              <button class="menu__i" on:click={() => { menuOpen = false; if (selected !== undefined) void client.update(selected, { shared: !selected.shared }) }}>{@html icon('share')} {selected?.shared ? 'Stop sharing' : 'Share with everyone'}</button>
            {/if}
            <button class="menu__i" on:click={() => { void copyLink() }}>{@html icon('link')} {copiedId === 'dash' ? 'Link copied' : 'Copy link'}</button>
            <div class="menu__sep" />
            <button class="menu__i" on:click={exportJson}>{@html icon('down')} Export JSON</button>
            <label class="menu__i"><input type="file" accept="application/json" on:change={importJson} />{@html icon('up')} Import JSON</label>
            <button class="menu__i" on:click={toggleWall}>{@html icon('wall')} {wall ? 'Exit wallboard' : 'Wallboard'}</button>
            <button class="menu__i" disabled={selected === undefined} on:click={() => { menuOpen = false; if (selected !== undefined) showPopup(Subscriptions, { kind: 'dashboard', dashboard: selected._id, name: selected.name }, 'top') }}>{@html icon('mail2')} Email on a schedule</button>
            {#if canEdit}<div class="menu__sep" /><button class="menu__i menu__i--bad" on:click={remove}>{@html icon('trash')} Delete dashboard</button>{/if}
          </div>
        {/if}
      </span>
    </div>
  </header>

  <div class="dash__body">
    <div class="grid" class:grid--max={maxId !== undefined}>
      {#each widgets as w, idx (w.id)}
        {#if maxId === undefined || maxId === w.id}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <section class="g" class:g--wide={w.params?.width === 2 || maxId === w.id} class:g--max={maxId === w.id} class:g--drop={dropIdx === idx && dragIdx !== idx} class:g--editing={editIdx === idx} draggable={editing && canEdit} on:dragstart={(e) => { dragStart(e, idx) }} on:dragover|preventDefault={() => { dropIdx = idx }} on:dragleave={() => { if (dropIdx === idx) dropIdx = undefined }} on:drop|preventDefault={() => { dropOn(idx) }} on:dragend={() => { dragIdx = undefined; dropIdx = undefined }}>
            <div class="g__head">
              {#if editing && canEdit}<span class="g__grip" title="Drag to reorder">{@html icon('grip')}</span>{/if}
              <span class="g__title">{titleOf(w)}</span>
              <span class="g__tools">
                {#if editing && canEdit}
                  <button class="ib ib--sm" title="Configure" on:click={() => { startEdit(idx) }}>{@html icon('settings')}</button>
                  <button class="ib ib--sm" title={w.params?.width === 2 ? 'Half width' : 'Full width'} on:click={() => { setWidth(idx, w.params?.width === 2 ? 1 : 2) }}>{@html icon(w.params?.width === 2 ? 'minimize' : 'maximize')}</button>
                  <button class="ib ib--sm" title="Move up" on:click={() => { move(idx, -1) }}>{@html icon('up')}</button>
                  <button class="ib ib--sm" title="Move down" on:click={() => { move(idx, 1) }}>{@html icon('down')}</button>
                  <button class="ib ib--sm ib--bad" title="Remove" on:click={() => { removeWidget(idx) }}>{@html icon('trash')}</button>
                {:else}
                  <button class="ib ib--sm" class:ib--rot={collapsed.has(w.id)} title={collapsed.has(w.id) ? 'Expand' : 'Collapse'} on:click={() => { toggleCollapse(w.id) }}>{@html icon('chevron')}</button>
                  <button class="ib ib--sm" title={maxId === w.id ? 'Restore' : 'Maximize'} on:click={() => { maxId = maxId === w.id ? undefined : w.id }}>{@html icon(maxId === w.id ? 'minimize' : 'maximize')}</button>
                  <button class="ib ib--sm" title="Refresh" on:click={() => { refreshOne(w.id) }}>{@html icon('refresh')}</button>
                  <button class="ib ib--sm" title={copiedId === w.id ? 'Link copied' : 'Copy link to this gadget'} on:click={() => { void copyLink(w.id) }}>{@html icon(copiedId === w.id ? 'check' : 'link')}</button>
                {/if}
              </span>
            </div>
            {#if !collapsed.has(w.id)}
              <div class="g__body">
                {#key tick + (wtick[w.id] ?? 0) + JSON.stringify(effective(w))}
                  <Widget type={w.type} params={effective(w)} {tick} {wall} />
                {/key}
              </div>
              <div class="g__foot"><span>Last refreshed {refreshedLabel(w.id, now)}</span>{#if w.params?.project}<span>· {projects.find((p) => p._id === w.params?.project)?.identifier ?? ''}</span>{:else if currentSpace !== undefined}<span>· this project</span>{/if}</div>
            {/if}
          </section>
        {/if}
      {/each}
      {#if widgets.length === 0}
        <div class="empty-dash"><span class="empty-dash__ic">{@html icon('gadget')}</span><b>This dashboard is empty</b><span>Add gadgets to see work items, statistics and charts.</span><button class="btn btn--primary" on:click={() => { void openGallery() }}>{@html icon('plus')} Add gadget</button></div>
      {/if}
    </div>

    {#if gallery}
      <aside class="drawer">
        <div class="drawer__head"><b>Add gadget</b><button class="ib" title="Close" on:click={() => { gallery = false }}>{@html icon('close')}</button></div>
        <input class="input drawer__search" placeholder="Search gadgets" bind:value={gallerySearch} />
        <div class="drawer__list">
          {#each galleryItems as l (l.type)}
            <div class="gcard"><span class="gcard__ic">{@html icon(l.ic)}</span><div class="gcard__t"><b>{l.label}</b><span>{l.hint}</span></div><button class="btn btn--sm" on:click={() => { void addGadget(l.type) }}>Add</button></div>
          {/each}
        </div>
      </aside>
    {/if}

    {#if editIdx !== undefined}
      <aside class="drawer">
        <div class="drawer__head"><b>Configure gadget</b><button class="ib" title="Close" on:click={() => { editIdx = undefined }}>{@html icon('close')}</button></div>
        <div class="drawer__form">
          <label class="f"><span>Gadget</span><select class="input" bind:value={draft.type}>{#each LIBRARY as l (l.type)}<option value={l.type}>{l.label}</option>{/each}</select></label>
          <label class="f"><span>Title</span><input class="input" placeholder={LIBRARY.find((l) => l.type === draft.type)?.label} bind:value={draft.params.title} /></label>
          <label class="f"><span>Project</span><select class="input" bind:value={draft.params.project}><option value="">{currentSpace !== undefined ? 'this project' : 'all projects'}</option>{#each projects as p (p._id)}<option value={p._id}>{p.name}</option>{/each}</select></label>
          <label class="f"><span>Filter</span><input class="input input--mono" placeholder="priority >= high AND labels = bug" bind:value={draft.params.filter} /></label>
          {#if knobsOf(draft.type).includes('text')}<label class="f"><span>{draft.type === 'text' ? 'Text' : 'Query'}</span>{#if draft.type === 'text'}<textarea class="input" rows="4" bind:value={draft.params.text} />{:else}<input class="input input--mono" placeholder="assignee = me AND status != done" bind:value={draft.params.text} />{/if}</label>{/if}
          {#if knobsOf(draft.type).includes('items')}<label class="f"><span>Links</span><textarea class="input" rows="4" placeholder="Runbook | https://…&#10;Status page | https://…" bind:value={draft.params.items} /></label>{/if}
          {#if knobsOf(draft.type).includes('field')}<label class="f"><span>Group by</span><select class="input" bind:value={draft.params.field}>{#each FIELDS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}</select></label>{/if}
          {#if knobsOf(draft.type).includes('view')}<label class="f"><span>Show as</span><select class="input" bind:value={draft.params.view}><option value={undefined}>bars</option><option value="count">count</option><option value="percentage">percentage</option></select></label>{/if}
          {#if knobsOf(draft.type).includes('x')}<label class="f"><span>Columns</span><select class="input" bind:value={draft.params.x}>{#each FIELDS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}</select></label><label class="f"><span>Rows</span><select class="input" bind:value={draft.params.y}>{#each FIELDS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}</select></label>{/if}
          {#if knobsOf(draft.type).includes('days')}<label class="f"><span>Days</span><input class="input" type="number" min="1" bind:value={draft.params.days} /></label>{/if}
          {#if knobsOf(draft.type).includes('hours')}<label class="f"><span>Hours</span><input class="input" type="number" min="1" bind:value={draft.params.hours} /></label>{/if}
          {#if knobsOf(draft.type).includes('limit')}<label class="f"><span>Rows</span><input class="input" type="number" min="1" bind:value={draft.params.limit} /></label>{/if}
          {#if knobsOf(draft.type).includes('includeDone')}<label class="f f--check"><input type="checkbox" bind:checked={draft.params.includeDone} /> Include done work</label>{/if}
          {#if knobsOf(draft.type).includes('everyone')}<label class="f f--check"><input type="checkbox" bind:checked={draft.params.everyone} /> Everyone, not just me</label>{/if}
          <label class="f f--check"><input type="checkbox" checked={draft.params.width === 2} on:change={(e) => { draft.params.width = e.currentTarget.checked ? 2 : undefined }} /> Full width</label>
          <span class="hint">{LIBRARY.find((l) => l.type === draft.type)?.hint}</span>
          <div class="drawer__actions"><button class="btn btn--primary" on:click={commit}>Save</button><button class="btn" on:click={() => { editIdx = undefined }}>Cancel</button><span class="grow" /><button class="btn btn--bad" on:click={() => { if (editIdx !== undefined) removeWidget(editIdx) }}>Remove</button></div>
        </div>
      </aside>
    {/if}
  </div>
</div>

<style lang="scss">
  .dash { --j-text: #172b4d; --j-sub: #626f86; --j-link: #0c66e4; --j-border: rgba(9, 30, 66, 0.14); --j-surface: #fff; --j-ground: #f7f8f9; --j-hover: rgba(9, 30, 66, 0.06); --j-track: #ebecf0;
    display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem 1.5rem 2rem; overflow: auto; height: 100%; background: var(--j-ground); color: var(--j-text);
    &--wall { --j-ground: #0b0c0f; --j-surface: #15171c; --j-border: #23262e; --j-text: #fff; --j-sub: #9aa4b2; --j-track: #23262e; .g__title { font-size: 1.1rem; } }
  }
  :global(.theme-dark) .dash { --j-text: #b6c2cf; --j-sub: #8c9bab; --j-link: #579dff; --j-border: #38414a; --j-surface: #22272b; --j-ground: #1d2125; --j-hover: rgba(255, 255, 255, 0.08); --j-track: #38414a; }
  .dh { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .dh__l { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .dh__crumb { font-size: 0.8125rem; color: var(--j-sub); }
  .dh__row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .dh__title { padding: 0.15rem 1.6rem 0.15rem 0; border: none; background: transparent; color: var(--j-text); font: inherit; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; cursor: pointer; appearance: auto; &:hover { color: var(--j-link); } }
  .dh__sub { font-size: 0.8125rem; color: var(--j-sub); margin-left: 0.25rem; }
  .dh__r { display: flex; align-items: center; gap: 0.4rem; }
  .btn { display: inline-flex; align-items: center; gap: 0.35rem; height: 2rem; padding: 0 0.75rem; border: none; border-radius: 0.25rem; background: #f1f2f4; color: var(--j-text); font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; :global(svg) { width: 1rem; height: 1rem; } &:hover { background: #dcdfe4; } &--primary { background: var(--j-link); color: #fff; &:hover { background: #0055cc; } } &--on { background: #e9f2ff; color: var(--j-link); } &--sm { height: 1.75rem; padding: 0 0.6rem; font-size: 0.8125rem; } &--bad { color: #c9372c; } }
  :global(.theme-dark) .dash .btn { background: #2c333a; &:hover { background: #38414a; } &--primary { background: var(--j-link); color: #1d2125; } }
  .ib { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border: none; border-radius: 0.25rem; background: transparent; color: var(--j-sub); cursor: pointer; :global(svg) { width: 1rem; height: 1rem; transition: transform 0.15s ease; } &:hover { background: var(--j-hover); color: var(--j-text); } &--sm { width: 1.6rem; height: 1.6rem; :global(svg) { width: 0.9rem; height: 0.9rem; } } &--star { color: #e2b203; } &--bad:hover { color: #c9372c; } &--rot :global(svg) { transform: rotate(-90deg); } }
  .dh__menu-wrap { position: relative; }
  .menu { position: absolute; right: 0; top: calc(100% + 0.25rem); z-index: 30; display: flex; flex-direction: column; min-width: 14rem; padding: 0.35rem; border: 1px solid var(--j-border); border-radius: 0.35rem; background: var(--j-surface); box-shadow: 0 8px 12px rgba(9, 30, 66, 0.15), 0 0 1px rgba(9, 30, 66, 0.31); }
  .menu__i { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.7rem; border: none; border-radius: 0.25rem; background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; :global(svg) { width: 1rem; height: 1rem; color: var(--j-sub); } &:hover { background: var(--j-hover); } &:disabled { opacity: 0.45; cursor: default; } &--bad { color: #c9372c; } input { display: none; } }
  .menu__sep { height: 1px; margin: 0.25rem 0; background: var(--j-border); }
  .dash__body { display: flex; gap: 1rem; align-items: flex-start; }
  .grid { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: start; &--max { grid-template-columns: 1fr; } }
  @media (max-width: 64rem) { .grid { grid-template-columns: 1fr; } }
  .g { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); box-shadow: 0 1px 1px rgba(9, 30, 66, 0.12); transition: box-shadow 0.15s ease; &:hover { box-shadow: 0 4px 12px rgba(9, 30, 66, 0.12); } &--wide { grid-column: 1 / -1; } &--max { min-height: 70vh; } &--drop { outline: 2px dashed var(--j-link); outline-offset: 2px; } &--editing { outline: 2px solid var(--j-link); } &[draggable='true'] { cursor: grab; } }
  .g__head { display: flex; align-items: center; gap: 0.5rem; padding: 0.7rem 0.6rem 0.4rem 1rem; }
  .g__grip { display: inline-flex; color: var(--j-sub); cursor: grab; :global(svg) { width: 1rem; height: 1rem; } }
  .g__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.95rem; font-weight: 600; color: var(--j-text); }
  .g__tools { display: flex; gap: 0.1rem; opacity: 0.6; transition: opacity 0.12s ease; }
  .g:hover .g__tools, .g:focus-within .g__tools { opacity: 1; }
  .g__body { padding: 0 1rem 0.6rem; min-width: 0; }
  .g__foot { display: flex; gap: 0.35rem; padding: 0.35rem 1rem 0.5rem; border-top: 1px solid var(--j-border); font-size: 0.7rem; color: var(--j-sub); }
  .empty-dash { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 3rem 1rem; border: 2px dashed var(--j-border); border-radius: 0.35rem; text-align: center; color: var(--j-sub); b { color: var(--j-text); font-size: 1rem; } }
  .empty-dash__ic { display: inline-flex; color: var(--j-link); :global(svg) { width: 2rem; height: 2rem; } }
  .drawer { position: sticky; top: 0; width: 22rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.6rem; max-height: calc(100vh - 10rem); padding: 0.9rem 1rem; border: 1px solid var(--j-border); border-radius: 0.35rem; background: var(--j-surface); box-shadow: 0 8px 12px rgba(9, 30, 66, 0.12); }
  .drawer__head { display: flex; align-items: center; justify-content: space-between; b { font-size: 1rem; } }
  .drawer__list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 0.4rem; }
  .gcard { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.6rem; padding: 0.6rem; border: 1px solid var(--j-border); border-radius: 0.3rem; &:hover { background: var(--j-hover); } }
  .gcard__ic { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 0.3rem; background: #e9f2ff; color: var(--j-link); :global(svg) { width: 1rem; height: 1rem; } }
  .gcard__t { display: flex; flex-direction: column; min-width: 0; b { font-size: 0.875rem; font-weight: 600; } span { font-size: 0.75rem; color: var(--j-sub); } }
  .drawer__form { display: flex; flex-direction: column; gap: 0.5rem; overflow: auto; }
  .drawer__actions { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
  .grow { flex: 1; }
  .f { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.75rem; font-weight: 600; color: var(--j-sub); &--check { flex-direction: row; align-items: center; gap: 0.4rem; font-weight: 500; color: var(--j-text); font-size: 0.8125rem; } }
  .input { padding: 0.4rem 0.5rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); color: var(--j-text); font: inherit; font-size: 0.875rem; font-weight: 400; &:focus { outline: none; border-color: var(--j-link); } &--mono { font-family: var(--mono-font, ui-monospace, Menlo, monospace); font-size: 0.8125rem; } }
  .drawer__search { width: 100%; }
  .hint { font-size: 0.75rem; color: var(--j-sub); }
</style>
