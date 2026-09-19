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
<!-- Sub-navigation of the Admin Center inside the settings navigator. -->
<script lang="ts">
  import { resolvedLocationStore } from '@hcengineering/ui'

  import { icon } from '../projects/icons'
  import { goSection, SECTIONS } from './sections'

  export let kind: 'navigation' | 'content' | undefined = undefined
  export let categoryName: string = 'administration'

  $: current = $resolvedLocationStore.path[5] ?? 'overview'
  $: void categoryName
</script>

{#if kind === 'navigation'}
  <div class="anav">
    {#each SECTIONS as s (s.id)}
      <button class="anav__i" class:anav__i--on={current === s.id} on:click={() => { goSection(s.id) }}>
        <span class="anav__ic">{@html icon(s.icon)}</span>
        <span>{s.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style lang="scss">
  .anav { display: flex; flex-direction: column; gap: 0.1rem; margin: 0.25rem 0 0.5rem 1.25rem; padding-left: 0.5rem; border-left: 1px solid var(--theme-divider-color); }
  .anav__i { display: flex; align-items: center; gap: 0.45rem; padding: 0.35rem 0.6rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--on { background: var(--theme-button-pressed); color: var(--theme-caption-color); font-weight: 600; } }
  .anav__ic { display: inline-flex; color: var(--theme-dark-color); :global(svg) { width: 0.9rem; height: 0.9rem; } }
</style>
