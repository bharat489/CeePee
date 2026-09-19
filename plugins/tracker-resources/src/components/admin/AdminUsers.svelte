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
  User management: everyone in the workspace with role, email, groups,
  presence and join date. Search and filters; select rows for bulk changes
  (role, groups, deactivate, reactivate, remove from workspace) and invite
  many people at once. Every administrative change is written to the audit
  log.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type SocialIdentity, type UserGroup } from '@hcengineering/contact'
  import { Avatar, getAccountClient } from '@hcengineering/contact-resources'
  import core, { AccountRole, getCurrentAccount, hasAccountRole, SortingOrder, type AccountUuid, type Ref, type UserStatus } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import { getResource } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Button } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import { recordAudit } from '../../audit'
  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import { ago, goSection } from './sections'

  const client = getClient()
  const accountClient = getAccountClient()
  const me = getCurrentAccount()
  const eq = createQuery()
  const sq = createQuery()
  const gq = createQuery()
  const uq = createQuery()
  let employees: Employee[] = []
  let identities: SocialIdentity[] = []
  let groups: UserGroup[] = []
  let statuses: UserStatus[] = []
  let roles: Record<string, AccountRole> = {}
  let rolesLoaded = false
  eq.query(contact.mixin.Employee, {}, (r) => { employees = r.sort((a, b) => formatName(a.name).localeCompare(formatName(b.name))) })
  sq.query(contact.class.SocialIdentity, { type: 'email' as any }, (r) => { identities = r })
  gq.query(contact.class.UserGroup, {}, (r) => { groups = r }, { sort: { name: SortingOrder.Ascending } })
  uq.query(core.class.UserStatus, {}, (r) => { statuses = r })
  async function loadRoles (): Promise<void> {
    try {
      const members = await accountClient.getWorkspaceMembers()
      roles = Object.fromEntries(members.map((m) => [m.person, m.role]))
    } finally {
      rolesLoaded = true
    }
  }
  onMount(() => { void loadRoles() })

  const ROLES: Array<{ id: AccountRole, label: string }> = [
    { id: AccountRole.Owner, label: 'Owner' }, { id: AccountRole.Maintainer, label: 'Maintainer' }, { id: AccountRole.User, label: 'Member' },
    { id: AccountRole.Guest, label: 'Guest' }, { id: AccountRole.ReadOnlyGuest, label: 'Read-only guest' }
  ]
  const roleLabel = (r: AccountRole | undefined): string => ROLES.find((x) => x.id === r)?.label ?? (r ?? '—')
  $: emailOf = (e: Employee): string => identities.filter((i) => i.attachedTo === e._id).map((i) => i.value).join(', ')
  $: statusOf = (e: Employee): UserStatus | undefined => statuses.find((s) => s.user === e.personUuid)
  $: groupsOf = (e: Employee): UserGroup[] => groups.filter((g) => e.personUuid != null && g.members.includes(e.personUuid))
  $: owners = employees.filter((e) => e.personUuid != null && roles[e.personUuid] === AccountRole.Owner).length

  // filters
  let search = ''
  let roleFilter = ''
  let stateFilter: 'all' | 'active' | 'deactivated' | 'online' = 'all'
  let groupFilter = ''
  $: rows = employees.filter((e) => {
    if (e.personUuid == null) return false
    const q = search.trim().toLowerCase()
    if (q !== '' && !`${formatName(e.name)} ${emailOf(e)} ${e.position ?? ''}`.toLowerCase().includes(q)) return false
    if (roleFilter !== '' && roles[e.personUuid] !== roleFilter) return false
    if (stateFilter === 'active' && !e.active) return false
    if (stateFilter === 'deactivated' && e.active) return false
    if (stateFilter === 'online' && statusOf(e)?.online !== true) return false
    if (groupFilter !== '' && !groups.find((g) => g._id === groupFilter)?.members.includes(e.personUuid)) return false
    return true
  })

  // selection and bulk actions
  let selected = new Set<Ref<Employee>>()
  $: allSelected = rows.length > 0 && rows.every((r) => selected.has(r._id))
  function toggle (id: Ref<Employee>): void {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected = next
  }
  function toggleAll (): void {
    selected = allSelected ? new Set() : new Set(rows.map((r) => r._id))
  }
  $: chosen = employees.filter((e) => selected.has(e._id))
  let bulkRole: AccountRole | '' = ''
  let bulkGroup = ''
  let busy = ''
  let notice = ''
  const canEditRole = (e: Employee): boolean => e.personUuid != null && e.personUuid !== me.uuid && hasAccountRole(me, roles[e.personUuid] ?? AccountRole.User) && !(roles[e.personUuid] === AccountRole.Owner && owners <= 1)

  async function setRole (e: Employee, role: AccountRole): Promise<void> {
    if (e.personUuid == null || roles[e.personUuid] === role || !canEditRole(e)) return
    await accountClient.updateWorkspaceRole(e.personUuid, role)
    roles = { ...roles, [e.personUuid]: role }
    await client.update(e, { role: [AccountRole.Guest, AccountRole.ReadOnlyGuest, AccountRole.DocGuest].includes(role) ? 'GUEST' : 'USER' })
    void recordAudit('role.changed', e.personUuid, `${formatName(e.name)} → ${roleLabel(role)}`)
  }
  function roleChanged (e: Employee, v: string): void {
    void setRole(e, v as AccountRole)
  }
  async function bulk (action: 'role' | 'add-group' | 'remove-group' | 'deactivate' | 'reactivate' | 'remove'): Promise<void> {
    if (chosen.length === 0) return
    const names = chosen.map((e) => formatName(e.name)).join(', ')
    if (action === 'remove' && !confirm(`Remove ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'} from the workspace? They lose access until invited again.\n\n${names}`)) return
    if (action === 'deactivate' && !confirm(`Deactivate ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}? They disappear from pickers and lists; reactivate any time.\n\n${names}`)) return
    busy = action
    notice = ''
    let n = 0
    try {
      for (const e of chosen) {
        if (e.personUuid == null) continue
        if (action === 'role' && bulkRole !== '') {
          if (!canEditRole(e)) continue
          await setRole(e, bulkRole)
          n++
        } else if ((action === 'add-group' || action === 'remove-group') && bulkGroup !== '') {
          const g = groups.find((x) => x._id === bulkGroup)
          if (g === undefined) continue
          const has = g.members.includes(e.personUuid)
          if (action === 'add-group' && !has) { await client.update(g, { $push: { members: e.personUuid } }); n++ }
          if (action === 'remove-group' && has) { await client.update(g, { $pull: { members: e.personUuid } }); n++ }
        } else if (action === 'deactivate' && e.active && e.personUuid !== me.uuid) {
          await client.update(e, { active: false })
          void recordAudit('user.deactivated', e.personUuid, formatName(e.name))
          n++
        } else if (action === 'reactivate' && !e.active) {
          await client.update(e, { active: true })
          void recordAudit('user.reactivated', e.personUuid, formatName(e.name))
          n++
        } else if (action === 'remove' && e.personUuid !== me.uuid) {
          await client.update(e, { active: false })
          const leave = await getResource(login.function.LeaveWorkspace)
          await leave(e.personUuid)
          void recordAudit('user.removed', e.personUuid, formatName(e.name))
          n++
        }
      }
      notice = `${n} ${n === 1 ? 'person' : 'people'} updated.`
      if (action === 'remove' || action === 'role') await loadRoles()
      selected = new Set()
    } catch (e: any) {
      notice = String(e?.message ?? e)
    } finally {
      busy = ''
    }
  }

  // invites
  let inviting = false
  let inviteText = ''
  let inviteRole: AccountRole = AccountRole.User
  async function sendInvites (): Promise<void> {
    const emails = inviteText.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (emails.length === 0) return
    busy = 'invite'
    let n = 0
    const failed: string[] = []
    for (const email of emails) {
      try {
        await accountClient.sendInvite(email, inviteRole)
        n++
      } catch {
        failed.push(email)
      }
    }
    void recordAudit('user.invited', emails.join(','), `${n} invited as ${roleLabel(inviteRole)}${failed.length > 0 ? `, failed: ${failed.join(', ')}` : ''}`)
    notice = `${n} invite${n === 1 ? '' : 's'} sent${failed.length > 0 ? `; could not send to ${failed.join(', ')} (is email configured?)` : ''}.`
    busy = ''
    if (failed.length === 0) { inviting = false; inviteText = '' }
  }
