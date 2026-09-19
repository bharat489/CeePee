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
  Admin Center: one place for workspace administration. Overview with usage,
  users with bulk actions, user groups, custom roles and granular permissions,
  security controls and automation across every project. The section comes
  from the location (settings/administration/<section>).
-->
<script lang="ts">
  import { resolvedLocationStore } from '@hcengineering/ui'

  import { icon } from '../projects/icons'
  import AdminAutomation from './AdminAutomation.svelte'
  import AdminGroups from './AdminGroups.svelte'
  import AdminOverview from './AdminOverview.svelte'
  import AdminRoles from './AdminRoles.svelte'
  import AdminSecurity from './AdminSecurity.svelte'
  import AdminUsers from './AdminUsers.svelte'
  import { goSection, SECTIONS } from './sections'

  export let kind: 'navigation' | 'content' | undefined = undefined
  $: void kind
  $: section = SECTIONS.find((s) => s.id === ($resolvedLocationStore.path[5] ?? 'overview')) ?? SECTIONS[0]
</script>

<div class="admin">
  <header class="admin__head">
    <div class="admin__titles">
      <span class="admin__crumb">Administration</span>
      <span class="admin__title">{section.label}</span>
      <span class="admin__hint">{section.hint}</span>
    </div>
    <nav class="admin__tabs" aria-label="Administration sections">
      {#each SECTIONS as s (s.id)}
        <button class="tab" class:tab--on={s.id === section.id} on:click={() => { goSection(s.id) }}><span class="tab__ic">{@html icon(s.icon)}</span>{s.label}</button>
      {/each}
    </nav>
  </header>
  <div class="admin__body">
    {#if section.id === 'users'}
      <AdminUsers />
    {:else if section.id === 'groups'}
      <AdminGroups />
    {:else if section.id === 'roles'}
      <AdminRoles />
    {:else if section.id === 'security'}
      <AdminSecurity />
    {:else if section.id === 'automation'}
      <AdminAutomation />
    {:else}
      <AdminOverview />
    {/if}
  </div>
</div>

<style lang="scss">
  .admin { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  .admin__head { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.1rem 1.5rem 0; border-bottom: 1px solid var(--theme-divider-color); }
  .admin__titles { display: flex; flex-direction: column; gap: 0.1rem; }
  .admin__crumb { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--theme-dark-color); }
  .admin__title { font-size: 1.35rem; font-weight: 700; color: var(--theme-caption-color); letter-spacing: -0.01em; }
  .admin__hint { font-size: 0.8125rem; color: var(--theme-dark-color); }
  .admin__tabs { display: flex; gap: 0.15rem; overflow-x: auto; }
  .tab { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.75rem; border: none; border-bottom: 2px solid transparent; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8375rem; white-space: nowrap; cursor: pointer; &:hover { color: var(--theme-caption-color); } &--on { color: var(--accent-brand); border-bottom-color: var(--accent-brand); font-weight: 600; } }
  .tab__ic { display: inline-flex; :global(svg) { width: 0.9rem; height: 0.9rem; } }
  .admin__body { flex: 1; min-height: 0; overflow: auto; padding: 1.1rem 1.5rem 2rem; }
</style>
