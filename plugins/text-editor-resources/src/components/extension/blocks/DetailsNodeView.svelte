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
  A toggle: an arrow, a summary line, and a body that folds away. The open
  state is part of the document, so it is shared with everyone reading it.
-->
<script lang="ts">
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'
  import NodeViewContent from '../../node-view/NodeViewContent.svelte'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let updateAttributes: NodeViewProps['updateAttributes']

  $: open = node.attrs.open !== false
  $: void editor
</script>

<NodeViewWrapper data-type="details" data-open={open ? 'true' : 'false'}>
  <div class="details" class:details--closed={!open}>
    <button class="details__toggle" type="button" contenteditable="false" aria-expanded={open} title={open ? 'Collapse' : 'Expand'} on:click={() => { updateAttributes({ open: !open }) }}>
      <svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <NodeViewContent class="details__inner" />
  </div>
</NodeViewWrapper>

<style lang="scss">
  .details { display: flex; gap: 0.35rem; align-items: flex-start; margin: 0.35rem 0; }
  .details__toggle { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; margin-top: 0.1rem; border: none; border-radius: 0.3rem; background: transparent; color: var(--theme-dark-color); cursor: pointer; transition: transform 0.15s; transform: rotate(90deg); }
  .details__toggle:hover { background: var(--theme-button-hovered); }
  .details--closed .details__toggle { transform: rotate(0deg); }
  :global(.details__inner) { flex: 1; min-width: 0; }
  :global(.details__inner .details-summary) { font-weight: 600; min-height: 1.5rem; }
  :global(.details__inner .details-summary:empty::before) { content: 'Toggle title'; color: var(--theme-dark-color); font-weight: 400; }
  :global(.details__inner .details-content) { margin-top: 0.25rem; padding-left: 0.1rem; }
  .details--closed :global(.details-content) { display: none; }
</style>
