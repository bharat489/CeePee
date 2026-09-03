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
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type DepartmentRole, type DepartmentSegment, type Issue, type IssueStatus } from '@hcengineering/tracker'
  import { Button, IconAdd, IconDelete, Label, SelectPopup, showPopup, getPlatformColorDef, themeStore } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import AddDepartmentPopup from './AddDepartmentPopup.svelte'

  export let value: Issue
  export let readonly: boolean = false

  const client = getClient()

  const segmentsQuery = createQuery()
  const departmentsQuery = createQuery()
  const rolesQuery = createQuery()
  const statusQuery = createQuery()

  let segments: DepartmentSegment[] = []
  let departments: Department[] = []
  let roles: DepartmentRole[] = []
  let statuses: IssueStatus[] = []

  $: segmentsQuery.query(
    tracker.class.DepartmentSegment,
    { attachedTo: value._id },
    (res) => {
      segments = res
    }
  )

  $: departmentsQuery.query(hr.class.Department, {}, (res) => {
    departments = res
  })

  $: rolesQuery.query(tracker.class.DepartmentRole, {}, (res) => {
    roles = res
  })

  $: statusQuery.query(tracker.class.IssueStatus, { space: value.space }, (res) => {
    statuses = res
  })

  $: departmentById = new Map(departments.map((d) => [d._id, d]))
  $: roleById = new Map(roles.map((r) => [r._id, r]))
  $: statusById = new Map(statuses.map((s) => [s._id, s]))

  // Accountable first — it is the answer to "who owns this", so it reads first.
  $: ordered = [...segments].sort((a, b) => {
    const ak = roleById.get(a.role)?.kind === 'accountable' ? 0 : 1
    const bk = roleById.get(b.role)?.kind === 'accountable' ? 0 : 1
    if (ak !== bk) return ak - bk
    return (departmentById.get(a.department)?.name ?? '').localeCompare(departmentById.get(b.department)?.name ?? '')
  })

  // A segment blocks closure when its role says so and its own status has not
  // reached a terminal category. Won and Lost both count as resolved — a
  // department that determines the work is not needed should not hold the issue.
  $: blocking = ordered.filter((s) => {
    const role = roleById.get(s.role)
    const category = statusById.get(s.status)?.category
    const resolved = category === task.statusCategory.Won || category === task.statusCategory.Lost
    return (role?.blocksCompletion ?? false) && !resolved
  })

  function colorOf (role: DepartmentRole | undefined): string {
    if (role === undefined) return 'var(--theme-content-color)'
    return getPlatformColorDef(role.color, $themeStore.dark).color
  }

  function addDepartment (): void {
    showPopup(AddDepartmentPopup, {
      issue: value,
      existing: segments.map((s) => s.department)
    })
  }

  async function changeRole (segment: DepartmentSegment, ev: MouseEvent): Promise<void> {
    const items = roles.map((r) => ({ id: r._id, text: r.name }))
    showPopup(
      SelectPopup,
      { value: items, placeholder: tracker.string.DepartmentRole },
      ev.target as HTMLElement,
      (result?: Ref<DepartmentRole>) => {
        if (result === undefined) return
        void applyRole(segment, result)
      }
    )
  }

  // Exactly one accountable department per issue. Promoting a team demotes the
  // incumbent to contributing rather than silently allowing two owners.
  async function applyRole (segment: DepartmentSegment, roleId: Ref<DepartmentRole>): Promise<void> {
    const nextRole = roleById.get(roleId)
    if (nextRole === undefined) return

    if (nextRole.kind === 'accountable') {
      const incumbent = segments.find(
        (s) => s._id !== segment._id && roleById.get(s.role)?.kind === 'accountable'
      )
      if (incumbent !== undefined) {
        await client.updateCollection(
          tracker.class.DepartmentSegment,
          incumbent.space,
          incumbent._id,
          incumbent.attachedTo,
          incumbent.attachedToClass,
          incumbent.collection,
          { role: tracker.ids.RoleContributing }
        )
      }
      await client.update(value, { owningDepartment: segment.department })
    }

    await client.updateCollection(
      tracker.class.DepartmentSegment,
      segment.space,
      segment._id,
      segment.attachedTo,
      segment.attachedToClass,
      segment.collection,
      { role: roleId }
    )
    await syncDenormalised()
  }

  async function removeSegment (segment: DepartmentSegment): Promise<void> {
    await client.removeCollection(
      tracker.class.DepartmentSegment,
      segment.space,
      segment._id,
      segment.attachedTo,
      segment.attachedToClass,
      segment.collection
    )
    if (value.owningDepartment === segment.department) {
      await client.update(value, { owningDepartment: null })
    }
    await syncDenormalised()
  }

  // Keep the flat arrays on Issue in step with the segment collection, so board
  // grouping and filtering can read a department without loading every segment.
  async function syncDenormalised (): Promise<void> {
    const contributing = segments
      .filter((s) => roleById.get(s.role)?.kind !== 'accountable')
      .map((s) => s.department)
    await client.update(value, { contributingDepartments: contributing })
  }
