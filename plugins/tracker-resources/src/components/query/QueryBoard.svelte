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
  Boards from a query. Any saved query (or one typed here) becomes a kanban
  across projects, grouped by status, assignee or priority. Save the query
  and share it and the whole team has the same board.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import core, { SortingOrder, type Ref, type WithLookup } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue, type SavedQuery } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import view, { type Viewlet, type ViewOptions } from '@hcengineering/view'
  import { getViewOptions, viewOptionStore } from '@hcengineering/view-resources'

  import tracker from '../../plugin'
  import KanbanView from '../issues/KanbanView.svelte'
  import { runQuery } from './run'

  const client = getClient()
  const me = getCurrentEmployee()
  const sq = createQuery()
  let saved: SavedQuery[] = []
  sq.query(tracker.class.SavedQuery, {}, (r) => { saved = r.filter((s) => s.shared || s.owner === me) }, { sort: { name: SortingOrder.Ascending } })

  let viewlet: WithLookup<Viewlet> | undefined
  void client.findOne(view.class.Viewlet, { attachTo: tracker.class.Issue, descriptor: tracker.viewlet.Kanban }).then((v) => { viewlet = v })
  let groupBy: 'status' | 'assignee' | 'priority' | 'space' = 'status'
  let viewOptions: ViewOptions | undefined
  $: if (viewlet !== undefined) viewOptions = { ...getViewOptions(viewlet, $viewOptionStore), groupBy: [groupBy] }

  let selected: Ref<SavedQuery> | '' = ''
  let text = ''
  let ids: Ref<Issue>[] | undefined
  let errors: string[] = []
  let count = 0
  let busy = false
  async function run (): Promise<void> {
    const q = selected !== '' ? saved.find((s) => s._id === selected)?.text ?? text : text
    if (q.trim() === '') return
    busy = true
    try {
      const r = await runQuery(q, 2000)
      errors = r.errors
      ids = r.issues.map((i) => i._id)
      count = ids.length
    } finally {
      busy = false
    }
  }
  $: if (selected !== '') {
    text = saved.find((s) => s._id === selected)?.text ?? text
    void run()
  }
  async function saveAsBoard (): Promise<void> {
    if (text.trim() === '') return
    const name = prompt('Board name', text.slice(0, 40))
    if (name === null || name.trim() === '') return
    selected = await client.createDoc(tracker.class.SavedQuery, core.space.Workspace, { name: name.trim(), text: text.trim(), owner: me, shared: true })
  }
  const boardQuery = (list: Ref<Issue>[] | undefined): Record<string, any> => ({ _id: { $in: list ?? [] }, archived: { $ne: true } })
</script>

<div class="qb">
  <header class="qb__head">
    <span class="qb__title"><Label label={tracker.string.Boards} /></span>
    <select class="select" bind:value={selected}><option value="">— type a query —</option>{#each saved as s (s._id)}<option value={s._id}>{s.name}{s.shared ? '' : ' (mine)'}</option>{/each}</select>
    <input class="input" placeholder="project in (PAY, WEB) AND status != done" bind:value={text} on:input={() => { selected = '' }} on:keydown={(e) => { if (e.key === 'Enter') void run() }} />
    <Button kind={'primary'} label={tracker.string.Run} disabled={busy || text.trim() === ''} on:click={() => { void run() }} />
    <Button kind={'ghost'} label={tracker.string.SaveQuery} disabled={text.trim() === ''} on:click={() => { void saveAsBoard() }} />
    <select class="select" bind:value={groupBy}><option value="status">columns: status</option><option value="assignee">columns: assignee</option><option value="priority">columns: priority</option><option value="space">columns: project</option></select>
    {#if ids !== undefined}<span class="muted">{count} issue{count === 1 ? '' : 's'}</span>{/if}
  </header>
  {#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}
  {#if ids === undefined}
    <p class="muted">Pick a saved query or type one. The board shows matching issues from every project; drag between columns as usual.</p>
  {:else if viewlet !== undefined && viewOptions !== undefined}
    <div class="board">
      {#key groupBy + String(count)}
        <KanbanView {viewlet} {viewOptions} config={viewlet.config} query={boardQuery(ids)} />
      {/key}
    </div>
  {/if}
</div>

<style lang="scss">
  .qb { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem 1.25rem; height: 100%; min-height: 0; }
  .qb__head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .qb__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .select, .input { padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .input { flex: 1; min-width: 16rem; font-family: var(--mono-font, ui-monospace, Menlo, monospace); }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
  .board { flex: 1; min-height: 0; overflow: hidden; }
</style>
