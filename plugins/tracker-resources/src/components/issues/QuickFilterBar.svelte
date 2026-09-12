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
  Quick filters on the board: chips that narrow the cards to a query, and
  the place to manage them and the card-colour rules. Both are stored on the
  project so the whole team shares them.
-->
<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import { type Project } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'

  export let project: Project | undefined
  export let active: string[] = []

  const client = getClient()
  const dispatch = createEventDispatcher()
  let manage = false
  const PALETTE = ['#c0f010', '#2b6bea', '#6a45f5', '#f5a623', '#e0475b', '#2bb3a0', '#d97ce0', '#8d8f9a']

  function toggle (name: string): void {
    active = active.includes(name) ? active.filter((n) => n !== name) : [...active, name]
    dispatch('change', { active })
  }
  async function addFilter (): Promise<void> {
    if (project === undefined) return
    const name = prompt('Quick filter name', 'Only mine')
    if (name === null || name.trim() === '') return
    const query = prompt('Query (same language as the Query page)', 'assignee = me')
    if (query === null || query.trim() === '') return
    await client.update(project, { quickFilters: [...(project.quickFilters ?? []).filter((q) => q.name !== name.trim()), { name: name.trim(), query: query.trim() }] })
  }
  async function removeFilter (name: string): Promise<void> {
    if (project === undefined) return
    await client.update(project, { quickFilters: (project.quickFilters ?? []).filter((q) => q.name !== name) })
    if (active.includes(name)) toggle(name)
  }
  async function addColor (): Promise<void> {
    if (project === undefined) return
    const query = prompt('Colour cards matching this query', 'priority = urgent')
    if (query === null || query.trim() === '') return
    const color = prompt('Colour (hex)', PALETTE[(project.cardColors ?? []).length % PALETTE.length])
    if (color === null || color.trim() === '') return
    await client.update(project, { cardColors: [...(project.cardColors ?? []), { query: query.trim(), color: color.trim() }] })
  }
  async function removeColor (k: number): Promise<void> {
    if (project === undefined) return
    await client.update(project, { cardColors: (project.cardColors ?? []).filter((_, i) => i !== k) })
  }
</script>

{#if project !== undefined}
  <div class="qf">
    {#each project.quickFilters ?? [] as f (f.name)}
      <button class="chip" class:chip--on={active.includes(f.name)} title={f.query} on:click={() => { toggle(f.name) }}>{f.name}</button>
    {/each}
    {#if active.length > 0}<button class="lnk" on:click={() => { active = []; dispatch('change', { active }) }}>clear</button>{/if}
    <button class="lnk" on:click={() => { manage = !manage }}>{manage ? 'done' : (project.quickFilters ?? []).length === 0 ? '+ quick filter' : 'manage'}</button>
    {#if manage}
      <div class="mg motion-pop">
        <div class="mg__col"><span class="mg__h">Quick filters</span>
          {#each project.quickFilters ?? [] as f (f.name)}<div class="mg__row"><b>{f.name}</b><code>{f.query}</code><button class="lnk lnk--bad" on:click={() => { void removeFilter(f.name) }}>remove</button></div>{/each}
          <button class="lnk" on:click={() => { void addFilter() }}>+ add quick filter</button>
        </div>
        <div class="mg__col"><span class="mg__h">Card colours</span>
          {#each project.cardColors ?? [] as c, k}<div class="mg__row"><i class="sw" style="background: {c.color}" /><code>{c.query}</code><button class="lnk lnk--bad" on:click={() => { void removeColor(k) }}>remove</button></div>{/each}
          <button class="lnk" on:click={() => { void addColor() }}>+ add colour rule</button>
          <span class="mg__hint">First matching rule wins; shown as the card's left edge.</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .qf { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; padding: 0.35rem 1rem 0.1rem; position: relative; }
  .chip { padding: 0.15rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); font-weight: 600; } }
  .lnk { border: none; background: transparent; padding: 0 0.2rem; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
  .mg { position: absolute; top: 100%; left: 1rem; z-index: 5; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 0.75rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-popup-color, var(--theme-panel-color)); box-shadow: var(--theme-popup-shadow, 0 8px 24px rgba(0, 0, 0, 0.2)); min-width: 36rem; }
  .mg__col { display: flex; flex-direction: column; gap: 0.3rem; }
  .mg__h { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .mg__row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } code { font-size: 0.7rem; color: var(--theme-dark-color); } }
  .mg__hint { font-size: 0.7rem; color: var(--theme-trans-color); }
  .sw { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; }
</style>
