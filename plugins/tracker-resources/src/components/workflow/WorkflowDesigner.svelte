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
  Workflow designer. Statuses are nodes you can drag anywhere (the layout is
  saved on the task type; "Auto layout" puts them back in category columns),
  allowed transitions are arrows. Click a status, then another, to allow or
  forbid that move. Click an arrow to edit its rule: transition screen,
  required fields, validators, linked-issue conditions, post-functions and
  the minimum role. Each status has properties too (locked, assignee
  required, clear assignee, assign to reporter, set resolution, pause SLA,
  colour, note). A whole workflow can be saved as a named scheme and applied
  to any other project by matching status names. Everything is stored on the
  task type and enforced by the server guard, so API writes and imports obey
  the same workflow.
-->
<script lang="ts">
  import core, { AccountRole, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task, { type LinkedCondition, type StatusProps, type TaskType, type TransitionRule } from '@hcengineering/task'
  import { type IssueStatus, type Project, type WorkflowScheme } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const pq = createQuery()
  const tq = createQuery()
  const sq = createQuery()
  const wq = createQuery()
  let project: Project | undefined
  let types: TaskType[] = []
  let statuses: IssueStatus[] = []
  let schemes: WorkflowScheme[] = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: if (project !== undefined) tq.query(task.class.TaskType, { parent: project.type }, (r) => { types = r })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  wq.query(tracker.class.WorkflowScheme, {}, (r) => { schemes = r })
  let typeId: Ref<TaskType> | undefined
  $: if (typeId === undefined && types.length > 0) typeId = (types.find((t) => t.name === 'Issue') ?? types[0])._id
  $: type = types.find((t) => t._id === typeId)
  $: ordered = ((type?.statuses ?? []) as Ref<IssueStatus>[]).map((id) => statuses.find((s) => s._id === id)).filter((s): s is IssueStatus => s !== undefined)
  $: transitions = (type?.transitions ?? {}) as Record<string, Ref<IssueStatus>[]>
  $: rules = (type?.transitionRules ?? []) as TransitionRule[]
  $: layout = (type?.workflowLayout ?? {}) as Record<string, { x: number, y: number }>
  $: statusProps = (type?.statusProps ?? {}) as Record<string, StatusProps>

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
    const saved = layout[s._id]
    if (saved !== undefined) return { s, x: saved.x, y: saved.y }
    const col = colOf(s)
    const idx = ordered.filter((o) => colOf(o) === col).indexOf(s)
    return { s, x: 30 + col * COLW, y: 46 + idx * ROWH }
  })
  $: W = Math.max(30 + COLS.length * COLW, ...nodes.map((n) => n.x + NW + 40))
  $: H = Math.max(46 + Math.max(1, ...COLS.map((_, k) => ordered.filter((o) => colOf(o) === k).length)) * ROWH + 20, ...nodes.map((n) => n.y + NH + 40))
  $: edges = nodes.flatMap((a) => (transitions[a.s._id] === undefined ? [] : nodes.filter((b) => b !== a && transitions[a.s._id].includes(b.s._id)).map((b) => ({ from: a, to: b }))))
  const ruleFor = (list: TransitionRule[], from: Ref<IssueStatus>, to: Ref<IssueStatus>): TransitionRule | undefined => list.find((r) => r.to === to && r.from === from) ?? list.find((r) => r.to === to && r.from === '*')

  // ---- dragging nodes -----------------------------------------------------------
  let svgEl: SVGSVGElement
  let dragging: { id: Ref<IssueStatus>, sx: number, sy: number, ox: number, oy: number, moved: boolean } | undefined
  let dragPos: { x: number, y: number } | undefined
  let suppressClick = false
  function svgPoint (e: PointerEvent): { x: number, y: number } {
    const r = svgEl.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  function startDrag (n: Node, e: PointerEvent): void {
    const p = svgPoint(e)
    dragging = { id: n.s._id, sx: p.x, sy: p.y, ox: n.x, oy: n.y, moved: false }
    dragPos = undefined
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  function moveDrag (e: PointerEvent): void {
    if (dragging === undefined) return
    const p = svgPoint(e)
    const dx = p.x - dragging.sx
    const dy = p.y - dragging.sy
    if (!dragging.moved && Math.hypot(dx, dy) < 4) return
    dragging.moved = true
    dragPos = { x: Math.max(0, Math.round(dragging.ox + dx)), y: Math.max(30, Math.round(dragging.oy + dy)) }
  }
  async function endDrag (): Promise<void> {
    if (dragging === undefined) return
    const d = dragging
    const p = dragPos
    dragging = undefined
    dragPos = undefined
    if (!d.moved || p === undefined || type === undefined) return
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 80)
    await client.update(type, { workflowLayout: { ...layout, [d.id]: p } })
  }
  const posOf = (n: Node): { x: number, y: number } => (dragging?.id === n.s._id && dragPos !== undefined ? dragPos : { x: n.x, y: n.y })
  async function autoLayout (): Promise<void> {
    if (type === undefined) return
    await client.update(type, { workflowLayout: {} })
  }

  function path (a: Node, b: Node): string {
    const pa = posOf(a)
    const pb = posOf(b)
    const x1 = pa.x + NW
    const y1 = pa.y + NH / 2
    const x2 = pb.x
    const y2 = pb.y + NH / 2
    if (pb.x <= pa.x) {
      // backwards: route underneath
      const dy = Math.max(pa.y, pb.y) + NH + 18
      return `M${pa.x + NW / 2},${pa.y + NH} C${pa.x + NW / 2},${dy} ${pb.x + NW / 2},${dy} ${pb.x + NW / 2},${pb.y + NH}`
    }
    const c = Math.max(30, (x2 - x1) / 2)
    return `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`
  }

  // ---- editing transitions ------------------------------------------------------
  let picked: Ref<IssueStatus> | undefined
  async function clickNode (s: IssueStatus): Promise<void> {
    if (suppressClick) {
      suppressClick = false
      return
    }
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

  // ---- status properties --------------------------------------------------------
  let propsFor: Ref<IssueStatus> | undefined
  let pdraft: StatusProps = {}
  let resMode: 'keep' | 'clear' | 'set' = 'keep'
  let resText = ''
  function editProps (s: IssueStatus): void {
    const cur = statusProps[s._id] ?? {}
    pdraft = JSON.parse(JSON.stringify(cur))
    resMode = cur.setResolution === undefined ? 'keep' : cur.setResolution === null ? 'clear' : 'set'
    resText = typeof cur.setResolution === 'string' ? cur.setResolution : ''
    propsFor = s._id
    editing = undefined
  }
  async function saveProps (): Promise<void> {
    if (type === undefined || propsFor === undefined) return
    const clean: StatusProps = {}
    if (pdraft.locked === true) clean.locked = true
    if (pdraft.assigneeRequired === true) clean.assigneeRequired = true
    if (pdraft.clearAssignee === true) clean.clearAssignee = true
    if (pdraft.assignToReporter === true) clean.assignToReporter = true
    if (pdraft.slaPause === true) clean.slaPause = true
    if (resMode === 'clear') clean.setResolution = null
    else if (resMode === 'set' && resText.trim() !== '') clean.setResolution = resText.trim()
    if (pdraft.color !== undefined && pdraft.color !== '') clean.color = pdraft.color
    if (pdraft.note !== undefined && pdraft.note.trim() !== '') clean.note = pdraft.note.trim()
    const next: Record<string, StatusProps> = { ...statusProps }
    if (Object.keys(clean).length === 0) delete next[propsFor]
    else next[propsFor] = clean
    await client.update(type, { statusProps: next })
    propsFor = undefined
  }
  const propGlyphs = (p: StatusProps | undefined): string => (p === undefined ? '' : [p.locked === true ? '🔒' : '', p.assigneeRequired === true ? '👤' : '', p.slaPause === true ? '⏸' : '', p.setResolution !== undefined ? '✓' : ''].join(''))
  const propSummary = (p: StatusProps | undefined): string => (p === undefined ? '' : [p.locked === true ? 'locked' : '', p.assigneeRequired === true ? 'assignee required' : '', p.clearAssignee === true ? 'clears assignee' : '', p.assignToReporter === true ? 'assigns reporter' : '', p.setResolution === null ? 'clears resolution' : typeof p.setResolution === 'string' ? `resolution "${p.setResolution}"` : '', p.slaPause === true ? 'pauses SLA' : '', p.note !== undefined && p.note !== '' ? 'note' : ''].filter((x) => x !== '').join(' · '))

  // ---- rule editor ------------------------------------------------------------
  const FIELDS = ['assignee', 'priority', 'component', 'milestone', 'sprint', 'estimation', 'dueDate', 'resolution', 'labels', 'description', 'severity', 'risk', 'postmortem']
  const OPS = ['is', 'is-not', 'contains', 'empty', 'not-empty'] as const
  const LINKED: Array<{ v: LinkedCondition, l: string }> = [
    { v: 'subtasks-done', l: 'all sub-issues are done' },
    { v: 'no-open-blockers', l: 'no open blockers' },
    { v: 'parent-open', l: 'parent is still open' },
    { v: 'has-subtasks', l: 'has at least one sub-issue' }
  ]
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
    draft.linked = draft.linked ?? []
    editing = { from, to }
    propsFor = undefined
  }
  function toggleIn (list: string[], k: string): string[] {
    return list.includes(k) ? list.filter((x) => x !== k) : [...list, k]
  }
  function toggleLinked (list: LinkedCondition[], k: LinkedCondition): LinkedCondition[] {
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
      ...((draft.linked ?? []).length > 0 ? { linked: draft.linked } : {}),
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
  const ruleSummary = (r: TransitionRule): string => [r.name, (r.screen ?? []).length > 0 ? `${(r.screen ?? []).length} screen field${(r.screen ?? []).length === 1 ? '' : 's'}` : '', (r.requiredFields ?? []).length > 0 ? `${(r.requiredFields ?? []).length} required` : '', (r.validators ?? []).length > 0 ? `${(r.validators ?? []).length} validator${(r.validators ?? []).length === 1 ? '' : 's'}` : '', (r.linked ?? []).length > 0 ? `${(r.linked ?? []).length} linked condition${(r.linked ?? []).length === 1 ? '' : 's'}` : '', (r.postFunctions ?? []).length > 0 ? `${(r.postFunctions ?? []).length} post-function${(r.postFunctions ?? []).length === 1 ? '' : 's'}` : '', r.minRole !== undefined && r.minRole !== '' ? `role ≥ ${r.minRole}` : ''].filter((x) => x !== undefined && x !== '').join(' · ')
  let anyTarget: Ref<IssueStatus> | '' = ''

  // ---- schemes: a named workflow, keyed by status names so it ports between projects ----
  const nm = (id: string): string => (id === '*' ? '*' : statuses.find((s) => s._id === id)?.name ?? id)
  const byName = (name: string): IssueStatus | undefined => ordered.find((s) => s.name.toLowerCase() === name.toLowerCase())
  let schemeName = ''
  let savingScheme = false
  let applying: Ref<WorkflowScheme> | '' = ''
  async function saveScheme (): Promise<void> {
    if (type === undefined || schemeName.trim() === '') return
    const data = {
      name: schemeName.trim(),
      description: `Saved from ${project?.name ?? ''} / ${type.name}`,
      statuses: ordered.map((s) => s.name),
      transitions: Object.fromEntries(Object.entries(transitions).map(([k, v]) => [nm(k), v.map((x) => nm(x))])),
      rules: rules.map((r) => ({ ...r, from: nm(r.from), to: nm(r.to) })),
      statusProps: Object.fromEntries(Object.entries(statusProps).map(([k, v]) => [nm(k), v as Record<string, any>])),
      layout: Object.fromEntries(Object.entries(layout).map(([k, v]) => [nm(k), v]))
    }
    const existing = schemes.find((s) => s.name.toLowerCase() === data.name.toLowerCase())
    if (existing !== undefined) await client.update(existing, data)
    else await client.createDoc(tracker.class.WorkflowScheme, core.space.Workspace, data)
    schemeName = ''
    savingScheme = false
  }
  async function applyScheme (): Promise<void> {
    const sc = schemes.find((s) => s._id === applying)
    if (type === undefined || sc === undefined) return
    const idOf = (name: string): Ref<IssueStatus> | '*' | undefined => (name === '*' ? '*' : byName(name)?._id)
    const missing = sc.statuses.filter((n) => byName(n) === undefined)
    if (missing.length > 0 && !confirm(`This project has no status named: ${missing.join(', ')}. Apply the rest of "${sc.name}"?`)) return
    const tr: Record<string, Ref<IssueStatus>[]> = {}
    for (const [k, v] of Object.entries(sc.transitions)) {
      const id = idOf(k)
      if (id === undefined || id === '*') continue
      tr[id] = v.map((x) => idOf(x)).filter((x): x is Ref<IssueStatus> => x !== undefined && x !== '*')
    }
    const rl: TransitionRule[] = []
    for (const r of sc.rules) {
      const f = idOf(String(r.from))
      const t = idOf(String(r.to))
      if (f === undefined || t === undefined || t === '*') continue
      rl.push({ ...(r as TransitionRule), from: f, to: t })
    }
    const sp: Record<string, StatusProps> = {}
    for (const [k, v] of Object.entries(sc.statusProps)) {
      const id = idOf(k)
      if (id !== undefined && id !== '*') sp[id] = v as StatusProps
    }
    const ly: Record<string, { x: number, y: number }> = {}
    for (const [k, v] of Object.entries(sc.layout ?? {})) {
      const id = idOf(k)
      if (id !== undefined && id !== '*') ly[id] = v
    }
    await client.update(type, { transitions: tr, transitionRules: rl, statusProps: sp, workflowLayout: ly } as any)
    applying = ''
  }
  async function deleteScheme (sc: WorkflowScheme): Promise<void> {
    if (!confirm(`Delete scheme "${sc.name}"? Projects that used it keep their workflow.`)) return
    await client.remove(sc)
  }
  const propsCount = (sc: WorkflowScheme): number => Object.keys(sc.statusProps ?? {}).length
</script>

<div class="wf">
  <header class="wf__head">
    <span class="wf__title"><Label label={tracker.string.Workflow} /></span>
    <select class="select" bind:value={typeId}>{#each types as t (t._id)}<option value={t._id}>{t.name}</option>{/each}</select>
    <span class="muted">{picked !== undefined ? `From ${nameOf(picked)}: click a status to allow or forbid the move, or click it again to cancel.` : 'Drag statuses to arrange them. Click a status, then another, to toggle that transition. Click an arrow to edit its rule.'}</span>
    <span class="grow" />
    <button class="lnk" on:click={() => { void autoLayout() }}>auto layout</button>
    <Button kind={'ghost'} label={tracker.string.SaveScheme} on:click={() => { savingScheme = !savingScheme }} />
  </header>

  {#if savingScheme}
    <section class="card card--edit motion-pop">
      <div class="vrow"><input class="input input--w" placeholder="Scheme name, e.g. Software development, Service desk, Simple" bind:value={schemeName} on:keydown={(e) => { if (e.key === 'Enter') void saveScheme() }} /><Button kind={'primary'} label={tracker.string.Save} disabled={schemeName.trim() === ''} on:click={() => { void saveScheme() }} /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { savingScheme = false }} /></div>
      <span class="muted">Saves this type's statuses, transitions, rules, status properties and layout under a name, keyed by status name, so it can be applied to any project whose statuses share those names.</span>
    </section>
  {/if}

  <section class="card">
    <div class="tl-wrap">
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <svg bind:this={svgEl} viewBox="0 0 {W} {H}" class="diagram" class:diagram--drag={dragging !== undefined} style="min-width: {W}px" on:pointermove={moveDrag} on:pointerup={() => { void endDrag() }} on:pointerleave={() => { void endDrag() }}>
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
          {@const p = posOf(n)}
          {@const sp = statusProps[n.s._id]}
          <g class="node" class:node--picked={picked === n.s._id} class:node--props={propsFor === n.s._id} role="button" tabindex="0" on:pointerdown={(ev) => { startDrag(n, ev) }} on:click={() => { void clickNode(n.s) }} on:keydown={(ev) => { if (ev.key === 'Enter') void clickNode(n.s) }}>
            <rect x={p.x} y={p.y} width={NW} height={NH} rx="8" class="node__box node__box--{colOf(n.s)}" />
            {#if sp?.color}<rect x={p.x} y={p.y + 6} width="4" height={NH - 12} rx="2" fill={sp.color} />{/if}
            <text x={p.x + 12} y={p.y + 25} class="node__label">{n.s.name.length > 16 ? n.s.name.slice(0, 15) + '…' : n.s.name}</text>
            {#if propGlyphs(sp) !== ''}<text x={p.x + NW - 8} y={p.y + 14} class="node__glyph" text-anchor="end">{propGlyphs(sp)}</text>{/if}
            {#if transitions[n.s._id] === undefined}<text x={p.x + NW - 10} y={p.y + 33} class="node__any" text-anchor="end">→ any</text>{/if}
          </g>
        {/each}
      </svg>
    </div>
    <div class="legend">
      <span><i class="sw sw--edge" />allowed transition</span><span><i class="sw sw--rule" />transition with a rule</span><span>"→ any" = not restricted yet</span><span>🔒 locked · 👤 assignee required · ⏸ pauses SLA · ✓ sets resolution</span>
    </div>
  </section>

  <div class="two">
    <section class="card">
      <span class="card__title">Statuses</span>
      {#each ordered as s (s._id)}
        {@const sp = statusProps[s._id]}
        <div class="row">
          <span class="row__name">{#if sp?.color}<i class="dot" style="background: {sp.color}" />{/if}{s.name}</span>
          <span class="muted">{transitions[s._id] === undefined ? 'may move anywhere' : `may move to ${transitions[s._id].length} status${transitions[s._id].length === 1 ? '' : 'es'}`}{propSummary(sp) !== '' ? ` · ${propSummary(sp)}` : ''}</span>
          <span class="grow" />
          <button class="lnk" on:click={() => { editProps(s) }}>properties</button>
          {#if transitions[s._id] === undefined}<button class="lnk" on:click={() => { void restrict(s) }}>restrict</button>{:else}<button class="lnk" on:click={() => { void allowAny(s) }}>allow any</button>{/if}
        </div>
      {/each}
      <p class="muted">Statuses themselves are managed in the project's status settings; this page decides how work moves between them and what each status enforces.</p>
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title">Rules</span>
        <span class="row__tools"><select class="select" bind:value={anyTarget}><option value="">any status → …</option>{#each ordered as s (s._id)}<option value={s._id}>{s.name}</option>{/each}</select><Button kind={'ghost'} label={tracker.string.Add} disabled={anyTarget === ''} on:click={() => { if (anyTarget !== '') editEdge('*', anyTarget) }} /></span>
      </div>
      {#each rules as r (r.from + r.to)}
        <button class="rule" on:click={() => { editEdge(r.from, r.to) }}>
          <span class="rule__path">{nameOf(r.from)} → {nameOf(r.to)}</span>
          <span class="muted">{ruleSummary(r)}</span>
        </button>
      {/each}
      {#if rules.length === 0}<p class="muted">No rules yet. Click an arrow in the diagram, or add one for "any status → …".</p>{/if}
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title"><Label label={tracker.string.WorkflowSchemes} /></span>
        <span class="row__tools"><select class="select" bind:value={applying}><option value="">{'apply scheme…'}</option>{#each schemes as sc (sc._id)}<option value={sc._id}>{sc.name}</option>{/each}</select><Button kind={'primary'} label={tracker.string.ApplyScheme} disabled={applying === ''} on:click={() => { void applyScheme() }} /></span>
      </div>
      {#each schemes as sc (sc._id)}
        <div class="row">
          <span class="row__name">{sc.name}</span>
          <span class="muted">{sc.statuses.length} statuses · {Object.keys(sc.transitions).length} restricted · {sc.rules.length} rule{sc.rules.length === 1 ? '' : 's'} · {propsCount(sc)} with properties{sc.description ? ` · ${sc.description}` : ''}</span>
          <span class="grow" />
          <button class="lnk lnk--bad" on:click={() => { void deleteScheme(sc) }}>delete</button>
        </div>
      {/each}
      {#if schemes.length === 0}<p class="muted">No schemes yet. Design a workflow here, then "Save as scheme…" to reuse it in other projects. Schemes match statuses by name.</p>{/if}
    </section>
  </div>

  {#if propsFor !== undefined}
    <section class="card card--edit motion-pop">
      <div class="card__head"><span class="card__title"><Label label={tracker.string.StatusProperties} />: {nameOf(propsFor)}</span>
        <span class="row__tools"><Button kind={'primary'} label={tracker.string.Save} on:click={() => { void saveProps() }} /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { propsFor = undefined }} /></span>
      </div>
      <div class="grid">
        <div class="box"><b>While an issue is in this status</b>
          <label class="opt"><input type="checkbox" bind:checked={pdraft.locked} /> locked: only the status may change (workspace owners excepted)</label>
          <label class="opt"><input type="checkbox" bind:checked={pdraft.slaPause} /> pause the SLA clock (time here is added back to the due time)</label>
          <label class="opt">note shown to people <input class="input input--w" placeholder="e.g. Waiting for the customer to reply" bind:value={pdraft.note} /></label>
          <label class="opt">colour <input type="color" value={pdraft.color ?? '#6a45f5'} on:input={(e) => { pdraft.color = e.currentTarget.value }} /> {#if pdraft.color}<button class="lnk" on:click={() => { pdraft.color = undefined }}>clear</button>{:else}<span class="muted">none</span>{/if}</label>
        </div>
        <div class="box"><b>When an issue enters this status</b>
          <label class="opt"><input type="checkbox" bind:checked={pdraft.assigneeRequired} /> an assignee is required (the move is refused without one)</label>
          <label class="opt"><input type="checkbox" bind:checked={pdraft.clearAssignee} /> clear the assignee</label>
          <label class="opt"><input type="checkbox" bind:checked={pdraft.assignToReporter} /> assign to the reporter</label>
          <label class="opt">resolution <select class="select" bind:value={resMode}><option value="keep">leave as is</option><option value="clear">clear it</option><option value="set">set to…</option></select>{#if resMode === 'set'}<input class="input input--s" placeholder="Fixed, Won't do, Duplicate…" bind:value={resText} />{/if}</label>
        </div>
      </div>
    </section>
  {/if}

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
      <div class="box"><b>Linked-issue conditions</b><span class="muted">The move is refused unless every checked condition holds for the issue's sub-issues, blockers and parent.</span>
        <div class="chips">{#each LINKED as l (l.v)}<label class="chip" class:chip--on={(draft.linked ?? []).includes(l.v)}><input type="checkbox" checked={(draft.linked ?? []).includes(l.v)} on:change={() => { draft.linked = toggleLinked(draft.linked ?? [], l.v) }} />{l.l}</label>{/each}</div>
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
  .grow { flex: 1; }
  .select, .input { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .input--s { width: 12rem; }
  .input--w { flex: 1; min-width: 14rem; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); min-width: 0; &--edit { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .card__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 0.9rem; }
  .tl-wrap { overflow-x: auto; }
  .diagram { width: 100%; height: auto; touch-action: none; user-select: none; &--drag { cursor: grabbing; } }
  .col { fill: var(--theme-dark-color); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .colline { stroke: var(--theme-divider-color); stroke-dasharray: 2 4; }
  .edge { fill: none; stroke: var(--theme-trans-color); stroke-width: 1.5; cursor: pointer; &:hover { stroke: var(--theme-caption-color); stroke-width: 2.5; } &--rule { stroke: var(--accent-brand-ink, #6a8a00); stroke-width: 2; } }
  .arrowhead { fill: var(--theme-trans-color); }
  .node { cursor: grab; &:hover .node__box { stroke: var(--theme-caption-color); } &--picked .node__box { stroke: var(--accent-brand); stroke-width: 3; } &--props .node__box { stroke-dasharray: 4 3; stroke: var(--accent-brand); } }
  .node__box { fill: var(--theme-bg-color); stroke: var(--theme-divider-color); stroke-width: 1.5; &--0 { fill: var(--theme-button-pressed); } &--2 { fill: color-mix(in srgb, var(--primary-button-default) 18%, var(--theme-bg-color)); } &--3 { fill: var(--accent-brand-soft); } &--4 { fill: color-mix(in srgb, var(--negative-button-default) 14%, var(--theme-bg-color)); } }
  .node__label { fill: var(--theme-caption-color); font-size: 13px; font-weight: 600; pointer-events: none; }
  .node__any { fill: var(--theme-trans-color); font-size: 10px; pointer-events: none; }
  .node__glyph { font-size: 10px; pointer-events: none; }
  .legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.75rem; color: var(--theme-dark-color); span { display: inline-flex; align-items: center; gap: 0.35rem; } }
  .sw { display: inline-block; width: 1.2rem; height: 2px; &--edge { background: var(--theme-trans-color); } &--rule { background: var(--accent-brand-ink, #6a8a00); height: 3px; } }
  .dot { display: inline-block; width: 0.55rem; height: 0.55rem; margin-right: 0.35rem; border-radius: 50%; }
  .row { display: flex; align-items: center; gap: 0.75rem; padding: 0.35rem 0; border-top: 1px solid var(--theme-divider-color); font-size: 0.8125rem; flex-wrap: wrap; }
  .row__name { min-width: 9rem; font-weight: 600; color: var(--theme-caption-color); }
  .row__tools { display: flex; gap: 0.4rem; align-items: center; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
  .rule { display: flex; flex-direction: column; gap: 0.1rem; width: 100%; padding: 0.45rem 0.5rem; border: none; border-top: 1px solid var(--theme-divider-color); background: transparent; color: var(--theme-content-color); font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .rule__path { font-weight: 600; color: var(--theme-caption-color); font-size: 0.875rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 0.75rem; }
  .box { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; font-size: 0.8125rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .opt { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--theme-content-color); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; font-size: 0.75rem; cursor: pointer; input { display: none; } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .vrow { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .knob { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--theme-content-color); }
</style>
