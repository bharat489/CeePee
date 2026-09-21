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
  The pages directly under this page, live. Only meaningful on a document page.
-->
<script lang="ts">
  import { SortingOrder, type Class, type Doc, type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { type AnyComponent, getCurrentLocation, getPanelURI, navigate } from '@hcengineering/ui'
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'
  import type { MacroContext } from './macros'

  export let node: NodeViewProps['node']
  export let context: MacroContext | undefined = undefined

  const DOCUMENT = 'document:class:Document' as Ref<Class<Doc>>
  interface PageLike extends Doc { title: string, rank?: string }

  $: onDocument = context?.objectClass === DOCUMENT && context.objectId !== undefined
  const q = createQuery()
  let pages: PageLike[] = []
  $: if (onDocument) {
    q.query(DOCUMENT, { parent: context?.objectId } as any, (r) => { pages = r as unknown as PageLike[] }, { sort: { rank: SortingOrder.Ascending } })
  }
  function open (p: PageLike): void {
    navigate({ ...getCurrentLocation(), fragment: getPanelURI('document:component:EditDoc' as AnyComponent, p._id, p._class) })
  }
  $: void node
</script>

<NodeViewWrapper data-type="childPages">
  <div class="cp" contenteditable="false">
    <div class="cp__head"><span class="cp__mark">⌂</span><b>Pages under this one</b><span class="cp__count">{pages.length}</span></div>
    {#if !onDocument}
      <div class="cp__empty">This block lists child pages when it sits on a document page.</div>
    {:else if pages.length === 0}
      <div class="cp__empty">No child pages yet.</div>
    {:else}
      <ul class="cp__list">
        {#each pages as p (p._id)}
          <li><button class="cp__item" type="button" on:click={() => { open(p) }}>📄 {p.title}</button></li>
        {/each}
      </ul>
    {/if}
  </div>
</NodeViewWrapper>

<style lang="scss">
  .cp { margin: 0.5rem 0; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); overflow: hidden; }
  .cp__head { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.6rem; font-size: 0.75rem; color: var(--theme-dark-color); border-bottom: 1px solid var(--theme-divider-color); b { color: var(--theme-caption-color); } }
  .cp__mark { color: var(--accent-brand); }
  .cp__count { margin-left: auto; padding: 0 0.45rem; border-radius: 999px; background: var(--theme-button-hovered); font-weight: 600; }
  .cp__empty { padding: 0.6rem 0.75rem; font-size: 0.8rem; color: var(--theme-dark-color); }
  .cp__list { list-style: none; margin: 0; padding: 0.25rem 0.4rem; display: flex; flex-direction: column; }
  .cp__item { border: none; background: transparent; text-align: left; padding: 0.3rem 0.4rem; border-radius: 0.35rem; font: inherit; font-size: 0.85rem; color: var(--theme-content-color); cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
</style>
