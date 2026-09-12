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
  Idea management. Capture ideas, score them (impact, effort, confidence,
  reach → RICE), collect insights (quotes, links, customer requests), vote,
  drag them across the impact/effort matrix, move them through a discovery
  board, and promote the winners to epics. Public ideas also appear on the
  portal where customers vote and suggest.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import { getCurrentAccount, SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Goal, type Idea, type IdeaStatus, type Issue, type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'
  import { buildMapping, Importer } from '../import/common'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const meUuid = getCurrentAccount().uuid
  const me = getCurrentEmployee()
  const iq = createQuery()
  const eq = createQuery()
  const gq = createQuery()
  const xq = createQuery()
  const pq = createQuery()
  let ideas: Idea[] = []
  let employees: Employee[] = []
  let goals: Goal[] = []
  let epics: Issue[] = []
  let project: Project | undefined
  $: iq.query(tracker.class.Idea, { space: currentSpace }, (r) => { ideas = r }, { sort: { createdOn: SortingOrder.Descending } })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  gq.query(tracker.class.Goal, {}, (r) => { goals = r })
  $: xq.query(tracker.class.Issue, { space: currentSpace, kind: tracker.taskTypes.Epic }, (r) => { epics = r }, { limit: 500 })
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: nameOf = new Map(employees.map((e) => [e._id as Ref<Person>, formatName(e.name)]))
  const integrationsUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8095` : ''

  const STATUSES: Array<{ v: IdeaStatus, l: string }> = [{ v: 'new', l: 'New' }, { v: 'exploring', l: 'Exploring' }, { v: 'validated', l: 'Validated' }, { v: 'planned', l: 'Planned' }, { v: 'shipped', l: 'Shipped' }, { v: 'declined', l: 'Declined' }]
  const SCORES: Array<{ k: 'impact' | 'effort' | 'confidence', l: string }> = [{ k: 'impact', l: 'Impact' }, { k: 'effort', l: 'Effort' }, { k: 'confidence', l: 'Confidence' }]
  const rice = (i: Idea): number => Math.round((Math.max(1, i.reach) * i.impact * i.confidence) / Math.max(1, i.effort))
  const ratio = (i: Idea): number => Math.round((i.impact / Math.max(1, i.effort)) * 10) / 10
  let tab: 'list' | 'matrix' | 'board' = 'list'
  let sortBy: 'rice' | 'votes' | 'new' = 'rice'
  let hideClosed = true
  $: shown = ideas.filter((i) => !hideClosed || (i.status !== 'shipped' && i.status !== 'declined')).sort((a, b) => sortBy === 'rice' ? rice(b) - rice(a) : sortBy === 'votes' ? b.voters.length - a.voters.length : (b.createdOn ?? 0) - (a.createdOn ?? 0))

  // ---- create / edit ---------------------------------------------------------------
  let creating = false
  let nTitle = ''
  let nDesc = ''
  let nPublic = false
  async function create (): Promise<void> {
    if (nTitle.trim() === '') return
    await client.createDoc(tracker.class.Idea, currentSpace, { title: nTitle.trim(), description: nDesc.trim(), status: 'new', impact: 3, effort: 3, confidence: 3, reach: 1, voters: [], tags: [], owner: me, insights: [], linkedIssues: [], goal: null, public: nPublic })
    nTitle = nDesc = ''
    nPublic = false
    creating = false
  }
  let openId: Ref<Idea> | undefined
  $: open = ideas.find((i) => i._id === openId)
  let insightText = ''
  let insightUrl = ''
  let linkKey = ''
  let tagText = ''
  async function set (i: Idea, patch: Partial<Idea>): Promise<void> {
    await client.update(i, patch)
  }
  const ownerName = (i: Idea): string => (i.owner != null ? nameOf.get(i.owner as Ref<Person>) ?? '' : '—')
  const setStatus = async (i: Idea, v: string): Promise<void> => { await set(i, { status: v as IdeaStatus }) }
  const setOwner = async (i: Idea, v: string): Promise<void> => { await set(i, { owner: v === '' ? null : (v as Ref<Employee>) }) }
  const setGoal = async (i: Idea, v: string): Promise<void> => { await set(i, { goal: v === '' ? null : (v as Ref<Goal>) }) }
  async function vote (i: Idea): Promise<void> {
    await set(i, { voters: i.voters.includes(meUuid) ? i.voters.filter((v) => v !== meUuid) : [...i.voters, meUuid] })
  }
  async function addInsight (i: Idea): Promise<void> {
    if (insightText.trim() === '') return
    await set(i, { insights: [...i.insights, { at: Date.now(), text: insightText.trim(), url: insightUrl.trim() || undefined, by: nameOf.get(me) }] })
    insightText = insightUrl = ''
  }
  async function linkIssue (i: Idea): Promise<void> {
    const k = linkKey.trim().toUpperCase()
    if (k === '') return
    const found = await client.findOne(tracker.class.Issue, { identifier: k })
    if (found === undefined) return
    if (!i.linkedIssues.includes(found._id)) await set(i, { linkedIssues: [...i.linkedIssues, found._id] })
    linkKey = ''
  }
  async function promote (i: Idea): Promise<void> {
    if (project === undefined) return
    const m = await buildMapping(project)
    const imp = new Importer(m)
    const created = await imp.create({
      title: i.title,
      description: [i.description, ...(i.insights.length > 0 ? ['Insights:', ...i.insights.map((x) => `- ${x.text}${x.url ? ` (${x.url})` : ''}`)] : []), `RICE ${rice(i)} · impact ${i.impact} · effort ${i.effort} · confidence ${i.confidence} · reach ${i.reach} · ${i.voters.length} votes`],
      isEpic: true,
      labels: ['idea', ...i.tags],
      assignee: i.owner ?? null
    }, `idea "${i.title}"`)
    await set(i, { linkedIssues: [...i.linkedIssues, created._id], status: i.status === 'new' || i.status === 'exploring' || i.status === 'validated' ? 'planned' : i.status })
    showPanel(view.component.EditDoc, created._id, tracker.class.Issue, 'content')
  }
  async function remove (i: Idea): Promise<void> {
    if (!confirm(`Delete idea "${i.title}"?`)) return
    await client.remove(i)
    if (openId === i._id) openId = undefined
  }
  let linked: Issue[] = []
  $: if (open !== undefined && open.linkedIssues.length > 0) void client.findAll(tracker.class.Issue, { _id: { $in: open.linkedIssues } }).then((r) => { linked = r })
  else linked = []

  // ---- matrix drag ------------------------------------------------------------------
  const MW = 600
  const MH = 420
  const PAD = 36
  const xOf = (effort: number): number => PAD + ((effort - 1) / 4) * (MW - 2 * PAD)
  const yOf = (impact: number): number => MH - PAD - ((impact - 1) / 4) * (MH - 2 * PAD)
  let dragging: Idea | undefined
  let dragPos: { impact: number, effort: number } | undefined
  let svgEl: SVGSVGElement
  function toModel (e: PointerEvent): { impact: number, effort: number } {
    const r = svgEl.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * MW
    const y = ((e.clientY - r.top) / r.height) * MH
    const effort = Math.min(5, Math.max(1, 1 + ((x - PAD) / (MW - 2 * PAD)) * 4))
    const impact = Math.min(5, Math.max(1, 1 + ((MH - PAD - y) / (MH - 2 * PAD)) * 4))
    return { impact: Math.round(impact * 2) / 2, effort: Math.round(effort * 2) / 2 }
  }
  function startDrag (i: Idea, e: PointerEvent): void {
    dragging = i
    dragPos = { impact: i.impact, effort: i.effort }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  function moveDrag (e: PointerEvent): void {
    if (dragging === undefined) return
    dragPos = toModel(e)
  }
  async function endDrag (): Promise<void> {
    if (dragging !== undefined && dragPos !== undefined && (dragPos.impact !== dragging.impact || dragPos.effort !== dragging.effort)) await set(dragging, dragPos)
    dragging = undefined
    dragPos = undefined
  }
  const pos = (i: Idea): { impact: number, effort: number } => (dragging?._id === i._id && dragPos !== undefined ? dragPos : { impact: i.impact, effort: i.effort })
  const quadrant = (i: Idea): string => (i.impact >= 3 ? (i.effort <= 3 ? 'Quick win' : 'Big bet') : i.effort <= 3 ? 'Fill-in' : 'Time sink')
  async function moveStatus (i: Idea, dir: -1 | 1): Promise<void> {
    const k = STATUSES.findIndex((s) => s.v === i.status) + dir
    if (k >= 0 && k < STATUSES.length) await set(i, { status: STATUSES[k].v })
  }
  const fmt = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<div class="id">
  <header class="id__head">
    <span class="id__title"><Label label={tracker.string.Ideas} /></span>
    <nav class="tabs"><button class="tab" class:tab--active={tab === 'list'} on:click={() => { tab = 'list' }}>List</button><button class="tab" class:tab--active={tab === 'matrix'} on:click={() => { tab = 'matrix' }}>Impact × effort</button><button class="tab" class:tab--active={tab === 'board'} on:click={() => { tab = 'board' }}>Board</button></nav>
    <select class="input" bind:value={sortBy}><option value="rice">by RICE score</option><option value="votes">by votes</option><option value="new">newest</option></select>
    <label class="check"><input type="checkbox" bind:checked={hideClosed} /> hide shipped & declined</label>
    <span class="grow" />
    {#if project?.portal?.enabled}<span class="muted">Public board: <code>{integrationsUrl}/portal/{project.portal.slug}/ideas</code></span>{/if}
    <Button kind={'primary'} icon={IconAdd} label={tracker.string.NewIdea} on:click={() => { creating = !creating }} />
  </header>

  {#if creating}
    <section class="card card--edit motion-pop">
      <input class="input input--w" placeholder="Idea in one line" bind:value={nTitle} on:keydown={(e) => { if (e.key === 'Enter') void create() }} />
      <textarea class="input" rows="3" placeholder="Problem it solves, who asked, what we'd build" bind:value={nDesc} />
      <div class="row"><label class="check"><input type="checkbox" bind:checked={nPublic} /> public on the portal (customers can vote)</label><span class="grow" /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { creating = false }} /><Button kind={'primary'} label={tracker.string.Add} disabled={nTitle.trim() === ''} on:click={() => { void create() }} /></div>
    </section>
  {/if}

  <div class="body" class:body--split={open !== undefined}>
    <div class="main">
      {#if tab === 'list'}
        <div class="table-wrap"><table class="table">
          <thead><tr><th class="th th--l">Idea</th><th class="th">Status</th><th class="th">RICE</th><th class="th">Impact</th><th class="th">Effort</th><th class="th">Conf.</th><th class="th">Reach</th><th class="th">Votes</th><th class="th">Insights</th><th class="th th--l">Owner</th></tr></thead>
          <tbody>
            {#each shown as i, idx (i._id)}
              <tr class="motion-rise" class:tr--open={openId === i._id} style="--i: {Math.min(idx, 12)}" on:click={() => { openId = openId === i._id ? undefined : i._id }}>
                <td class="td td--l"><b>{i.title}</b>{#if i.public}<span class="pill">public</span>{/if}<div class="muted">{quadrant(i)}{i.tags.length > 0 ? ` · ${i.tags.join(', ')}` : ''}</div></td>
                <td class="td"><span class="st st--{i.status}">{STATUSES.find((s) => s.v === i.status)?.l}</span></td>
                <td class="td td--score">{rice(i)}</td>
                <td class="td">{i.impact}</td><td class="td">{i.effort}</td><td class="td">{i.confidence}</td><td class="td">{i.reach}</td>
                <td class="td"><button class="votebtn" class:votebtn--on={i.voters.includes(meUuid)} on:click|stopPropagation={() => { void vote(i) }}>▲ {i.voters.length}</button></td>
                <td class="td">{i.insights.length}</td>
                <td class="td td--l">{ownerName(i)}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        {#if shown.length === 0}<p class="muted">No ideas yet. Capture one, or let customers suggest on the portal.</p>{/if}
      {:else if tab === 'matrix'}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <svg bind:this={svgEl} viewBox="0 0 {MW} {MH}" class="matrix" on:pointermove={moveDrag} on:pointerup={() => { void endDrag() }} on:pointerleave={() => { void endDrag() }}>
          <rect x={PAD} y={PAD} width={(MW - 2 * PAD) / 2} height={(MH - 2 * PAD) / 2} class="q q--win" />
          <rect x={MW / 2} y={PAD} width={(MW - 2 * PAD) / 2} height={(MH - 2 * PAD) / 2} class="q q--bet" />
          <rect x={PAD} y={MH / 2} width={(MW - 2 * PAD) / 2} height={(MH - 2 * PAD) / 2} class="q q--fill" />
          <rect x={MW / 2} y={MH / 2} width={(MW - 2 * PAD) / 2} height={(MH - 2 * PAD) / 2} class="q q--sink" />
          <text x={PAD + 8} y={PAD + 16} class="qlabel">Quick wins</text><text x={MW - PAD - 8} y={PAD + 16} class="qlabel" text-anchor="end">Big bets</text>
          <text x={PAD + 8} y={MH - PAD - 8} class="qlabel">Fill-ins</text><text x={MW - PAD - 8} y={MH - PAD - 8} class="qlabel" text-anchor="end">Time sinks</text>
          <text x={MW / 2} y={MH - 8} class="axis" text-anchor="middle">effort →</text>
          <text x="10" y={MH / 2} class="axis" transform="rotate(-90 10 {MH / 2})" text-anchor="middle">impact →</text>
          {#each shown as i (i._id)}
            {@const p = pos(i)}
            <g class="dot" class:dot--drag={dragging?._id === i._id} role="button" tabindex="0" on:pointerdown={(e) => { startDrag(i, e) }} on:click={() => { if (dragging === undefined) openId = i._id }} on:keydown={(e) => { if (e.key === 'Enter') openId = i._id }}>
              <circle cx={xOf(p.effort)} cy={yOf(p.impact)} r={8 + Math.min(12, i.voters.length * 2)} class="dot__c dot__c--{i.status}" />
              <text x={xOf(p.effort) + 12 + Math.min(12, i.voters.length * 2)} y={yOf(p.impact) + 4} class="dot__t">{i.title.length > 28 ? i.title.slice(0, 27) + '…' : i.title}</text>
            </g>
          {/each}
        </svg>
        <p class="muted">Drag a dot to re-score it. Size = votes. High impact, low effort is the top-left.</p>
      {:else}
        <div class="board">
          {#each STATUSES as s (s.v)}
            {@const col = ideas.filter((i) => i.status === s.v).sort((a, b) => rice(b) - rice(a))}
            <div class="col"><span class="col__h">{s.l} <span class="muted">{col.length}</span></span>
              {#each col as i (i._id)}
                <button class="idcard motion-rise" class:idcard--open={openId === i._id} on:click={() => { openId = i._id }}>
                  <span class="idcard__t">{i.title}</span>
                  <span class="muted">RICE {rice(i)} · ▲ {i.voters.length}</span>
                  <span class="idcard__tools"><button class="mini" on:click|stopPropagation={() => { void moveStatus(i, -1) }}>◀</button><button class="mini" on:click|stopPropagation={() => { void moveStatus(i, 1) }}>▶</button></span>
                </button>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if open !== undefined}
      <aside class="drawer motion-pop">
        <div class="drawer__head"><input class="input input--title" value={open.title} on:change={(e) => { if (open !== undefined) void set(open, { title: e.currentTarget.value }) }} /><button class="x" on:click={() => { openId = undefined }}>×</button></div>
        <textarea class="input" rows="4" value={open.description} placeholder="Describe the idea" on:change={(e) => { if (open !== undefined) void set(open, { description: e.currentTarget.value }) }} />
        <div class="grid2">
          <label class="fld"><span>Status</span><select class="input" value={open.status} on:change={(e) => { if (open !== undefined) void setStatus(open, e.currentTarget.value) }}>{#each STATUSES as s}<option value={s.v}>{s.l}</option>{/each}</select></label>
          <label class="fld"><span>Owner</span><select class="input" value={open.owner ?? ''} on:change={(e) => { if (open !== undefined) void setOwner(open, e.currentTarget.value) }}><option value="">—</option>{#each employees as e (e._id)}<option value={e._id}>{formatName(e.name)}</option>{/each}</select></label>
          <label class="fld"><span>Goal</span><select class="input" value={open.goal ?? ''} on:change={(e) => { if (open !== undefined) void setGoal(open, e.currentTarget.value) }}><option value="">—</option>{#each goals as g (g._id)}<option value={g._id}>{g.name}</option>{/each}</select></label>
          <label class="fld"><span>Public</span><input type="checkbox" checked={open.public} on:change={(e) => { if (open !== undefined) void set(open, { public: e.currentTarget.checked }) }} /></label>
        </div>
        <div class="score">
          <div class="score__n"><span class="score__v">{rice(open)}</span><span class="muted">RICE</span></div>
          <div class="score__n"><span class="score__v">{ratio(open)}</span><span class="muted">impact / effort</span></div>
          <div class="score__n"><span class="score__v">▲ {open.voters.length}</span><button class="lnk" on:click={() => { if (open !== undefined) void vote(open) }}>{open.voters.includes(meUuid) ? 'unvote' : 'vote'}</button></div>
        </div>
        {#each SCORES as sc (sc.k)}
          <label class="slider"><span>{sc.l} <b>{open[sc.k]}</b></span><input type="range" min="1" max="5" step="0.5" value={open[sc.k]} on:change={(e) => { if (open !== undefined) void set(open, { [sc.k]: Number(e.currentTarget.value) }) }} /></label>
        {/each}
        <label class="fld"><span>Reach (people / month)</span><input class="input" type="number" min="0" value={open.reach} on:change={(e) => { if (open !== undefined) void set(open, { reach: Number(e.currentTarget.value) || 0 }) }} /></label>
        <label class="fld"><span>Tags</span><input class="input" placeholder="comma-separated" value={open.tags.join(', ')} on:change={(e) => { if (open !== undefined) void set(open, { tags: e.currentTarget.value.split(',').map((t) => t.trim()).filter((t) => t !== '') }) }} /></label>
        <div class="sec"><span class="sec__h"><Label label={tracker.string.Insights} /> · {open.insights.length}</span>
          {#each open.insights as ins, k}
            <div class="ins"><span>{ins.text}</span>{#if ins.url}<a href={ins.url} target="_blank" rel="noopener noreferrer">↗</a>{/if}<span class="muted">{ins.by ?? ''} {fmt(ins.at)}</span><button class="x" on:click={() => { if (open !== undefined) void set(open, { insights: open.insights.filter((_, i) => i !== k) }) }}>×</button></div>
          {/each}
          <div class="row"><input class="input input--w" placeholder="Quote, observation, request…" bind:value={insightText} /><input class="input" placeholder="link (optional)" bind:value={insightUrl} /><button class="lnk" on:click={() => { if (open !== undefined) void addInsight(open) }}>add</button></div>
        </div>
        <div class="sec"><span class="sec__h">Linked work · {open.linkedIssues.length}</span>
          {#each linked as l (l._id)}<button class="lnk" on:click={() => { showPanel(view.component.EditDoc, l._id, l._class, 'content') }}>{l.identifier} {l.title}</button>{/each}
          <div class="row"><input class="input" placeholder="KEY-12" bind:value={linkKey} on:keydown={(e) => { if (e.key === 'Enter' && open !== undefined) void linkIssue(open) }} /><button class="lnk" on:click={() => { if (open !== undefined) void linkIssue(open) }}>link</button><span class="grow" /><Button kind={'primary'} label={tracker.string.PromoteToEpic} on:click={() => { if (open !== undefined) void promote(open) }} /></div>
          {#if epics.length > 0}<span class="muted">{epics.length} epics in this project already.</span>{/if}
        </div>
        <button class="lnk lnk--bad" on:click={() => { if (open !== undefined) void remove(open) }}>delete idea</button>
      </aside>
    {/if}
  </div>
</div>

<style lang="scss">
  .id { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.25rem; height: 100%; min-height: 0; overflow: auto; }
  .id__head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .id__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .grow { flex: 1; }
  .tabs { display: flex; gap: 0.25rem; }
  .tab { padding: 0.3rem 0.7rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &--active { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--theme-caption-color); } }
  .input { padding: 0.35rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--w { flex: 1; min-width: 10rem; } &--title { flex: 1; font-weight: 600; font-size: 0.95rem; } }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { margin: 0; font-size: 0.75rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); &--edit { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .body { display: grid; grid-template-columns: 1fr; gap: 1rem; min-height: 0; &--split { grid-template-columns: minmax(0, 1fr) 26rem; } }
  .main { min-width: 0; }
  .table-wrap { overflow-x: auto; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); text-align: center; white-space: nowrap; &--l { text-align: left; white-space: normal; } }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .td { color: var(--theme-content-color); cursor: pointer; b { color: var(--theme-caption-color); } &--score { font-weight: 700; color: var(--theme-caption-color); } }
  tr:hover .td { background: var(--theme-button-hovered); }
  .tr--open .td { background: var(--accent-brand-soft); }
  .pill { margin-left: 0.4rem; padding: 0.02rem 0.45rem; border-radius: 999px; font-size: 0.65rem; font-weight: 600; background: var(--accent-brand-soft); color: var(--theme-caption-color); }
  .st { padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--validated { background: color-mix(in srgb, var(--primary-button-default) 25%, transparent); } &--planned { background: var(--accent-brand-soft); } &--shipped { background: var(--accent-brand); color: #1a2400; } &--declined { opacity: 0.6; } }
  .votebtn { padding: 0.15rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.75rem; cursor: pointer; &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); font-weight: 600; } }
  .matrix { width: 100%; max-width: 60rem; height: auto; touch-action: none; user-select: none; }
  .q { fill: var(--theme-button-pressed); stroke: var(--theme-divider-color); &--win { fill: var(--accent-brand-soft); } &--bet { fill: color-mix(in srgb, var(--primary-button-default) 12%, transparent); } &--sink { fill: color-mix(in srgb, var(--negative-button-default) 8%, transparent); } }
  .qlabel { fill: var(--theme-dark-color); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .axis { fill: var(--theme-trans-color); font-size: 11px; }
  .dot { cursor: grab; &--drag { cursor: grabbing; } }
  .dot__c { fill: var(--primary-button-default); fill-opacity: 0.85; stroke: var(--theme-panel-color); stroke-width: 2; &--planned { fill: var(--accent-brand); } &--shipped { fill: var(--accent-brand); fill-opacity: 0.5; } &--declined { fill: var(--theme-trans-color); } &--validated { fill: #6a45f5; } }
  .dot__t { fill: var(--theme-caption-color); font-size: 11px; pointer-events: none; }
  .board { display: grid; grid-template-columns: repeat(6, minmax(11rem, 1fr)); gap: 0.6rem; overflow-x: auto; }
  .col { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); min-width: 0; }
  .col__h { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .idcard { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &--open { border-color: var(--accent-brand); } }
  .idcard__t { font-weight: 600; color: var(--theme-caption-color); }
  .idcard__tools { display: flex; gap: 0.2rem; }
  .mini { width: 1.4rem; height: 1.4rem; border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; background: transparent; color: var(--theme-dark-color); font: inherit; font-size: 0.65rem; cursor: pointer; }
  .drawer { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem; border: 1px solid var(--accent-brand); border-radius: 0.75rem; background: var(--theme-panel-color); box-shadow: 0 0 0 3px var(--accent-brand-soft); align-self: start; position: sticky; top: 0; }
  .drawer__head { display: flex; align-items: center; gap: 0.4rem; }
  .x { border: none; background: transparent; color: var(--theme-trans-color); font: inherit; font-size: 1rem; cursor: pointer; &:hover { color: var(--negative-button-default); } }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .fld { display: flex; flex-direction: column; gap: 0.2rem; span { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); } }
  .score { display: flex; gap: 1.2rem; padding: 0.5rem 0; }
  .score__n { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; }
  .score__v { font-size: 1.3rem; font-weight: 700; color: var(--theme-caption-color); }
  .slider { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; color: var(--theme-dark-color); b { color: var(--theme-caption-color); } input { accent-color: var(--accent-brand); } }
  .sec { display: flex; flex-direction: column; gap: 0.35rem; padding-top: 0.5rem; border-top: 1px solid var(--theme-divider-color); }
  .sec__h { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .ins { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.8125rem; color: var(--theme-content-color); span:first-child { flex: 1; } a { color: var(--primary-button-default); text-decoration: none; } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.8125rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); font-size: 0.75rem; } }
</style>
