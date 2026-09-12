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
  Assistant. Works with no API key, by design.

  The questions people actually ask a work assistant -- what should I do
  next, what has gone quiet, who is doing what -- are all answerable exactly
  from the work graph. Answering them with queries rather than a language
  model means every result is a real issue you can click, nothing is invented,
  and it runs on a laptop with no network. A model can be added later behind
  the same intents; the intents are the product, the model is a parser.

  When a question does not match an intent the assistant says so. Guessing
  is how these panels lose trust in week one.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { IssuePriority, type Issue, type IssueStatus } from '@hcengineering/tracker'
  import { Label, closePopup, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount, tick } from 'svelte'

  import tracker from '../../plugin'

  const client = getClient()
  const me = getCurrentEmployee()

  // ---- reference data ----------------------------------------------------
  const statusQuery = createQuery()
  let statuses: IssueStatus[] = []
  statusQuery.query(tracker.class.IssueStatus, {}, (res) => {
    statuses = res
  })
  $: openIds = statuses
    .filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost)
    .map((s) => s._id)
  $: activeIds = statuses.filter((s) => s.category === task.statusCategory.Active).map((s) => s._id)
  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))

  // ---- intents ------------------------------------------------------------
  type IntentId = 'next' | 'stale' | 'grouped'
  interface Intent {
    id: IntentId
    label: string
    match: RegExp
  }
  const intents: Intent[] = [
    { id: 'next', label: 'What should I work on next?', match: /\b(next|work on|my (tasks|issues)|priorit|today|first)\b/i },
    { id: 'stale', label: "What work hasn't been picked up in a while?", match: /\b(stale|stuck|quiet|idle|picked up|untouched|no (update|progress)|in a while|forgotten)\b/i },
    { id: 'grouped', label: 'List issues in progress, grouped by assignee', match: /\b(in progress|group|by assignee|who is (working|doing)|assignee)\b/i }
  ]

  // ---- state --------------------------------------------------------------
  let input = ''
  let inputEl: HTMLInputElement | undefined
  let busy = false
  let answered: Intent | undefined
  let unmatched = false
  let rows: Issue[] = []
  let groups: Array<{ assignee: string, issues: Issue[] }> = []

  onMount(async () => {
    await tick()
    inputEl?.focus()
  })

  const STALE_DAYS = 7
  const DAY = 86_400_000
  const LIMIT = 25

  // Urgent first, then High, Medium, Low; unset priority last.
  function priorityRank (p: IssuePriority): number {
    return p === IssuePriority.NoPriority ? 99 : p
  }

  async function run (intent: Intent): Promise<void> {
    busy = true
    unmatched = false
    answered = intent
    rows = []
    groups = []
    try {
      if (intent.id === 'next') {
        const found = await client.findAll(
          tracker.class.Issue,
          { assignee: me, status: { $in: openIds } },
          { limit: 200 }
        )
        rows = found
          .sort((a, b) => {
            const pr = priorityRank(a.priority) - priorityRank(b.priority)
            if (pr !== 0) return pr
            const ad = a.dueDate ?? Number.MAX_SAFE_INTEGER
            const bd = b.dueDate ?? Number.MAX_SAFE_INTEGER
            return ad - bd
          })
          .slice(0, LIMIT)
      } else if (intent.id === 'stale') {
        rows = await client.findAll(
          tracker.class.Issue,
          { status: { $in: openIds }, modifiedOn: { $lt: Date.now() - STALE_DAYS * DAY } },
          { limit: LIMIT, sort: { modifiedOn: SortingOrder.Ascending } }
        )
      } else {
        const found = await client.findAll(tracker.class.Issue, { status: { $in: activeIds } }, { limit: 300 })
        const ids = Array.from(new Set(found.map((i) => i.assignee).filter((a): a is Ref<Person> => a != null)))
        const people = ids.length > 0 ? await client.findAll(contact.class.Person, { _id: { $in: ids } }) : []
        const nameOf = new Map(people.map((p) => [p._id, formatName(p.name)]))
        const byAssignee = new Map<string, Issue[]>()
        for (const i of found) {
          const key = i.assignee != null ? (nameOf.get(i.assignee) ?? '—') : 'Unassigned'
          byAssignee.set(key, [...(byAssignee.get(key) ?? []), i])
        }
        groups = Array.from(byAssignee.entries())
          .map(([assignee, issues]) => ({ assignee, issues }))
          .sort((a, b) => b.issues.length - a.issues.length)
      }
    } finally {
      busy = false
    }
  }

  async function ask (): Promise<void> {
    const q = input.trim()
    if (q === '') return
    const hit = intents.find((i) => i.match.test(q))
    if (hit === undefined) {
      answered = undefined
      rows = []
      groups = []
      unmatched = true
      return
    }
    await run(hit)
  }

  function open (issue: Issue): void {
    closePopup()
    showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
  }

  function ago (ts: number): string {
    const d = Math.floor((Date.now() - ts) / DAY)
    return d <= 0 ? 'today' : d === 1 ? '1 day' : d + ' days'
  }
</script>

