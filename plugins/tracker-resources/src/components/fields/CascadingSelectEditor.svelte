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
<!-- Value editor for a cascading select attribute: pick the parent, then one of its children. -->
<script lang="ts">
  import { type IntlString } from '@hcengineering/platform'
  import { type TypeCascadingSelect } from '@hcengineering/tracker'

  export let value: string | undefined
  export let type: TypeCascadingSelect
  export let onChange: (value: string | undefined) => void
  export let readonly: boolean = false
  export let label: IntlString | undefined = undefined
  export let kind: string = 'link'
  export let size: string = 'medium'
  export let width: string | undefined = undefined

  $: options = type?.options ?? []
  $: [parent, child] = (value ?? '').split(' / ').map((s) => s.trim())
  $: children = options.find((o) => o.parent === parent)?.children ?? []
  function setParent (p: string): void {
    if (p === '') onChange(undefined)
    else onChange(p)
  }
  function setChild (c: string): void {
    onChange(c === '' ? parent : `${parent} / ${c}`)
  }
  // keep unused props from tripping the linter
  $: void [label, kind, size, width]
</script>

<span class="cs" style={width !== undefined ? `width:${width}` : ''}>
  <select class="sel" disabled={readonly} value={parent ?? ''} on:change={(e) => { setParent(e.currentTarget.value) }}>
    <option value="">—</option>
    {#each options as o (o.parent)}<option value={o.parent}>{o.parent}</option>{/each}
  </select>
  {#if parent && children.length > 0}
    <span class="sep">/</span>
    <select class="sel" disabled={readonly} value={child ?? ''} on:change={(e) => { setChild(e.currentTarget.value) }}>
      <option value="">—</option>
      {#each children as c (c)}<option value={c}>{c}</option>{/each}
    </select>
  {/if}
</span>

<style lang="scss">
  .cs { display: inline-flex; align-items: center; gap: 0.25rem; }
  .sel { padding: 0.2rem 0.4rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; max-width: 12rem; }
  .sep { color: var(--theme-trans-color); }
</style>
