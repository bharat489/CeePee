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
  Workflow designer. Statuses as nodes in category columns, allowed
  transitions as arrows. Click a status, then another, to allow or forbid
  that move. Click an arrow to edit its rule: the transition screen (fields
  asked for), required fields, validators, post-functions and the minimum
  role. Everything is stored on the task type and enforced by the server
  guard, so API writes and imports obey the same workflow.
-->
<script lang="ts">
  import { AccountRole, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task, { type TaskType, type TransitionRule } from '@hcengineering/task'
  import { type IssueStatus, type Project } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const pq = createQuery()
  const tq = createQuery()
  const sq = createQuery()
  let project: Project | undefined
  let types: TaskType[] = []
  let statuses: IssueStatus[] = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: if (project !== undefined) tq.query(task.class.TaskType, { parent: project.type }, (r) => { types = r })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  let typeId: Ref<TaskType> | undefined
  $: if (typeId === undefined && types.length > 0) typeId = (types.find((t) => t.name === 'Issue') ?? types[0])._id
  $: type = types.find((t) => t._id === typeId)
  $: ordered = ((type?.statuses ?? []) as Ref<IssueStatus>[]).map((id) => statuses.find((s) => s._id === id)).filter((s): s is IssueStatus => s !== undefined)

  // ---- layout ---------------------------------------------------------------
  const COLS = [
    { cat: task.statusCategory.UnStarted, label: 'Backlog' },
    { cat: task.statusCategory.ToDo, label: 'To do' },
    { cat: task.statusCategory.Active, label: 'In progress' },
    { cat: task.statusCategory.Won, label: 'Done' },
    { cat: task.statusCategory.Lost, label: 'Cancelled' }
  ]
  const NW = 150
  const NH = 40
  const COLW = 210
  const ROWH = 72
  const colOf = (s: IssueStatus): number => Math.max(0, COLS.findIndex((c) => c.cat === s.category))
  interface Node {
    s: IssueStatus
    x: number
    y: number
  }
  $: nodes = ordered.map((s): Node => {
    const col = colOf(s)
    const idx = ordered.filter((o) => colOf(o) === col).indexOf(s)
    return { s, x: 30 + col * COLW, y: 46 + idx * ROWH }
  })
  $: W = 30 + COLS.length * COLW
  $: H = 46 + Math.max(1, ...COLS.map((_, k) => ordered.filter((o) => colOf(o) === k).length)) * ROWH + 20
  $: transitions = (type?.transitions ?? {}) as Record<string, Ref<IssueStatus>[]>
  $: rules = (type?.transitionRules ?? []) as TransitionRule[]
  const allowed = (tr: Record<string, Ref<IssueStatus>[]>, from: Ref<IssueStatus>, to: Ref<IssueStatus>): boolean => tr[from] === undefined || tr[from].includes(to)
  $: edges = nodes.flatMap((a) => (transitions[a.s._id] === undefined ? [] : nodes.filter((b) => b !== a && transitions[a.s._id].includes(b.s._id)).map((b) => ({ from: a, to: b }))))
  const ruleFor = (list: TransitionRule[], from: Ref<IssueStatus>, to: Ref<IssueStatus>): TransitionRule | undefined => list.find((r) => r.to === to && r.from === from) ?? list.find((r) => r.to === to && r.from === '*')

  function path (a: Node, b: Node): string {
    const x1 = a.x + NW
    const y1 = a.y + NH / 2
    const x2 = b.x
    const y2 = b.y + NH / 2
    if (b.x <= a.x) {
      // backwards: route underneath
      const dy = Math.max(a.y, b.y) + NH + 18
      return `M${a.x + NW / 2},${a.y + NH} C${a.x + NW / 2},${dy} ${b.x + NW / 2},${dy} ${b.x + NW / 2},${b.y + NH}`
    }
    const c = Math.max(30, (x2 - x1) / 2)
    return `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`
  }

  // ---- editing transitions ------------------------------------------------------
  let picked: Ref<IssueStatus> | undefined
  async function clickNode (s: IssueStatus): Promise<void> {
    if (type === undefined) return
    if (picked === undefined) {
      picked = s._id
      return
    }
    if (picked === s._id) {
      picked = undefined
      return
    }
    const from = picked
    const cur = transitions[from] ?? ordered.filter((o) => o._id !== from).map((o) => o._id)
    const next = cur.includes(s._id) ? cur.filter((x) => x !== s._id) : [...cur, s._id]
    await client.update(type, { transitions: { ...transitions, [from]: next } } as any)
    picked = undefined
  }
  async function allowAny (s: IssueStatus): Promise<void> {
    if (type === undefined) return
    const next = { ...transitions }
    delete next[s._id]
    await client.update(type, { transitions: next } as any)
  }
  async function restrict (s: IssueStatus): Promise<void> {
    if (type === undefined) return
    await client.update(type, { transitions: { ...transitions, [s._id]: ordered.filter((o) => o._id !== s._id).map((o) => o._id) } } as any)
  }

  // ---- rule editor ------------------------------------------------------------
  const FIELDS = ['assignee', 'priority', 'component', 'milestone', 'sprint', 'estimation', 'dueDate', 'resolution', 'labels', 'description', 'severity', 'risk', 'postmortem']
  const OPS = ['is', 'is-not', 'contains', 'empty', 'not-empty'] as const
  const PF: Array<{ id: string, label: string, needsValue: boolean, needsUrl?: boolean }> = [
    { id: 'set-priority', label: 'set priority (0-4)', needsValue: true },
    { id: 'set-assignee', label: 'assign (none / reporter / component-lead / person id)', needsValue: true },
    { id: 'add-comment', label: 'add comment', needsValue: true },
    { id: 'set-sprint', label: 'move to sprint (active / none)', needsValue: true },
    { id: 'set-milestone', label: 'set milestone (id / none)', needsValue: true },
    { id: 'set-due', label: 'set due in N days', needsValue: true },
    { id: 'create-subtasks', label: 'create sub-tasks (one per line)', needsValue: true },
    { id: 'create-issue', label: 'create follow-up issue (title; project key)', needsValue: true, needsUrl: true },
    { id: 'send-email', label: 'send email (body; recipients)', needsValue: true, needsUrl: true },
    { id: 'slack', label: 'post to Slack (text; webhook URL)', needsValue: true, needsUrl: true },
    { id: 'teams', label: 'post to Teams (text; webhook URL)', needsValue: true, needsUrl: true },
    { id: 'webhook', label: 'call webhook (URL)', needsValue: true }
  ]
  const ROLES = [{ v: '', l: 'anyone' }, { v: AccountRole.Maintainer, l: 'maintainers and owners' }, { v: AccountRole.Owner, l: 'owners only' }]
  let editing: { from: Ref<IssueStatus> | '*', to: Ref<IssueStatus> } | undefined
  let draft: TransitionRule = { from: '*', to: '' as Ref<IssueStatus> }
  function editEdge (from: Ref<IssueStatus> | '*', to: Ref<IssueStatus>): void {
    const existing = rules.find((r) => r.from === from && r.to === to)
    draft = existing !== undefined ? JSON.parse(JSON.stringify(existing)) : { from, to, screen: [], requiredFields: [], validators: [], postFunctions: [], minRole: '' }
    draft.screen = draft.screen ?? []
    draft.requiredFields = draft.requiredFields ?? []
    draft.validators = draft.validators ?? []
    draft.postFunctions = draft.postFunctions ?? []
    editing = { from, to }
  }
  function toggleIn (list: string[], k: string): string[] {
    return list.includes(k) ? list.filter((x) => x !== k) : [...list, k]
  }
  async function saveRule (): Promise<void> {
    if (type === undefined || editing === undefined) return
    const clean: TransitionRule = {
      from: draft.from,
      to: draft.to,
      ...(draft.name !== undefined && draft.name.trim() !== '' ? { name: draft.name.trim() } : {}),
      ...((draft.screen ?? []).length > 0 ? { screen: draft.screen } : {}),
      ...((draft.requiredFields ?? []).length > 0 ? { requiredFields: draft.requiredFields } : {}),
      ...((draft.validators ?? []).filter((v) => v.field !== '').length > 0 ? { validators: (draft.validators ?? []).filter((v) => v.field !== '') } : {}),
      ...((draft.postFunctions ?? []).filter((p) => p.type !== '').length > 0 ? { postFunctions: (draft.postFunctions ?? []).filter((p) => p.type !== '') } : {}),
      ...(draft.minRole !== undefined && draft.minRole !== '' ? { minRole: draft.minRole } : {})
    }
    const others = rules.filter((r) => !(r.from === editing?.from && r.to === editing?.to))
    const hasContent = Object.keys(clean).length > 2
    await client.update(type, { transitionRules: hasContent ? [...others, clean] : others } as any)
    editing = undefined
  }
  async function removeRule (): Promise<void> {
    if (type === undefined || editing === undefined) return
    await client.update(type, { transitionRules: rules.filter((r) => !(r.from === editing?.from && r.to === editing?.to)) } as any)
    editing = undefined
  }
  const nameOf = (id: Ref<IssueStatus> | '*'): string => (id === '*' ? 'any status' : statuses.find((s) => s._id === id)?.name ?? '?')
  let anyTarget: Ref<IssueStatus> | '' = ''
</script>

<div class="wf">
  <header class="wf__head">
    <span class="wf__title"><Label label={tracker.string.Workflow} /></span>
    <select class="select" bind:value={typeId}>{#each types as t (t._id)}<option value={t._id}>{t.name}</option>{/each}</select>
    <span class="muted">{picked !== undefined ? `From ${nameOf(picked)}: click a status to allow or forbid the move, or click it again to cancel.` : 'Click a status, then another, to toggle that transition. Click an arrow to edit its rule.'}</span>
  </header>

  <section class="card">
    <div class="tl-wrap">
      <svg viewBox="0 0 {W} {H}" class="diagram" style="min-width: {W}px">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead" /></marker></defs>
        {#each COLS as c, k}
          <text x={30 + k * COLW} y="22" class="col">{c.label}</text>
          <line x1={30 + k * COLW - 20} x2={30 + k * COLW - 20} y1="30" y2={H} class="colline" />
        {/each}
        {#each edges as e (e.from.s._id + e.to.s._id)}
          {@const r = ruleFor(rules, e.from.s._id, e.to.s._id)}
          <path d={path(e.from, e.to)} class="edge" class:edge--rule={r !== undefined} marker-end="url(#arrow)" role="button" tabindex="0" on:click={() => { editEdge(e.from.s._id, e.to.s._id) }} on:keydown={(ev) => { if (ev.key === 'Enter') editEdge(e.from.s._id, e.to.s._id) }}><title>{e.from.s.name} → {e.to.s.name}{r !== undefined ? ' · has a rule' : ''}</title></path>
        {/each}
        {#each nodes as n (n.s._id)}
          <g class="node" class:node--picked={picked === n.s._id} role="button" tabindex="0" on:click={() => { void clickNode(n.s) }} on:keydown={(ev) => { if (ev.key === 'Enter') void clickNode(n.s) }}>
            <rect x={n.x} y={n.y} width={NW} height={NH} rx="8" class="node__box node__box--{colOf(n.s)}" />
            <text x={n.x + 12} y={n.y + 25} class="node__label">{n.s.name.length > 16 ? n.s.name.slice(0, 15) + '…' : n.s.name}</text>
            {#if transitions[n.s._id] === undefined}<text x={n.x + NW - 10} y={n.y + 25} class="node__any" text-anchor="end">→ any</text>{/if}
          </g>
        {/each}
      </svg>
    </div>
    <div class="legend">
      <span><i class="sw sw--edge" />allowed transition</span><span><i class="sw sw--rule" />transition with a rule</span><span>"→ any" = not restricted yet</span>
    </div>
  </section>

  <div class="two">
    <section class="card">
      <span class="card__title">Statuses</span>
      {#each ordered as s (s._id)}
        <div class="row">
          <span class="row__name">{s.name}</span>
          <span class="muted">{transitions[s._id] === undefined ? 'may move anywhere' : `may move to ${transitions[s._id].length} status${transitions[s._id].length === 1 ? '' : 'es'}`}</span>
          {#if transitions[s._id] === undefined}<button class="lnk" on:click={() => { void restrict(s) }}>restrict</button>{:else}<button class="lnk" on:click={() => { void allowAny(s) }}>allow any</button>{/if}
        </div>
      {/each}
      <p class="muted">Statuses themselves are managed in the project's status settings; this page decides how work moves between them.</p>
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title">Rules</span>
        <span class="row__tools"><select class="select" bind:value={anyTarget}><option value="">any status → …</option>{#each ordered as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select><Button kind={'ghost'} label={tracker.string.Add} disabled={anyTarget === ''} on:click={() => { if (anyTarget !== '') editEdge('*', anyTarget) }} /></span>
      </div>
      {#each rules as r (r.from + r.to)}
        <button class="rule" on:click={() => { editEdge(r.from, r.to) }}>
          <span class="rule__path">{nameOf(r.from)} → {nameOf(r.to)}</span>
          <span class="muted">{[r.name, (r.screen ?? []).length > 0 ? `${(r.screen ?? []).length} screen field${(r.screen ?? []).length === 1 ? '' : 's'}` : '', (r.requiredFields ?? []).length > 0 ? `${(r.requiredFields ?? []).length} required` : '', (r.validators ?? []).length > 0 ? `${(r.validators ?? []).length} validator${(r.validators ?? []).length === 1 ? '' : 's'}` : '', (r.postFunctions ?? []).length > 0 ? `${(r.postFunctions ?? []).length} post-function${(r.postFunctions ?? []).length === 1 ? '' : 's'}` : '', r.minRole !== undefined && r.minRole !== '' ? `role ≥ ${r.minRole}` : ''].filter((x) => x !== undefined && x !== '').join(' · ')}</span>
        </button>
      {/each}
      {#if rules.length === 0}<p class="muted">No rules yet. Click an arrow in the diagram, or add one for "any status → …".</p>{/if}
    </section>
  </div>

  {#if editing !== undefined}
    <section class="card card--edit motion-pop">
      <div class="card__head"><span class="card__title">Rule: {nameOf(editing.from)} → {nameOf(editing.to)}</span>
        <span class="row__tools"><Button kind={'primary'} label={tracker.string.Save} on:click={() => { void saveRule() }} /><Button kind={'ghost'} label={tracker.string.Delete} on:click={() => { void removeRule() }} /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = undefined }} /></span>
      </div>
      <input class="input" placeholder="Transition name (optional), e.g. Start work, Resolve" bind:value={draft.name} />
      <div class="grid">
        <div class="box"><b>Transition screen</b><span class="muted">Fields the person is asked for when making this move.</span>
          <div class="chips">{#each FIELDS as f}<label class="chip" class:chip--on={(draft.screen ?? []).includes(f)}><input type="checkbox" checked={(draft.screen ?? []).includes(f)} on:change={() => { draft.screen = toggleIn(draft.screen ?? [], f) }} />{f}</label>{/each}</div>
        </div>
        <div class="box"><b>Required fields</b><span class="muted">Must be filled or the move is refused.</span>
          <div class="chips">{#each FIELDS as f}<label class="chip" class:chip--on={(draft.requiredFields ?? []).includes(f)}><input type="checkbox" checked={(draft.requiredFields ?? []).includes(f)} on:change={() => { draft.requiredFields = toggleIn(draft.requiredFields ?? [], f) }} />{f}</label>{/each}</div>
        </div>
      </div>
      <div class="box"><b>Validators</b><span class="muted">Conditions on the issue that must hold.</span>
        {#each draft.validators ?? [] as v, k}
          <div class="vrow">
            <input class="input input--s" placeholder="field, e.g. priority / labels / estimation" bind:value={v.field} />
            <select class="select" bind:value={v.op}>{#each OPS as o}<option value={o}>{o}</option>{/each}</select>
            {#if v.op !== 'empty' && v.op !== 'not-empty'}<input class="input input--s" placeholder="value" bind:value={v.value} />{/if}
            <button class="lnk lnk--bad" on:click={() => { draft.validators = (draft.validators ?? []).filter((_, i) => i !== k) }}>remove</button>
          </div>
        {/each}
        <button class="lnk" on:click={() => { draft.validators = [...(draft.validators ?? []), { field: '', op: 'not-empty' }] }}>+ validator</button>
      </div>
      <div class="box"><b>Post-functions</b><span class="muted">Run after the move. Templates: {'{identifier} {title} {status} {assignee} {priority} {url}'}.</span>
        {#each draft.postFunctions ?? [] as p, k}
          {@const def = PF.find((x) => x.id === p.type)}
          <div class="vrow">
            <select class="select" bind:value={p.type}><option value="">action…</option>{#each PF as x (x.id)}<option value={x.id}>{x.label}</option>{/each}</select>
            {#if def?.needsValue}<input class="input input--w" placeholder="value" bind:value={p.value} />{/if}
            {#if def?.needsUrl}<input class="input input--s" placeholder={p.type === 'create-issue' ? 'project key' : p.type === 'send-email' ? 'assignee, reporter, watchers, portal or emails' : 'https://…'} bind:value={p.url} />{/if}
            <select class="select" bind:value={p.target}><option value={undefined}>this issue</option><option value="parent">parent</option><option value="children">sub-issues</option><option value="blocked-by">blockers</option><option value="blocking">blocked issues</option></select>
            <button class="lnk lnk--bad" on:click={() => { draft.postFunctions = (draft.postFunctions ?? []).filter((_, i) => i !== k) }}>remove</button>
          </div>
        {/each}
        <button class="lnk" on:click={() => { draft.postFunctions = [...(draft.postFunctions ?? []), { type: '' }] }}>+ post-function</button>
      </div>
      <label class="knob">Who may use it <select class="select" bind:value={draft.minRole}>{#each ROLES as r}<option value={r.v}>{r.l}</option>{/each}</select></label>
    </section>
  {/if}
</div>

<style lang="scss">
  .wf { display: flex; flex-direction: column; gap: 0.9rem; padding: 1rem 1.25rem; overflow: auto; }
  .wf__head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .wf__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .select, .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .input--s { width: 12rem; }
  .input--w { flex: 1; min-width: 14rem; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); min-width: 0; &--edit { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .card__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 0.9rem; }
  .tl-wrap { overflow-x: auto; }
  .diagram { width: 100%; height: auto; }
  .col { fill: var(--theme-dark-color); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .colline { stroke: var(--theme-divider-color); stroke-dasharray: 2 4; }
  .edge { fill: none; stroke: var(--theme-trans-color); stroke-width: 1.5; cursor: pointer; &:hover { stroke: var(--theme-caption-color); stroke-width: 2.5; } &--rule { stroke: var(--accent-brand-ink, #6a8a00); stroke-width: 2; } }
  .arrowhead { fill: var(--theme-trans-color); }
  .node { cursor: pointer; &:hover .node__box { stroke: var(--theme-caption-color); } &--picked .node__box { stroke: var(--accent-brand); stroke-width: 3; } }
  .node__box { fill: var(--theme-bg-color); stroke: var(--theme-divider-color); stroke-width: 1.5; &--0 { fill: var(--theme-button-pressed); } &--2 { fill: color-mix(in srgb, var(--primary-button-default) 18%, var(--theme-bg-color)); } &--3 { fill: var(--accent-brand-soft); } &--4 { fill: color-mix(in srgb, var(--negative-button-default) 14%, var(--theme-bg-color)); } }
  .node__label { fill: var(--theme-caption-color); font-size: 13px; font-weight: 600; pointer-events: none; }
  .node__any { fill: var(--theme-trans-color); font-size: 10px; pointer-events: none; }
  .legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.75rem; color: var(--theme-dark-color); span { display: inline-flex; align-items: center; gap: 0.35rem; } }
  .sw { display: inline-block; width: 1.2rem; height: 2px; &--edge { background: var(--theme-trans-color); } &--rule { background: var(--accent-brand-ink, #6a8a00); height: 3px; } }
  .row { display: flex; align-items: center; gap: 0.75rem; padding: 0.35rem 0; border-top: 1px solid var(--theme-divider-color); font-size: 0.8125rem; }
  .row__name { min-width: 9rem; font-weight: 600; color: var(--theme-caption-color); }
  .row__tools { display: flex; gap: 0.4rem; align-items: center; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
  .rule { display: flex; flex-direction: column; gap: 0.1rem; width: 100%; padding: 0.45rem 0.5rem; border: none; border-top: 1px solid var(--theme-divider-color); background: transparent; color: var(--theme-content-color); font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .rule__path { font-weight: 600; color: var(--theme-caption-color); font-size: 0.875rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 0.75rem; }
  .box { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; font-size: 0.8125rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; font-size: 0.75rem; cursor: pointer; input { display: none; } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .vrow { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .knob { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--theme-content-color); }
</style>
