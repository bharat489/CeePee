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
<!-- Settings → Import: one place for Jira (CSV and REST), Trello, Asana and GitHub. -->
<script lang="ts">
  import { Label } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import AsanaImport from './AsanaImport.svelte'
  import GitHubImport from './GitHubImport.svelte'
  import JiraImport from './JiraImport.svelte'
  import TrelloImport from './TrelloImport.svelte'

  const TABS = [
    { id: 'jira', label: 'Jira', hint: 'CSV export or Cloud REST API' },
    { id: 'trello', label: 'Trello', hint: 'Board JSON export' },
    { id: 'asana', label: 'Asana', hint: 'Project CSV export' },
    { id: 'github', label: 'GitHub Issues', hint: 'Straight from the API' }
  ] as const
  let tab: (typeof TABS)[number]['id'] = 'jira'
</script>

<div class="hulyComponent">
  <div class="hub">
    <header class="hub__head">
      <span class="hub__title"><Label label={tracker.string.Import} /></span>
      <nav class="tabs">
        {#each TABS as t (t.id)}<button class="tab" class:tab--active={tab === t.id} title={t.hint} on:click={() => { tab = t.id }}>{t.label}</button>{/each}
      </nav>
    </header>
    {#if tab === 'jira'}
      <JiraImport />
    {:else}
      <div class="body">
        {#if tab === 'trello'}<TrelloImport />{:else if tab === 'asana'}<AsanaImport />{:else}<GitHubImport />{/if}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .hub { display: flex; flex-direction: column; gap: 0.5rem; overflow: auto; }
  .hub__head { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 1.5rem 2rem 0; }
  .hub__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .tabs { display: flex; gap: 0.25rem; }
  .tab { padding: 0.35rem 0.7rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--active { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--theme-caption-color); } }
  .body { padding: 0.5rem 2rem 1.5rem; max-width: 56rem; }
</style>
