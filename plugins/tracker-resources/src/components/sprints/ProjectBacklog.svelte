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
  Backlog: the planning surface for sprints.

  Left, the open top-level issues not yet in a sprint, in rank order. Right,
  the active sprint and every planned one, each with its issues and its
  totals (count, story points, hours, days left). Drag an issue between
  lanes to move it; a button on each row does the same for keyboards.

  Epics and initiatives are containers, not units of sprint work, so they
  are excluded. Sub-issues follow their parent and are excluded too.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const issueQuery = createQuery()
  const sprintQuery = createQuery()
  const statusQuery = createQuery()

  let issues: Issue[] = []
  let sprints: Sprint[] = []
  let statuses: IssueStatus[] = []

  statusQuery.query(tracker.class.IssueStatus, {}, (res) => {
    statuses = res
  })
  $: openIds = statuses
    .filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost)
    .map((s) => s._id)

  $: sprintQuery.query(
    tracker.class.Sprint,
    { space: currentSpace, state: { $ne: 'completed' } },
    (res) => {
      sprints = res
    },
    { sort: { startDate: SortingOrder.Ascending } }
  )

  $: if (openIds.length > 0) {
    issueQuery.query(
      tracker.class.Issue,
      {
        space: currentSpace,
        status: { $in: openIds },
        attachedTo: tracker.ids.NoParent,
        kind: { $nin: [tracker.taskTypes.Epic, tracker.taskTypes.Initiative] }
      },
      (res) => {
        issues = res
      },
      { sort: { rank: SortingOrder.Ascending } }
    )
  }

  $: active = sprints.find((s) => s.state === 'active')
  $: lanes = [...(active !== undefined ? [active] : []), ...sprints.filter((s) => s.state === 'planned')]
  $: backlog = issues.filter((i) => i.sprint == null)
  $: inSprint = (s: Sprint): Issue[] => issues.filter((i) => i.sprint === s._id)
  // where a keyboard "move to sprint" sends an issue: the active sprint, else the next planned one
  $: target = active ?? lanes[0]

  function points (list: Issue[]): number {
    return list.reduce((a, i) => a + (i.storyPoints ?? 0), 0)
  }
  function hours (list: Issue[]): number {
    return Math.round(list.reduce((a, i) => a + (i.estimation ?? 0), 0) * 10) / 10
  }
  const DAY = 86_400_000
  function daysLeft (s: Sprint): number {
    return Math.max(0, Math.ceil((s.endDate - Date.now()) / DAY))
  }
  function statusName (i: Issue): string {
    return statuses.find((s) => s._id === i.status)?.name ?? ''
  }

  async function move (issue: Issue, sprint: Ref<Sprint> | null): Promise<void> {
    if ((issue.sprint ?? null) === sprint) return
    await client.update(issue, { sprint })
  }

  // ---- drag and drop ------------------------------------------------------
  type Lane = Ref<Sprint> | 'backlog'
  let dragging: Ref<Issue> | undefined
  let over: Lane | undefined

  function onDragStart (e: DragEvent, issue: Issue): void {
    dragging = issue._id
    if (e.dataTransfer !== null) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', issue._id)
    }
  }
  async function onDrop (lane: Lane): Promise<void> {
    const id = dragging
    dragging = undefined
    over = undefined
    const issue = issues.find((i) => i._id === id)
    if (issue === undefined) return
    await move(issue, lane === 'backlog' ? null : lane)
  }

  function open (issue: Issue): void {
    showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
  }
</script>

