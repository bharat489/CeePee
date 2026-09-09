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
  Query: type a question about issues in a small language (see parse.ts).
  Errors are shown next to the results, never swallowed.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { IssuePriority, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount, tick } from 'svelte'

  import tracker from '../../plugin'
  import { parseQuery, type QueryContext } from './parse'

  const client = getClient()
  const me = getCurrentEmployee()

  // reference data for name resolution
  const statusQuery = createQuery()
  const projectQuery = createQuery()
  const sprintQuery = createQuery()
  const milestoneQuery = createQuery()
  let statuses: IssueStatus[] = []
  let projects: Project[] = []
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  statusQuery.query(tracker.class.IssueStatus, {}, (r) => {
    statuses = r
  })
  projectQuery.query(tracker.class.Project, {}, (r) => {
    projects = r
  })
  sprintQuery.query(tracker.class.Sprint, {}, (r) => {
    sprints = r
  })
  milestoneQuery.query(tracker.class.Milestone, {}, (r) => {
    milestones = r
  })

  let input = ''
  let inputEl: HTMLInputElement | undefined
  let results: Issue[] = []
  let errors: string[] = []
  let ran = false
  let busy = false
  let people: Array<{ _id: Ref<Person>, name: string }> = []

  const examples = [
    'assignee = me AND status != done',
    'priority >= high AND updated < -7d',
    'sprint = active AND assignee = none',
    'created > -30d AND status = open'
  ]

  onMount(async () => {
    await tick()
    inputEl?.focus()
  })

  async function ensurePeople (): Promise<void> {
    if (people.length > 0) return
    const list = await client.findAll(contact.class.Person, {}, { limit: 1000 })
    people = list.map((p) => ({ _id: p._id, name: formatName(p.name) }))
  }

  async function run (): Promise<void> {
    const text = input.trim()
    if (text === '') return
    busy = true
    try {
      await ensurePeople()
      const ctx: QueryContext = {
        me,
        statuses: statuses.map((s) => ({ _id: s._id, name: s.name, category: s.category })),
        projects: projects.map((p) => ({ _id: p._id, name: p.name, identifier: p.identifier })),
        sprints: sprints.map((s) => ({ _id: s._id, name: s.name, state: s.state })),
        milestones: milestones.map((m) => ({ _id: m._id, label: m.label })),
        people
      }
      const parsed = parseQuery(text, ctx)
      errors = parsed.errors
      results =
        parsed.clauses > 0 && parsed.errors.length === 0
          ? await client.findAll(tracker.class.Issue, parsed.query, {
            limit: 200,
            sort: { modifiedOn: SortingOrder.Descending }
          })
          : []
      ran = true
    } finally {
      busy = false
    }
  }

  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))
  $: projectName = new Map(projects.map((p) => [p._id, p.identifier]))
  $: personName = new Map(people.map((p) => [p._id, p.name]))
  const prio: Record<IssuePriority, string> = {
    [IssuePriority.Urgent]: 'Urgent',
    [IssuePriority.High]: 'High',
    [IssuePriority.Medium]: 'Medium',
    [IssuePriority.Low]: 'Low',
    [IssuePriority.NoPriority]: ''
  }

  function open (issue: Issue): void {
    showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
  }
</script>

<div class="q">
  <header class="q__head">
    <span class="q__title"><Label label={tracker.string.Query} /></span>
    <span class="q__hint"><Label label={tracker.string.QueryHint} /></span>
  </header>

  <form
    class="q__form"
    on:submit|preventDefault={() => {
      void run()
    }}
  >
    <input
      bind:this={inputEl}
      bind:value={input}
      class="q__input"
      type="text"
      placeholder="assignee = me AND status != done"
      autocomplete="off"
      spellcheck="false"
    />
    <button class="q__go" type="submit" disabled={busy || input.trim() === ''}>↵</button>
  </form>

  {#if !ran}
    <div class="q__examples">
      {#each examples as e, idx}
        <button
          class="chip motion-rise"
          style="--i: {idx}"
          on:click={() => {
            input = e
            void run()
          }}
        >
          {e}
        </button>
      {/each}
    </div>
  {/if}

  {#if errors.length > 0}
    <ul class="q__errors">
      {#each errors as e}<li>{e}</li>{/each}
    </ul>
  {/if}

  {#if ran && errors.length === 0}
    <div class="q__count">{results.length}{results.length === 200 ? '+' : ''} <Label label={tracker.string.Issues} /></div>
    <div class="q__list">
      {#each results as i, idx (i._id)}
        <button
          class="row motion-rise"
          style="--i: {idx}"
          on:click={() => {
            open(i)
          }}
        >
          <span class="row__id">{i.identifier}</span>
          <span class="row__title">{i.title}</span>
          <span class="row__meta">{prio[i.priority]}</span>
          <span class="row__meta">{i.assignee != null ? personName.get(i.assignee) ?? '' : ''}</span>
          <span class="row__meta row__meta--status">{statusName.get(i.status) ?? ''}</span>
          <span class="row__meta">{projectName.get(i.space) ?? ''}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .q {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    max-width: 72rem;
    overflow: auto;
  }
  .q__head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .q__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .q__hint {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .q__form {
    display: flex;
    gap: 0.4rem;
  }
  .q__input {
    flex: 1;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.6rem;
    background: var(--theme-panel-color);
    color: var(--theme-caption-color);
    font: inherit;
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.9375rem;
    outline: none;
    transition: var(--transition-interactive);
    &:focus {
      border-color: var(--accent-brand);
      box-shadow: 0 0 0 3px var(--accent-brand-soft);
    }
    &::placeholder {
      color: var(--theme-trans-color);
    }
  }
  .q__go {
    width: 2.6rem;
    border: none;
    border-radius: 0.6rem;
    background-image: var(--accent-gradient);
    color: #fff;
    font: inherit;
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
  .q__examples {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 999px;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.75rem;
    cursor: pointer;
    transition: var(--transition-interactive);
    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
      border-color: var(--accent-brand);
    }
  }
  .q__errors {
    margin: 0;
    padding: 0.5rem 0.75rem 0.5rem 1.5rem;
    border: 1px solid var(--negative-button-default);
    border-radius: 0.5rem;
    color: var(--negative-button-default);
    font-size: 0.8125rem;
  }
  .q__count {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .q__list {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 5rem 1fr 4rem 8rem 7rem 4rem;
    align-items: baseline;
    gap: 0.75rem;
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: none;
    border-bottom: 1px solid var(--theme-divider-color);
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .row__id {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .row__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-caption-color);
  }
  .row__meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    &--status {
      color: var(--theme-content-color);
    }
  }
  @media (max-width: 800px) {
    .row {
      grid-template-columns: 4rem 1fr 6rem;
      .row__meta:not(.row__meta--status) {
        display: none;
      }
    }
  }
</style>
