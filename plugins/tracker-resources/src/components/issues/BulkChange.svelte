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
  Bulk change wizard for the selected issues: pick an operation, review
  the list, apply. Operations: transition, move to another project (keys are
  re-numbered), edit fields, add a label, watch or unwatch, archive or
  restore. Server guards still apply, so a refused transition is reported
  per issue rather than forced.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import core, { getCurrentAccount, type Ref } from '@hcengineering/core'
  import { Card, createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task, { type TaskType } from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'
  import { moveIssueToSpace } from '../../utils'

  export let docs: Issue[]

  const client = getClient()
  const dispatch = createEventDispatcher()
  const me = getCurrentEmployee()
  const meUuid = getCurrentAccount().uuid

  type Op = 'transition' | 'move' | 'edit' | 'label' | 'watch' | 'unwatch' | 'archive' | 'unarchive'
  const OPS: Array<{ id: Op, label: string, hint: string }> = [
    { id: 'transition', label: 'Transition', hint: 'Move every selected issue to a status.' },
    { id: 'move', label: 'Move to project', hint: 'Issues get new keys in the target project.' },
    { id: 'edit', label: 'Edit fields', hint: 'Assignee, priority, sprint, milestone, due date.' },
    { id: 'label', label: 'Add label', hint: 'Add one label to each issue.' },
    { id: 'watch', label: 'Watch', hint: 'Add yourself as a watcher.' },
    { id: 'unwatch', label: 'Stop watching', hint: 'Remove yourself as a watcher.' },
    { id: 'archive', label: 'Archive', hint: 'Hide from lists, boards and queries. Restorable.' },
    { id: 'unarchive', label: 'Restore from archive', hint: '' }
  ]
  let step: 1 | 2 | 3 = 1
  let op: Op = 'transition'

  const sq = createQuery()
  const pq = createQuery()
  const eq = createQuery()
  const tq = createQuery()
  let statuses: IssueStatus[] = []
  let projects: Project[] = []
  let employees: Employee[] = []
  let tagElements: any[] = []
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  tq.query(tags.class.TagElement, { targetClass: tracker.class.Issue }, (r) => { tagElements = r })

  // statuses every selected issue's type allows
  let taskTypes: TaskType[] = []
  $: void client.findAll(task.class.TaskType, { _id: { $in: Array.from(new Set(docs.map((d) => d.kind))) } }).then((r) => { taskTypes = r })
  $: allowedStatusIds = taskTypes.map((t) => new Set(t.statuses as Ref<IssueStatus>[])).reduce<Set<Ref<IssueStatus>>>((acc, s, k) => (k === 0 ? s : new Set(Array.from(acc).filter((x) => s.has(x)))), new Set<Ref<IssueStatus>>())
  $: statusOptions = statuses.filter((s) => allowedStatusIds.has(s._id))
  $: sameProject = new Set(docs.map((d) => d.space)).size === 1
  $: spaceId = docs[0]?.space
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  $: if (sameProject && spaceId !== undefined) {
    void client.findAll(tracker.class.Sprint, { space: spaceId, state: { $ne: 'completed' } }).then((r) => { sprints = r })
    void client.findAll(tracker.class.Milestone, { space: spaceId }).then((r) => { milestones = r })
  }

  // parameters
  let toStatus: Ref<IssueStatus> | '' = ''
  let toProject: Ref<Project> | '' = ''
  let assignee: Ref<Person> | '' | 'none' = ''
  let priority: IssuePriority | '' = ''
  let sprint: Ref<Sprint> | '' | 'none' = ''
  let milestone: Ref<Milestone> | '' | 'none' = ''
  let dueDate = ''
  let label: Ref<any> | '' = ''

  $: canContinue =
    (op === 'transition' && toStatus !== '') ||
    (op === 'move' && toProject !== '') ||
    (op === 'edit' && (assignee !== '' || priority !== '' || sprint !== '' || milestone !== '' || dueDate !== '')) ||
    (op === 'label' && label !== '') ||
    ['watch', 'unwatch', 'archive', 'unarchive'].includes(op)

  let done = 0
  let errors: string[] = []
  let running = false
  let finished = false

  async function apply (): Promise<void> {
    running = true
    done = 0
    errors = []
    try {
      if (op === 'move') {
        const target = projects.find((p) => p._id === toProject)
        if (target !== undefined) {
          const movable = docs.filter((d) => d.space !== target._id)
          try {
            await moveIssueToSpace(client, movable, target, new Map())
            done = movable.length
          } catch (e: any) {
            errors = [String(e?.message ?? e)]
          }
        }
      } else {
        for (const i of docs) {
          try {
            switch (op) {
              case 'transition':
                if (toStatus !== '' && i.status !== toStatus) await client.update(i, { status: toStatus })
                break
              case 'edit': {
                const ops: Partial<Issue> = {}
                if (assignee !== '') ops.assignee = assignee === 'none' ? null : assignee
                if (priority !== '') ops.priority = priority
                if (sprint !== '') ops.sprint = sprint === 'none' ? null : sprint
                if (milestone !== '') ops.milestone = milestone === 'none' ? null : milestone
                if (dueDate !== '') ops.dueDate = new Date(dueDate).getTime()
                if (Object.keys(ops).length > 0) await client.update(i, ops)
                break
              }
              case 'label': {
                const el = tagElements.find((t) => t._id === label)
                if (el === undefined) break
                const existing = await client.findOne(tags.class.TagReference, { attachedTo: i._id, tag: el._id })
                if (existing === undefined) await client.addCollection(tags.class.TagReference, i.space, i._id, i._class, 'labels', { tag: el._id, title: el.title, color: el.color })
                break
              }
              case 'watch': {
                const existing = await client.findOne(core.class.Collaborator, { attachedTo: i._id, collaborator: meUuid })
                if (existing === undefined) await client.addCollection(core.class.Collaborator, i.space, i._id, i._class, 'collaborators', { collaborator: meUuid })
                break
              }
              case 'unwatch': {
                const existing = await client.findAll(core.class.Collaborator, { attachedTo: i._id, collaborator: meUuid })
                for (const c of existing) await client.remove(c)
                break
              }
              case 'archive':
                if (i.archived !== true) await client.update(i, { archived: true })
                break
              case 'unarchive':
                if (i.archived === true) await client.update(i, { archived: false })
                break
            }
          } catch (e: any) {
            errors = [...errors, `${i.identifier}: ${String(e?.message ?? e)}`]
          }
          done++
        }
      }
    } finally {
      running = false
      finished = true
      step = 3
    }
  }
  const prio: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'No priority' }