<div class="backlog">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <section
    class="lane lane--backlog"
    class:lane--over={over === 'backlog'}
    on:dragover|preventDefault={() => {
      over = 'backlog'
    }}
    on:dragleave={() => {
      if (over === 'backlog') over = undefined
    }}
    on:drop|preventDefault={() => {
      void onDrop('backlog')
    }}
  >
    <header class="lane__head">
      <span class="lane__name"><Label label={tracker.string.Backlog} /></span>
      <span class="lane__meta">
        {backlog.length} · {points(backlog)} <Label label={tracker.string.Points} /> · {hours(backlog)}h
      </span>
    </header>
    {#if backlog.length === 0}
      <p class="lane__empty"><Label label={tracker.string.BacklogEmpty} /></p>
    {/if}
    {#each backlog as i, idx (i._id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="row motion-rise"
        style="--i: {idx}"
        class:row--dragging={dragging === i._id}
        draggable="true"
        on:dragstart={(e) => {
          onDragStart(e, i)
        }}
        on:dragend={() => {
          dragging = undefined
          over = undefined
        }}
      >
        <button
          class="row__main"
          on:click={() => {
            open(i)
          }}
        >
          <span class="row__id">{i.identifier}</span>
          <span class="row__title">{i.title}</span>
          <span class="row__status">{statusName(i)}</span>
          {#if i.storyPoints}<span class="row__pts">{i.storyPoints}</span>{/if}
        </button>
        {#if target !== undefined}
          <Button
            kind={'ghost'}
            size={'small'}
            label={tracker.string.MoveToSprint}
            on:click={() => {
              void move(i, target._id)
            }}
          />
        {/if}
      </div>
    {/each}
  </section>

  <div class="sprints">
    {#if lanes.length === 0}
      <p class="lane__empty"><Label label={tracker.string.NoSprintsYet} /></p>
    {/if}
    {#each lanes as s (s._id)}
      {@const list = inSprint(s)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <section
        class="lane"
        class:lane--active={s.state === 'active'}
        class:lane--over={over === s._id}
        on:dragover|preventDefault={() => {
          over = s._id
        }}
        on:dragleave={() => {
          if (over === s._id) over = undefined
        }}
        on:drop|preventDefault={() => {
          void onDrop(s._id)
        }}
      >
        <header class="lane__head">
          <span class="lane__name">
            {s.name}
            {#if s.state === 'active'}<span class="pill"><Label label={tracker.string.ActiveSprint} /></span>{/if}
          </span>
          <span class="lane__meta">
            {list.length} · {points(list)} <Label label={tracker.string.Points} /> · {hours(list)}h
            {#if s.state === 'active'}· {daysLeft(s)} <Label label={tracker.string.DaysLeft} />{/if}
          </span>
        </header>
        {#if s.goal}<p class="lane__goal">{s.goal}</p>{/if}
        {#each list as i, idx (i._id)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="row motion-rise"
            style="--i: {idx}"
            class:row--dragging={dragging === i._id}
            draggable="true"
            on:dragstart={(e) => {
              onDragStart(e, i)
            }}
            on:dragend={() => {
              dragging = undefined
              over = undefined
            }}
          >
            <button
              class="row__main"
              on:click={() => {
                open(i)
              }}
            >
              <span class="row__id">{i.identifier}</span>
              <span class="row__title">{i.title}</span>
              <span class="row__status">{statusName(i)}</span>
              {#if i.storyPoints}<span class="row__pts">{i.storyPoints}</span>{/if}
            </button>
            <Button
              kind={'ghost'}
              size={'small'}
              label={tracker.string.MoveToBacklog}
              on:click={() => {
                void move(i, null)
              }}
            />
          </div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style lang="scss">
  .backlog {
    display: grid;
    grid-template-columns: minmax(20rem, 1fr) minmax(20rem, 1fr);
    gap: 1rem;
    padding: 1rem 1.25rem;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }
  .sprints {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .lane {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.75rem 0.9rem;
    min-width: 0;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    transition:
      border-color var(--motion-fast) var(--ease-standard),
      background-color var(--motion-fast) var(--ease-standard),
      box-shadow var(--motion-fast) var(--ease-standard);

    &--active {
      border-color: var(--accent-brand);
    }
    &--over {
      background: var(--accent-brand-soft);
      border-color: var(--accent-brand);
      box-shadow: 0 0 0 3px var(--accent-brand-soft);
    }
  }
  .lane__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.35rem;
  }
  .lane__name {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .pill {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--accent-brand);
    color: #1a2400;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .lane__meta {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .lane__goal {
    margin: 0 0 0.4rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .lane__empty {
    margin: 0.25rem 0;
    font-size: 0.875rem;
    color: var(--theme-trans-color);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: 0.5rem;
    cursor: grab;
    transition:
      background-color var(--motion-fast) var(--ease-standard),
      opacity var(--motion-fast) var(--ease-standard);
    &:hover {
      background: var(--theme-button-hovered);
    }
    &--dragging {
      opacity: 0.4;
    }
  }
  .row__main {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }
  .row__id {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .row__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-caption-color);
  }
  .row__status {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .row__pts {
    flex-shrink: 0;
    min-width: 1.5rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--theme-button-pressed);
    font-size: 0.75rem;
    text-align: center;
    color: var(--theme-caption-color);
  }
  @media (max-width: 900px) {
    .backlog {
      grid-template-columns: 1fr;
    }
  }
</style>
