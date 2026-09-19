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
  import { type Ref } from '@hcengineering/core'
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
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: mq.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r })
  $: spq.query(tracker.class.Sprint, { space: currentSpace }, (r) => { sprints = r })
  $: done = new Set(statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id))
  let hideDone = true

  interface Cell { t: number, inMonth: boolean, today: boolean, issues: Issue[], marks: string[] }
  $: cells = ((): Cell[] => {
    const first = new Date(from)
    const lead = (first.getDay() + 6) % 7
    const start = from - lead * DAY
    const out: Cell[] = []
    const todayT = new Date(); todayT.setHours(0, 0, 0, 0)
    for (let k = 0; k < 42; k++) {
      const t = start + k * DAY
      const end = t + DAY
      const dayIssues = issues.filter((i) => i.dueDate != null && i.dueDate >= t && i.dueDate < end && (!hideDone || !done.has(i.status))).sort((a, b) => a.priority - b.priority)
      const marks: string[] = []
      for (const m of milestones) if (m.targetDate >= t && m.targetDate < end) marks.push(`◆ ${m.label}`)
      for (const s of sprints) { if (s.startDate >= t && s.startDate < end) marks.push(`▶ ${s.name}`); if (s.endDate >= t && s.endDate < end) marks.push(`■ ${s.name} ends`) }
      out.push({ t, inMonth: t >= from && t < to, today: t === todayT.getTime(), issues: dayIssues, marks })
    }
    return out
  })()
  const PRIO_C: Record<number, string> = { [IssuePriority.Urgent]: '#ef4444', [IssuePriority.High]: '#f97316', [IssuePriority.Medium]: '#eab308', [IssuePriority.Low]: '#22c55e', [IssuePriority.NoPriority]: '#94a3b8' }
  function prev (): void { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1) }
  function next (): void { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) }
  function today (): void { const d = new Date(); cursor = new Date(d.getFullYear(), d.getMonth(), 1) }
  const open = (i: Issue): void => { showPanel(view.component.EditDoc, i._id, i._class, 'content') }

  // drag to re-date
  let dragId: Ref<Issue> | undefined
  let over: number | undefined
  function dragStart (e: DragEvent, i: Issue): void { dragId = i._id; e.dataTransfer?.setData('text/plain', i.identifier); if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'move' }
  async function drop (t: number): Promise<void> {
    const issue = issues.find((i) => i._id === dragId)
    over = undefined
    dragId = undefined
    if (issue === undefined) return
    const keepTime = issue.dueDate != null ? issue.dueDate % DAY : 17 * 3_600_000
    await client.update(issue, { dueDate: t + keepTime })
  }
  $: monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  $: unscheduled = issues.length
</script>

<div class="cal">
  <header class="cal__head">
    <div class="cal__nav"><button class="cal__btn" on:click={prev}>‹</button><span class="cal__month">{monthLabel}</span><button class="cal__btn" on:click={next}>›</button><button class="cal__btn cal__btn--t" on:click={today}>Today</button></div>
    <div class="cal__tools"><label class="check"><input type="checkbox" bind:checked={hideDone} /> hide done</label><span class="muted">{unscheduled} dated items around this month · drag to re-date · milestones ◆ · sprints ▶ ■</span></div>
  </header>
  <div class="cal__dow">{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d}<span>{d}</span>{/each}</div>
  <div class="cal__grid">
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

<style lang="scss">
  .cal { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0.75rem 1.25rem 1rem; gap: 0.5rem; }
  .cal__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .cal__nav { display: flex; align-items: center; gap: 0.4rem; }
  .cal__month { min-width: 11rem; text-align: center; font-weight: 700; color: var(--theme-caption-color); }
  .cal__btn { padding: 0.25rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-panel-color); color: var(--theme-content-color); font: inherit; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--t { font-size: 0.75rem; } }
  .cal__tools { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { font-size: 0.72rem; color: var(--theme-trans-color); }
  .cal__dow { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.3rem; span { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); padding: 0 0.4rem; } }
  .cal__grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: minmax(6rem, 1fr); gap: 0.3rem; overflow: auto; }
  .day { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.3rem 0.35rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); min-width: 0; overflow: hidden; transition: box-shadow 0.15s ease; &--out { opacity: 0.45; } &--today { border-color: var(--accent-brand); box-shadow: inset 0 0 0 1px var(--accent-brand); } &--over { box-shadow: 0 0 0 3px var(--accent-brand-soft); border-color: var(--accent-brand); } }
  .day__n { font-size: 0.72rem; font-weight: 600; color: var(--theme-dark-color); }
  .day--today .day__n { color: var(--accent-brand-ink); }
  .mark { font-size: 0.62rem; font-weight: 600; color: var(--accent-brand-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.35rem; border: none; border-radius: 0.4rem; background: color-mix(in srgb, var(--c) 18%, var(--theme-bg-color)); color: var(--theme-caption-color); font: inherit; font-size: 0.68rem; text-align: left; cursor: grab; min-width: 0; &:hover { filter: brightness(1.1); } &--done { opacity: 0.55; text-decoration: line-through; } }
  .chip__dot { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--c); flex-shrink: 0; }
  .chip__k { flex-shrink: 0; font-weight: 700; color: var(--accent-brand-ink); }
  .chip__t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .more { font-size: 0.62rem; color: var(--theme-trans-color); }
</style>
