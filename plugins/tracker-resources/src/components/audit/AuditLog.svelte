<!--
// Copyright © 2026 Hardcore Engineering Inc.
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
  Audit log: who changed what, when, across the workspace.

  Built on the activity feed the platform already writes for every document
  change, so it is complete from day one and costs nothing extra to keep.
  This is a record of edits to shared work -- not of presence, reading, or
  attention, which this product deliberately does not track.
-->
<script lang="ts">
  import activity, { type DocUpdateMessage } from '@hcengineering/activity'
  import { formatName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import core, { SortingOrder, type Class, type Doc, type PersonId, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const query = createQuery()
  const DAY = 86_400_000

  let days = 7
  let limit = 200
  let who = ''
  let messages: DocUpdateMessage[] = []

  $: query.query(
    activity.class.DocUpdateMessage,
    { createdOn: { $gte: Date.now() - days * DAY } },
    (r) => {
      messages = r
    },
    { limit, sort: { createdOn: SortingOrder.Descending } }
  )

  // person names, resolved lazily per social id
  let names = new Map<PersonId, string>()
  function nameOf (id: PersonId | undefined): string {
    if (id === undefined) return ''
    const n = names.get(id)
    if (n !== undefined) return n
    names.set(id, '…')
    getPersonByPersonIdCb(id, (p: Readonly<Person> | null) => {
      names = new Map(names).set(id, p !== null ? formatName(p.name) : 'system')
    })
    return '…'
  }

  function className (c: Ref<Class<Doc>>): string {
    try {
      const cls = hierarchy.getClass(c)
      return cls.label !== undefined ? '' : (cls as any).name ?? c
    } catch {
      return c
    }
  }
  function classLabel (c: Ref<Class<Doc>>): any {
    try {
      return hierarchy.getClass(c).label
    } catch {
      return undefined
    }
  }

  function summary (m: DocUpdateMessage): string {
    const u = m.attributeUpdates
    if (u === undefined) return m.updateCollection !== undefined ? m.updateCollection : ''
    const set = u.set.filter((v) => v !== null && v !== '').map(String)
    const added = u.added.length > 0 ? ` +${u.added.length}` : ''
    const removed = u.removed.length > 0 ? ` −${u.removed.length}` : ''
    return `${u.attrKey}${set.length > 0 ? ' → ' + set.map((s) => (s.length > 40 ? s.slice(0, 39) + '…' : s)).join(', ') : ''}${added}${removed}`
  }

  function when (ts: number | undefined): string {
    if (ts === undefined) return ''
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function open (m: DocUpdateMessage): void {
    showPanel(view.component.EditDoc, m.objectId, m.objectClass, 'content')
  }

  $: filtered = who.trim() === '' ? messages : messages.filter((m) => nameOf(m.createdBy ?? m.modifiedBy).toLowerCase().includes(who.trim().toLowerCase()))
</script>

<div class="hulyComponent">
  <div class="audit">
    <header class="audit__head">
      <div>
        <span class="audit__title"><Label label={tracker.string.AuditLog} /></span>
        <span class="audit__sub"><Label label={tracker.string.AuditLogHint} /></span>
      </div>
      <div class="audit__filters">
        <input class="audit__input" type="text" placeholder="person" bind:value={who} />
        <select class="audit__select" bind:value={days}>
          <option value={1}>24h</option>
          <option value={7}>7d</option>
          <option value={30}>30d</option>
          <option value={90}>90d</option>
        </select>
      </div>
    </header>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="th">When</th>
            <th class="th">Who</th>
            <th class="th">Action</th>
            <th class="th">Object</th>
            <th class="th">Change</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as m, idx (m._id)}
            <tr class="tr motion-rise" style="--i: {Math.min(idx, 12)}" on:click={() => { open(m) }}>
              <td class="td td--when">{when(m.createdOn ?? m.modifiedOn)}</td>
              <td class="td td--who">{nameOf(m.createdBy ?? m.modifiedBy)}</td>
              <td class="td"><span class="pill pill--{m.action}">{m.action}</span></td>
              <td class="td td--obj">
                {#if classLabel(m.objectClass) !== undefined}<Label label={classLabel(m.objectClass)} />{:else}{className(m.objectClass)}{/if}
              </td>
              <td class="td td--change">{summary(m)}</td>
            </tr>
          {/each}
          {#if filtered.length === 0}
            <tr><td class="td td--empty" colspan="5"><Label label={tracker.string.NothingToShow} /></td></tr>
          {/if}
        </tbody>
      </table>
    </div>
    {#if messages.length >= limit}
      <button
        class="more"
        on:click={() => {
          limit += 200
        }}
      >
        <Label label={tracker.string.LoadMore} />
      </button>
    {/if}
  </div>
</div>

<style lang="scss">
  .audit {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem 2rem;
    overflow: auto;
  }
  .audit__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    > div:first-child {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
  }
  .audit__title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .audit__sub {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .audit__filters {
    display: flex;
    gap: 0.4rem;
  }
  .audit__input,
  .audit__select {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.4rem;
    background: var(--theme-panel-color);
    color: var(--theme-caption-color);
    font: inherit;
    font-size: 0.8125rem;
    outline: none;
    &:focus {
      border-color: var(--accent-brand);
    }
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
  }
  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .th,
  .td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--theme-divider-color);
    text-align: left;
    white-space: nowrap;
  }
  .th {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-dark-color);
    background: var(--theme-comp-header-color);
  }
  .tr {
    cursor: pointer;
    &:hover .td {
      background: var(--theme-button-hovered);
    }
  }
  .td {
    color: var(--theme-content-color);
    &--when {
      color: var(--theme-trans-color);
      font-variant-numeric: tabular-nums;
    }
    &--who {
      color: var(--theme-caption-color);
      font-weight: 500;
    }
    &--change {
      max-width: 28rem;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 0.75rem;
    }
    &--empty {
      text-align: center;
      color: var(--theme-trans-color);
      border-bottom: none;
    }
  }
  .pill {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 600;
    background: var(--theme-button-pressed);
    color: var(--theme-caption-color);
    &--create {
      background: var(--accent-brand-soft);
      color: var(--accent-brand-ink);
    }
    &--remove {
      background: rgba(203, 75, 66, 0.15);
      color: var(--negative-button-default);
    }
  }
  .more {
    align-self: center;
    padding: 0.5rem 1rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 999px;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    cursor: pointer;
    &:hover {
      background: var(--theme-button-hovered);
    }
  }
</style>
