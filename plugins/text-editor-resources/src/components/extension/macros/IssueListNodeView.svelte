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
  A live list of issues inside a page. The block stores its settings (project,
  status filter, sort, limit); the rows come from a live query, so the page
  always shows the current state. Editors change the settings in the header.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee } from '@hcengineering/contact'
  import core, { SortingOrder, type Class, type Doc, type Ref, type Status } from '@hcengineering/core'
  import { ObjectPopup, createQuery, getClient } from '@hcengineering/presentation'
  import { showPanel, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let updateAttributes: NodeViewProps['updateAttributes']

  // the tracker is addressed by id so this package needs no dependency on it
  const ISSUE = 'tracker:class:Issue' as Ref<Class<Doc>>
  const PROJECT = 'tracker:class:Project' as Ref<Class<Doc>>
  const DONE = new Set(['task:statusCategory:Won', 'task:statusCategory:Lost'])

  interface IssueLike extends Doc {
    identifier: string
    title: string
    status: Ref<Status>
    assignee: Ref<Employee> | null
    dueDate: number | null
    priority: number
    createdOn?: number
  }

  $: project = node.attrs.project as string | null
  $: status = (node.attrs.status ?? 'open') as 'open' | 'all' | 'done'
  $: assignee = (node.attrs.assignee ?? 'any') as 'any' | 'me'
  $: sort = (node.attrs.sort ?? 'modified') as 'modified' | 'created' | 'priority' | 'due'
  $: limit = Number(node.attrs.limit ?? 10)
  $: editable = editor.isEditable

  const sq = createQuery()
  const iq = createQuery()
  const eq = createQuery()
  let statuses: Status[] = []
  let issues: IssueLike[] = []
  let people: Employee[] = []
  let loading = true
  sq.query(core.class.Status, {}, (r) => { statuses = r })
  eq.query(contact.mixin.Employee, {}, (r) => { people = r })
  $: statusById = new Map(statuses.map((s) => [s._id, s]))
  $: openIds = statuses.filter((s) => !DONE.has(s.category as string)).map((s) => s._id)
  $: doneIds = statuses.filter((s) => DONE.has(s.category as string)).map((s) => s._id)
  $: me = getCurrentEmployee()
  $: if (project !== null && statuses.length > 0) {
    const q: Record<string, unknown> = { space: project }
    if (status === 'open') q.status = { $in: openIds }
    if (status === 'done') q.status = { $in: doneIds }
    if (assignee === 'me') q.assignee = me
    const sortKey = sort === 'created' ? 'createdOn' : sort === 'priority' ? 'priority' : sort === 'due' ? 'dueDate' : 'modifiedOn'
    iq.query(ISSUE, q as any, (r) => { issues = r as unknown as IssueLike[]; loading = false }, { limit: Math.max(1, Math.min(100, limit)), sort: { [sortKey]: sort === 'priority' || sort === 'due' ? SortingOrder.Ascending : SortingOrder.Descending } })
  } else {
    loading = false
  }

  const nameOf = (id: Ref<Employee> | null): string => {
    if (id === null) return ''
    const p = people.find((x) => x._id === id)
    return p !== undefined ? formatName(p.name) : ''
  }
  const priorityLabel = ['—', 'Urgent', 'High', 'Medium', 'Low']

  function pickProject (): void {
    showPopup(ObjectPopup, { _class: PROJECT, allowDeselect: false, closeAfterSelect: true }, 'top', (res: any) => {
      if (res != null) updateAttributes({ project: res._id, projectName: res.identifier ?? res.name })
    })
  }
  function open (it: IssueLike): void {
    showPanel(view.component.EditDoc, it._id, ISSUE, 'content')
  }
</script>

<NodeViewWrapper data-type="issueList">
  <div class="il" contenteditable="false">
    <div class="il__head">
      <span class="il__mark">☰</span>
      <b>Issues</b>
      {#if editable}
        <button class="il__pick" type="button" on:click={pickProject}>{node.attrs.projectName ?? 'pick a project'}</button>
        <select class="il__sel" value={status} on:change={(e) => { updateAttributes({ status: e.currentTarget.value }) }}>
          <option value="open">open</option><option value="all">all</option><option value="done">done</option>
        </select>
        <select class="il__sel" value={assignee} on:change={(e) => { updateAttributes({ assignee: e.currentTarget.value }) }}>
          <option value="any">anyone</option><option value="me">assigned to me</option>
        </select>
        <select class="il__sel" value={sort} on:change={(e) => { updateAttributes({ sort: e.currentTarget.value }) }}>
          <option value="modified">recently changed</option><option value="created">newest</option><option value="priority">by priority</option><option value="due">by due date</option>
        </select>
        <input class="il__num" type="number" min="1" max="100" value={limit} title="How many" on:change={(e) => { updateAttributes({ limit: Number(e.currentTarget.value) || 10 }) }} />
      {:else}
        <span class="il__txt">{node.attrs.projectName ?? ''} · {status}{assignee === 'me' ? ' · mine' : ''}</span>
      {/if}
      <span class="il__count">{issues.length}</span>
    </div>
    {#if project === null}
      <div class="il__empty">Pick a project to list its issues here.</div>
    {:else if loading}
      <div class="il__empty">Loading…</div>
    {:else if issues.length === 0}
      <div class="il__empty">No matching issues.</div>
    {:else}
      <table class="il__tbl">
        <tbody>
          {#each issues as it (it._id)}
            <tr on:click={() => { open(it) }}>
              <td class="key">{it.identifier}</td>
              <td class="ttl">{it.title}</td>
              <td class="st"><span class="dot" class:dot--done={DONE.has(String(statusById.get(it.status)?.category ?? ''))}></span>{statusById.get(it.status)?.name ?? ''}</td>
              <td class="who">{nameOf(it.assignee)}</td>
              <td class="pr">{priorityLabel[it.priority] ?? ''}</td>
              <td class="due">{it.dueDate != null ? new Date(it.dueDate).toLocaleDateString() : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</NodeViewWrapper>

<style lang="scss">
  .il { margin: 0.5rem 0; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; overflow: hidden; background: var(--theme-panel-color); }
  .il__head { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; padding: 0.35rem 0.6rem; font-size: 0.75rem; color: var(--theme-dark-color); border-bottom: 1px solid var(--theme-divider-color); b { color: var(--theme-caption-color); } }
  .il__mark { color: var(--accent-brand); }
  .il__pick { border: 1px dashed var(--theme-divider-color); border-radius: 0.35rem; background: transparent; padding: 0.15rem 0.5rem; font: inherit; font-size: 0.75rem; color: var(--primary-button-default); cursor: pointer; }
  .il__sel, .il__num { border: 1px solid var(--theme-divider-color); border-radius: 0.35rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.72rem; padding: 0.1rem 0.3rem; }
  .il__num { width: 3.5rem; }
  .il__count { margin-left: auto; padding: 0 0.45rem; border-radius: 999px; background: var(--theme-button-hovered); font-weight: 600; }
  .il__empty { padding: 0.6rem 0.75rem; font-size: 0.8rem; color: var(--theme-dark-color); }
  .il__tbl { width: 100%; border-collapse: collapse; font-size: 0.8rem; tr { cursor: pointer; } tr:hover { background: var(--theme-button-hovered); } td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); vertical-align: middle; } tr:last-child td { border-bottom: none; } }
  .key { width: 5rem; color: var(--theme-dark-color); font-size: 0.72rem; white-space: nowrap; }
  .ttl { color: var(--theme-caption-color); }
  .st { white-space: nowrap; color: var(--theme-dark-color); font-size: 0.75rem; }
  .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 50%; margin-right: 0.3rem; background: #60a5fa; &--done { background: #22c55e; } }
  .who, .pr, .due { white-space: nowrap; color: var(--theme-dark-color); font-size: 0.75rem; }
</style>
