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
  Duplicate detection while raising a ticket.

  Deliberately uses a $like query on title rather than the fulltext service:
  the create dialog must behave identically whether or not the fulltext and
  elastic services are running, and in the minified stack they are not.

  This only ever informs. It never blocks submission -- the reporter is often
  right that their case differs, and a create form that argues with you is
  worse than a duplicate.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { type Issue, type Project } from '@hcengineering/tracker'
  import { Icon, IconClose, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../plugin'

  export let title: string = ''
  export let space: Ref<Project> | undefined = undefined
  /** Excluded so an issue being edited never matches itself. */
  export let exclude: Ref<Issue> | undefined = undefined

  const client = getClient()

  const MIN_CHARS = 6
  const DEBOUNCE_MS = 400
  const MAX_SHOWN = 3
  // Words this short carry no signal and match nearly everything.
  const MIN_TOKEN = 4

  let matches: Issue[] = []
  let dismissed = false
  let timer: any
  let lastQueried = ''

  $: onTitleChange(title, space)

  function onTitleChange (t: string, sp: Ref<Project> | undefined): void {
    clearTimeout(timer)
    const trimmed = t.trim()
    if (trimmed.length < MIN_CHARS || sp === undefined) {
      matches = []
      return
    }
    // Re-showing on every keystroke after a dismissal would be nagging; a
    // materially different title is a fresh question, so reset only then.
    timer = setTimeout(() => {
      void search(trimmed, sp)
    }, DEBOUNCE_MS)
  }

  async function search (t: string, sp: Ref<Project>): Promise<void> {
    if (t === lastQueried) return
    lastQueried = t

    const tokens = t
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= MIN_TOKEN)

    if (tokens.length === 0) {
      matches = []
      return
    }

    // Rank by the longest token, which is the most distinctive one.
    const probe = tokens.slice().sort((a, b) => b.length - a.length)[0]

    try {
      const found = await client.findAll(
        tracker.class.Issue,
        { space: sp, title: { $like: '%' + probe + '%' } },
        { limit: 12, sort: { modifiedOn: SortingOrder.Descending } }
      )

      const scored = found
        .filter((i) => i._id !== exclude)
        .map((i) => {
          const hay = i.title.toLowerCase()
          const hits = tokens.filter((w) => hay.includes(w)).length
          return { issue: i, score: hits / tokens.length }
        })
        // One shared word out of ten is noise; require a real overlap.
        .filter((s) => s.score >= 0.5)
        .sort((a, b) => b.score - a.score)

      matches = scored.slice(0, MAX_SHOWN).map((s) => s.issue)
      if (matches.length > 0) dismissed = false
    } catch {
      // Never let duplicate detection break issue creation.
      matches = []
    }
  }

  function open (issue: Issue): void {
    showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
  }
</script>

{#if matches.length > 0 && !dismissed}
  <div class="similar" role="status">
    <div class="similar__head">
      <span class="similar__label">
        {matches.length === 1 ? 'A similar issue already exists' : 'Similar issues already exist'}
      </span>
      <button
        class="similar__dismiss"
        title="Dismiss"
        on:click={() => {
          dismissed = true
        }}
      >
        <Icon icon={IconClose} size={'x-small'} />
      </button>
    </div>
    <div class="similar__list">
      {#each matches as issue (issue._id)}
        <button
          class="similar__item"
          on:click={() => {
            open(issue)
          }}
        >
          <span class="similar__id">{issue.identifier}</span>
          <span class="similar__title">{issue.title}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style lang="scss">
  .similar {
    margin: 0 0.75rem 0.25rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--theme-warning-color, var(--theme-divider-color));
    border-radius: 0.375rem;
    background: var(--theme-bg-accent-color, transparent);
  }
  .similar__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }
  .similar__label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--theme-warning-color, var(--theme-dark-color));
  }
  .similar__dismiss {
    display: inline-flex;
    padding: 0.15rem;
    border: none;
    background: transparent;
    color: var(--theme-trans-color);
    cursor: pointer;
    border-radius: 0.2rem;

    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .similar__list {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .similar__item {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0.25rem 0.3rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
    }
  }
  .similar__id {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
    flex-shrink: 0;
  }
  .similar__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
