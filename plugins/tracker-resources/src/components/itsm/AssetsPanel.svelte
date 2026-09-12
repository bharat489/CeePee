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
<!-- Assets linked to one issue, with link and unlink. Hidden when the project has no assets. -->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue, type SupportAsset } from '@hcengineering/tracker'

  import tracker from '../../plugin'

  export let issue: Issue
  export let readonly = false

  const client = getClient()
  const q = createQuery()
  let assets: SupportAsset[] = []
  $: q.query(tracker.class.Asset, { space: issue.space }, (r) => { assets = r })
  $: linked = (issue.assets ?? []).map((id) => assets.find((a) => a._id === id)).filter((a): a is SupportAsset => a !== undefined)
  $: free = assets.filter((a) => !(issue.assets ?? []).includes(a._id) && a.status !== 'retired')
  let pick: Ref<SupportAsset> | '' = ''
  async function link (): Promise<void> {
    if (pick === '') return
    await client.update(issue, { assets: [...(issue.assets ?? []), pick] })
    pick = ''
  }
  async function unlink (id: Ref<SupportAsset>): Promise<void> {
    await client.update(issue, { assets: (issue.assets ?? []).filter((x) => x !== id) })
  }
</script>

{#if assets.length > 0}
  <div class="ap">
    {#each linked as a (a._id)}
      <span class="asset"><b>{a.name}</b><span class="muted">{a.kind}{a.location ? ` · ${a.location}` : ''}</span>{#if !readonly}<button class="x" title="Unlink" on:click={() => { void unlink(a._id) }}>×</button>{/if}</span>
    {/each}
    {#if !readonly && free.length > 0}
      <span class="add"><select class="select" bind:value={pick}><option value="">link an asset…</option>{#each free as a (a._id)}<option value={a._id}>{a.name} · {a.kind}</option>{/each}</select>{#if pick !== ''}<button class="lnk" on:click={() => { void link() }}>link</button>{/if}</span>
    {/if}
    {#if linked.length === 0 && (readonly || free.length === 0)}<span class="muted">—</span>{/if}
  </div>
{/if}

<style lang="scss">
  .ap { display: flex; flex-direction: column; gap: 0.3rem; }
  .asset { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.8125rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .muted { font-size: 0.75rem; color: var(--theme-trans-color); }
  .x { margin-left: auto; border: none; background: transparent; color: var(--theme-trans-color); font: inherit; cursor: pointer; &:hover { color: var(--negative-button-default); } }
  .add { display: flex; align-items: center; gap: 0.4rem; }
  .select { flex: 1; min-width: 0; padding: 0.25rem 0.4rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.75rem; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; }
</style>
