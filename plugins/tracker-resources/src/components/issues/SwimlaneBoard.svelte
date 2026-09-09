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
  Board with swimlanes: one kanban per lane, stacked. Lanes by assignee,
  epic, or priority. Each lane is the ordinary board filtered to its value,
  so drag between columns keeps working; moving a card between lanes is a
  field change and happens on the card, not by dragging across lanes.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { type Ref, type WithLookup } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import view, { type Viewlet, type ViewOptions } from '@hcengineering/view'
  import { getViewOptions, viewOptionStore } from '@hcengineering/view-resources'

  import tracker from '../../plugin'
  import KanbanView from './KanbanView.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  let viewlet: WithLookup<Viewlet> | undefined
  void client.findOne(view.class.Viewlet, { attachTo: tracker.class.Issue, descriptor: tracker.viewlet.Kanban }).then((v) => {
    viewlet = v
  })
  let viewOptions: ViewOptions | undefined
  $: if (viewlet !== undefined) viewOptions = { ...getViewOptions(viewlet, $viewOptionStore), groupBy: ['status'] }

  type LaneBy = 'assignee' | 'epic' | 'priority'
  let laneBy: LaneBy = 'assignee'
  let hideDone = true
  let collapsed = new Set<string>()

  const statusQ = createQuery()
  const issueQ = createQuery()
  let statuses: IssueStatus[] = []
  let issues: Issue[] = []
  statusQ.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: issueQ.query(tracker.class.Issue, { space: currentSpace }, (r) => { issues = r }, { limit: 3000 })
  $: openIds = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  $: base = hideDone && openIds.length > 0 ? { space: currentSpace, status: { $in: openIds } } : { space: currentSpace }

  let names = new Map<Ref<Person>, string>()
  async function loadNames (list: Issue[]): Promise<void> {
    const ids = Array.from(new Set(list.map((i) => i.assignee).filter((a): a is Ref<Person> => a != null))).filter((id) => !names.has(id))
    if (ids.length === 0) return
    const people = await client.findAll(contact.class.Person, { _id: { $in: ids } })
    const next = new Map(names)
    for (const p of people) next.set(p._id, formatName(p.name))
    names = next
  }
  $: void loadNames(issues)

  interface Lane {
    key: string
    title: string
    query: Record<string, any>
    count: number
  }
  const prioLabel: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'No priority' }
  $: visible = hideDone ? issues.filter((i) => openIds.includes(i.status)) : issues
  $: lanes = ((): Lane[] => {
    if (laneBy === 'assignee') {
      const ids = Array.from(new Set(visible.map((i) => i.assignee ?? null)))
      return ids
        .map((id) => ({
          key: id ?? 'none',
          title: id != null ? names.get(id) ?? '…' : 'Unassigned',
          query: { assignee: id },
          count: visible.filter((i) => (i.assignee ?? null) === id).length
        }))
        .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : b.count - a.count))
    }
    if (laneBy === 'priority') {
      return [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.NoPriority].map((p) => ({
        key: String(p),
        title: prioLabel[p],
        query: { priority: p },
        count: visible.filter((i) => i.priority === p).length
      })).filter((l) => l.count > 0)
    }
    const epics = issues.filter((i) => i.kind === tracker.taskTypes.Epic)
    const withEpic = epics.map((e) => ({
      key: e._id,
      title: `${e.identifier} ${e.title}`,
      query: { attachedTo: e._id },
      count: visible.filter((i) => i.attachedTo === e._id).length
    }))
    const noEpic = {
      key: 'none',
      title: 'No epic',
      query: { attachedTo: { $nin: epics.map((e) => e._id) }, kind: { $ne: tracker.taskTypes.Epic } },
      count: visible.filter((i) => !epics.some((e) => e._id === i.attachedTo) && i.kind !== tracker.taskTypes.Epic).length
    }
    return [...withEpic.filter((l) => l.count > 0), noEpic]
  })()

  function toggle (key: string): void {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsed = next
  }
</script>

<div class="swim">
  <header class="swim__head">
    <span class="swim__title"><Label label={tracker.string.Swimlanes} /></span>
    <div class="swim__tools">
      <select class="select" bind:value={laneBy}>
        <option value="assignee">by assignee</option>
        <option value="epic">by epic</option>
        <option value="priority">by priority</option>
      </select>
      <label class="check"><input type="checkbox" bind:checked={hideDone} /> hide done</label>
    </div>
  </header>

  {#if viewlet === undefined || viewOptions === undefined}
    <p class="muted">…</p>
  {:else}
    {#each lanes as lane, idx (lane.key)}
      <section class="lane motion-rise" style="--i: {idx}">
        <button class="lane__head" on:click={() => { toggle(lane.key) }}>
          <span class="lane__chev" class:lane__chev--closed={collapsed.has(lane.key)}>▾</span>
          <span class="lane__title">{lane.title}</span>
          <span class="lane__n">{lane.count}</span>
        </button>
        {#if !collapsed.has(lane.key)}
          <div class="lane__board">
            <KanbanView {viewlet} {viewOptions} config={viewlet.config} space={currentSpace} query={{ ...base, ...lane.query }} />
          </div>
        {/if}
      </section>
    {/each}
    {#if lanes.length === 0}<p class="muted">No issues.</p>{/if}
  {/if}
</div>

<style lang="scss">
  .swim { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem 1.25rem; height: 100%; min-height: 0; overflow: auto; }
  .swim__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .swim__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .swim__tools { display: flex; align-items: center; gap: 0.75rem; }
  .select { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .lane { border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; overflow: hidden; }
  .lane__head {
    display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.55rem 0.9rem; border: none;
    background: var(--theme-comp-header-color); color: var(--theme-caption-color); font: inherit; font-weight: 600; text-align: left; cursor: pointer;
    &:hover { background: var(--theme-button-hovered); }
  }
  .lane__chev { color: var(--theme-trans-color); transition: transform var(--motion-base) var(--ease-standard); &--closed { transform: rotate(-90deg); } }
  .lane__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lane__n { font-size: 0.75rem; font-weight: 500; color: var(--theme-trans-color); }
  .lane__board { height: 22rem; min-height: 0; overflow: hidden; }
</style>
