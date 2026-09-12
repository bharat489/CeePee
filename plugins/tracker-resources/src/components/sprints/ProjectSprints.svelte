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
  Sprints for a project.

  Cadence is optional in this product -- Milestones carry the dates that
  matter for delivery, and a team that does not run iterations never opens
  this view. For teams that do, three rules keep it honest:

  1. One active sprint per project. Starting one closes nothing; it only
     refuses to start if another is already active.
  2. Completing a sprint carries unfinished issues forward to the next
     planned sprint, and records where they went on the sprint itself, so
     "what slipped out of sprint 4?" is answerable later.
  3. Nothing is deleted. A completed sprint is history.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, DatePresenter, EditBox, IconAdd, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const sprintQuery = createQuery()
  const statusQuery = createQuery()

  let sprints: Sprint[] = []
  let statuses: IssueStatus[] = []

  $: sprintQuery.query(tracker.class.Sprint, { space: currentSpace }, (res) => {
    sprints = res
  }, { sort: { startDate: SortingOrder.Descending } })

  $: statusQuery.query(tracker.class.IssueStatus, { space: currentSpace }, (res) => {
    statuses = res
  })

  $: active = sprints.find((s) => s.state === 'active')
  $: planned = sprints.filter((s) => s.state === 'planned').sort((a, b) => a.startDate - b.startDate)
  $: completed = sprints.filter((s) => s.state === 'completed')

  // ---- create -----------------------------------------------------------
  let creating = false
  let name = ''
  let goal = ''
  const DAY = 86_400_000
  let startDate: number | null = Date.now()
  let endDate: number | null = Date.now() + 14 * DAY

  $: canCreate = name.trim() !== '' && startDate != null && endDate != null && endDate > startDate

  async function create (): Promise<void> {
    if (!canCreate || startDate == null || endDate == null) return
    await client.createDoc(tracker.class.Sprint, currentSpace, {
      name: name.trim(),
      goal: goal.trim() === '' ? undefined : goal.trim(),
      startDate,
      endDate,
      state: 'planned',
      carriedOverTo: null
    })
    name = ''
    goal = ''
    creating = false
  }

  // ---- start / complete -------------------------------------------------
  async function start (s: Sprint): Promise<void> {
    // Rule 1: one active sprint. Refuse rather than silently close the other.
    if (active !== undefined) return
    await client.update(s, { state: 'active' })
  }

  function isResolved (status: Ref<IssueStatus>): boolean {
    const cat = statuses.find((st) => st._id === status)?.category
    return cat === task.statusCategory.Won || cat === task.statusCategory.Lost
  }

  async function complete (s: Sprint): Promise<void> {
    // Rule 2: unfinished work moves to the next planned sprint, and the
    // completed sprint records where. If there is no next sprint the issues
    // are simply released from this one.
    const next = planned.find((p) => p._id !== s._id)
    const issues: Issue[] = await client.findAll(tracker.class.Issue, { space: currentSpace, sprint: s._id })
    const unfinished = issues.filter((i) => !isResolved(i.status))
    for (const i of unfinished) {
      await client.update(i, { sprint: next?._id ?? null })
    }
    await client.update(s, { state: 'completed', carriedOverTo: next?._id ?? null })
  }

  function days (s: Sprint): number {
    return Math.max(0, Math.round((s.endDate - s.startDate) / DAY))
  }
</script>