</script>

<Card
  label={tracker.string.BulkChange}
  okLabel={step === 1 ? tracker.string.Continue : step === 2 ? tracker.string.Apply : tracker.string.Done}
  canSave={step === 1 ? canContinue : step === 2 ? !running : true}
  okAction={() => {
    if (step === 1) step = 2
    else if (step === 2) void apply()
    else dispatch('close')
  }}
  on:close={() => { dispatch('close') }}
  width={'medium'}
>
  <div class="bulk">
    <div class="steps"><span class="step" class:step--on={step === 1}>1 · Operation</span><span class="step" class:step--on={step === 2}>2 · Review</span><span class="step" class:step--on={step === 3}>3 · Result</span></div>
    <p class="muted">{docs.length} issue{docs.length === 1 ? '' : 's'} selected{sameProject ? ` in ${projects.find((p) => p._id === spaceId)?.name ?? ''}` : ' across projects'}.</p>

    {#if step === 1}
      <div class="ops">
        {#each OPS as o (o.id)}
          <label class="op" class:op--on={op === o.id}><input type="radio" bind:group={op} value={o.id} /><span><b>{o.label}</b>{#if o.hint}<small>{o.hint}</small>{/if}</span></label>
        {/each}
      </div>
      <div class="params">
        {#if op === 'transition'}
          <select class="input" bind:value={toStatus}><option value="">status…</option>{#each statusOptions as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>
          {#if statusOptions.length === 0 && taskTypes.length > 0}<span class="muted">The selected issues have no status in common.</span>{/if}
        {:else if op === 'move'}
          <select class="input" bind:value={toProject}><option value="">project…</option>{#each projects as p (p._id)}<option value={p._id}>{p.name} ({p.identifier})</option>{/each}</select>
        {:else if op === 'edit'}
          <select class="input" bind:value={assignee}><option value="">assignee: keep</option><option value="none">unassign</option>{#each employees as e (e._id)}<option value={e._id}>{formatName(e.name)}</option>{/each}</select>
          <select class="input" bind:value={priority}><option value="">priority: keep</option>{#each [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.NoPriority] as p}<option value={p}>{prio[p]}</option>{/each}</select>
          {#if sameProject}
            <select class="input" bind:value={sprint}><option value="">sprint: keep</option><option value="none">no sprint</option>{#each sprints as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>
            <select class="input" bind:value={milestone}><option value="">milestone: keep</option><option value="none">no milestone</option>{#each milestones as m (m._id)}<option value={m._id}>{m.label}</option>{/each}</select>
          {/if}
          <label class="knob">due <input class="input" type="date" bind:value={dueDate} /></label>
        {:else if op === 'label'}
          <select class="input" bind:value={label}><option value="">label…</option>{#each tagElements as t (t._id)}<option value={t._id}>{t.title}</option>{/each}</select>
        {/if}
      </div>
    {:else if step === 2}
      <p class="muted"><b>{OPS.find((o) => o.id === op)?.label}</b> will be applied to:</p>
      <ul class="list">{#each docs as d (d._id)}<li><span class="id">{d.identifier}</span>{d.title}</li>{/each}</ul>
      {#if running}<p class="muted">Applying… {done} / {docs.length}</p>{/if}
    {:else}
      <p class="ok">{done - errors.length} of {docs.length} updated{errors.length > 0 ? `, ${errors.length} failed` : ''}.</p>
      {#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}
    {/if}
  </div>
</Card>

<style lang="scss">
  .bulk { display: flex; flex-direction: column; gap: 0.6rem; min-width: 28rem; max-width: 40rem; }
  .steps { display: flex; gap: 0.5rem; font-size: 0.75rem; color: var(--theme-trans-color); }
  .step { padding: 0.15rem 0.5rem; border-radius: 999px; &--on { background: var(--accent-brand-soft); color: var(--theme-caption-color); font-weight: 600; } }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .ok { margin: 0; font-size: 0.875rem; color: var(--theme-caption-color); }
  .ops { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; }
  .op { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.5rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; cursor: pointer; font-size: 0.8125rem; color: var(--theme-content-color); &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); } span { display: flex; flex-direction: column; } b { color: var(--theme-caption-color); } small { font-size: 0.7rem; color: var(--theme-dark-color); } }
  .params { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .input { padding: 0.35rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .knob { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .list { margin: 0; padding: 0; list-style: none; max-height: 16rem; overflow: auto; font-size: 0.8125rem; color: var(--theme-content-color); li { padding: 0.2rem 0; border-top: 1px solid var(--theme-divider-color); } }
  .id { display: inline-block; min-width: 4.5rem; font-size: 0.7rem; color: var(--theme-trans-color); }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
</style>