</script>

<div class="top">
  <label class="search">{@html icon('filter')}<input placeholder="Search people, emails, titles" bind:value={search} /></label>
  <select class="sel" bind:value={roleFilter}><option value="">every role</option>{#each ROLES as r (r.id)}<option value={r.id}>{r.label}</option>{/each}</select>
  <select class="sel" bind:value={stateFilter}><option value="all">active and deactivated</option><option value="active">active</option><option value="deactivated">deactivated</option><option value="online">online now</option></select>
  <select class="sel" bind:value={groupFilter}><option value="">every group</option>{#each groups as g (g._id)}<option value={g._id}>{g.name}</option>{/each}</select>
  <span class="grow" />
  <span class="muted">{rows.length} of {employees.length}</span>
  <Button kind={'primary'} label={tracker.string.SendInvites} on:click={() => { inviting = !inviting }} />
</div>

{#if inviting}
  <section class="panel motion-pop">
    <span class="panel__t">Invite people</span>
    <textarea class="input" rows="3" placeholder="one email per line, or comma-separated" bind:value={inviteText} />
    <div class="row">
      <span class="muted">as</span>
      <select class="sel" bind:value={inviteRole}>{#each ROLES.filter((r) => hasAccountRole(me, r.id)) as r (r.id)}<option value={r.id}>{r.label}</option>{/each}</select>
      <span class="grow" />
      <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { inviting = false }} />
      <Button kind={'primary'} label={tracker.string.SendInvites} loading={busy === 'invite'} on:click={() => { void sendInvites() }} />
    </div>
    <p class="muted">Invites go out by email through the mail service; without it, share an invite link from Invite settings instead.</p>
  </section>
{/if}

{#if selected.size > 0}
  <div class="bulk motion-pop">
    <b>{selected.size} selected</b>
    <span class="bulk__g"><select class="sel" bind:value={bulkRole}><option value="">change role…</option>{#each ROLES.filter((r) => hasAccountRole(me, r.id)) as r (r.id)}<option value={r.id}>{r.label}</option>{/each}</select><button class="bbtn" disabled={bulkRole === '' || busy !== ''} on:click={() => { void bulk('role') }}>Apply</button></span>
    <span class="bulk__g"><select class="sel" bind:value={bulkGroup}><option value="">group…</option>{#each groups as g (g._id)}<option value={g._id}>{g.name}</option>{/each}</select><button class="bbtn" disabled={bulkGroup === '' || busy !== ''} on:click={() => { void bulk('add-group') }}>Add to group</button><button class="bbtn" disabled={bulkGroup === '' || busy !== ''} on:click={() => { void bulk('remove-group') }}>Remove from group</button></span>
    <span class="grow" />
    <button class="bbtn" disabled={busy !== ''} on:click={() => { void bulk('reactivate') }}>Reactivate</button>
    <button class="bbtn bbtn--warn" disabled={busy !== ''} on:click={() => { void bulk('deactivate') }}>Deactivate</button>
    <button class="bbtn bbtn--bad" disabled={busy !== ''} on:click={() => { void bulk('remove') }}>Remove from workspace</button>
    <button class="lnk" on:click={() => { selected = new Set() }}>clear</button>
  </div>
{/if}
{#if notice !== ''}<p class="notice">{notice}</p>{/if}

<div class="tbl">
  <div class="tr tr--h">
    <span class="td td--c"><input type="checkbox" checked={allSelected} on:change={toggleAll} /></span>
    <span class="td">Person</span><span class="td">Email</span><span class="td">Role</span><span class="td">Groups</span><span class="td">Status</span><span class="td">Joined</span>
  </div>
  {#each rows as e, k (e._id)}
    {@const st = statusOf(e)}
    {@const role = e.personUuid != null ? roles[e.personUuid] : undefined}
    <div class="tr motion-rise" style="--i: {Math.min(k, 14)}" class:tr--off={!e.active} class:tr--sel={selected.has(e._id)}>
      <span class="td td--c"><input type="checkbox" checked={selected.has(e._id)} on:change={() => { toggle(e._id) }} /></span>
      <span class="td td--p"><Avatar person={e} name={e.name} size={'small'} /><span class="p"><span class="p__n">{formatName(e.name)}{#if e.personUuid === me.uuid} <span class="you">you</span>{/if}</span>{#if e.position}<span class="p__t">{e.position}</span>{/if}</span></span>
      <span class="td td--e">{emailOf(e) || '—'}</span>
      <span class="td">
        {#if rolesLoaded && role !== undefined}
          <select class="sel sel--s" value={role} disabled={!canEditRole(e)} on:change={(ev) => { roleChanged(e, ev.currentTarget.value) }}>{#each ROLES as r (r.id)}{#if r.id === role || hasAccountRole(me, r.id)}<option value={r.id}>{r.label}</option>{/if}{/each}</select>
        {:else}<span class="muted">{rolesLoaded ? 'not a member' : '…'}</span>{/if}
      </span>
      <span class="td td--g">{#each groupsOf(e) as g (g._id)}<button class="chip" on:click={() => { goSection('groups') }}>{g.name}</button>{/each}{#if groupsOf(e).length === 0}<span class="muted">—</span>{/if}</span>
      <span class="td"><span class="dot" class:dot--on={st?.online === true} class:dot--off={!e.active} />{!e.active ? 'deactivated' : st?.online === true ? 'online' : st !== undefined ? `seen ${ago(st.modifiedOn)}` : 'never seen'}</span>
      <span class="td muted">{new Date(e.createdOn ?? 0).toLocaleDateString()}</span>
    </div>
  {/each}
  {#if rows.length === 0}<p class="muted pad">Nobody matches these filters.</p>{/if}
</div>

<style lang="scss">
  .top, .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.78rem; color: var(--theme-dark-color); }
  .pad { padding: 1rem; }
  .search { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); color: var(--theme-dark-color); min-width: 16rem; :global(svg) { width: 0.9rem; height: 0.9rem; } input { flex: 1; border: none; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; } }
  .sel { padding: 0.4rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--s { padding: 0.2rem 0.4rem; font-size: 0.78rem; } &:disabled { opacity: 0.6; } }
  .input { width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; resize: vertical; &:focus { border-color: var(--accent-brand); } }
  .panel { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 0.9rem; padding: 0.9rem 1rem; border: 1px dashed var(--accent-brand); border-radius: 0.8rem; background: var(--theme-panel-color); }
  .panel__t { font-weight: 700; color: var(--theme-caption-color); }
  .bulk { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.6rem; padding: 0.5rem 0.75rem; border-radius: 0.7rem; background: var(--accent-brand-soft); color: var(--theme-caption-color); font-size: 0.8125rem; }
  .bulk__g { display: inline-flex; align-items: center; gap: 0.3rem; }
  .bbtn { padding: 0.3rem 0.65rem; border: 1px solid transparent; border-radius: 0.45rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; &:hover { border-color: var(--accent-brand); } &:disabled { opacity: 0.5; cursor: default; } &--warn { color: #b45309; } &--bad { color: var(--negative-button-default); } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; }
  .notice { margin: 0 0 0.6rem; font-size: 0.8125rem; color: var(--accent-brand); font-weight: 600; }
  .tbl { display: flex; flex-direction: column; border: 1px solid var(--theme-divider-color); border-radius: 0.8rem; background: var(--theme-panel-color); overflow: hidden; }
  .tr { display: grid; grid-template-columns: 2rem minmax(12rem, 1.4fr) minmax(10rem, 1.2fr) 9rem minmax(8rem, 1fr) 9rem 6rem; align-items: center; gap: 0.5rem; padding: 0.45rem 0.75rem; border-top: 1px solid var(--theme-divider-color); font-size: 0.8375rem; color: var(--theme-content-color); &--h { border-top: none; background: var(--theme-bg-color); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--theme-dark-color); } &--off { opacity: 0.6; } &--sel { background: var(--accent-brand-soft); } }
  .td { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &--c { display: inline-flex; } &--p { display: flex; align-items: center; gap: 0.5rem; } &--e { font-size: 0.78rem; color: var(--theme-dark-color); } &--g { display: flex; gap: 0.25rem; flex-wrap: wrap; white-space: normal; } }
  .p { display: flex; flex-direction: column; min-width: 0; }
  .p__n { font-weight: 600; color: var(--theme-caption-color); }
  .p__t { font-size: 0.72rem; color: var(--theme-dark-color); }
  .you { margin-left: 0.2rem; padding: 0 0.35rem; border-radius: 999px; background: var(--accent-brand-soft); color: var(--accent-brand); font-size: 0.62rem; font-weight: 700; }
  .chip { padding: 0.1rem 0.5rem; border: none; border-radius: 999px; background: var(--theme-button-default); color: var(--theme-content-color); font: inherit; font-size: 0.7rem; cursor: pointer; }
  .dot { display: inline-block; width: 0.5rem; height: 0.5rem; margin-right: 0.35rem; border-radius: 50%; background: var(--theme-trans-color); &--on { background: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2); } &--off { background: var(--negative-button-default); } }
  @media (max-width: 60rem) { .tr { grid-template-columns: 2rem 1fr 1fr; } .td--e, .td--g, .tr > .td:nth-child(6), .tr > .td:nth-child(7) { display: none; } }
</style>
