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
  Automation rules: WHEN trigger IF conditions THEN actions. Per project, or
  for all projects (optionally limited to a list). Triggers include a
  schedule and an incoming webhook; actions include creating issues and
  sub-tasks, sending email, posting to Slack or Teams. Every run is logged.
  Evaluated on the server (server-plugins/tracker-resources/src/rules.ts),
  depth-limited to two.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import core, { generateId, SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task from '@hcengineering/task'
  import { IssuePriority, type AutomationAction, type AutomationCondition, type AutomationRule, type AutomationRun, type AutomationTrigger, type Component as TComponent, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, IconAdd, Toggle } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const rq = createQuery()
  const gq = createQuery()
  const sq = createQuery()
  const cq = createQuery()
  const spq = createQuery()
  const mq = createQuery()
  const pq = createQuery()
  const runq = createQuery()
  let own: AutomationRule[] = []
  let globals: AutomationRule[] = []
  let statuses: IssueStatus[] = []
  let components: TComponent[] = []
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  let projects: Project[] = []
  let runs: AutomationRun[] = []
  let people: Array<{ _id: Ref<Person>, name: string }> = []
  let labels: Array<{ _id: string, title: string }> = []
  $: rq.query(tracker.class.AutomationRule, { space: currentSpace }, (r) => { own = r.filter((x) => x.global !== true) }, { sort: { createdOn: SortingOrder.Ascending } })
  gq.query(tracker.class.AutomationRule, { global: true }, (r) => { globals = r }, { sort: { createdOn: SortingOrder.Ascending } })
  $: rules = [...own, ...globals.filter((g) => (g.projects ?? []).length === 0 || (g.projects ?? []).includes(currentSpace))]
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: cq.query(tracker.class.Component, { space: currentSpace }, (r) => { components = r })
  $: spq.query(tracker.class.Sprint, { space: currentSpace, state: { $ne: 'completed' } }, (r) => { sprints = r })
  $: mq.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r })
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  runq.query(tracker.class.AutomationRun, {}, (r) => { runs = r }, { sort: { at: SortingOrder.Descending }, limit: 200 })
  $: shownRuns = runs.filter((r) => rules.some((x) => x._id === r.rule)).slice(0, 60)
  void client.findAll(contact.mixin.Employee, { active: true }).then((r) => { people = r.map((p) => ({ _id: p._id, name: formatName(p.name) })) })
  void client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }).then((r) => { labels = r.map((t) => ({ _id: t._id, title: t.title })) })
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
    { id: 'updated', label: 'any other field changes' },
    { id: 'scheduled', label: 'on a schedule' },
    { id: 'webhook', label: 'an incoming webhook is called' }
  ]
  const EVERY = [{ v: 15, l: 'every 15 minutes' }, { v: 60, l: 'every hour' }, { v: 240, l: 'every 4 hours' }, { v: 1440, l: 'every day' }, { v: 10080, l: 'every week' }]
  const SCOPES: Array<{ id: NonNullable<AutomationRule['scope']>, label: string }> = [
    { id: 'open', label: 'open issues' }, { id: 'stale7', label: 'open issues untouched for 7 days' }, { id: 'due3', label: 'open issues due within 3 days' }, { id: 'overdue', label: 'overdue open issues' }, { id: 'unassigned', label: 'unassigned open issues' }, { id: 'all', label: 'all issues' }
  ]
  const FIELDS: Array<{ id: AutomationCondition['field'], label: string }> = [
    { id: 'status', label: 'status' }, { id: 'priority', label: 'priority' }, { id: 'assignee', label: 'assignee' }, { id: 'kind', label: 'type' }, { id: 'component', label: 'component' }, { id: 'labels', label: 'labels' }, { id: 'title', label: 'title' }, { id: 'sprint', label: 'sprint' }, { id: 'milestone', label: 'milestone' }
  ]
  const OPS: Array<{ id: AutomationCondition['op'], label: string }> = [{ id: 'is', label: 'is' }, { id: 'is-not', label: 'is not' }, { id: 'contains', label: 'contains' }, { id: 'empty', label: 'is empty' }, { id: 'not-empty', label: 'is not empty' }]
  const ACTIONS: Array<{ id: AutomationAction['type'], label: string, issue: boolean }> = [
    { id: 'set-status', label: 'set status to', issue: true }, { id: 'set-priority', label: 'set priority to', issue: true }, { id: 'set-assignee', label: 'assign to', issue: true },
    { id: 'add-label', label: 'add label', issue: true }, { id: 'add-comment', label: 'add comment', issue: true }, { id: 'set-sprint', label: 'move to sprint', issue: true },
    { id: 'set-milestone', label: 'set milestone', issue: true }, { id: 'set-due', label: 'set due date to now +', issue: true },
    { id: 'create-issue', label: 'create follow-up issue', issue: true }, { id: 'create-subtasks', label: 'create sub-tasks', issue: true }, { id: 'send-email', label: 'send email', issue: true },
    { id: 'slack', label: 'post to Slack', issue: false }, { id: 'teams', label: 'post to Microsoft Teams', issue: false }, { id: 'webhook', label: 'call webhook', issue: false }
  ]
  const TARGETS: Array<{ id: NonNullable<AutomationAction['target']>, label: string }> = [
    { id: 'self', label: 'this issue' }, { id: 'parent', label: 'its parent' }, { id: 'children', label: 'its sub-issues' }, { id: 'blocked-by', label: 'issues blocking it' }, { id: 'blocking', label: 'issues it blocks' }
  ]
  const PRIOS = [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.NoPriority]
  const prio: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'None' }
  const KINDS = [{ id: tracker.taskTypes.Issue, label: 'Issue' }, { id: tracker.taskTypes.Epic, label: 'Epic' }, { id: tracker.taskTypes.Initiative, label: 'Initiative' }]
  const integrationsUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8095` : ''

  // ---- editor -------------------------------------------------------------
  let editing: AutomationRule | undefined | null = null
  let name = ''
  let trigger: AutomationTrigger = 'created'
  let every = 60
  let scope: NonNullable<AutomationRule['scope']> = 'open'
  let token = ''
  let isGlobal = false
  let onlyKeys = ''
  let conditions: AutomationCondition[] = []
  let actions: AutomationAction[] = []
  function newToken (): string {
    return generateId().replace(/[^a-z0-9]/gi, '').slice(0, 24)
  }
  function edit (r?: AutomationRule): void {
    editing = r
    name = r?.name ?? ''
    trigger = r?.trigger ?? 'created'
    every = r?.every ?? 60
    scope = r?.scope ?? 'open'
    token = r?.token ?? newToken()
    isGlobal = r?.global === true
    onlyKeys = (r?.projects ?? []).map((id) => projects.find((p) => p._id === id)?.identifier ?? '').filter((k) => k !== '').join(', ')
    conditions = r?.conditions.map((c) => ({ ...c })) ?? []
    actions = r?.actions.map((a) => ({ ...a })) ?? [{ type: 'add-comment', value: 'Automation: {identifier} matched this rule', target: 'self' }]
  }
  async function save (): Promise<void> {
    if (name.trim() === '' || actions.length === 0) return
    const keys = onlyKeys.split(',').map((k) => k.trim().toUpperCase()).filter((k) => k !== '')
    const only = projects.filter((p) => keys.includes(p.identifier.toUpperCase())).map((p) => p._id)
    const data = {
      name: name.trim(),
      trigger,
      conditions,
      actions,
      every: trigger === 'scheduled' ? every : undefined,
      scope: trigger === 'scheduled' || trigger === 'webhook' ? scope : undefined,
      token: trigger === 'webhook' ? token : undefined,
      global: isGlobal,
      projects: isGlobal && only.length > 0 ? only : undefined
    }
    if (editing === undefined) await client.createDoc(tracker.class.AutomationRule, isGlobal ? (core.space.Workspace as unknown as Ref<Project>) : currentSpace, { ...data, enabled: true, runs: 0 })
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (r: AutomationRule): Promise<void> {
    if (!confirm(`Delete rule "${r.name}"?`)) return
    await client.remove(r)
  }
  function describe (r: AutomationRule): string {
    const when = r.trigger === 'scheduled' ? `${EVERY.find((e) => e.v === r.every)?.l ?? 'on a schedule'} over ${SCOPES.find((s) => s.id === r.scope)?.label ?? 'open issues'}` : r.trigger === 'webhook' ? 'an incoming webhook is called' : TRIGGERS.find((t) => t.id === r.trigger)?.label ?? r.trigger
    return `when ${when}${r.conditions.length > 0 ? ` if ${r.conditions.length} condition${r.conditions.length > 1 ? 's' : ''}` : ''} → ${r.actions.map((a) => `${ACTIONS.find((x) => x.id === a.type)?.label ?? a.type}${a.target !== undefined && a.target !== 'self' ? ` (${TARGETS.find((t) => t.id === a.target)?.label})` : ''}`).join(', ')}`
  }
  const isIssueAction = (t: AutomationAction['type']): boolean => ACTIONS.find((a) => a.id === t)?.issue === true
  let showLog = false
  const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<section class="card motion-rise" style="--i: 2">
  <div class="card__head">
    <span class="card__title">Rules</span>
    <span class="tools"><button class="lnk" on:click={() => { showLog = !showLog }}>{showLog ? 'hide run log' : `run log (${shownRuns.length})`}</button><Button kind={'primary'} icon={IconAdd} label={tracker.string.NewRule} on:click={() => { edit(undefined) }} /></span>
  </div>
  <p class="hint">Rules run on the server after every change. Scheduled rules fire on the integrations service heartbeat (or on issue traffic once due). A rule's own changes can trigger other rules, two levels deep at most. Templates: {'{identifier}'} {'{title}'} {'{status}'} {'{assignee}'} {'{priority}'} {'{url}'} {'{payload.field}'}.</p>

  {#if editing !== null}
    <div class="editor motion-pop">
      <div class="line line--top">
        <input class="input input--name" placeholder="Rule name" bind:value={name} />
        <label class="knob"><input type="checkbox" bind:checked={isGlobal} /> all projects</label>
        {#if isGlobal}<input class="input input--wide" placeholder="limit to project keys, comma-separated (empty = every project)" bind:value={onlyKeys} />{/if}
      </div>
      <div class="line">
        <span class="kw">WHEN</span>
        <select class="input" bind:value={trigger}>{#each TRIGGERS as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select>
        {#if trigger === 'scheduled'}
          <select class="input" bind:value={every}>{#each EVERY as e (e.v)}<option value={e.v}>{e.l}</option>{/each}</select>
          over <select class="input" bind:value={scope}>{#each SCOPES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select>
        {/if}
        {#if trigger === 'webhook'}
          over <select class="input" bind:value={scope}>{#each SCOPES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select>
        {/if}
      </div>
      {#if trigger === 'webhook'}
        <div class="line line--sub">
          <span class="kw" />
          <code class="url">POST {integrationsUrl}/inbound/rule/{editing?._id ?? '<saved-rule-id>'}?token={token}</code>
          <button class="lnk" on:click={() => { token = newToken() }}>regenerate token</button>
        </div>
        <p class="hint hint--indent">Send JSON. A body with <code>issue: "KEY-12"</code> targets that issue; otherwise the scope above is used. Payload fields are available in templates as {'{payload.name}'}.</p>
      {/if}
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
          {:else if a.type === 'create-issue'}<input class="input input--wide" placeholder="Title — {'{title}'} {'{identifier}'} are filled in" bind:value={a.value} /><input class="input input--key" placeholder="project key (optional)" bind:value={a.url} />
          {:else if a.type === 'create-subtasks'}<textarea class="input input--wide" rows="2" placeholder="One sub-task title per line" bind:value={a.value} />
          {:else if a.type === 'send-email'}<input class="input input--key" placeholder="assignee, reporter, watchers, portal or emails" bind:value={a.url} /><textarea class="input input--wide" rows="2" placeholder="First line is the subject. {'{identifier}'} {'{title}'} {'{url}'}" bind:value={a.value} />
          {:else if a.type === 'webhook'}<input class="input input--wide" placeholder="https://…" bind:value={a.value} />
          {:else if a.type === 'slack' || a.type === 'teams'}
            <input class="input input--wide" placeholder={a.type === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://….webhook.office.com/…'} bind:value={a.url} />
            <input class="input input--wide" placeholder="Message — {'{identifier}'} {'{title}'} {'{status}'} {'{url}'}" bind:value={a.value} />
          {:else}<input class="input input--wide" placeholder="Comment text — {'{identifier}'} and {'{title}'} are filled in" bind:value={a.value} />{/if}
          {#if isIssueAction(a.type)}
            on <select class="input" bind:value={a.target}>{#each TARGETS as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select>
          {/if}
          <button class="x" on:click={() => { actions = actions.filter((_, k) => k !== i) }}>×</button>
        </div>
      {/each}
      <button class="lnk" on:click={() => { actions = [...actions, { type: 'set-priority', value: String(IssuePriority.High), target: 'self' }] }}>+ action</button>
      <div class="editor__actions">
        <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} />
        <Button kind={'primary'} label={tracker.string.Save} disabled={name.trim() === '' || actions.length === 0} on:click={save} />
      </div>
    </div>
  {/if}

  {#each rules as r, idx (r._id)}
    <div class="rule motion-rise" style="--i: {idx}" class:rule--off={!r.enabled}>
      <div class="rule__main">
        <span class="rule__name">{r.name}{#if r.global === true} <span class="pill">all projects{(r.projects ?? []).length > 0 ? ` · ${(r.projects ?? []).length} selected` : ''}</span>{/if}</span>
        <span class="rule__desc">{describe(r)}</span>
        <span class="rule__meta">{r.runs ?? 0} runs{#if r.lastMatched !== undefined} · last matched {r.lastMatched}{/if}{#if r.lastRun} · last {new Date(r.lastRun).toLocaleString()}{/if}{#if r.lastError} · <span class="bad">{r.lastError}</span>{/if}</span>
        {#if r.trigger === 'webhook'}<code class="url url--small">POST {integrationsUrl}/inbound/rule/{r._id}?token={r.token ?? ''}</code>{/if}
      </div>
      <div class="rule__tools">
        <button class="lnk" on:click={() => { edit(r) }}>edit</button>
        <button class="lnk lnk--bad" on:click={() => { void remove(r) }}>delete</button>
        <Toggle on={r.enabled} on:change={(e) => { void client.update(r, { enabled: e.detail }) }} />
      </div>
    </div>
  {/each}
  {#if rules.length === 0 && editing === null}<p class="hint">No rules yet.</p>{/if}

  {#if showLog}
    <div class="log motion-pop">
      <span class="card__title">Run log</span>
      {#if shownRuns.length === 0}<p class="hint">No runs recorded yet. Runs are kept for 30 days.</p>{/if}
      {#each shownRuns as run (run._id)}
        <div class="log__row" class:log__row--bad={!run.ok}>
          <span class="log__at">{fmt(run.at)}</span>
          <span class="log__rule">{run.ruleName}</span>
          <span class="log__what">{run.identifier ?? `${run.matched} matched`} · {run.trigger} · {run.actions.join(', ')}</span>
          <span class="log__state">{run.ok ? 'ok' : run.error ?? 'failed'}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style lang="scss">
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .tools { display: flex; align-items: center; gap: 0.6rem; }
  .hint { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); &--indent { margin-left: 3.6rem; } }
  .editor { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.85rem; border: 1px dashed var(--accent-brand); border-radius: 0.6rem; }
  .editor__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .line { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--theme-content-color); &--sub { margin-top: -0.2rem; } &--top { gap: 0.75rem; } }
  .kw { width: 3.2rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; color: var(--accent-brand-ink); }
  .knob { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; outline: none; &:focus { border-color: var(--accent-brand); } &--name { font-weight: 600; } &--wide { min-width: 18rem; } &--n { width: 4rem; } &--key { width: 14rem; } }
  .url { font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 0.3rem; background: var(--theme-button-pressed); color: var(--theme-caption-color); word-break: break-all; &--small { margin-top: 0.2rem; font-size: 0.65rem; } }
  .x { border: none; background: transparent; color: var(--theme-trans-color); font: inherit; cursor: pointer; &:hover { color: var(--negative-button-default); } }
  .lnk { align-self: flex-start; border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
  .rule { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; border-top: 1px solid var(--theme-divider-color); &--off { opacity: 0.55; } }
  .rule__main { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .rule__name { font-weight: 600; color: var(--theme-caption-color); }
  .pill { margin-left: 0.3rem; padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--accent-brand-soft); color: var(--theme-caption-color); }
  .rule__desc { font-size: 0.8125rem; color: var(--theme-content-color); }
  .rule__meta { font-size: 0.7rem; color: var(--theme-trans-color); }
  .bad { color: var(--negative-button-default); }
  .rule__tools { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
  .log { display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--theme-divider-color); }
  .log__row { display: grid; grid-template-columns: 9rem 12rem 1fr 8rem; gap: 0.6rem; font-size: 0.75rem; color: var(--theme-content-color); padding: 0.2rem 0; &--bad .log__state { color: var(--negative-button-default); } }
  .log__at { color: var(--theme-trans-color); }
  .log__rule { font-weight: 600; color: var(--theme-caption-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log__what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log__state { text-align: right; color: var(--accent-brand-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
