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
  Links to work that lives elsewhere: an issue in another workspace, a
  pull request, a design file, a ticket in a vendor's tracker. A URL and a
  label; the label defaults to the host so a bare paste still reads well.
-->
<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'

  export let issue: Issue
  export let readonly: boolean = false

  const client = getClient()
  $: links = issue.externalLinks ?? []
  let adding = false
  let url = ''
  let label = ''

  function hostOf (u: string): string {
    try {
      return new URL(u).host.replace(/^www\./, '')
    } catch {
      return u
    }
  }
  async function add (): Promise<void> {
    const u = url.trim()
    if (!/^https?:\/\/\S+$/i.test(u)) return
    await client.update(issue, { externalLinks: [...links, { url: u, label: label.trim() === '' ? hostOf(u) : label.trim() }] })
    url = ''
    label = ''
    adding = false
  }
  async function remove (idx: number): Promise<void> {
    await client.update(issue, { externalLinks: links.filter((_, k) => k !== idx) })
  }
</script>

<div class="links">
  {#each links as l, idx (l.url)}
    <div class="link">
      <a class="link__a" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
      <span class="link__host">{hostOf(l.url)}</span>
      {#if !readonly}<button class="link__x" title="Remove" on:click={() => { void remove(idx) }}>×</button>{/if}
    </div>
  {/each}
  {#if !readonly}
    {#if adding}
      <form class="add" on:submit|preventDefault={add}>
        <input class="add__in" placeholder="https://…" bind:value={url} />
        <input class="add__in" placeholder="Label" bind:value={label} />
        <button class="add__ok" type="submit">Add</button>
        <button class="add__cancel" type="button" on:click={() => { adding = false }}>Cancel</button>
      </form>
    {:else}
      <button class="add__btn" on:click={() => { adding = true }}>+ link</button>
    {/if}
  {/if}
</div>

<style lang="scss">
  .links { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  .link { display: flex; align-items: baseline; gap: 0.4rem; min-width: 0; font-size: 0.8125rem; }
  .link__a { color: var(--theme-caption-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &:hover { text-decoration: underline; } }
  .link__host { font-size: 0.7rem; color: var(--theme-trans-color); flex-shrink: 0; }
  .link__x { margin-left: auto; border: none; background: transparent; color: var(--theme-trans-color); font: inherit; cursor: pointer; &:hover { color: var(--negative-button-default); } }
  .add { display: flex; flex-direction: column; gap: 0.25rem; }
  .add__in { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.35rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .add__ok, .add__cancel, .add__btn { align-self: flex-start; padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .add__ok { background-image: var(--accent-gradient); color: #fff; border-color: transparent; }
</style>