<div class="assistant">
  <div class="assistant__head">
    <span class="assistant__title"><Label label={tracker.string.Assistant} /></span>
    <span class="assistant__scope">All projects · no AI key required</span>
  </div>

  {#if answered === undefined && !unmatched}
    <div class="assistant__chips">
      {#each intents as i, idx (i.id)}
        <button
          class="chip motion-rise"
          style="--i: {idx}"
          on:click={() => {
            input = i.label
            void run(i)
          }}
        >
          {i.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="assistant__body">
    {#if busy}
      <p class="assistant__muted">Looking…</p>
    {:else if unmatched}
      <p class="assistant__muted">
        I can't answer that from the work graph yet. Try one of the questions above — those are answered
        exactly, from your issues.
      </p>
    {:else if answered?.id === 'grouped'}
      {#if groups.length === 0}
        <p class="assistant__muted">Nothing is in progress right now.</p>
      {:else}
        {#each groups as g (g.assignee)}
          <div class="group">
            <span class="group__who">{g.assignee} <span class="group__n">{g.issues.length}</span></span>
            {#each g.issues as i, idx (i._id)}
              <button
                class="row motion-rise"
                style="--i: {idx}"
                on:click={() => {
                  open(i)
                }}
              >
                <span class="row__id">{i.identifier}</span>
                <span class="row__title">{i.title}</span>
              </button>
            {/each}
          </div>
        {/each}
      {/if}
    {:else if answered !== undefined}
      {#if rows.length === 0}
        <p class="assistant__muted">
          {answered.id === 'next' ? 'Nothing open is assigned to you.' : `Nothing open has gone quiet for ${STALE_DAYS} days.`}
        </p>
      {:else}
        {#each rows as i, idx (i._id)}
          <button
            class="row motion-rise"
            style="--i: {idx}"
            on:click={() => {
              open(i)
            }}
          >
            <span class="row__id">{i.identifier}</span>
            <span class="row__title">{i.title}</span>
            <span class="row__meta">
              {#if answered.id === 'stale'}{ago(i.modifiedOn)}{:else}{statusName.get(i.status) ?? ''}{/if}
            </span>
          </button>
        {/each}
      {/if}
    {/if}
  </div>

  <form
    class="assistant__ask"
    on:submit|preventDefault={() => {
      void ask()
    }}
  >
    <input
      bind:this={inputEl}
      bind:value={input}
      class="assistant__input"
      type="text"
      placeholder="Ask about your work…"
      autocomplete="off"
      spellcheck="false"
    />
    <button class="assistant__go" type="submit" disabled={input.trim() === ''}>↑</button>
  </form>
</div>

<style lang="scss">
  .assistant {
    display: flex; flex-direction: column;
    width: min(30rem, 92vw); max-height: min(34rem, 78vh);
    background: var(--theme-popup-color); border: 1px solid var(--theme-popup-divider);
    border-radius: 0.75rem; box-shadow: var(--theme-popup-shadow); overflow: hidden;
  }
  .assistant__head { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.85rem 1rem 0.5rem; }
  .assistant__title { font-weight: 600; color: var(--theme-caption-color); }
  .assistant__scope { font-size: 0.75rem; color: var(--theme-trans-color); }

  .assistant__chips { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.35rem 1rem 0.6rem; }
  .chip {
    text-align: left; padding: 0.55rem 0.75rem; border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem; background: transparent; color: var(--theme-content-color);
    font: inherit; font-size: 0.875rem; cursor: pointer;
    &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); }
  }

  .assistant__body { flex: 1; overflow-y: auto; padding: 0.25rem 0.5rem; }
  .assistant__muted { margin: 0.5rem 0.5rem; font-size: 0.875rem; color: var(--theme-dark-color); }

  .group { margin: 0.4rem 0 0.6rem; }
  .group__who {
    display: block; padding: 0.2rem 0.5rem; font-size: 0.75rem; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase; color: var(--theme-dark-color);
  }
  .group__n { font-weight: 400; color: var(--theme-trans-color); margin-left: 0.3rem; }

  .row {
    display: flex; align-items: baseline; gap: 0.5rem; width: 100%;
    padding: 0.4rem 0.5rem; border: none; border-radius: 0.375rem; background: transparent;
    color: var(--theme-content-color); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer;
    &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); }
  }
  .row__id { font-size: 0.75rem; color: var(--theme-trans-color); flex-shrink: 0; }
  .row__title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row__meta { font-size: 0.75rem; color: var(--theme-trans-color); flex-shrink: 0; }

  .assistant__ask {
    display: flex; align-items: center; gap: 0.4rem; padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--theme-popup-divider);
  }
  .assistant__input {
    flex: 1; padding: 0.55rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem;
    background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.9375rem; outline: none;
    &::placeholder { color: var(--theme-trans-color); }
    &:focus { border-color: var(--theme-caption-color); }
  }
  .assistant__go {
    width: 2.1rem; height: 2.1rem; border: none; border-radius: 0.5rem;
    background: var(--theme-button-pressed); color: var(--theme-caption-color); font: inherit; cursor: pointer;
    &:disabled { opacity: 0.4; cursor: default; }
  }
</style>
