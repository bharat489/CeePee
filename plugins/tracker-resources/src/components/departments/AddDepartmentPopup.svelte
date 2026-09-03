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
  import { type AttachedData, type Ref } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { Card, createQuery, getClient } from '@hcengineering/presentation'
  import { IssuePriority, type DepartmentRole, type DepartmentSegment, type Issue } from '@hcengineering/tracker'
  import { Label, getPlatformColorDef, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let issue: Issue
  export let existing: Array<Ref<Department>> = []

  const client = getClient()
  const dispatch = createEventDispatcher()

  const departmentsQuery = createQuery()
  const rolesQuery = createQuery()

  let departments: Department[] = []
  let roles: DepartmentRole[] = []

  let selectedDepartment: Ref<Department> | undefined = undefined
  let selectedRole: Ref<DepartmentRole> = tracker.ids.RoleContributing

  $: departmentsQuery.query(hr.class.Department, {}, (res) => {
    departments = res
  })

  $: rolesQuery.query(tracker.class.DepartmentRole, {}, (res) => {
    roles = res
    // Default to Contributing when it exists; the accountable slot is usually
    // already taken, and adding a second owner is the mistake we're preventing.
    if (!roles.some((r) => r._id === selectedRole) && roles.length > 0) {
      selectedRole = roles.find((r) => r.kind === 'contributing')?._id ?? roles[0]._id
    }
  })

  // A department can only appear once on an issue — two segments for the same
  // team would reintroduce exactly the ambiguity this feature removes.
  $: available = departments.filter((d) => !existing.includes(d._id))
  $: canSave = selectedDepartment !== undefined

  function colorOf (role: DepartmentRole): string {
    return getPlatformColorDef(role.color, $themeStore.dark).color
  }

  async function save (): Promise<void> {
    if (selectedDepartment === undefined) return

    const role = roles.find((r) => r._id === selectedRole)

    // Promoting a new team to accountable demotes the incumbent rather than
    // creating a second owner.
    if (role?.kind === 'accountable') {
      const incumbent = await client.findOne(tracker.class.DepartmentSegment, {
        attachedTo: issue._id,
        role: tracker.ids.RoleAccountable
      })
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
      await client.update(issue, { owningDepartment: selectedDepartment })
    } else {
      const contributing = [...(issue.contributingDepartments ?? []), selectedDepartment]
      await client.update(issue, { contributingDepartments: contributing })
    }

    const data: AttachedData<DepartmentSegment> = {
      department: selectedDepartment,
      role: selectedRole,
      // Start the segment where the issue currently is, so a newly added team
      // inherits context instead of appearing to have already started.
      status: issue.status,
      assignee: null,
      localPriority: IssuePriority.NoPriority,
      estimation: 0,
      dueDate: null,
      enteredStatusAt: Date.now()
    }

    await client.addCollection(
      tracker.class.DepartmentSegment,
      issue.space,
      issue._id,
      issue._class,
      'segments',
      data
    )

    dispatch('close')
  }
</script>

<Card
  label={tracker.string.AddDepartment}
  okAction={save}
  okLabel={tracker.string.AddDepartment}
  canSave={canSave}
  on:close={() => {
    dispatch('close')
  }}
  on:changeContent
>
  <div class="picker">
    <section>
      <span class="picker__label"><Label label={tracker.string.Department} /></span>
      {#if available.length === 0}
        <span class="picker__empty"><Label label={tracker.string.DepartmentAlreadyAdded} /></span>
      {:else}
        <div class="picker__options">
          {#each available as dept (dept._id)}
            <button
              class="option"
              class:option--on={selectedDepartment === dept._id}
              on:click={() => {
                selectedDepartment = dept._id
              }}
            >
              {dept.name}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section>
      <span class="picker__label"><Label label={tracker.string.DepartmentRole} /></span>
      <div class="picker__options">
        {#each roles as role (role._id)}
          <button
            class="option"
            class:option--on={selectedRole === role._id}
            style:border-color={selectedRole === role._id ? colorOf(role) : undefined}
            on:click={() => {
              selectedRole = role._id
            }}
          >
            <span class="option__dot" style:background={colorOf(role)} />
            {role.name}
          </button>
        {/each}
      </div>
    </section>
  </div>
</Card>

<style lang="scss">
  .picker {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 22rem;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .picker__label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-dark-color);
  }
  .picker__empty {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .picker__options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .option {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--theme-content-color);
    background: var(--theme-button-default);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .option:hover {
    background: var(--theme-button-hovered);
  }
  .option--on {
    background: var(--theme-button-pressed);
    color: var(--theme-caption-color);
  }
  .option__dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
</style>
