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
  Type editor for a cascading select attribute (Settings → Classes → add
  attribute → Cascading select). One line per parent: "Parent: child, child".
-->
<script lang="ts">
  import { type TypeCascadingSelect } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let type: TypeCascadingSelect | undefined
  export let editable: boolean = true

  const dispatch = createEventDispatcher()
  let text = (type?.options ?? []).map((o) => `${o.parent}: ${o.children.join(', ')}`).join('\n')
  function parse (t: string): TypeCascadingSelect['options'] {
    return t
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((l) => {
        const [parent, rest] = l.split(':')
        return { parent: parent.trim(), children: (rest ?? '').split(',').map((c) => c.trim()).filter((c) => c !== '') }
      })
      .filter((o) => o.parent !== '')
  }
  function emit (): void {
    const options = parse(text)
    dispatch('change', { type: { _class: tracker.class.TypeCascadingSelect, label: tracker.string.CascadingSelect, options } })
  }
  if (type === undefined) emit()
</script>

<span class="label"><Label label={tracker.string.CascadingSelect} /></span>
{#if editable}
  <textarea class="ta" rows="5" placeholder={'Hardware: Laptop, Monitor, Phone\nSoftware: Licence, Access, Bug'} bind:value={text} on:input={emit} on:blur={emit} />
  <span class="hint">One parent per line, children after the colon. Stored as "Parent / Child".</span>
{:else}
  <ul class="ro">{#each type?.options ?? [] as o}<li><b>{o.parent}</b>: {o.children.join(', ')}</li>{/each}</ul>
{/if}

<style lang="scss">
  .label { display: block; margin-bottom: 0.25rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--theme-dark-color); }
  .ta { width: 100%; min-width: 18rem; padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; resize: vertical; }
  .hint { display: block; margin-top: 0.2rem; font-size: 0.7rem; color: var(--theme-trans-color); }
  .ro { margin: 0; padding-left: 1rem; font-size: 0.8125rem; color: var(--theme-content-color); }
</style>
