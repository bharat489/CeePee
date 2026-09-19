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
  Project summary, laid out like Jira's: a member filter row; four KPI cards
  (completed, updated, created, due soon in 7 days); status overview donut;
  an automations starter card; recent activity; priority breakdown bar chart;
  types of work; team workload; epic progress. Every number is live and every
  link goes somewhere in this project.
-->
<script lang="ts">
  import activity, { type DocUpdateMessage } from '@hcengineering/activity'
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import { Avatar, getPersonRefByPersonIdStore } from '@hcengineering/contact-resources'
  import { SortingOrder, type PersonId, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'
  import { icon } from './icons'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const dispatch = createEventDispatcher()
  const DAY = 86_400_000
  const iq = createQuery()
  const sq = createQuery()
  const eq = createQuery()
  const aq = createQuery()
  let issues: Issue[] = []
  let statuses: IssueStatus[] = []
  let employees: Employee[] = []
  let feed: DocUpdateMessage[] = []
  $: iq.query(tracker.class.Issue, { space: currentSpace }, (r) => { issues = r }, { limit: 5000 })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: aq.query(activity.class.DocUpdateMessage, { objectClass: tracker.class.Issue, space: currentSpace }, (r) => { feed = r }, { sort: { createdOn: SortingOrder.Descending }, limit: 12 })
  $: cat = new Map(statuses.map((s) => [s._id, s.category]))
  $: bucket = (i: Issue): 'todo' | 'doing' | 'done' => { const c = cat.get(i.status); return c === task.statusCategory.Won || c === task.statusCategory.Lost ? 'done' : c === task.statusCategory.Active ? 'doing' : 'todo' }
  $: live = issues.filter((i) => i.archived !== true)
  $: byId = new Map(employees.map((e) => [e._id as Ref<Person>, e]))
  $: nameOf = (id: Ref<Person> | null | undefined): string => (id == null ? 'Unassigned' : byId.get(id) !== undefined ? formatName(byId.get(id)?.name ?? '') : '…')

  // ---- member filter row ------------------------------------------------------------------------
  let who = new Set<string>()
  let filterOpen = false
  $: assignees = Array.from(new Set(live.map((i) => i.assignee).filter((x): x is Ref<Person> => x != null)))
  $: hasUnassigned = live.some((i) => i.assignee == null)
  function toggleWho (k: string): void {
    const next = new Set(who)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    who = next
  }
  $: scope = who.size === 0 ? live : live.filter((i) => who.has(i.assignee == null ? 'unassigned' : i.assignee))
  $: open = scope.filter((i) => bucket(i) !== 'done')

  // ---- KPIs -----------------------------------------------------------------------------------------
  $: now = Date.now()
  $: kpis = [
    { n: scope.filter((i) => bucket(i) === 'done' && i.modifiedOn >= now - 7 * DAY).length, l: 'completed', s: 'in the last 7 days', ic: 'check', tone: 'green' },
    { n: scope.filter((i) => i.modifiedOn >= now - 7 * DAY).length, l: 'updated', s: 'in the last 7 days', ic: 'edit', tone: 'grey' },
    { n: scope.filter((i) => (i.createdOn ?? 0) >= now - 7 * DAY).length, l: 'created', s: 'in the last 7 days', ic: 'created', tone: 'grey' },
    { n: open.filter((i) => i.dueDate != null && i.dueDate >= now && i.dueDate <= now + 7 * DAY).length, l: 'due soon', s: 'in the next 7 days', ic: 'due', tone: 'grey' }
  ]

  // ---- status overview ------------------------------------------------------------------------------
  const C = { done: '#388bff', doing: '#7fbb3b', todo: '#a077f0', grey: '#8590a2', track: '#dcdfe4', blue: '#0c66e4', green: '#6a9a23' }
  $: counts = { done: scope.filter((i) => bucket(i) === 'done').length, doing: scope.filter((i) => bucket(i) === 'doing').length, todo: scope.filter((i) => bucket(i) === 'todo').length }
  $: total = scope.length
  function arc (start: number, end: number): string {
    const r = 40
    const a0 = start * 2 * Math.PI - Math.PI / 2
    const a1 = Math.min(end, 0.99999) * 2 * Math.PI - Math.PI / 2
    return `M${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)} A${r} ${r} 0 ${end - start > 0.5 ? 1 : 0} 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)}`
  }
  $: segs = [{ k: 'done', l: 'Done', n: counts.done, c: C.done }, { k: 'doing', l: 'In Progress', n: counts.doing, c: C.doing }, { k: 'todo', l: 'To Do', n: counts.todo, c: C.todo }]

  // ---- recent activity --------------------------------------------------------------------------------
  $: feedPids = Array.from(new Set(feed.map((m) => m.createdBy ?? m.modifiedBy)))
  $: personRefs = getPersonRefByPersonIdStore(feedPids)
  $: issueById = new Map(issues.map((i) => [i._id, i]))
  const verb = (m: DocUpdateMessage): string => {
    if (m.action === 'create') return 'created'
    const k = m.attributeUpdates?.attrKey
    if (k === 'status') return 'changed the status of'
    if (k === 'assignee') return 'reassigned'
    if (k === 'priority') return 'changed the priority of'
    if (k === 'dueDate') return 'changed the due date of'
    if (k === 'title') return 'renamed'
    if (k === 'sprint') return 'moved to a sprint'
    return 'updated'
  }
  const ago = (t: number): string => { const m = Math.floor((Date.now() - t) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago` }
  const issueOf = (m: DocUpdateMessage): Issue | undefined => issueById.get(m.objectId as Ref<Issue>)
  const personOf = (pid: PersonId | undefined): Employee | undefined => (pid === undefined ? undefined : byId.get($personRefs.get(pid) as Ref<Person>))

  // ---- priority breakdown ---------------------------------------------------------------------------
  const PRIO: Array<{ p: IssuePriority, l: string, ic: string, c: string }> = [
    { p: IssuePriority.Urgent, l: 'Urgent', ic: 'urgent', c: '#c9372c' }, { p: IssuePriority.High, l: 'High', ic: 'high', c: '#c9372c' }, { p: IssuePriority.Medium, l: 'Medium', ic: 'medium', c: '#e56910' }, { p: IssuePriority.Low, l: 'Low', ic: 'low', c: '#0c66e4' }, { p: IssuePriority.NoPriority, l: 'None', ic: 'none', c: '#8590a2' }
  ]
  $: prio = PRIO.map((x) => ({ ...x, n: open.filter((i) => i.priority === x.p).length }))
  const W = 520
  const H = 220
  const M = { l: 40, r: 12, t: 14, b: 44 }
  function ticks (max: number): number[] {
    if (max <= 0) return [0, 1]
    const raw = max / 4
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? mag
    const out: number[] = []
    for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v * 100) / 100)
    return out
  }
  $: ptk = ticks(Math.max(1, ...prio.map((x) => x.n)))
  $: ptop = ptk[ptk.length - 1]
  const yOf = (v: number, max: number): number => M.t + (H - M.t - M.b) * (1 - v / max)
  const xOf = (k: number, n: number): number => M.l + ((W - M.l - M.r) / n) * (k + 0.5)
  let hoverPrio: number | undefined

  // ---- types of work ------------------------------------------------------------------------------------
  const kindOf = (i: Issue): string => (i.kind === tracker.taskTypes.Epic ? 'Epic' : i.kind === tracker.taskTypes.Initiative ? 'Initiative' : i.requestType != null ? 'Request' : i.parents.length > 0 ? 'Sub-task' : 'Issue')
  const TYPES = [{ l: 'Issue', ic: 'issue', c: '#388bff' }, { l: 'Sub-task', ic: 'subtask', c: '#6554c0' }, { l: 'Epic', ic: 'epic', c: '#904ee2' }, { l: 'Initiative', ic: 'initiative', c: '#f38a3f' }, { l: 'Request', ic: 'request', c: '#2898bd' }]
  $: types = TYPES.map((t) => ({ ...t, n: scope.filter((i) => kindOf(i) === t.l).length })).filter((t, k) => t.n > 0 || k < 4)
  const pct = (n: number, of: number): number => (of === 0 ? 0 : Math.round((n / of) * 100))

  // ---- team workload ----------------------------------------------------------------------------------------
  $: workload = [...(open.some((i) => i.assignee == null) ? [{ id: 'unassigned', p: undefined as Employee | undefined, n: open.filter((i) => i.assignee == null).length }] : []), ...Array.from(open.reduce((m, i) => { if (i.assignee != null) m.set(i.assignee, (m.get(i.assignee) ?? 0) + 1); return m }, new Map<Ref<Person>, number>()).entries()).map(([id, n]) => ({ id: id as string, p: byId.get(id), n })).sort((a, b) => b.n - a.n)]

  // ---- epic progress ------------------------------------------------------------------------------------------
  $: epics = live.filter((i) => i.kind === tracker.taskTypes.Epic).map((e) => {
    const kids = scope.filter((i) => i.parents.some((p) => p.parentId === e._id))
    const done = kids.filter((i) => bucket(i) === 'done').length
    const doing = kids.filter((i) => bucket(i) === 'doing').length
    return { e, total: kids.length, done, doing, todo: kids.length - done - doing }
  }).sort((a, b) => b.total - a.total).slice(0, 6)

  const openIssue = (i: Issue): void => { showPanel(view.component.EditDoc, i._id, i._class, 'content') }
  const go = (t: string): void => { dispatch('go', t) }
  function closeFilter (e: MouseEvent): void {
    if ((e.target as HTMLElement | null)?.closest('.sm__filter-wrap') === null) filterOpen = false
  }
</script>

<svelte:window on:click={closeFilter} />

<div class="sm">
  <div class="sm__filters">
    <div class="sm__avatars">
      <button class="av av--all" class:av--on={who.size === 0} title="Everyone" on:click={() => { who = new Set() }}>{@html icon('people')}</button>
      {#each assignees.slice(0, 8) as id (id)}
        {@const e = byId.get(id)}
        <button class="av" class:av--on={who.has(id)} title={nameOf(id)} on:click={() => { toggleWho(id) }}>{#if e !== undefined}<Avatar person={e} size={'small'} name={e.name} />{:else}<span class="av__ph">?</span>{/if}</button>
      {/each}
      {#if hasUnassigned}<button class="av av--un" class:av--on={who.has('unassigned')} title="Unassigned" on:click={() => { toggleWho('unassigned') }}>?</button>{/if}
    </div>
    <span class="sm__filter-wrap">
      <button class="btn" class:btn--on={filterOpen} on:click|stopPropagation={() => { filterOpen = !filterOpen }}>{@html icon('filter')} Filter{#if who.size > 0}<span class="btn__n">{who.size}</span>{/if}</button>
      {#if filterOpen}
        <div class="menu">
          <span class="menu__t">Assignee</span>
          {#each assignees as id (id)}<label class="menu__row"><input type="checkbox" checked={who.has(id)} on:change={() => { toggleWho(id) }} />{nameOf(id)}</label>{/each}
          {#if hasUnassigned}<label class="menu__row"><input type="checkbox" checked={who.has('unassigned')} on:change={() => { toggleWho('unassigned') }} />Unassigned</label>{/if}
          {#if who.size > 0}<button class="lnk menu__clear" on:click={() => { who = new Set() }}>Clear filters</button>{/if}
        </div>
      {/if}
    </span>
  </div>

  <div class="kpis">
    {#each kpis as k (k.l)}
      <div class="kpi"><span class="kpi__ic kpi__ic--{k.tone}">{@html icon(k.ic)}</span><div class="kpi__t"><b>{k.n} {k.l}</b><span>{k.s}</span></div></div>
    {/each}
  </div>

  <div class="row2">
    <section class="card">
      <h3 class="card__t">Status overview</h3>
      <p class="card__s">Get a snapshot of the status of your work items. <button class="lnk" on:click={() => { go('list') }}>View all work items</button></p>
      <div class="donut">
        <svg viewBox="0 0 100 100" class="donut__svg" role="img">
          <circle cx="50" cy="50" r="40" class="donut__track" />
          {#each segs.filter((s) => s.n > 0) as s, k (s.k)}
            {@const before = segs.filter((x) => x.n > 0).slice(0, k).reduce((a, x) => a + x.n, 0)}
            <path d={arc(before / Math.max(1, total), (before + s.n) / Math.max(1, total))} stroke={s.c} class="donut__seg"><title>{s.l}: {s.n}</title></path>
          {/each}
          <text x="50" y="48" text-anchor="middle" class="donut__n">{total}</text>
          <text x="50" y="60" text-anchor="middle" class="donut__l">Total work items</text>
        </svg>
        <ul class="legend">{#each segs as s (s.k)}<li><i class="sw" style="background: {s.c}" />{s.l}: {s.n}</li>{/each}</ul>
      </div>
    </section>

    <section class="card card--auto">
      <div class="auto__icons"><span class="auto__ic auto__ic--p">{@html icon('automation')}</span><span class="auto__ic auto__ic--b">{@html icon('sparkle')}</span></div>
      <h3 class="card__t auto__t">Get started with automations</h3>
      <p class="card__s auto__s">Let CeePee analyze the project and share updates with your team, on a schedule or when work changes.</p>
      <div class="auto__list">
        {#each [{ t: 'Delivery health check', s: 'Surface delivery risks and health signals.', ch: ['mail'] }, { t: 'Stakeholder status update', s: 'Inform stakeholders of progress and completed work.', ch: ['mail'] }, { t: 'Daily standup', s: 'Summarize progress and blockers for your team.', ch: ['chat'] }] as a (a.t)}
          <div class="auto__row">
            <span class="auto__bolt">{@html icon('automation')}</span>
            <div class="auto__txt"><b>{a.t}</b><span>{a.s}</span></div>
            <span class="auto__ch">{#each a.ch as c}<i class="auto__chip">{@html icon(c)}</i>{/each}</span>
            <button class="btn btn--sm" on:click={() => { go('automation') }}>Set up</button>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <section class="card">
    <h3 class="card__t">Recent activity</h3>
    <p class="card__s">Stay up to date with what's happening across the project.</p>
    <div class="feed">
      {#each feed as m (m._id)}
        {@const p = personOf(m.createdBy ?? m.modifiedBy)}
        {@const i = issueOf(m)}
        <button class="feed__row" on:click={() => { if (i !== undefined) openIssue(i) }}>
          <span class="feed__av">{#if p !== undefined}<Avatar person={p} size={'small'} name={p.name} />{:else}<span class="av__ph">·</span>{/if}</span>
          <span class="feed__txt"><b>{p !== undefined ? formatName(p.name) : 'Someone'}</b> {verb(m)} <span class="feed__key">{i?.identifier ?? ''}</span> · {i?.title ?? 'a work item'}</span>
          <span class="feed__t">{ago(m.createdOn ?? m.modifiedOn)}</span>
        </button>
      {/each}
      {#if feed.length === 0}<p class="empty">No activity yet. Create the first work item from the List tab.</p>{/if}
    </div>
  </section>

  <div class="row2">
    <section class="card">
      <h3 class="card__t">Priority breakdown</h3>
      <p class="card__s">Get a holistic view of how your work is being prioritized. <button class="lnk" on:click={() => { go('list') }}>How to manage priorities for spaces</button></p>
      <svg viewBox="0 0 {W} {H}" class="chart" role="img" on:mouseleave={() => { hoverPrio = undefined }}>
        {#each ptk as v}<line x1={M.l} x2={W - M.r} y1={yOf(v, ptop)} y2={yOf(v, ptop)} class="grid" /><text x={M.l - 8} y={yOf(v, ptop) + 4} text-anchor="end" class="ax">{v}</text>{/each}
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} class="axis" />
        {#each prio as x, k (x.l)}
          {@const bw = Math.min(90, ((W - M.l - M.r) / prio.length) * 0.62)}
          <rect x={xOf(k, prio.length) - bw / 2} y={yOf(x.n, ptop)} width={bw} height={H - M.b - yOf(x.n, ptop)} class="pbar" class:pbar--hover={hoverPrio === k} on:mouseenter={() => { hoverPrio = k }} />
          <g transform="translate({xOf(k, prio.length) - 30} {H - M.b + 10})"><g transform="translate(0 0)" style="color: {x.c}">{@html icon(x.ic)}</g><text x="20" y="12" class="ax ax--cat">{x.l}</text></g>
        {/each}
        {#if hoverPrio !== undefined}
          {@const x = prio[hoverPrio]}
          {@const hx = Math.min(W - 100, Math.max(M.l, xOf(hoverPrio, prio.length) - 40))}
          {@const hy = Math.max(M.t, yOf(x.n, ptop) - 50)}
          <g class="tip"><rect x={hx} y={hy} width="90" height="42" rx="4" /><text x={hx + 10} y={hy + 17} class="tip__t">{x.l}</text><rect x={hx + 10} y={hy + 25} width="9" height="9" rx="1.5" class="tip__sw" /><text x={hx + 25} y={hy + 33} class="tip__v">{x.n}</text></g>
        {/if}
      </svg>
    </section>

    <section class="card">
      <h3 class="card__t">Types of work</h3>
      <p class="card__s">Get a breakdown of work items by their types. <button class="lnk" on:click={() => { go('list') }}>View all items</button></p>
      <div class="tbl">
        <div class="tbl__h"><span>Type</span><span>Distribution</span></div>
        {#each types as t (t.l)}
          <div class="tbl__r"><span class="tbl__name"><i class="tico" style="color: {t.c}">{@html icon(t.ic)}</i>{t.l}</span><span class="track"><span class="fill" style="width: {pct(t.n, total)}%">{#if pct(t.n, total) >= 8}{pct(t.n, total)}%{/if}</span></span></div>
        {/each}
      </div>
    </section>
  </div>

  <div class="row2">
    <section class="card">
      <h3 class="card__t">Team workload</h3>
      <p class="card__s">Monitor the capacity of your team. <button class="lnk" on:click={() => { go('list') }}>Reassign work items to get the right balance</button></p>
      <div class="tbl">
        <div class="tbl__h"><span>Assignee</span><span>Work distribution</span></div>
        {#each workload as w (w.id)}
          <div class="tbl__r"><span class="tbl__name">{#if w.p !== undefined}<Avatar person={w.p} size={'small'} name={w.p.name} />{formatName(w.p.name)}{:else}<span class="av__ph av__ph--sm">?</span>Unassigned{/if}</span><span class="track"><span class="fill" style="width: {pct(w.n, open.length)}%">{#if pct(w.n, open.length) >= 8}{pct(w.n, open.length)}%{/if}</span></span></div>
        {/each}
        {#if workload.length === 0}<p class="empty">No open work.</p>{/if}
      </div>
    </section>

    <section class="card">
      <h3 class="card__t">Epic progress</h3>
      <p class="card__s">See how your epics are progressing at a glance. <button class="lnk" on:click={() => { go('epics') }}>View all epics</button></p>
      <ul class="legend legend--left"><li><i class="sw" style="background: {C.green}" />Done</li><li><i class="sw" style="background: {C.blue}" />In progress</li><li><i class="sw" style="background: {C.grey}" />To do</li></ul>
      <div class="epics">
        {#each epics as x (x.e._id)}
          <div class="epic">
            <button class="epic__name" on:click={() => { openIssue(x.e) }}><i class="tico" style="color: #904ee2">{@html icon('epic')}</i><span class="epic__key">{x.e.identifier}</span>{x.e.title}</button>
            <div class="stack">
              {#if x.total === 0}<span class="stack__seg" style="width: 100%; background: {C.track}; color: #626f86">no child work items</span>
              {:else}
                {#if x.done > 0}<span class="stack__seg" style="width: {pct(x.done, x.total)}%; background: {C.green}">{pct(x.done, x.total) >= 8 ? `${pct(x.done, x.total)}%` : ''}</span>{/if}
                {#if x.doing > 0}<span class="stack__seg" style="width: {pct(x.doing, x.total)}%; background: {C.blue}">{pct(x.doing, x.total) >= 8 ? `${pct(x.doing, x.total)}%` : ''}</span>{/if}
                {#if x.todo > 0}<span class="stack__seg" style="width: {pct(x.todo, x.total)}%; background: {C.grey}">{pct(x.todo, x.total) >= 8 ? `${pct(x.todo, x.total)}%` : ''}</span>{/if}
              {/if}
            </div>
          </div>
        {/each}
        {#if epics.length === 0}<p class="empty">No epics yet. Create one from More → Epics to group related work.</p>{/if}
      </div>
    </section>
  </div>
</div>

<style lang="scss">
  .sm { --j-text: #172b4d; --j-sub: #626f86; --j-link: #0c66e4; --j-border: rgba(9, 30, 66, 0.14); --j-surface: #fff; --j-hover: rgba(9, 30, 66, 0.06); --j-track: #dcdfe4; --j-fill: #8590a2; --j-grid: #dcdfe4;
    display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem 1.5rem 2rem; overflow: auto; color: var(--j-text); }
  :global(.theme-dark) .sm { --j-text: #b6c2cf; --j-sub: #8c9bab; --j-link: #579dff; --j-border: #38414a; --j-surface: #22272b; --j-hover: rgba(255, 255, 255, 0.08); --j-track: #38414a; --j-fill: #738496; --j-grid: #38414a; }
  .sm__filters { display: flex; align-items: center; gap: 0.75rem; }
  .sm__avatars { display: flex; align-items: center; }
  .av { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; margin-right: -0.35rem; padding: 0; border: 2px solid var(--j-surface); border-radius: 50%; background: var(--j-track); color: var(--j-sub); cursor: pointer; transition: transform 0.12s ease; overflow: hidden; &:hover { transform: translateY(-2px); z-index: 2; } &--on { box-shadow: 0 0 0 2px var(--j-link); z-index: 1; } &--all { background: #f1f2f4; } &--un { font-weight: 700; } :global(svg) { width: 1rem; height: 1rem; } }
  .av__ph { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: var(--j-track); color: var(--j-sub); font-size: 0.75rem; font-weight: 700; &--sm { width: 1.5rem; height: 1.5rem; } }
  .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); color: var(--j-text); font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; &:hover { background: var(--j-hover); } &--on { background: var(--j-hover); } &--sm { padding: 0.3rem 0.7rem; font-size: 0.8125rem; } :global(svg) { width: 1rem; height: 1rem; } }
  .btn__n { padding: 0 0.4rem; border-radius: 999px; background: var(--j-link); color: #fff; font-size: 0.7rem; font-weight: 700; }
  .sm__filter-wrap { position: relative; }
  .menu { position: absolute; left: 0; top: calc(100% + 0.25rem); z-index: 20; display: flex; flex-direction: column; min-width: 14rem; padding: 0.5rem; border: 1px solid var(--j-border); border-radius: 0.35rem; background: var(--j-surface); box-shadow: 0 8px 12px rgba(9, 30, 66, 0.15), 0 0 1px rgba(9, 30, 66, 0.31); }
  .menu__t { padding: 0.25rem 0.5rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--j-sub); }
  .menu__row { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; cursor: pointer; &:hover { background: var(--j-hover); } }
  .menu__clear { padding: 0.35rem 0.5rem; text-align: left; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
  .kpi { display: flex; align-items: center; gap: 0.9rem; padding: 1.1rem 1.25rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); }
  .kpi__ic { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: 0.25rem; background: #f1f2f4; color: #44546f; :global(svg) { width: 1.1rem; height: 1.1rem; } &--green { background: #dcfff1; color: #1f845a; } }
  :global(.theme-dark) .kpi__ic { background: #2c333a; color: #b6c2cf; &--green { background: #164b35; color: #7ee2b8; } }
  .kpi__t { display: flex; flex-direction: column; b { font-size: 1rem; font-weight: 600; color: var(--j-text); } span { font-size: 0.8125rem; color: var(--j-sub); } }
  .row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr)); gap: 1rem; }
  .card { display: flex; flex-direction: column; gap: 0.35rem; padding: 1.25rem 1.5rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); min-width: 0; &--auto { align-items: center; text-align: center; } }
  .card__t { margin: 0; font-size: 1rem; font-weight: 600; color: var(--j-text); }
  .card__s { margin: 0 0 0.5rem; font-size: 0.875rem; color: var(--j-sub); }
  .lnk { padding: 0; border: none; background: transparent; color: var(--j-link); font: inherit; font-size: inherit; cursor: pointer; &:hover { text-decoration: underline; } }
  .empty { margin: 0.25rem 0 0; font-size: 0.875rem; color: var(--j-sub); }
  .donut { display: flex; align-items: center; justify-content: center; gap: 2.5rem; flex-wrap: wrap; padding: 0.5rem 0; }
  .donut__svg { width: 13rem; height: 13rem; }
  .donut__track { fill: none; stroke: var(--j-track); stroke-width: 16; }
  .donut__seg { fill: none; stroke-width: 16; transition: stroke-width 0.15s ease; &:hover { stroke-width: 18; } }
  .donut__n { fill: var(--j-text); font-size: 20px; font-weight: 700; }
  .donut__l { fill: var(--j-text); font-size: 7.5px; }
  .legend { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; color: var(--j-text); li { display: inline-flex; align-items: center; gap: 0.5rem; } &--left { flex-direction: row; gap: 1rem; margin-bottom: 0.5rem; font-weight: 500; color: var(--j-sub); } }
  .sw { width: 0.75rem; height: 0.75rem; border-radius: 2px; flex-shrink: 0; }
  .auto__icons { display: flex; gap: 0.25rem; margin: 0.5rem 0 0.75rem; }
  .auto__ic { display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 0.6rem; color: #fff; :global(svg) { width: 1.3rem; height: 1.3rem; } &--p { background: #ae4cff; transform: rotate(-6deg); } &--b { background: #0c66e4; transform: rotate(6deg) translateY(-4px); } }
  .auto__t { font-size: 1.05rem; }
  .auto__s { max-width: 30rem; }
  .auto__list { display: flex; flex-direction: column; width: 100%; margin-top: 0.5rem; }
  .auto__row { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 0.75rem; padding: 0.6rem 0.25rem; border-top: 1px solid var(--j-border); text-align: left; }
  .auto__bolt { display: inline-flex; color: var(--j-sub); :global(svg) { width: 1rem; height: 1rem; } }
  .auto__txt { display: flex; flex-direction: column; min-width: 0; b { font-size: 0.875rem; font-weight: 500; color: var(--j-text); } span { font-size: 0.75rem; color: var(--j-sub); } }
  .auto__ch { display: inline-flex; gap: 0.3rem; }
  .auto__chip { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 0.25rem; background: #e9f2ff; color: #0c66e4; :global(svg) { width: 0.85rem; height: 0.85rem; } }
  .feed { display: flex; flex-direction: column; }
  .feed__row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.75rem; width: 100%; padding: 0.5rem 0.25rem; border: none; border-top: 1px solid var(--j-border); background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; &:hover { background: var(--j-hover); } &:first-child { border-top: none; } }
  .feed__av { display: inline-flex; }
  .feed__txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; b { font-weight: 600; } }
  .feed__key { color: var(--j-link); font-weight: 600; }
  .feed__t { font-size: 0.75rem; color: var(--j-sub); white-space: nowrap; }
  .chart { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--j-grid); }
  .axis { stroke: var(--j-sub); }
  .ax { fill: var(--j-sub); font-size: 11px; &--cat { fill: var(--j-text); font-size: 12px; } }
  .pbar { fill: var(--j-fill); opacity: 0.55; transition: opacity 0.12s ease; &--hover, &:hover { opacity: 1; } }
  .tip rect:first-child { fill: var(--j-surface); stroke: var(--j-border); filter: drop-shadow(0 2px 6px rgba(9, 30, 66, 0.2)); }
  .tip__t { fill: var(--j-sub); font-size: 11px; }
  .tip__sw { fill: var(--j-fill); }
  .tip__v { fill: var(--j-text); font-size: 12px; font-weight: 600; }
  .tbl { display: flex; flex-direction: column; }
  .tbl__h { display: grid; grid-template-columns: 11rem 1fr; gap: 1rem; padding: 0.25rem 0 0.5rem; font-size: 0.75rem; font-weight: 700; color: var(--j-sub); }
  .tbl__r { display: grid; grid-template-columns: 11rem 1fr; align-items: center; gap: 1rem; padding: 0.4rem 0; font-size: 0.875rem; }
  .tbl__name { display: inline-flex; align-items: center; gap: 0.5rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tico { display: inline-flex; :global(svg) { width: 1rem; height: 1rem; } }
  .track { display: block; height: 1.5rem; border-radius: 3px; background: var(--j-track); overflow: hidden; }
  .fill { display: flex; align-items: center; height: 100%; padding-left: 0.5rem; border-radius: 3px; background: var(--j-fill); color: #fff; font-size: 0.8125rem; font-weight: 600; white-space: nowrap; transition: width 0.4s ease; }
  .epics { display: flex; flex-direction: column; gap: 0.75rem; }
  .epic { display: flex; flex-direction: column; gap: 0.35rem; }
  .epic__name { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0; border: none; background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; &:hover { color: var(--j-link); } }
  .epic__key { color: var(--j-sub); }
  .stack { display: flex; width: 100%; height: 1.5rem; border-radius: 3px; background: var(--j-track); overflow: hidden; }
  .stack__seg { display: flex; align-items: center; justify-content: flex-start; padding-left: 0.5rem; color: #fff; font-size: 0.8125rem; font-weight: 600; white-space: nowrap; overflow: hidden; transition: width 0.4s ease; }
</style>
