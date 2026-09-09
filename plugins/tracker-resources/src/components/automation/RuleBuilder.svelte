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
  Rule builder: WHEN a trigger fires, IF every condition holds, THEN run the
  actions. Rules are project documents evaluated on the server (see
  server-plugins/tracker-resources/src/rules.ts), so they also apply to
  imports, API writes and other rules -- with a depth limit against loops.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task from '@hcengineering/task'
  import { IssuePriority, type AutomationAction, type AutomationCondition, type AutomationRule, type AutomationTrigger, type Component as TComponent, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, IconAdd, Toggle } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const rq = createQuery()
  const sq = createQuery()
  const cq = createQuery()
  const spq = createQuery()
  const mq = createQuery()
  let rules: AutomationRule[] = []
  let statuses: IssueStatus[] = []
  let components: TComponent[] = []
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  let people: Array<{ _id: Ref<Person>, name: string }> = []
  let labels: Array<{ _id: string, title: string }> = []
  $: rq.query(tracker.class.AutomationRule, { space: currentSpace }, (r) => { rules = r }, { sort: { createdOn: SortingOrder.Ascending } })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: cq.query(tracker.class.Component, { space: currentSpace }, (r) => { components = r })
  $: spq.query(tracker.class.Sprint, { space: currentSpace, state: { $ne: 'completed' } }, (r) => { sprints = r })
  $: mq.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r })
  void client.findAll(contact.mixin.Employee, { active: true }).then((r) => { people = r.map((p) => ({ _id: p._id, name: formatName(p.name) })) })
  void client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }).then((r) => { labels = r.map((t) => ({ _id: t._id, title: t.title })) })
  // project statuses only
  let projectStatuses: IssueStatus[] = []
  $: void (async () => {
    const p = await client.findOne(tracker.class.Project, { _id: currentSpace })
    const ptype = p !== undefined ? await client.findOne(task.class.ProjectType, { _id: p.type }) : undefined
    const ids = new Set((ptype?.statuses ?? []).map((s) => s._id))
    projectStatuses = statuses.filter((s) => ids.has(s._id))
  })()

  const TRIGGERS: Array<{ id: AutomationTrigger, label: string }> = [
    { id: 'created', label: 'an issue is created' },
    { id: 'status', label: 'status changes' },
    { id: 'priority', label: 'priority changes' },
    { id: 'assignee', label: 'assignee changes' },
    { id: 'commented', label: 'a comment is added' },
    { id: 'updated', label: 'any field changes' }
  ]
  const FIELDS: Array<{ id: AutomationCondition['field'], label: string }> = [
    { id: 'status', label: 'status' }, { id: 'priority', label: 'priority' }, { id: 'assignee', label: 'assignee' }, { id: 'kind', label: 'type' },
    { id: 'component', label: 'component' }, { id: 'labels', label: 'labels' }, { id: 'title', label: 'title' }, { id: 'sprint', label: 'sprint' }, { id: 'milestone', label: 'milestone' }
  ]
  const OPS: Array<{ id: AutomationCondition['op'], label: string }> = [
    { id: 'is', label: 'is' }, { id: 'is-not', label: 'is not' }, { id: 'contains', label: 'contains' }, { id: 'empty', label: 'is empty' }, { id: 'not-empty', label: 'is not empty' }
  ]
  const ACTIONS: Array<{ id: AutomationAction['type'], label: string }> = [
    { id: 'set-status', label: 'set status to' }, { id: 'set-priority', label: 'set priority to' }, { id: 'set-assignee', label: 'assign to' },
    { id: 'add-label', label: 'add label' }, { id: 'add-comment', label: 'add comment' }, { id: 'set-sprint', label: 'move to sprint' },
    { id: 'set-milestone', label: 'set milestone' }, { id: 'set-due', label: 'set due date to now +' }, { id: 'webhook', label: 'call webhook' }
  ]
  const PRIOS = [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.NoPriority]
  const prio: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'None' }
  const KINDS = [{ id: tracker.taskTypes.Issue, label: 'Issue' }, { id: tracker.taskTypes.Epic, label: 'Epic' }, { id: tracker.taskTypes.Initiative, label: 'Initiative' }]

  // ---- editor -------------------------------------------------------------
  let editing: AutomationRule | undefined | null = null
  let name = ''
  let trigger: AutomationTrigger = 'created'
  let conditions: AutomationCondition[] = []
  let actions: AutomationAction[] = []
  function edit (r?: AutomationRule): void {
    editing = r
    name = r?.name ?? ''
    trigger = r?.trigger ?? 'created'
    conditions = r?.conditions.map((c) => ({ ...c })) ?? []
    actions = r?.actions.map((a) => ({ ...a })) ?? [{ type: 'add-comment', value: 'Hello from automation' }]
  }
  async function save (): Promise<void> {
    if (name.trim() === '' || actions.length === 0) return
    const data = { name: name.trim(), trigger, conditions, actions }
    if (editing === undefined) await client.createDoc(tracker.class.AutomationRule, currentSpace, { ...data, enabled: true, runs: 0 })
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (r: AutomationRule): Promise<void> {
    if (!confirm(`Delete rule "${r.name}"?`)) return
    await client.remove(r)
  }
  const describe = (r: AutomationRule): string =>
    `when ${TRIGGERS.find((t) => t.id === r.trigger)?.label ?? r.trigger}${r.conditions.length > 0 ? ` if ${r.conditions.length} condition${r.conditions.length > 1 ? 's' : ''}` : ''} → ${r.actions.map((a) => ACTIONS.find((x) => x.id === a.type)?.label ?? a.type).join(', ')}`
</script>

<section class="card motion-rise" style="--i: 2">
  <div class="card__head">
    <span class="card__title">Rules</span>
    <Button kind={'primary'} icon={IconAdd} label={tracker.string.NewRule} on:click={() => { edit(undefined) }} />
  </div>
  <p class="hint">Rules run on the server after every change. A rule's own changes can trigger other rules, two levels deep at most.</p>

  {#if editing !== null}
    <div class="editor motion-pop">
      <input class="input input--name" placeholder="Rule name" bind:value={name} />
      <div class="line"><span class="kw">WHEN</span><select class="input" bind:value={trigger}>{#each TRIGGERS as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select></div>
      {#each conditions as c, i}
        <div class="line">
          <span class="kw">{i === 0 ? 'IF' : 'AND'}</span>
          <select class="input" bind:value={c.field}>{#each FIELDS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}</select>
          <select class="input" bind:value={c.op}>{#each OPS as o (o.id)}<option value={o.id}>{o.label}</option>{/each}</select>
          {#if c.op !== 'empty' && c.op !== 'not-empty'}
            {#if c.field === 'status'}<select class="input" bind:value={c.value}>{#each projectStatuses as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>
            {:else if c.field === 'priority'}<select class="input" bind:value={c.value}>{#each PRIOS as p}<option value={String(p)}>{prio[p]}</option>{/each}</select>
            {:else if c.field === 'assignee'}<select class="input" bind:value={c.value}>{#each people as p (p._id)}<option value={p._id}>{p.name}</option>{/each}</select>
            {:else if c.field === 'kind'}<select class="input" bind:value={c.value}>{#each KINDS as k (k.id)}<option value={k.id}>{k.label}</option>{/each}</select>
            {:else if c.field === 'component'}<select class="input" bind:value={c.value}>{#each components as x (x._id)}<option value={x._id}>{x.label}</option>{/each}</select>
            {:else if c.field === 'labels'}<select class="input" bind:value={c.value}>{#each labels as l (l._id)}<option value={l.title}>{l.title}</option>{/each}</select>
            {:else if c.field === 'sprint'}<select class="input" bind:value={c.value}><option value="active">active sprint</option>{#each sprints as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>
            {:else if c.field === 'milestone'}<select class="input" bind:value={c.value}>{#each milestones as m (m._id)}<option value={m._id}>{m.label}</option>{/each}</select>
            {:else}<input class="input" placeholder="text" bind:value={c.value} />{/if}
          {/if}
          <button class="x" on:click={() => { conditions = conditions.filter((_, k) => k !== i) }}>×</button>
        </div>
      {/each}
      <button class="lnk" on:click={() => { conditions = [...conditions, { field: 'status', op: 'is', value: projectStatuses[0]?._id ?? '' }] }}>+ condition</button>
      {#each actions as a, i}
        <div class="line">
          <span class="kw">{i === 0 ? 'THEN' : 'AND'}</span>
          <select class="input" bind:value={a.type}>{#each ACTIONS as x (x.id)}<option value={x.id}>{x.label}</option>{/each}</select>
          {#if a.type === 'set-status'}<select class="input" bind:value={a.value}>{#each projectStatuses as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>
          {:else if a.type === 'set-priority'}<select class="input" bind:value={a.value}>{#each PRIOS as p}<option value={String(p)}>{prio[p]}</option>{/each}</select>
          {:else if a.type === 'set-assignee'}<select class="input" bind:value={a.value}><option value="component-lead">the component lead</option><option value="reporter">the reporter</option><option value="none">nobody</option>{#each people as p (p._id)}<option value={p._id}>{p.name}</option>{/each}</select>
          {:else if a.type === 'add-label'}<select class="input" bind:value={a.value}>{#each labels as l (l._id)}<option value={l._id}>{l.title}</option>{/each}</select>
          {:else if a.type === 'set-sprint'}<select class="input" bind:value={a.value}><option value="active">active sprint</option><option value="none">backlog</option>{#each sprints as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select>
          {:else if a.type === 'set-milestone'}<select class="input" bind:value={a.value}><option value="none">none</option>{#each milestones as m (m._id)}<option value={m._id}>{m.label}</option>{/each}</select>
          {:else if a.type === 'set-due'}<input class="input input--n" type="number" min="0" bind:value={a.value} /> days
          {:else if a.type === 'webhook'}<input class="input input--wide" placeholder="https://…" bind:value={a.value} />
          {:else}<input class="input input--wide" placeholder="Comment text — {'{'}identifier{'}'} and {'{'}title{'}'} are filled in" bind:value={a.value} />{/if}
          <button class="x" on:click={() => { actions = actions.filter((_, k) => k !== i) }}>×</button>
        </div>
      {/each}
      <button class="lnk" on:click={() => { actions = [...actions, { type: 'set-priority', value: String(IssuePriority.High) }] }}>+ action</button>
      <div class="editor__actions">
        <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} />
        <Button kind={'primary'} label={tracker.string.Save} disabled={name.trim() === '' || actions.length === 0} on:click={save} />
      </div>
    </div>
  {/if}

  {#each rules as r, idx (r._id)}
    <div class="rule motion-rise" style="--i: {idx}" class:rule--off={!r.enabled}>
      <div class="rule__main">
        <span class="rule__name">{r.name}</span>
        <span class="rule__desc">{describe(r)}</span>
        <span class="rule__meta">{r.runs ?? 0} runs{#if r.lastRun} · last {new Date(r.lastRun).toLocaleString()}{/if}{#if r.lastError} · <span class="bad">{r.lastError}</span>{/if}</span>
      </div>
      <div class="rule__tools">
        <button class="lnk" on:click={() => { edit(r) }}>edit</button>
        <button class="lnk lnk--bad" on:click={() => { void remove(r) }}>delete</button>
        <Toggle on={r.enabled} on:change={(e) => { void client.update(r, { enabled: e.detail }) }} />
      </div>
    </div>
  {/each}
  {#if rules.length === 0 && editing === null}<p class="hint">No rules yet.</p>{/if}
</section>

<style lang="scss">
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .hint { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .editor { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.85rem; border: 1px dashed var(--accent-brand); border-radius: 0.6rem; }
  .editor__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .line { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--theme-content-color); }
  .kw { width: 3.2rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; color: var(--accent-brand-ink); }
  .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; outline: none; &:focus { border-color: var(--accent-brand); } &--name { font-weight: 600; } &--wide { min-width: 18rem; } &--n { width: 4rem; } }
  .x { border: none; background: transparent; color: var(--theme-trans-color); font: inherit; cursor: pointer; &:hover { color: var(--negative-button-default); } }
  .lnk { align-self: flex-start; border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
  .rule { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; border-top: 1px solid var(--theme-divider-color); &--off { opacity: 0.55; } }
  .rule__main { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .rule__name { font-weight: 600; color: var(--theme-caption-color); }
  .rule__desc { font-size: 0.8125rem; color: var(--theme-content-color); }
  .rule__meta { font-size: 0.7rem; color: var(--theme-trans-color); }
  .bad { color: var(--negative-button-default); }
  .rule__tools { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
</style>
