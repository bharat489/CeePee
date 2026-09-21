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
  An inline date. Reads as a date, edits with the browser's date picker, and
  turns red once it is in the past.
-->
<script lang="ts">
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let updateAttributes: NodeViewProps['updateAttributes']

  $: date = node.attrs.date as number | null
  $: iso = date != null ? new Date(date).toISOString().slice(0, 10) : ''
  $: label = date != null ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'pick a date'
  $: past = date != null && date < Date.now() - 24 * 60 * 60 * 1000
  let input: HTMLInputElement
  function pick (): void {
    if (!editor.isEditable) return
    input?.showPicker?.()
    input?.focus()
  }
  function changed (e: Event): void {
    const v = (e.currentTarget as HTMLInputElement).value
    if (v !== '') updateAttributes({ date: Date.parse(v + 'T00:00:00Z') })
  }
</script>

<NodeViewWrapper as="span" data-type="dateChip">
  <span class="dc" contenteditable="false">
    <button class="dc__chip" class:dc__chip--past={past} type="button" on:click={pick}>📅 {label}</button>
    <input class="dc__in" type="date" value={iso} bind:this={input} on:change={changed} tabindex="-1" />
  </span>
</NodeViewWrapper>

<style lang="scss">
  .dc { position: relative; display: inline-block; vertical-align: baseline; }
  .dc__chip { border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; padding: 0.05rem 0.45rem; background: var(--theme-button-default); font: inherit; font-size: 0.8rem; color: var(--theme-content-color); cursor: pointer; line-height: 1.5; &--past { color: var(--negative-button-default); border-color: var(--negative-button-default); } }
  .dc__in { position: absolute; left: 0; top: 100%; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
