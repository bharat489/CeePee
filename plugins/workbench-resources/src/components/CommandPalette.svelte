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
  Command palette (Ctrl/Cmd-K).

  Built on the existing registries rather than a parallel one: applications
  come from workbench.class.Application and commands from view.class.Action
  in the 'workbench' context, which is the context already reserved for
  actions that make sense with nothing selected. That means anything added
  to those registries shows up here for free.
-->
<script lang="ts">
  import { type Doc } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { translate } from '@hcengineering/platform'
  import { type Action } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import { invokeAction } from '@hcengineering/view-resources'
  import workbench, { type Application } from '@hcengineering/workbench'
  import { Icon, closePopup, languageStore } from '@hcengineering/ui'
  import { createEventDispatcher, onMount, tick } from 'svelte'

  import { doNavigate } from '../utils'

  interface Entry {
    id: string
    kind: 'app' | 'action'
    title: string
    /** Lower-cased haystack: title plus keywords, matched subsequence-style. */
    haystack: string
    icon?: any
    hint?: string
    run: (evt: Event) => Promise<void> | void
  }

  const client = getClient()
  const dispatch = createEventDispatcher()

  let search = ''
  let entries: Entry[] = []
  let selected = 0
  let input: HTMLInputElement | undefined

  onMount(async () => {
    entries = await build()
    await tick()
    input?.focus()
  })

  async function build (): Promise<Entry[]> {
    const model = client.getModel()
    const lang = $languageStore

    const apps = model
      .findAllSync(workbench.class.Application, {})
      .filter((a: Application) => a.hidden !== true)

    const appEntries: Entry[] = await Promise.all(
      apps.map(async (app) => {
        const title = await translate(app.label, {}, lang)
        return {
          id: 'app-' + app._id,
          kind: 'app' as const,
          title,
          haystack: (title + ' ' + app.alias).toLowerCase(),
          icon: app.icon,
          hint: 'Go to',
          run: async (evt: Event) => {
            await doNavigate([], evt, { mode: 'app', application: app.alias })
          }
        }
      })
    )

    // 'workbench' context actions are the ones designed to run with no
    // selection, so they are the only ones safe to offer globally.
    const actions = model.findAllSync(view.class.Action, { 'context.mode': 'workbench' })
    const actionEntries: Entry[] = await Promise.all(
      actions.map(async (a: Action) => {
        const title = await translate(a.label, {}, lang)
        const desc = a.description !== undefined ? await translate(a.description, {}, lang) : undefined
        return {
          id: 'action-' + a._id,
          kind: 'action' as const,
          title,
          haystack: (title + ' ' + (desc ?? '')).toLowerCase(),
          icon: a.icon,
          hint: a.keyBinding?.[0],
          run: async (evt: Event) => {
            await invokeAction([] as unknown as Doc, evt, a)
          }
        }
      })
    )

    return [...appEntries, ...actionEntries]
  }

  // Subsequence match, so "trk" finds "Tracker" the way editors behave.
  function matches (haystack: string, needle: string): boolean {
    if (needle === '') return true
    let i = 0
    for (const ch of haystack) {
      if (ch === needle[i]) i++
      if (i === needle.length) return true
    }
    return false
  }

  $: needle = search.trim().toLowerCase()
  $: filtered = entries.filter((e) => matches(e.haystack, needle)).slice(0, 40)
  $: if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1)

  async function run (entry: Entry, evt: Event): Promise<void> {
    closePopup()
    dispatch('close')
    await entry.run(evt)
  }

  function onKeydown (evt: KeyboardEvent): void {
    if (evt.key === 'ArrowDown') {
      evt.preventDefault()
      selected = Math.min(selected + 1, filtered.length - 1)
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault()
      selected = Math.max(selected - 1, 0)
    } else if (evt.key === 'Enter') {
      evt.preventDefault()
      const entry = filtered[selected]
      if (entry !== undefined) void run(entry, evt)
    } else if (evt.key === 'Escape') {
      evt.preventDefault()
      closePopup()
      dispatch('close')
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="palette">
  <div class="palette__search">
    <!-- svelte-ignore a11y-autofocus -->
    <input
      bind:this={input}
      bind:value={search}
      class="palette__input"
      type="text"
      placeholder="Search commands and apps…"
      spellcheck="false"
      autocomplete="off"
    />
  </div>

  <div class="palette__list">
    {#if filtered.length === 0}
      <div class="palette__empty">No matches</div>
    {:else}
      {#each filtered as entry, i (entry.id)}
        <button
          class="palette__row"
          class:selected={i === selected}
          on:mouseenter={() => {
            selected = i
          }}
          on:click={(evt) => {
            void run(entry, evt)
          }}
        >
          <span class="palette__icon">
            {#if entry.icon !== undefined}
              <Icon icon={entry.icon} size={'small'} />
            {/if}
          </span>
          <span class="palette__title">{entry.title}</span>
          {#if entry.hint !== undefined}
            <span class="palette__hint">{entry.hint}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>

  <div class="palette__footer">
    <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
    <span><kbd>↵</kbd> run</span>
    <span><kbd>esc</kbd> close</span>
  </div>
</div>

<style lang="scss">
  .palette {
    display: flex;
    flex-direction: column;
    width: min(34rem, 90vw);
    max-height: min(28rem, 70vh);
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.75rem;
    box-shadow: var(--theme-popup-shadow);
    overflow: hidden;
    animation: paletteIn 0.16s cubic-bezier(0.2, 0.7, 0.3, 1);
  }

  @keyframes paletteIn {
    from {
      opacity: 0;
      transform: translateY(-0.4rem) scale(0.985);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .palette {
      animation: none;
    }
  }

  .palette__search {
    border-bottom: 1px solid var(--theme-popup-divider);
  }
  .palette__input {
    width: 100%;
    padding: 0.9rem 1rem;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-caption-color);
    font: inherit;
    font-size: 1rem;

    &::placeholder {
      color: var(--theme-trans-color);
    }
  }

  .palette__list {
    flex: 1;
    overflow-y: auto;
    padding: 0.35rem;
  }

  .palette__empty {
    padding: 1.25rem 1rem;
    color: var(--theme-trans-color);
    font-size: 0.875rem;
    text-align: center;
  }

  .palette__row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;

    &.selected {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
    }
  }

  .palette__icon {
    display: inline-flex;
    width: 1rem;
    justify-content: center;
    color: var(--theme-dark-color);
    flex-shrink: 0;
  }

  .palette__title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .palette__hint {
    color: var(--theme-trans-color);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .palette__footer {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 0.85rem;
    border-top: 1px solid var(--theme-popup-divider);
    color: var(--theme-trans-color);
    font-size: 0.75rem;
  }

  kbd {
    display: inline-block;
    min-width: 1.1rem;
    padding: 0 0.25rem;
    margin-right: 0.2rem;
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.2rem;
    font-family: inherit;
    font-size: 0.6875rem;
    text-align: center;
  }
</style>
