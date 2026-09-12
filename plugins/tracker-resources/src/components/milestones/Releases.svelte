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
  Release hub. Every milestone as a release: status, dates, progress, the
  warnings that matter before shipping, and the actions -- release
  (optionally moving what is left to the next one), merge into another
  version, archive, release notes with a shareable link.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { MilestoneStatus, type Issue, type IssueStatus, type Milestone, type Project } from '@hcengineering/tracker'
  import { Button, getCurrentLocation, Label, navigate, showPanel, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount } from 'svelte'

  import tracker from '../../plugin'
  import ReleaseNotesPopup from './ReleaseNotesPopup.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const mq = createQuery()
  const iq = createQuery()
  const sq = createQuery()
  let milestones: Milestone[] = []
  let issues: Issue[] = []
  let statuses: IssueStatus[] = []
  $: mq.query(tracker.class.Milestone, { space: currentSpace }, (r) => { milestones = r }, { sort: { targetDate: SortingOrder.Ascending } })
  $: iq.query(tracker.class.Issue, { space: currentSpace, milestone: { $ne: null } }, (r) => { issues = r }, { limit: 5000 })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: cat = new Map(statuses.map((s) => [s._id, s.category]))
  const isDone = (st: Ref<IssueStatus>): boolean => cat.get(st) === task.statusCategory.Won || cat.get(st) === task.statusCategory.Lost

  let showArchived = false
  const DAY = 86_400_000
  const statusLabel: Record<MilestoneStatus, string> = { [MilestoneStatus.Planned]: 'Unreleased', [MilestoneStatus.InProgress]: 'In progress', [MilestoneStatus.Completed]: 'Released', [MilestoneStatus.Canceled]: 'Cancelled' }

  interface Row {
    m: Milestone
    total: number
    done: number
    open: Issue[]
    blocked: number
    overdue: number
    daysLeft: number
  }
  $: rows = milestones
    .filter((m) => showArchived || m.archived !== true)
    .map((m): Row => {
      const list = issues.filter((i) => i.milestone === m._id)
      const open = list.filter((i) => !isDone(i.status))
      return { m, total: list.length, done: list.length - open.length, open, blocked: open.filter((i) => (i.blockedBy?.length ?? 0) > 0).length, overdue: open.filter((i) => i.dueDate != null && i.dueDate < Date.now()).length, daysLeft: Math.ceil((m.targetDate - Date.now()) / DAY) }
    })

  // ?notes=<milestone> opens the release notes straight away (shareable link)
  let opened = false
  onMount(() => {
    const id = getCurrentLocation().query?.notes
    if (id != null && !opened) {
      opened = true
      const stop = setInterval(() => {
        const m = milestones.find((x) => x._id === id)
        if (m !== undefined) {
          clearInterval(stop)
          notes(m)
        }
      }, 200)
      setTimeout(() => { clearInterval(stop) }, 8000)
    }
  })

  async function release (r: Row): Promise<void> {
    const next = milestones.find((x) => x._id !== r.m._id && x.status !== MilestoneStatus.Completed && x.status !== MilestoneStatus.Canceled && x.targetDate > r.m.targetDate)
    if (r.open.length > 0) {
      const move = confirm(`${r.open.length} unresolved issue(s). ${next !== undefined ? `Move them to "${next.label}"?` : 'Release anyway?'}`)
      if (!move) return
      if (next !== undefined) for (const i of r.open) await client.update(i, { milestone: next._id })
    }
    await client.update(r.m, { status: MilestoneStatus.Completed, releasedOn: Date.now() })
  }
  async function merge (r: Row): Promise<void> {
    const others = milestones.filter((x) => x._id !== r.m._id && x.archived !== true)
    if (others.length === 0) return
    const pick = prompt(`Merge "${r.m.label}" into which version?\n\n${others.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}\n\nEnter a number:`)
    if (pick === null) return
    const target = others[Number(pick) - 1]
    if (target === undefined) return
    const list = issues.filter((i) => i.milestone === r.m._id)
    for (const i of list) await client.update(i, { milestone: target._id })
    const affected = await client.findAll(tracker.class.Issue, { affectsMilestone: r.m._id })
    for (const i of affected) await client.update(i, { affectsMilestone: target._id })
    await client.update(r.m, { archived: true, status: MilestoneStatus.Canceled })
  }
  async function archive (r: Row, on: boolean): Promise<void> {
    await client.update(r.m, { archived: on })
  }
  function notes (m: Milestone): void {
    showPopup(ReleaseNotesPopup, { milestone: m }, 'top')
  }
  function copyNotesLink (m: Milestone): void {
    const loc = getCurrentLocation()
    const url = `${window.location.origin}/workbench/${loc.path[1]}/tracker/${currentSpace}/releases?notes=${m._id}`
    void navigator.clipboard.writeText(url)
    navigate({ ...loc, query: { ...(loc.query ?? {}), notes: m._id } })
  }
  function open (m: Milestone): void {
    showPanel(view.component.EditDoc, m._id, m._class, 'content')
  }
  function fmt (t: number | null | undefined): string {
    return t == null ? '—' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
</script>

<div class="rel">
  <header class="rel__head">
    <span class="rel__title"><Label label={tracker.string.Releases} /></span>
    <label class="check"><input type="checkbox" bind:checked={showArchived} /> show archived</label>
  </header>
  {#if rows.length === 0}<p class="muted"><Label label={tracker.string.NoReleases} /></p>{/if}
  {#each rows as r, idx (r.m._id)}
    <section class="card motion-rise" style="--i: {idx}" class:card--released={r.m.status === MilestoneStatus.Completed} class:card--archived={r.m.archived === true}>
      <div class="card__main">
        <button class="card__name" on:click={() => { open(r.m) }}>{r.m.label}</button>
        <span class="pill pill--{r.m.status}">{statusLabel[r.m.status]}</span>
        {#if r.m.archived === true}<span class="pill">Archived</span>{/if}
        <span class="card__dates">{fmt(r.m.startDate)} → {fmt(r.m.targetDate)}{#if r.m.releasedOn != null} · released {fmt(r.m.releasedOn)}{/if}</span>
      </div>
      <div class="card__progress">
        <span class="track"><span class="fill" style="width: {r.total === 0 ? 0 : (r.done / r.total) * 100}%" /></span>
        <span class="card__n">{r.done} / {r.total}{#if r.m.status !== MilestoneStatus.Completed} · {r.daysLeft >= 0 ? `${r.daysLeft}d left` : `${-r.daysLeft}d over`}{/if}</span>
      </div>
      {#if r.m.status !== MilestoneStatus.Completed && (r.open.length > 0 || r.blocked > 0 || r.overdue > 0)}
        <ul class="warn">
          {#if r.open.length > 0}<li>{r.open.length} unresolved</li>{/if}
          {#if r.blocked > 0}<li>{r.blocked} blocked</li>{/if}
          {#if r.overdue > 0}<li>{r.overdue} past due date</li>{/if}
          {#if r.daysLeft < 0}<li>target date passed</li>{/if}
        </ul>
      {/if}
      <div class="card__actions">
        <Button kind={'ghost'} label={tracker.string.ReleaseNotes} on:click={() => { notes(r.m) }} />
        <Button kind={'ghost'} label={tracker.string.CopyLink} on:click={() => { copyNotesLink(r.m) }} />
        {#if r.m.archived !== true}<Button kind={'ghost'} label={tracker.string.MergeInto} on:click={() => { void merge(r) }} />{/if}
        {#if r.m.status !== MilestoneStatus.Completed && r.m.status !== MilestoneStatus.Canceled}
          <Button kind={'primary'} label={tracker.string.Release} on:click={() => { void release(r) }} />
        {:else}
          <Button kind={'ghost'} label={r.m.archived === true ? tracker.string.Unarchive : tracker.string.Archive} on:click={() => { void archive(r, r.m.archived !== true) }} />
        {/if}
      </div>
    </section>
  {/each}
</div>

<style lang="scss">
  .rel { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.25rem; max-width: 60rem; overflow: auto; }
  .rel__head { display: flex; align-items: center; justify-content: space-between; }
  .rel__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { margin: 0; font-size: 0.875rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); &--released { border-color: var(--accent-brand); } &--archived { opacity: 0.6; } }
  .card__main { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .card__name { border: none; background: transparent; padding: 0; color: var(--theme-caption-color); font: inherit; font-weight: 600; font-size: 1rem; cursor: pointer; &:hover { text-decoration: underline; } }
  .card__dates { font-size: 0.75rem; color: var(--theme-trans-color); }
  .pill { padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--2 { background: var(--accent-brand); color: #1a2400; } &--1 { background: var(--primary-button-default); color: #fff; } }
  .card__progress { display: flex; align-items: center; gap: 0.75rem; }
  .track { flex: 1; height: 0.5rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent-brand); transition: width var(--motion-slow) var(--ease-enter); }
  .card__n { font-size: 0.75rem; color: var(--theme-dark-color); flex-shrink: 0; }
  .warn { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0; padding: 0; list-style: none; font-size: 0.75rem; color: #b8860b; li::before { content: '⚠ '; } }
  .card__actions { display: flex; justify-content: flex-end; gap: 0.4rem; flex-wrap: wrap; }
</style>
