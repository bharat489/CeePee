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
  Shows a rollup value. The server keeps the value on the document, so this is
  display only: numbers as numbers, percentages with their sign, lists joined.
-->
<script lang="ts">
  import { type AnyAttribute } from '@hcengineering/core'

  export let value: number | unknown[] | null | undefined
  export let attribute: AnyAttribute | undefined = undefined
  export let kind: 'no-border' | 'link' | 'list' = 'link'

  const format = (v: unknown): string => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))
  $: aggregate = (attribute?.type as any)?.aggregate as string | undefined
  $: empty = value === undefined || value === null || (Array.isArray(value) && value.length === 0)
  $: text = empty
    ? '—'
    : Array.isArray(value)
      ? value.map(format).join(', ')
      : aggregate === 'percent'
        ? `${value}%`
        : typeof value === 'number'
          ? value.toLocaleString()
          : format(value)
  $: void kind
</script>

<span class="rollup" class:rollup--empty={empty} title={aggregate !== undefined ? `Rollup · ${aggregate}` : undefined}>{text}</span>

<style lang="scss">
  .rollup { font-variant-numeric: tabular-nums; color: var(--theme-content-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rollup--empty { color: var(--theme-dark-color); }
</style>
