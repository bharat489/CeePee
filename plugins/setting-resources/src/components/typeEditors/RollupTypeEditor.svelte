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
  Configures a rollup attribute: which relation to follow from this class, which
  field of the related documents to read, and how to fold the values. The
  attribute is read-only for people; the server keeps it current.
-->
<script lang="ts">
  import core, { type AnyAttribute, type Association, type Class, type Doc, type Ref, type TypeRollup } from '@hcengineering/core'
  import { TypeRollup as makeRollup } from '@hcengineering/model'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { type ButtonKind, type ButtonSize, type DropdownTextItem, DropdownLabels, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'

  export let type: TypeRollup | undefined
  export let attribute: AnyAttribute | undefined = undefined
  export let attributeOf: Ref<Class<Doc>>
  export let editable: boolean = true
  export let kind: ButtonKind = 'regular'
  export let size: ButtonSize = 'medium'
  export let isCard: boolean = false
  export let width: string | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const model = client.getModel()

  type Aggregate = TypeRollup['aggregate']
  type FieldKind = 'number' | 'boolean' | 'text' | 'none'
  interface Side { id: string, assoc: Association, direction: 'A' | 'B', target: Ref<Class<Doc>> }

  // every relation that touches this class, one entry per side it sits on
  const sidesOf: Side[] = []
  for (const a of model.findAllSync(core.class.Association, {})) {
    if (hierarchy.isDerived(attributeOf, a.classA)) sidesOf.push({ id: `${a._id}_A`, assoc: a, direction: 'A', target: a.classB })
    if (hierarchy.isDerived(attributeOf, a.classB)) sidesOf.push({ id: `${a._id}_B`, assoc: a, direction: 'B', target: a.classA })
  }
  let relationItems: DropdownTextItem[] = []
  async function buildRelationItems (): Promise<void> {
    const items: DropdownTextItem[] = []
    for (const s of sidesOf) {
      const cls = hierarchy.getClass(s.target)
      const name = cls.label !== undefined ? await translate(cls.label, {}, $themeStore.language) : s.target
      const via = s.direction === 'A' ? s.assoc.nameB : s.assoc.nameA
      items.push({ id: s.id, label: `${via} · ${name}` })
    }
    relationItems = items
  }
  void buildRelationItems()

  let sideId: string | undefined = type !== undefined ? `${type.association}_${type.direction}` : undefined
  let field: string = type?.field ?? ''
  let aggregate: Aggregate = type?.aggregate ?? 'count'

  $: side = sidesOf.find((s) => s.id === sideId)

  const kindOf = (a: AnyAttribute): FieldKind | undefined => {
    const c = a.type._class
    if (c === core.class.TypeNumber) return 'number'
    if (c === core.class.TypeBoolean) return 'boolean'
    if (c === core.class.TypeString || c === core.class.TypeHyperlink || c === core.class.EnumOf) return 'text'
    return undefined
  }
  let fieldItems: DropdownTextItem[] = []
  let fieldKinds = new Map<string, FieldKind>()
  async function buildFieldItems (target: Ref<Class<Doc>> | undefined): Promise<void> {
    const items: DropdownTextItem[] = [{ id: '', label: '(just count the related items)' }]
    const kinds = new Map<string, FieldKind>()
    if (target !== undefined) {
      for (const [name, a] of hierarchy.getAllAttributes(target)) {
        const k = kindOf(a)
        if (k === undefined || a.hidden === true) continue
        kinds.set(name, k)
        items.push({ id: name, label: await translate(a.label, {}, $themeStore.language) })
      }
    }
    fieldKinds = kinds
    fieldItems = items
  }
  $: void buildFieldItems(side?.target)

  const labels: Record<Aggregate, string> = {
    count: 'Count',
    sum: 'Sum',
    avg: 'Average',
    min: 'Minimum',
    max: 'Maximum',
    list: 'List of values',
    unique: 'Count of distinct values',
    checked: 'Count of checked',
    percent: 'Percent checked'
  }
  const aggregatesFor = (k: FieldKind): Aggregate[] =>
    k === 'none' ? ['count'] : k === 'number' ? ['count', 'sum', 'avg', 'min', 'max', 'list', 'unique'] : k === 'boolean' ? ['count', 'checked', 'percent'] : ['count', 'list', 'unique']
  $: fieldKind = field === '' ? 'none' : (fieldKinds.get(field) ?? 'text')
  $: aggregateItems = aggregatesFor(fieldKind).map((a) => ({ id: a, label: labels[a] }))
  $: if (!aggregatesFor(fieldKind).includes(aggregate)) aggregate = 'count'

  // report only once mounted: the host attaches its change listener after creating this component
  let ready = false
  onMount(() => {
    ready = true
  })
  $: if (ready && side !== undefined) {
    dispatch('change', {
      type: makeRollup({ association: side.assoc._id, direction: side.direction, field, aggregate }),
      extra: { readonly: true, automationOnly: true }
    })
  }
  $: void attribute
  $: void isCard
</script>

<div class="rollup-editor">
  <span class="label">Relation</span>
  {#if sidesOf.length === 0}
    <span class="hint">No relation touches this class yet. Create one under Settings → Relations first.</span>
  {:else}
    <DropdownLabels label={core.string.Relations} items={relationItems} bind:selected={sideId} {kind} {size} {width} disabled={!editable} />
  {/if}
  {#if side !== undefined}
    <span class="label">Field to roll up</span>
    <DropdownLabels label={core.string.Rollup} items={fieldItems} bind:selected={field} {kind} {size} {width} disabled={!editable} />
    <span class="label">Fold</span>
    <DropdownLabels label={core.string.Rollup} items={aggregateItems} bind:selected={aggregate} {kind} {size} {width} disabled={!editable} />
    <span class="hint">Kept current by the server; nobody edits it by hand.</span>
  {/if}
</div>

<style lang="scss">
  .rollup-editor { display: flex; flex-direction: column; gap: 0.35rem; }
  .label { font-size: 0.75rem; font-weight: 600; color: var(--theme-dark-color); }
  .hint { font-size: 0.75rem; color: var(--theme-dark-color); }
</style>
