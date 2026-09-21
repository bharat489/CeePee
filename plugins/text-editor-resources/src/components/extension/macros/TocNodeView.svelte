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
  A table of contents inside the page, rebuilt from the headings on every
  change. Clicking an entry moves the cursor there.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let updateAttributes: NodeViewProps['updateAttributes']

  interface Entry { level: number, text: string, pos: number }
  let entries: Entry[] = []
  $: depth = Number(node.attrs.depth ?? 3)

  function rebuild (): void {
    const list: Entry[] = []
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'heading' && Number(n.attrs.level) <= depth) list.push({ level: Number(n.attrs.level), text: n.textContent, pos })
    })
    entries = list
  }
  $: depth, rebuild()
  onMount(() => { editor.on('update', rebuild); rebuild() })
  onDestroy(() => { editor.off('update', rebuild) })

  function go (e: Entry): void {
    editor.chain().focus(e.pos + 1, { scrollIntoView: true }).run()
  }
</script>

<NodeViewWrapper data-type="tableOfContents">
  <div class="toc" contenteditable="false">
    <div class="toc__head">
      <b>Contents</b>
      {#if editor.isEditable}
        <select class="toc__sel" value={String(depth)} on:change={(e) => { updateAttributes({ depth: Number(e.currentTarget.value) }) }}>
          <option value="1">H1</option><option value="2">to H2</option><option value="3">to H3</option><option value="4">to H4</option>
        </select>
      {/if}
    </div>
    {#if entries.length === 0}
      <div class="toc__empty">Add headings and they appear here.</div>
    {:else}
      <ol class="toc__list">
        {#each entries as e (e.pos)}
          <li class="toc__i toc__i--{e.level}"><button class="toc__lnk" type="button" on:click={() => { go(e) }}>{e.text === '' ? '(untitled)' : e.text}</button></li>
        {/each}
      </ol>
    {/if}
  </div>
</NodeViewWrapper>

<style lang="scss">
  .toc { margin: 0.5rem 0; padding: 0.5rem 0.75rem; border-left: 3px solid var(--accent-brand); border-radius: 0.3rem; background: var(--theme-panel-color); }
  .toc__head { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--theme-dark-color); b { color: var(--theme-caption-color); } }
  .toc__sel { margin-left: auto; border: 1px solid var(--theme-divider-color); border-radius: 0.35rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.72rem; }
  .toc__empty { font-size: 0.8rem; color: var(--theme-dark-color); padding: 0.25rem 0; }
  .toc__list { list-style: none; margin: 0.25rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .toc__i--2 { padding-left: 1rem; } .toc__i--3 { padding-left: 2rem; } .toc__i--4 { padding-left: 3rem; }
  .toc__lnk { border: none; background: transparent; padding: 0.1rem 0; font: inherit; font-size: 0.85rem; color: var(--primary-button-default); cursor: pointer; text-align: left; &:hover { text-decoration: underline; } }
</style>
