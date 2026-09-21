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
  An inline status label. Click it to change the text or the colour.
-->
<script lang="ts">
  import { STATUS_CHIP_COLORS } from '@hcengineering/text'
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let updateAttributes: NodeViewProps['updateAttributes']

  $: text = String(node.attrs.text ?? 'STATUS')
  $: color = String(node.attrs.color ?? 'grey')
  let open = false
  let draft = ''
  function toggle (): void {
    if (!editor.isEditable) return
    draft = text
    open = !open
  }
  function apply (): void {
    const t = draft.trim().toUpperCase()
    if (t !== '') updateAttributes({ text: t })
    open = false
  }
</script>

<NodeViewWrapper as="span" data-type="statusChip">
  <span class="sc" contenteditable="false">
    <button class="sc__chip sc__chip--{color}" type="button" on:click={toggle}>{text}</button>
    {#if open}
      <span class="sc__menu" role="menu">
        <input class="sc__in" bind:value={draft} maxlength="24" on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } if (e.key === 'Escape') { open = false } }} />
        <span class="sc__colors">
          {#each STATUS_CHIP_COLORS as c}
            <button class="sc__c sc__chip--{c}" class:sc__c--on={c === color} type="button" title={c} on:click={() => { updateAttributes({ color: c }) }}></button>
          {/each}
        </span>
        <button class="sc__ok" type="button" on:click={apply}>ok</button>
      </span>
    {/if}
  </span>
</NodeViewWrapper>

<style lang="scss">
  .sc { position: relative; display: inline-block; vertical-align: baseline; }
  .sc__chip { border: none; border-radius: 0.3rem; padding: 0.05rem 0.45rem; font: inherit; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; cursor: pointer; line-height: 1.5; }
  .sc__chip--grey { background: #e2e8f0; color: #334155; }
  .sc__chip--green { background: #dcfce7; color: #166534; }
  .sc__chip--yellow { background: #fef3c7; color: #92400e; }
  .sc__chip--red { background: #fee2e2; color: #991b1b; }
  .sc__chip--blue { background: #dbeafe; color: #1e40af; }
  .sc__chip--purple { background: #ede9fe; color: #5b21b6; }
  .sc__menu { position: absolute; z-index: 6; top: 1.6rem; left: 0; display: flex; align-items: center; gap: 0.3rem; padding: 0.3rem; border-radius: 0.45rem; border: 1px solid var(--theme-popup-divider); background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); white-space: nowrap; }
  .sc__in { width: 7rem; padding: 0.15rem 0.35rem; border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; background: transparent; color: inherit; font: inherit; font-size: 0.75rem; }
  .sc__colors { display: inline-flex; gap: 0.2rem; }
  .sc__c { width: 1rem; height: 1rem; border: 2px solid transparent; border-radius: 50%; cursor: pointer; padding: 0; &--on { border-color: var(--theme-caption-color); } }
  .sc__ok { border: none; background: var(--primary-button-default); color: #fff; border-radius: 0.3rem; padding: 0.15rem 0.45rem; font: inherit; font-size: 0.72rem; cursor: pointer; }
</style>
