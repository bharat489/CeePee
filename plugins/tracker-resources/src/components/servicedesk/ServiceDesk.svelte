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
  Service desk for a project: the queues agents work from, and the request
  types customers pick from. A request is an ordinary issue with a request
  type, so everything else -- SLA, automation, reports -- already applies.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus, type Project, type RequestType } from '@hcengineering/tracker'
  import { Button, IconAdd, Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const tq = createQuery()
  const iq = createQuery()
  const sq = createQuery()
  let types: RequestType[] = []
  let issues: Issue[] = []
  let statuses: IssueStatus[] = []
  $: tq.query(tracker.class.RequestType, { space: currentSpace }, (r) => { types = r }, { sort: { name: SortingOrder.Ascending } })
  $: iq.query(tracker.class.Issue, { space: currentSpace, requestType: { $ne: null } }, (r) => { issues = r }, { limit: 3000 })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: cat = new Map(statuses.map((s) => [s._id, s.category]))
  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))
  const isDone = (st: Ref<IssueStatus>): boolean => cat.get(st) === task.statusCategory.Won || cat.get(st) === task.statusCategory.Lost
  const HOUR = 3_600_000
  const DAY = 86_400_000

  let tab: 'queues' | 'types' = 'queues'

  interface Queue {
    id: string
    label: string
    filter: (i: Issue) => boolean
  }
  $: open = issues.filter((i) => !isDone(i.status))
  $: queues = [
    { id: 'open', label: 'All open requests', filter: (i: Issue) => !isDone(i.status) },
    { id: 'unassigned', label: 'Unassigned', filter: (i: Issue) => !isDone(i.status) && i.assignee == null },
    { id: 'breach', label: 'Breaching SLA', filter: (i: Issue) => !isDone(i.status) && i.slaDue != null && i.slaDue < Date.now() },
    { id: 'soon', label: 'Due within 4h', filter: (i: Issue) => !isDone(i.status) && i.slaDue != null && i.slaDue >= Date.now() && i.slaDue < Date.now() + 4 * HOUR },
    { id: 'waiting', label: 'Waiting on customer', filter: (i: Issue) => !isDone(i.status) && /wait/i.test(statusName.get(i.status) ?? '') },
    { id: 'urgent', label: 'Urgent', filter: (i: Issue) => !isDone(i.status) && i.priority === IssuePriority.Urgent },
    { id: 'today', label: 'Resolved today', filter: (i: Issue) => isDone(i.status) && i.modifiedOn > Date.now() - DAY },
    { id: 'rated', label: 'Rated', filter: (i: Issue) => i.csat !== undefined }
  ] satisfies Queue[]
  let selected = 'open'
  $: queue = queues.find((q) => q.id === selected) ?? queues[0]
  $: list = issues.filter(queue.filter).sort((a, b) => (a.slaDue ?? 9e15) - (b.slaDue ?? 9e15))
  $: typeName = new Map(types.map((t) => [t._id, t.name]))

  // ---- request types ----------------------------------------------------------
  let editing: RequestType | undefined | null = null // null = closed, undefined = new
  let fName = ''
  let fDesc = ''
  let fPriority: IssuePriority = IssuePriority.Medium
  let fSla = 0
  function edit (t?: RequestType): void {
    editing = t
    fName = t?.name ?? ''
    fDesc = t?.description ?? ''
    fPriority = t?.priority ?? IssuePriority.Medium
    fSla = t?.slaHours ?? 0
  }
  async function save (): Promise<void> {
    if (fName.trim() === '') return
    const data = { name: fName.trim(), description: fDesc.trim(), priority: fPriority, slaHours: fSla > 0 ? fSla : undefined }
    if (editing === undefined) await client.createDoc(tracker.class.RequestType, currentSpace, data)
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (t: RequestType): Promise<void> {
    if (!confirm(`Delete request type "${t.name}"? Existing requests keep their data.`)) return
    await client.remove(t)
  }
  const prio: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'None' }
  function open2 (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  function sla (i: Issue): string {
    if (i.slaDue == null) return ''
    const h = Math.round((i.slaDue - Date.now()) / HOUR)
    return h < 0 ? `${-h}h over` : `${h}h`
  }
</script>

<div class="sd">
  <header class="sd__head">
    <span class="sd__title"><Label label={tracker.string.ServiceDesk} /></span>
    <nav class="tabs">
      <button class="tab" class:tab--active={tab === 'queues'} on:click={() => { tab = 'queues' }}>Queues</button>
      <button class="tab" class:tab--active={tab === 'types'} on:click={() => { tab = 'types' }}>Request types</button>
    </nav>
  </header>

  {#if tab === 'queues'}
    <div class="queues">
      <aside class="qlist">
        {#each queues as q (q.id)}
          <button class="qitem" class:qitem--active={selected === q.id} on:click={() => { selected = q.id }}>
            <span>{q.label}</span><span class="qitem__n" class:qitem__n--hot={q.id === 'breach' && issues.filter(q.filter).length > 0}>{issues.filter(q.filter).length}</span>
          </button>
        {/each}
      </aside>
      <section class="qbody">
        <span class="qbody__title">{queue.label} · {list.length}</span>
        {#each list as i, idx (i._id)}
          <button class="row motion-rise" style="--i: {Math.min(idx, 12)}" on:click={() => { open2(i) }}>
            <span class="row__id">{i.identifier}</span>
            <span class="row__title">{i.title}</span>
            <span class="row__meta">{i.requestType != null ? typeName.get(i.requestType) ?? '' : ''}</span>
            <span class="row__meta">{prio[i.priority]}</span>
            <span class="row__meta row__meta--status">{statusName.get(i.status) ?? ''}</span>
            <span class="row__meta" class:row__meta--late={i.slaDue != null && i.slaDue < Date.now()}>{sla(i)}</span>
          </button>
        {/each}
        {#if list.length === 0}<p class="muted">Empty queue.</p>{/if}
        {#if types.length === 0}<p class="muted">No request types yet — add one under "Request types" so people can submit requests.</p>{/if}
      </section>
    </div>
  {:else}
    <section class="card">
      <div class="card__head">
        <span class="card__title">Request types</span>
        <Button kind={'primary'} icon={IconAdd} label={tracker.string.AddRequestType} on:click={() => { edit(undefined) }} />
      </div>
      {#if editing !== null}
        <div class="form motion-pop">
          <input class="input" placeholder="Name (e.g. Bug report, Access request)" bind:value={fName} />
          <textarea class="input input--area" placeholder="What to include, shown to the person submitting" bind:value={fDesc} />
          <div class="form__row">
            <label>Priority <select class="input" bind:value={fPriority}><option value={IssuePriority.Urgent}>Urgent</option><option value={IssuePriority.High}>High</option><option value={IssuePriority.Medium}>Medium</option><option value={IssuePriority.Low}>Low</option></select></label>
            <label>SLA hours <input class="input input--n" type="number" min="0" bind:value={fSla} /></label>
            <Button kind={'primary'} label={tracker.string.Save} on:click={save} />
            <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} />
          </div>
        </div>
      {/if}
      {#each types as t, idx (t._id)}
        <div class="type motion-rise" style="--i: {idx}">
          <div class="type__main"><span class="type__name">{t.name}</span><span class="type__desc">{t.description}</span></div>
          <span class="type__meta">{prio[t.priority]}{#if t.slaHours} · SLA {t.slaHours}h{/if} · {issues.filter((i) => i.requestType === t._id).length} requests</span>
          <div class="type__tools"><button class="lnk" on:click={() => { edit(t) }}>edit</button><button class="lnk lnk--bad" on:click={() => { void remove(t) }}>delete</button></div>
        </div>
      {/each}
      {#if types.length === 0 && editing === null}<p class="muted">No request types yet.</p>{/if}
    </section>
  {/if}
</div>

<style lang="scss">
  .sd { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.25rem; height: 100%; min-height: 0; overflow: auto; }
  .sd__head { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .sd__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .tabs { display: flex; gap: 0.25rem; }
  .tab { padding: 0.35rem 0.7rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--active { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--theme-caption-color); } }
  .queues { display: grid; grid-template-columns: 14rem 1fr; gap: 1rem; min-height: 0; }
  .qlist { display: flex; flex-direction: column; gap: 0.15rem; }
  .qitem { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.45rem 0.6rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--active { background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .qitem__n { color: var(--theme-trans-color); &--hot { color: var(--negative-button-default); font-weight: 700; } }
  .qbody { display: flex; flex-direction: column; min-width: 0; }
  .qbody__title { margin-bottom: 0.4rem; font-weight: 600; color: var(--theme-caption-color); }
  .row { display: grid; grid-template-columns: 5rem 1fr 7rem 4rem 7rem 4rem; align-items: baseline; gap: 0.6rem; width: 100%; padding: 0.4rem 0.5rem; border: none; border-bottom: 1px solid var(--theme-divider-color); background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .row__id { font-size: 0.7rem; color: var(--theme-trans-color); }
  .row__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-caption-color); }
  .row__meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: var(--theme-dark-color); &--status { color: var(--theme-content-color); } &--late { color: var(--negative-button-default); font-weight: 600; } }
  .muted { margin: 0.5rem 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); max-width: 56rem; }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .form { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px dashed var(--accent-brand); border-radius: 0.6rem; }
  .form__row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--theme-content-color); label { display: inline-flex; align-items: center; gap: 0.35rem; } }
  .input { padding: 0.4rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; &:focus { border-color: var(--accent-brand); } &--area { min-height: 4rem; resize: vertical; } &--n { width: 5rem; } }
  .type { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0; border-top: 1px solid var(--theme-divider-color); }
  .type__main { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
  .type__name { font-weight: 600; color: var(--theme-caption-color); }
  .type__desc { font-size: 0.8125rem; color: var(--theme-dark-color); }
  .type__meta { font-size: 0.75rem; color: var(--theme-trans-color); white-space: nowrap; }
  .type__tools { display: flex; gap: 0.5rem; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
</style>