</script>

<div class="segments">
  <div class="segments__head">
    <span class="segments__title">
      <Label label={tracker.string.DepartmentSegments} />
      {#if segments.length > 0}
        <span class="segments__count">{segments.length}</span>
      {/if}
    </span>
    {#if !readonly}
      <Button icon={IconAdd} kind={'ghost'} label={tracker.string.AddDepartment} on:click={addDepartment} />
    {/if}
  </div>

  {#if blocking.length > 0}
    <div class="segments__blocking">
      <Label label={tracker.string.WaitingOn} />
      <span>{blocking.map((s) => departmentById.get(s.department)?.name ?? '—').join(', ')}</span>
    </div>
  {/if}

  {#if ordered.length === 0}
    <div class="segments__empty">
      <Label label={tracker.string.NoDepartments} />
      <span class="segments__hint"><Label label={tracker.string.NoDepartmentsHint} /></span>
    </div>
  {:else}
    <div class="segments__list">
      {#each ordered as segment (segment._id)}
        {@const dept = departmentById.get(segment.department)}
        {@const role = roleById.get(segment.role)}
        {@const status = statusById.get(segment.status)}
        <div class="segment" class:segment--accountable={role?.kind === 'accountable'}>
          <span class="segment__bar" style:background={colorOf(role)} />
          <span class="segment__dept">{dept?.name ?? '—'}</span>
          <button
            class="segment__role"
            style:color={colorOf(role)}
            disabled={readonly}
            on:click={(ev) => {
              void changeRole(segment, ev)
            }}
          >
            {role?.name ?? '—'}
          </button>
          <span class="segment__status">{status?.name ?? '—'}</span>
          {#if !readonly}
            <Button
              icon={IconDelete}
              kind={'ghost'}
              size={'small'}
              showTooltip={{ label: tracker.string.RemoveDepartment }}
              on:click={() => {
                void removeSegment(segment)
              }}
            />
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .segments {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .segments__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .segments__title {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 500;
    color: var(--theme-caption-color);
  }
  .segments__count {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .segments__blocking {
    display: flex;
    gap: 0.4rem;
    font-size: 0.8125rem;
    color: var(--theme-warning-color, var(--theme-dark-color));
  }
  .segments__empty {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.75rem;
    border: 1px dashed var(--theme-divider-color);
    border-radius: 0.375rem;
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
  }
  .segments__hint {
    color: var(--theme-trans-color);
  }
  .segments__list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .segment {
    display: grid;
    grid-template-columns: 3px 1fr auto auto auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.5rem;
    border-radius: 0.375rem;
    background: var(--theme-bg-accent-color, transparent);
  }
  .segment:hover {
    background: var(--theme-button-hovered);
  }
  .segment__bar {
    align-self: stretch;
    border-radius: 2px;
  }
  .segment__dept {
    color: var(--theme-caption-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .segment__role {
    background: transparent;
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
  }
  .segment__role:disabled {
    cursor: default;
  }
  .segment__role:hover:not(:disabled) {
    background: var(--theme-button-pressed);
  }
  .segment__status {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
</style>
