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
  Calendar: the project's month, with every issue on its due date, milestone
  targets and sprint start/end. Drag an issue to another day to re-date it.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const iq = createQuery()
  const sq = createQuery()
  const mq = createQuery()
  const spq = createQuery()
  let issues: Issue[] = []
  let statuses: IssueStatus[] = []
  let milestones: Milestone[] = []
  let sprints: Sprint[] = []
  const DAY = 86_400_000
  let cursor = new Date()
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  $: from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime()
  $: to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime()
  $: iq.query(tracker.class.Issue, { space: currentSpace, dueDate: { $gte: from - 7 * DAY, $lt: to + 7 * DAY } }, (r) => { issues = r }, { limit: 2000 })
  const uq = createQuery()
  let unscheduled: Issue[] = []
  $: uq.query(tracker.class.Issue, { space: currentSpace, dueDate: null, archived: { $ne: true } }, (r) => { unscheduled = r }, { limit: 500, sort: { modifiedOn: SortingOrder.Descending } })
  let showUnscheduled = true
  let mode: 'month' | 'week' = 'month'
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: mq.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r })
  $: spq.query(tracker.class.Sprint, { space: currentSpace }, (r) => { sprints = r })
  $: done = new Set(statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id))
  let hideDone = true

  interface Cell { t: number, inMonth: boolean, today: boolean, issues: Issue[], marks: string[] }
  $: cells = ((): Cell[] => {
    const first = new Date(from)
    const lead = (first.getDay() + 6) % 7
    const todayT = new Date(); todayT.setHours(0, 0, 0, 0)
    // week mode shows the seven days of the cursor week
    const weekStart = weekCursor - ((new Date(weekCursor).getDay() + 6) % 7) * DAY
    const start = mode === 'week' ? weekStart : from - lead * DAY
    const out: Cell[] = []
    for (let k = 0; k < (mode === 'week' ? 7 : 42); k++) {
      const t = start + k * DAY
      const end = t + DAY
      const dayIssues = issues.filter((i) => i.dueDate != null && i.dueDate >= t && i.dueDate < end && (!hideDone || !done.has(i.status))).sort((a, b) => a.priority - b.priority)
      const marks: string[] = []
      for (const m of milestones) if (m.targetDate >= t && m.targetDate < end) marks.push(`◆ ${m.label}`)
      for (const s of sprints) { if (s.startDate >= t && s.startDate < end) marks.push(`▶ ${s.name}`); if (s.endDate >= t && s.endDate < end) marks.push(`■ ${s.name} ends`) }
      out.push({ t, inMonth: mode === 'week' || (t >= from && t < to), today: t === todayT.getTime(), issues: dayIssues, marks })
    }
    return out
  })()
  const PRIO_C: Record<number, string> = { [IssuePriority.Urgent]: '#ef4444', [IssuePriority.High]: '#f97316', [IssuePriority.Medium]: '#eab308', [IssuePriority.Low]: '#22c55e', [IssuePriority.NoPriority]: '#94a3b8' }
  let weekCursor = ((): number => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
  const monthOf = (t: number): Date => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), 1)
  function prev (): void { if (mode === 'week') { weekCursor -= 7 * DAY; cursor = monthOf(weekCursor) } else cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1) }
  function next (): void { if (mode === 'week') { weekCursor += 7 * DAY; cursor = monthOf(weekCursor) } else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) }
  function today (): void { const d = new Date(); cursor = new Date(d.getFullYear(), d.getMonth(), 1); d.setHours(0, 0, 0, 0); weekCursor = d.getTime() }
  const open = (i: Issue): void => { showPanel(view.component.EditDoc, i._id, i._class, 'content') }

  // drag to re-date
  let dragId: Ref<Issue> | undefined
  let over: number | undefined
  function dragStart (e: DragEvent, i: Issue): void { dragId = i._id; e.dataTransfer?.setData('text/plain', i.identifier); if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'move' }
  async function drop (t: number): Promise<void> {
    const issue = issues.find((i) => i._id === dragId) ?? unscheduled.find((i) => i._id === dragId)
    over = undefined
    dragId = undefined
    if (issue === undefined) return
    const keepTime = issue.dueDate != null ? issue.dueDate % DAY : 17 * 3_600_000
    await client.update(issue, { dueDate: t + keepTime })
  }
  $: monthLabel = mode === 'week' ? `${new Date(cells[0]?.t ?? weekCursor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(cells[6]?.t ?? weekCursor).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  async function unschedule (): Promise<void> {
    const i = issues.find((x) => x._id === dragId)
    dragId = undefined
    over = undefined
    if (i !== undefined) await client.update(i, { dueDate: null })
  }
</script>

<div class="cal">
  <header class="cal__head">
    <div class="cal__nav"><button class="cal__btn cal__btn--t" on:click={today}>Today</button><button class="cal__btn" on:click={prev}>‹</button><button class="cal__btn" on:click={next}>›</button><span class="cal__month">{monthLabel}</span></div>
    <div class="cal__tools">
      <span class="seg"><button class="seg__b" class:seg__b--on={mode === 'week'} on:click={() => { mode = 'week' }}>Week</button><button class="seg__b" class:seg__b--on={mode === 'month'} on:click={() => { mode = 'month' }}>Month</button></span>
      <label class="check"><input type="checkbox" bind:checked={hideDone} /> Hide done</label>
      <button class="cal__btn cal__btn--t" class:cal__btn--on={showUnscheduled} on:click={() => { showUnscheduled = !showUnscheduled }}>Unscheduled work · {unscheduled.length}</button>
    </div>
  </header>
  <div class="cal__body">
  <div class="cal__main">
  <div class="cal__dow">{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d}<span>{d}</span>{/each}</div>
  <div class="cal__grid" class:cal__grid--week={mode === 'week'}>
    {#each cells as c (c.t)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="day" class:day--out={!c.inMonth} class:day--today={c.today} class:day--over={over === c.t} on:dragover|preventDefault={() => { over = c.t }} on:dragleave={() => { if (over === c.t) over = undefined }} on:drop|preventDefault={() => { void drop(c.t) }}>
        <span class="day__n">{new Date(c.t).getDate()}</span>
        {#each c.marks as m}<span class="mark">{m}</span>{/each}
        {#each c.issues.slice(0, 4) as i (i._id)}
          <button class="chip" class:chip--done={done.has(i.status)} draggable="true" style="--c: {PRIO_C[i.priority] ?? '#94a3b8'}" title="{i.identifier} {i.title}" on:dragstart={(e) => { dragStart(e, i) }} on:click={() => { open(i) }}><i class="chip__dot" /><span class="chip__k">{i.identifier}</span><span class="chip__t">{i.title}</span></button>
        {/each}
        {#if c.issues.length > 4}<span class="more">+{c.issues.length - 4} more</span>{/if}
      </div>
    {/each}
  </div>
  </div>
  {#if showUnscheduled}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <aside class="cal__side" on:dragover|preventDefault on:drop|preventDefault={() => { void unschedule() }}>
      <div class="cal__side-head"><b>Unscheduled work</b><span class="muted">Drag onto a day to set its due date. Drop here to clear one.</span></div>
      <div class="cal__side-list">
        {#each unscheduled.filter((i) => !hideDone || !done.has(i.status)) as i (i._id)}
          <button class="uchip" draggable="true" style="--c: {PRIO_C[i.priority] ?? '#94a3b8'}" on:dragstart={(e) => { dragStart(e, i) }} on:click={() => { open(i) }}><i class="chip__dot" /><span class="chip__k">{i.identifier}</span><span class="chip__t">{i.title}</span></button>
        {/each}
        {#if unscheduled.length === 0}<p class="muted">Every work item has a date.</p>{/if}
      </div>
    </aside>
  {/if}
  </div>
</div>

<style lang="scss">
  .cal { --j-text: #172b4d; --j-sub: #626f86; --j-link: #0c66e4; --j-border: rgba(9, 30, 66, 0.14); --j-surface: #fff; --j-hover: rgba(9, 30, 66, 0.06); display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0.75rem 1.5rem 1rem; gap: 0.5rem; color: var(--j-text); }
  :global(.theme-dark) .cal { --j-text: #b6c2cf; --j-sub: #8c9bab; --j-link: #579dff; --j-border: #38414a; --j-surface: #22272b; --j-hover: rgba(255, 255, 255, 0.08); }
  .cal__body { flex: 1; min-height: 0; display: flex; gap: 1rem; }
  .cal__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .cal__side { width: 17rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--j-border); border-radius: 0.35rem; background: var(--j-surface); overflow: hidden; }
  .cal__side-head { display: flex; flex-direction: column; gap: 0.15rem; b { font-size: 0.875rem; color: var(--j-text); } }
  .cal__side-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .uchip { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.5rem; border: 1px solid var(--j-border); border-radius: 0.3rem; background: var(--j-surface); color: var(--j-text); font: inherit; font-size: 0.78rem; text-align: left; cursor: grab; min-width: 0; &:hover { background: var(--j-hover); } }
  .seg { display: inline-flex; border: 1px solid var(--j-border); border-radius: 0.3rem; overflow: hidden; }
  .seg__b { padding: 0.3rem 0.7rem; border: none; background: var(--j-surface); color: var(--j-sub); font: inherit; font-size: 0.8125rem; font-weight: 500; cursor: pointer; &--on { background: #e9f2ff; color: var(--j-link); } }
  .cal__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .cal__nav { display: flex; align-items: center; gap: 0.4rem; }
  .cal__month { margin-left: 0.5rem; font-size: 1.05rem; font-weight: 600; color: var(--j-text); }
  .cal__btn { padding: 0.3rem 0.65rem; border: 1px solid var(--j-border); border-radius: 0.3rem; background: var(--j-surface); color: var(--j-text); font: inherit; font-weight: 500; cursor: pointer; &:hover { background: var(--j-hover); } &--t { font-size: 0.8125rem; } &--on { background: #e9f2ff; color: var(--j-link); border-color: transparent; } }
  .cal__tools { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { font-size: 0.72rem; color: var(--theme-trans-color); }
  .cal__dow { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.3rem; span { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); padding: 0 0.4rem; } }
  .cal__grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: minmax(6rem, 1fr); gap: 0.3rem; overflow: auto; &--week { grid-auto-rows: 1fr; } }
  .day { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.3rem 0.35rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); min-width: 0; overflow: hidden; transition: box-shadow 0.15s ease; &--out { opacity: 0.45; } &--today { border-color: var(--accent-brand); box-shadow: inset 0 0 0 1px var(--accent-brand); } &--over { box-shadow: 0 0 0 3px var(--accent-brand-soft); border-color: var(--accent-brand); } }
  .day__n { font-size: 0.72rem; font-weight: 600; color: var(--theme-dark-color); }
  .day--today .day__n { color: var(--accent-brand-ink); }
  .mark { font-size: 0.62rem; font-weight: 600; color: var(--accent-brand-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.35rem; border: none; border-radius: 0.4rem; background: color-mix(in srgb, var(--c) 18%, var(--theme-bg-color)); color: var(--theme-caption-color); font: inherit; font-size: 0.68rem; text-align: left; cursor: grab; min-width: 0; &:hover { filter: brightness(1.1); } &--done { opacity: 0.55; text-decoration: line-through; } }
  .chip__dot { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--c); flex-shrink: 0; }
  .chip__k { flex-shrink: 0; font-weight: 700; color: var(--accent-brand-ink); }
  .chip__t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .more { font-size: 0.62rem; color: var(--theme-trans-color); }
</style>
