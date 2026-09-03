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
  import core, { type Data } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type DepartmentRole, type DepartmentRoleKind } from '@hcengineering/tracker'
  import {
    Button,
    EditBox,
    IconAdd,
    IconDelete,
    Label,
    Toggle,
    getPlatformColorDef,
    themeStore
  } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const client = getClient()
  const rolesQuery = createQuery()

  let roles: DepartmentRole[] = []
  let creating = false
  let draftName = ''
  let draftKind: DepartmentRoleKind = 'contributing'
  let draftBlocks = true

  $: rolesQuery.query(tracker.class.DepartmentRole, {}, (res) => {
    roles = res
  })

  // Accountable first, then contributing, each alphabetical — the same order the
  // issue panel uses, so the two screens agree.
  $: ordered = [...roles].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'accountable' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  $: usedColors = new Set(roles.map((r) => r.color))
  $: canCreate = draftName.trim().length > 0

  function colorOf (role: DepartmentRole): string {
    return getPlatformColorDef(role.color, $themeStore.dark).color
  }

  // Pick a palette slot nobody is using yet, so a new role is distinguishable
  // on the board without the user having to choose a colour.
  function nextColor (): number {
    for (let i = 0; i < 20; i++) {
      if (!usedColors.has(i)) return i
    }
    return roles.length % 20
  }

  async function create (): Promise<void> {
    if (!canCreate) return
    const data: Data<DepartmentRole> = {
      name: draftName.trim(),
      kind: draftKind,
      color: nextColor(),
      blocksCompletion: draftBlocks
    }
    await client.createDoc(tracker.class.DepartmentRole, core.space.Model, data)
    draftName = ''
    draftKind = 'contributing'
    draftBlocks = true
    creating = false
  }

  async function rename (role: DepartmentRole, name: string): Promise<void> {
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed === role.name) return
    await client.update(role, { name: trimmed })
  }

  async function toggleBlocking (role: DepartmentRole, blocksCompletion: boolean): Promise<void> {
    await client.update(role, { blocksCompletion })
  }

  async function remove (role: DepartmentRole): Promise<void> {
    // The two seeded roles carry the structural accountable/contributing
    // distinction the model depends on, so they are renameable but not
    // removable. Custom roles delete freely.
    if (role.readonly === true) return
    await client.remove(role)
  }
</script>

<div class="roles">
  <div class="roles__head">
    <div class="roles__intro">
      <h3><Label label={tracker.string.DepartmentRoles} /></h3>
      <p><Label label={tracker.string.BlocksCompletionHint} /></p>
    </div>
    {#if !creating}
      <Button
        icon={IconAdd}
        kind={'primary'}
        label={tracker.string.AddRole}
        on:click={() => {
          creating = true
        }}
      />
    {/if}
  </div>

  {#if creating}
    <div class="draft">
      <EditBox bind:value={draftName} placeholder={tracker.string.RoleName} autoFocus />
      <div class="draft__row">
        <span class="draft__label"><Label label={tracker.string.RoleKind} /></span>
        <div class="draft__kinds">
          <button
            class="kind"
            class:kind--on={draftKind === 'accountable'}
            on:click={() => {
              draftKind = 'accountable'
            }}
          >
            <Label label={tracker.string.Accountable} />
          </button>
          <button
            class="kind"
            class:kind--on={draftKind === 'contributing'}
            on:click={() => {
              draftKind = 'contributing'
            }}
          >
            <Label label={tracker.string.Contributing} />
          </button>
        </div>
      </div>
      <div class="draft__row">
        <span class="draft__label"><Label label={tracker.string.BlocksCompletion} /></span>
        <Toggle bind:on={draftBlocks} />
      </div>
      <div class="draft__actions">
        <Button
          kind={'primary'}
          label={tracker.string.AddRole}
          disabled={!canCreate}
          on:click={() => {
            void create()
          }}
        />
        <Button
          kind={'ghost'}
          label={tracker.string.CancelRole}
          on:click={() => {
            creating = false
            draftName = ''
          }}
        />
      </div>
    </div>
  {/if}

  <div class="roles__list">
    {#each ordered as role (role._id)}
      <div class="role">
        <span class="role__swatch" style:background={colorOf(role)} />
        <div class="role__name">
          <EditBox
            value={role.name}
            on:change={(ev) => {
              void rename(role, String(ev.detail ?? role.name))
            }}
          />
        </div>
        <span class="role__kind" style:color={colorOf(role)}>
          {#if role.kind === 'accountable'}
            <Label label={tracker.string.Accountable} />
          {:else}
            <Label label={tracker.string.Contributing} />
          {/if}
        </span>
        <span class="role__blocks">
          <Toggle
            on={role.blocksCompletion}
            on:change={(ev) => {
              void toggleBlocking(role, Boolean(ev.detail))
            }}
          />
        </span>
        <Button
          icon={IconDelete}
          kind={'ghost'}
          size={'small'}
          disabled={role.readonly === true}
          showTooltip={role.readonly === true ? undefined : { label: tracker.string.RemoveRole }}
          on:click={() => {
            void remove(role)
          }}
        />
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .roles {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    max-width: 46rem;
  }
  .roles__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .roles__intro h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    color: var(--theme-caption-color);
  }
  .roles__intro p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
    max-width: 34rem;
  }
  .draft {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    background: var(--theme-bg-accent-color, transparent);
  }
  .draft__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .draft__label {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .draft__kinds {
    display: flex;
    gap: 0.35rem;
  }
  .draft__actions {
    display: flex;
    gap: 0.5rem;
  }
  .kind {
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--theme-content-color);
    background: var(--theme-button-default);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .kind--on {
    background: var(--theme-button-pressed);
    color: var(--theme-caption-color);
  }
  .roles__list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .role {
    display: grid;
    grid-template-columns: 0.75rem 1fr 9rem 3rem auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.5rem;
    border-radius: 0.375rem;
  }
  .role:hover {
    background: var(--theme-button-hovered);
  }
  .role__swatch {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }
  .role__kind {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .role__blocks {
    display: flex;
    justify-content: center;
  }
</style>