<div class="sprints">
  <div class="sprints__head">
    <span class="sprints__title"><Label label={tracker.string.Sprints} /></span>
    <Button
      icon={IconAdd}
      kind={'primary'}
      label={tracker.string.NewSprint}
      on:click={() => {
        creating = !creating
      }}
    />
  </div>

  {#if creating}
    <div class="sprint-form">
      <EditBox bind:value={name} placeholder={tracker.string.Sprint} kind={'large-style'} autoFocus fullSize />
      <EditBox bind:value={goal} placeholder={tracker.string.SprintGoal} kind={'default'} fullSize />
      <div class="sprint-form__dates">
        <span><Label label={tracker.string.SprintStart} /></span>
        <DatePresenter bind:value={startDate} editable kind={'regular'} />
        <span><Label label={tracker.string.SprintEnd} /></span>
        <DatePresenter bind:value={endDate} editable kind={'regular'} />
      </div>
      <div class="sprint-form__actions">
        <Button kind={'primary'} label={tracker.string.NewSprint} disabled={!canCreate} on:click={create} />
      </div>
    </div>
  {/if}

  {#if sprints.length === 0 && !creating}
    <p class="sprints__empty"><Label label={tracker.string.NoSprint} /></p>
  {/if}

  {#if active !== undefined}
    <section>
      <span class="sprints__section"><Label label={tracker.string.ActiveSprint} /></span>
      <div class="sprint sprint--active">
        <div class="sprint__main">
          <span class="sprint__name">{active.name}</span>
          {#if active.goal}<span class="sprint__goal">{active.goal}</span>{/if}
          <span class="sprint__meta">{days(active)}d</span>
        </div>
        <Button
          kind={'regular'}
          label={tracker.string.CompleteSprint}
          on:click={() => {
            void complete(active)
          }}
        />
      </div>
    </section>
  {/if}

  {#if planned.length > 0}
    <section>
      <span class="sprints__section"><Label label={tracker.string.PlannedSprint} /></span>
      {#each planned as s (s._id)}
        <div class="sprint">
          <div class="sprint__main">
            <span class="sprint__name">{s.name}</span>
            {#if s.goal}<span class="sprint__goal">{s.goal}</span>{/if}
            <span class="sprint__meta">{days(s)}d</span>
          </div>
          <Button
            kind={'regular'}
            label={tracker.string.StartSprint}
            disabled={active !== undefined}
            on:click={() => {
              void start(s)
            }}
          />
        </div>
      {/each}
    </section>
  {/if}

  {#if completed.length > 0}
    <section>
      <span class="sprints__section"><Label label={tracker.string.CompletedSprint} /></span>
      {#each completed as s (s._id)}
        <div class="sprint sprint--done">
          <div class="sprint__main">
            <span class="sprint__name">{s.name}</span>
            {#if s.carriedOverTo}
              <span class="sprint__meta"><Label label={tracker.string.CarriedOver} /> {sprints.find((x) => x._id === s.carriedOverTo)?.name ?? ''}</span>
            {/if}
          </div>
        </div>
      {/each}
    </section>
  {/if}
</div>

<style lang="scss">
  .sprints { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; max-width: 56rem; }
  .sprints__head { display: flex; align-items: center; justify-content: space-between; }
  .sprints__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .sprints__section {
    display: block; margin-bottom: 0.4rem; font-size: 0.6875rem; letter-spacing: 0.07em;
    text-transform: uppercase; color: var(--theme-dark-color);
  }
  .sprints__empty { margin: 0; color: var(--theme-trans-color); font-size: 0.875rem; }
  .sprint-form {
    display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem;
    border: 1px solid var(--theme-divider-color); border-radius: 0.5rem;
  }
  .sprint-form__dates { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .sprint-form__actions { display: flex; justify-content: flex-end; }
  .sprint {
    display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
    padding: 0.6rem 0.8rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; margin-bottom: 0.4rem;
  }
  .sprint--active { border-color: var(--theme-caption-color); }
  .sprint--done { opacity: 0.65; }
  .sprint__main { display: flex; align-items: baseline; gap: 0.6rem; min-width: 0; }
  .sprint__name { font-weight: 500; color: var(--theme-caption-color); }
  .sprint__goal { color: var(--theme-content-color); font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sprint__meta { color: var(--theme-trans-color); font-size: 0.75rem; flex-shrink: 0; }
</style>
