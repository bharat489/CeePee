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
  Team setup: one screen for who is on the team, their position, their
  workspace role and their department.

  Before this, adding one person meant four surfaces -- Invite to workspace,
  then Members for the role, then the job-title control, then the HR module
  for the department. Each is correct on its own; together they are the
  reason onboarding felt complicated.

  Two sections. Existing members are edited inline and saved on change.
  New people get an invite link with their role pre-set (createInviteLink
  accepts any role -- the Guest/User limit elsewhere is a UI choice, not an
  API one). The link route is used rather than sendInvite because the mail
  service is not part of the minimal stack; a link the admin can paste works
  on every deployment.
-->
<script lang="ts">
  import contact, { type Employee, formatName } from '@hcengineering/contact'
  import { EmployeePresenter } from '@hcengineering/contact-resources'
  import core, { type Account, AccountRole, type Enum, type Ref, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import {
    Breadcrumb,
    Button,
    DropdownLabels,
    type DropdownIntlItem,
    DropdownLabelsIntl,
    type DropdownTextItem,
    EditBox,
    Header,
    IconAdd,
    Label,
    Scroller
  } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import setting from '../plugin'
  import { getAccountClient } from '../utils'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const accountClient = getAccountClient()
  const currentAccount = getCurrentAccount()

  // ---- data ----------------------------------------------------------------
  const employeeQuery = createQuery()
  const departmentQuery = createQuery()
  const enumQuery = createQuery()

  let employees: Employee[] = []
  let departments: Department[] = []
  let enums: Enum[] = []
  let workspaceRoles: Record<string, AccountRole> = {}

  employeeQuery.query(contact.mixin.Employee, { active: true }, (res) => {
    employees = res
      .filter((e) => e.personUuid != null)
      .sort((a, b) => formatName(a.name).localeCompare(formatName(b.name)))
  })
  departmentQuery.query(hr.class.Department, {}, (res) => {
    departments = res
  })
  enumQuery.query(core.class.Enum, {}, (res) => {
    enums = res
  })

  onMount(async () => {
    const members = await accountClient.getWorkspaceMembers()
    workspaceRoles = Object.fromEntries(members.map((m) => [m.person, m.role]))
  })

  // ---- option lists --------------------------------------------------------
  const roleItems: DropdownIntlItem[] = [
    { id: AccountRole.Guest, label: setting.string.Guest },
    { id: AccountRole.User, label: setting.string.User },
    { id: AccountRole.Maintainer, label: setting.string.Maintainer },
    { id: AccountRole.Owner, label: setting.string.Owner }
  ]
  function rolesGrantable (current: AccountRole | undefined, me: Account): DropdownIntlItem[] {
    // You may only grant up to your own level, and never see a role you cannot grant.
    return roleItems.filter((i) => i.id === current || hasAccountRole(me, i.id as AccountRole))
  }

  // Positions come from an Enum the team manages in Settings -> Enums, so new
  // titles need no release. Same lookup the Members screen uses.
  const JOB_ENUM_NAMES = ['job role', 'job title', 'job roles', 'discipline', 'team role', 'position']
  const FALLBACK_TITLES = ['Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'QA / Tester', 'DevOps', 'Designer', 'Product Manager', 'Team Lead']
  const NONE = '$none'
  $: jobEnum = enums.find((e) => JOB_ENUM_NAMES.includes(e.name.trim().toLowerCase()))
  $: assigned = employees.map((e) => e.position).filter((p): p is string => p != null && p !== '')
  $: positionItems = [
    { id: NONE, label: '—' },
    ...Array.from(new Set([...(jobEnum?.enumValues ?? FALLBACK_TITLES), ...assigned])).map(
      (t): DropdownTextItem => ({ id: t, label: t })
    )
  ] as DropdownTextItem[]

  $: departmentItems = [
    { id: NONE, label: '—' },
    ...departments.map((d): DropdownTextItem => ({ id: d._id, label: d.name }))
  ] as DropdownTextItem[]

  function departmentOf (e: Employee): string {
    return hierarchy.hasMixin(e, hr.mixin.Staff) ? (hierarchy.as(e, hr.mixin.Staff).department ?? NONE) : NONE
  }

  // ---- inline edits on existing members -----------------------------------
  async function setPosition (e: Employee, value: string): Promise<void> {
    const position = value === NONE ? null : value
    if ((e.position ?? null) === position) return
    await client.update(e, { position })
  }

  async function setRole (e: Employee, role: AccountRole): Promise<void> {
    if (e.personUuid == null || workspaceRoles[e.personUuid] === role) return
    await accountClient.updateWorkspaceRole(e.personUuid, role)
    workspaceRoles = { ...workspaceRoles, [e.personUuid]: role }
  }

  async function setDepartment (e: Employee, value: string): Promise<void> {
    if (departmentOf(e) === value) return
    if (value === NONE) return
    // Same write the HR module makes when you drag someone into a department.
    await client.updateMixin(e._id, e._class, e.space, hr.mixin.Staff, { department: value as Ref<Department> })
  }

  // ---- adding people -------------------------------------------------------
  interface NewPerson {
    email: string
    first: string
    last: string
    role: AccountRole
    link?: string
    copied?: boolean
    busy?: boolean
  }
  let adding: NewPerson[] = [blank()]
  function blank (): NewPerson {
    return { email: '', first: '', last: '', role: AccountRole.User }
  }
  function addRow (): void {
    adding = [...adding, blank()]
  }
  function canInvite (p: NewPerson): boolean {
    return /.+@.+\..+/.test(p.email.trim()) && p.first.trim() !== '' && p.busy !== true && p.link === undefined
  }

  async function invite (p: NewPerson): Promise<void> {
    if (!canInvite(p)) return
    p.busy = true
    adding = adding
    try {
      // autoJoin: the invitee lands in the workspace on first sign-in with the
      // role already set -- no second trip to Members to promote them.
      p.link = await accountClient.createInviteLink(p.email.trim(), p.role, true, p.first.trim(), p.last.trim())
    } finally {
      p.busy = false
      adding = adding
    }
  }

  async function copy (p: NewPerson): Promise<void> {
    if (p.link === undefined) return
    await navigator.clipboard.writeText(p.link)
    p.copied = true
    adding = adding
    setTimeout(() => {
      p.copied = false
      adding = adding
    }, 1600)
  }

  $: ownersCount = employees.filter((e) => e.personUuid != null && workspaceRoles[e.personUuid] === AccountRole.Owner).length
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={setting.icon.Members} label={setting.string.TeamSetup} size={'large'} isCurrent />
  </Header>

  <div class="hulyComponent-content__column content">
    <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
      <div class="hulyComponent-content team">
        <p class="team__hint"><Label label={setting.string.TeamSetupHint} /></p>

        <!-- existing members -->
        {#if employees.length === 0}
          <p class="team__empty"><Label label={setting.string.TeamSetupEmpty} /></p>
        {:else}
          <div class="team__grid team__grid--head">
            <span></span>
            <span><Label label={setting.string.Position} /></span>
            <span><Label label={setting.string.Role} /></span>
            <span><Label label={setting.string.Department} /></span>
          </div>
          {#each employees as e, idx (e._id)}
            {@const uuid = e.personUuid ?? undefined}
            {@const role = uuid !== undefined ? workspaceRoles[uuid] : undefined}
            <div class="team__grid team__row motion-rise" style="--i: {idx}">
              <div class="team__who"><EmployeePresenter value={e} disabled={false} /></div>
              <DropdownLabels
                label={setting.string.Position}
                kind={'regular'}
                size={'medium'}
                items={positionItems}
                selected={e.position ?? NONE}
                on:selected={(ev) => {
                  void setPosition(e, ev.detail)
                }}
              />
              {#if role !== undefined && uuid !== undefined}
                <DropdownLabelsIntl
                  label={setting.string.Role}
                  kind={'regular'}
                  size={'medium'}
                  items={rolesGrantable(role, currentAccount)}
                  selected={role}
                  disabled={!hasAccountRole(currentAccount, role) ||
                    (role === AccountRole.Owner && ownersCount === 1) ||
                    currentAccount.uuid === uuid}
                  on:selected={(ev) => {
                    void setRole(e, ev.detail)
                  }}
                />
              {:else}
                <span class="team__muted">—</span>
              {/if}
              <DropdownLabels
                label={setting.string.Department}
                kind={'regular'}
                size={'medium'}
                items={departmentItems}
                selected={departmentOf(e)}
                on:selected={(ev) => {
                  void setDepartment(e, ev.detail)
                }}
              />
            </div>
          {/each}
        {/if}

        <!-- add people -->
        <div class="team__section">
          <span class="team__title"><Label label={setting.string.AddPeople} /></span>
          <Button icon={IconAdd} kind={'ghost'} size={'small'} on:click={addRow} />
        </div>

        {#each adding as p, i (i)}
          <div class="team__add motion-pop">
            <EditBox bind:value={p.email} placeholder={setting.string.Email} kind={'default'} disabled={p.link !== undefined} />
            <EditBox bind:value={p.first} placeholder={setting.string.FirstName} kind={'default'} disabled={p.link !== undefined} />
            <EditBox bind:value={p.last} placeholder={setting.string.LastName} kind={'default'} disabled={p.link !== undefined} />
            <DropdownLabelsIntl
              label={setting.string.Role}
              kind={'regular'}
              size={'medium'}
              items={rolesGrantable(p.role, currentAccount)}
              selected={p.role}
              disabled={p.link !== undefined}
              on:selected={(ev) => {
                p.role = ev.detail
                adding = adding
              }}
            />
            {#if p.link === undefined}
              <Button
                kind={'primary'}
                size={'medium'}
                label={setting.string.InviteAndAdd}
                disabled={!canInvite(p)}
                loading={p.busy === true}
                on:click={() => {
                  void invite(p)
                }}
              />
            {:else}
              <Button
                kind={'regular'}
                size={'medium'}
                label={p.copied === true ? setting.string.LinkCopied : setting.string.CopyInviteLink}
                on:click={() => {
                  void copy(p)
                }}
              />
            {/if}
          </div>
        {/each}
      </div>
    </Scroller>
  </div>
</div>

<style lang="scss">
  .team { display: flex; flex-direction: column; gap: 0.5rem; }
  .team__hint { margin: 0 0 0.75rem; color: var(--theme-dark-color); font-size: 0.875rem; max-width: 60ch; }
  .team__empty { margin: 0; color: var(--theme-trans-color); font-size: 0.875rem; }

  .team__grid {
    display: grid;
    grid-template-columns: minmax(14rem, 1.4fr) 1fr 1fr 1fr;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.5rem;
  }
  .team__grid--head {
    font-size: 0.6875rem; letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--theme-dark-color); border-bottom: 1px solid var(--theme-divider-color);
    padding-bottom: 0.5rem;
  }
  .team__row { border-radius: 0.375rem; }
  .team__row:hover { background: var(--theme-button-hovered); }
  .team__who { min-width: 0; }
  .team__muted { color: var(--theme-trans-color); }

  .team__section {
    display: flex; align-items: center; gap: 0.5rem;
    margin-top: 1.25rem; padding-top: 0.75rem; border-top: 1px solid var(--theme-divider-color);
  }
  .team__title { font-weight: 500; color: var(--theme-caption-color); }

  .team__add {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
  }
</style>
