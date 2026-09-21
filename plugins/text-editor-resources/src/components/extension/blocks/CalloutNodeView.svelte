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
  A callout: a coloured box with an icon or emoji in the margin. Click the icon
  to change the kind, or to set your own emoji.
-->
<script lang="ts">
  import { CALLOUT_KINDS, type CalloutKind } from '@hcengineering/text'
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'
  import NodeViewContent from '../../node-view/NodeViewContent.svelte'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let updateAttributes: NodeViewProps['updateAttributes']

  const icons: Record<CalloutKind, string> = { info: 'ℹ️', tip: '💡', warning: '⚠️', danger: '🛑', note: '📝' }
  const names: Record<CalloutKind, string> = { info: 'Info', tip: 'Tip', warning: 'Warning', danger: 'Danger', note: 'Note' }
  $: kind = (node.attrs.kind ?? 'info') as CalloutKind
  $: emoji = (node.attrs.emoji as string | null) ?? icons[kind] ?? icons.info
  let menu = false
  let custom = ''
  function pick (k: CalloutKind): void {
    updateAttributes({ kind: k, emoji: null })
    menu = false
  }
  function setEmoji (): void {
    const v = custom.trim()
    if (v !== '') updateAttributes({ emoji: v })
    custom = ''
    menu = false
  }
</script>

<NodeViewWrapper data-type="callout" data-kind={kind}>
  <div class="callout" class:callout--info={kind === 'info'} class:callout--tip={kind === 'tip'} class:callout--warning={kind === 'warning'} class:callout--danger={kind === 'danger'} class:callout--note={kind === 'note'}>
    <div class="callout__icon" contenteditable="false">
      <button class="callout__btn" type="button" title={names[kind]} disabled={!editor.isEditable} on:click={() => { menu = !menu }}>{emoji}</button>
      {#if menu}
        <div class="callout__menu" role="menu">
          {#each CALLOUT_KINDS as k}
            <button class="callout__item" class:callout__item--on={k === kind} type="button" on:click={() => { pick(k) }}>{icons[k]} {names[k]}</button>
          {/each}
          <div class="callout__custom">
            <input class="callout__input" placeholder="emoji" maxlength="4" bind:value={custom} on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEmoji() } }} />
            <button class="callout__item" type="button" on:click={setEmoji}>use</button>
          </div>
        </div>
      {/if}
    </div>
    <NodeViewContent class="callout__content" />
  </div>
</NodeViewWrapper>

<style lang="scss">
  .callout { display: flex; gap: 0.6rem; margin: 0.5rem 0; padding: 0.75rem 0.9rem; border-radius: 0.6rem; border: 1px solid var(--callout-border, var(--theme-divider-color)); background: var(--callout-bg, var(--theme-button-default)); }
  .callout--info { --callout-bg: rgba(59, 130, 246, 0.1); --callout-border: rgba(59, 130, 246, 0.35); }
  .callout--tip { --callout-bg: rgba(34, 197, 94, 0.1); --callout-border: rgba(34, 197, 94, 0.35); }
  .callout--warning { --callout-bg: rgba(245, 158, 11, 0.12); --callout-border: rgba(245, 158, 11, 0.4); }
  .callout--danger { --callout-bg: rgba(239, 68, 68, 0.1); --callout-border: rgba(239, 68, 68, 0.4); }
  .callout--note { --callout-bg: rgba(139, 92, 246, 0.1); --callout-border: rgba(139, 92, 246, 0.35); }
  .callout__icon { position: relative; flex: none; }
  .callout__btn { border: none; background: transparent; font: inherit; font-size: 1.15rem; line-height: 1.4; cursor: pointer; padding: 0 0.1rem; }
  .callout__btn:disabled { cursor: default; }
  .callout__menu { position: absolute; z-index: 5; top: 1.8rem; left: 0; min-width: 9rem; display: flex; flex-direction: column; gap: 0.1rem; padding: 0.3rem; border-radius: 0.5rem; border: 1px solid var(--theme-popup-divider); background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); }
  .callout__item { border: none; background: transparent; text-align: left; padding: 0.3rem 0.5rem; border-radius: 0.35rem; font: inherit; font-size: 0.8rem; color: var(--theme-content-color); cursor: pointer; }
  .callout__item:hover, .callout__item--on { background: var(--theme-button-hovered); }
  .callout__custom { display: flex; gap: 0.25rem; align-items: center; border-top: 1px solid var(--theme-popup-divider); padding-top: 0.25rem; margin-top: 0.15rem; }
  .callout__input { width: 4rem; padding: 0.2rem 0.4rem; border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; background: transparent; color: inherit; font: inherit; font-size: 0.8rem; }
  :global(.callout__content) { flex: 1; min-width: 0; }
  :global(.callout__content > :first-child) { margin-top: 0; }
  :global(.callout__content > :last-child) { margin-bottom: 0; }

  // columns share the editor stylesheet through this component
  :global(.ProseMirror .column-list) { display: flex; gap: 1rem; margin: 0.5rem 0; }
  :global(.ProseMirror .column) { flex: 1 1 0; min-width: 0; padding: 0.25rem 0.5rem; border-radius: 0.4rem; border: 1px dashed transparent; }
  :global(.ProseMirror:focus-within .column) { border-color: var(--theme-divider-color); }
  :global(.ProseMirror .column > :first-child) { margin-top: 0; }
</style>
