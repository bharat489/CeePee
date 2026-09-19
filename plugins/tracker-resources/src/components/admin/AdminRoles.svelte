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
  Roles & permissions. Roles belong to a space type (project type, teamspace
  type…) and grant permissions; a space assigns people (or whole groups) to
  each role. When a space enforces roles, the server checks every change
  against them: a member without a matching role cannot make it. Workspace
  roles (owner, maintainer, member, guest) stay the outer layer.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type UserGroup } from '@hcengineering/contact'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import core, { SortingOrder, type AccountUuid, type Permission, type Ref, type Role, type Space, type SpaceType, type SpaceTypeDescriptor, type TypedSpace } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { createSpaceTypeRole, deleteSpaceTypeRole } from '@hcengineering/setting'
  import { Button, IconAdd, Label, Toggle } from '@hcengineering/ui'

  import { recordAudit } from '../../audit'
  import tracker from '../../plugin'
  import { icon } from '../projects/icons'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const tq = createQuery()
  const dq = createQuery()
  const rq = createQuery()
  const pq = createQuery()
  const gq = createQuery()
  const eq = createQuery()
  let types: SpaceType[] = []
  let descriptors: SpaceTypeDescriptor[] = []
  let roles: Role[] = []
  let permissions: Permission[] = []
  let groups: UserGroup[] = []
  let employees: Employee[] = []
  tq.query(core.class.SpaceType, {}, (r) => { types = r })
  dq.query(core.class.SpaceTypeDescriptor, {}, (r) => { descriptors = r })
  rq.query(core.class.Role, {}, (r) => { roles = r }, { sort: { name: SortingOrder.Ascending } })
  pq.query(core.class.Permission, {}, (r) => { permissions = r })
  gq.query(contact.class.UserGroup, {}, (r) => { groups = r }, { sort: { name: SortingOrder.Ascending } })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: kinds = types
    .map((t) => ({ type: t, descriptor: descriptors.find((d) => d._id === t.descriptor), roles: roles.filter((r) => r.attachedTo === t._id) }))
    .filter((k) => k.descriptor !== undefined && k.descriptor.system !== true)
    .sort((a, b) => a.type.name.localeCompare(b.type.name))
  $: workspacePerms = permissions.filter((p) => p.scope === 'workspace')
  const available = (d: SpaceTypeDescriptor | undefined): Permission[] => permissions.filter((p) => (d?.availablePermissions ?? []).includes(p._id))

  // one type opened at a time
  let openType: Ref<SpaceType> | undefined
  const sq = createQuery()
  let spaces: Space[] = []
  $: {
    const k = kinds.find((x) => x.type._id === openType)
    if (k?.descriptor !== undefined) sq.query(k.descriptor.baseClass, { type: openType, archived: false } as any, (r) => { spaces = r }, { sort: { name: SortingOrder.Ascending } })
    else { sq.unsubscribe(); spaces = [] }
  }
  let openSpace: Ref<Space> | undefined
  $: space = spaces.find((s) => s._id === openSpace)
  $: assignment = (space !== undefined && openKind?.type.targetClass !== undefined ? (hierarchy.as(space, openKind.type.targetClass) as unknown as Record<string, AccountUuid[] | undefined>) : {})
  $: openKind = kinds.find((x) => x.type._id === openType)

  // roles
  let creating = false
  let roleName = ''
  let rolePerms: Ref<Permission>[] = []
  let busy = false
  let error = ''
  async function createRole (): Promise<void> {
    if (openKind === undefined || roleName.trim() === '') return
    busy = true
    error = ''
    try {
      const id = await createSpaceTypeRole(client, openKind.type, { name: roleName.trim(), permissions: rolePerms })
      void recordAudit('role.defined', id, `${roleName.trim()} on ${openKind.type.name}: ${rolePerms.length} permissions`)
      creating = false
      roleName = ''
      rolePerms = []
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      busy = false
    }
  }
  async function togglePerm (role: Role, p: Ref<Permission>): Promise<void> {
    const next = role.permissions.includes(p) ? role.permissions.filter((x) => x !== p) : [...role.permissions, p]
    await client.update(role, { permissions: next })
    void recordAudit('role.permissions', role._id, `${role.name}: ${next.length} permissions`)
  }
  async function removeRole (role: Role): Promise<void> {
    if (openKind === undefined || !confirm(`Delete role "${role.name}"? Its assignments in every ${openKind.type.name} are cleared.`)) return
    await deleteSpaceTypeRole(client, role, openKind.type.targetClass)
    void recordAudit('role.deleted', role._id, role.name)
  }
  async function assign (role: Role, refs: AccountUuid[]): Promise<void> {
    if (space === undefined || openKind === undefined) return
    await client.updateMixin(space._id, space._class, space.space, openKind.type.targetClass, { [role._id]: refs })
    void recordAudit('role.assigned', space._id, `${role.name} in ${space.name}: ${refs.length} people`)
  }
  let groupPick: Record<string, string> = {}
  async function addGroup (role: Role): Promise<void> {
    const g = groups.find((x) => x._id === groupPick[role._id])
    if (g === undefined) return
    const current = assignment[role._id] ?? []
    await assign(role, Array.from(new Set([...current, ...g.members])))
    groupPick = { ...groupPick, [role._id]: '' }
  }
  async function setRestricted (on: boolean): Promise<void> {
    if (space === undefined) return
    await client.update(space as TypedSpace, { restricted: on })
    void recordAudit(on ? 'space.restricted' : 'space.unrestricted', space._id, space.name)
  }
  const isRestricted = (s: Space | undefined): boolean => (s as TypedSpace | undefined)?.restricted === true
  const nameOf = (uuid: AccountUuid): string => { const e = employees.find((x) => x.personUuid === uuid); return e !== undefined ? formatName(e.name) : uuid.slice(0, 8) }
</script>

<p class="intro">Workspace roles (owner, maintainer, member, guest) decide who may administer. Roles below are finer: they live on a space type, grant specific permissions, and are assigned per project or teamspace, to people or to whole groups. Switch on <b>Enforce roles</b> in a space and the server rejects any change its author has no role for.</p>

<div class="kinds">
  {#each kinds as k (k.type._id)}
    <button class="kind" class:kind--on={openType === k.type._id} on:click={() => { openType = openType === k.type._id ? undefined : k.type._id; openSpace = undefined; creating = false }}>
      <span class="kind__ic">{@html icon(k.descriptor?.baseClass === tracker.class.Project ? 'board' : 'docs')}</span>
      <span class="kind__t"><span class="kind__n">{k.type.name}</span><span class="muted"><Label label={k.descriptor?.name ?? core.string.Spaces} /> · {k.roles.length} role{k.roles.length === 1 ? '' : 's'} · {available(k.descriptor).length + workspacePerms.length} permissions</span></span>
    </button>
  {/each}
</div>

{#if openKind !== undefined}
  {@const perms = [...available(openKind.descriptor), ...workspacePerms]}
  <section class="card motion-pop">
    <div class="card__head"><span class="card__t">Roles on {openKind.type.name}</span><span class="grow" /><Button kind={'primary'} icon={IconAdd} label={tracker.string.NewRole} on:click={() => { creating = !creating }} /></div>
    {#if creating}
      <div class="new motion-pop">
        <input class="input" placeholder="Role name, e.g. Reviewer" bind:value={roleName} />
        <div class="perms">{#each perms as p (p._id)}<label class="perm" class:perm--on={rolePerms.includes(p._id)}><input type="checkbox" checked={rolePerms.includes(p._id)} on:change={() => { rolePerms = rolePerms.includes(p._id) ? rolePerms.filter((x) => x !== p._id) : [...rolePerms, p._id] }} /><span><b><Label label={p.label} /></b>{#if p.description}<small><Label label={p.description} /></small>{/if}</span></label>{/each}</div>
        {#if error !== ''}<p class="err">{error}</p>{/if}
        <div class="actions"><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { creating = false }} /><Button kind={'primary'} label={tracker.string.Save} loading={busy} disabled={roleName.trim() === ''} on:click={() => { void createRole() }} /></div>
      </div>
    {/if}
    {#if openKind.roles.length === 0 && !creating}<p class="muted">No roles yet. Create one, for example "Lead" with every permission or "Reviewer" that can comment but not edit.</p>{/if}
    <div class="roles">
      {#each openKind.roles as role (role._id)}
        <div class="role">
          <div class="role__head"><span class="role__n">{role.name}</span><span class="muted">{role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}</span><span class="grow" /><button class="lnk lnk--bad" on:click={() => { void removeRole(role) }}>delete</button></div>
          <div class="perms perms--tight">{#each perms as p (p._id)}<label class="perm" class:perm--on={role.permissions.includes(p._id)}><input type="checkbox" checked={role.permissions.includes(p._id)} on:change={() => { void togglePerm(role, p._id) }} /><span><b><Label label={p.label} /></b></span></label>{/each}</div>
        </div>
      {/each}
    </div>
  </section>

  <section class="card motion-pop">
    <div class="card__head"><span class="card__t">Assignments</span><span class="muted">who holds which role in a {openKind.descriptor?.baseClass === tracker.class.Project ? 'project' : 'space'}</span></div>
    <div class="chips">
      {#each spaces as s (s._id)}<button class="chip" class:chip--on={openSpace === s._id} on:click={() => { openSpace = s._id }}>{s.name}{#if isRestricted(s)} <span class="lock">🔒</span>{/if}</button>{/each}
      {#if spaces.length === 0}<span class="muted">No spaces of this type yet.</span>{/if}
    </div>
    {#if space !== undefined}
      <div class="enforce">
        <div class="enforce__t"><b>Enforce roles in {space.name}</b><span class="muted">On: every change in this space needs a role that permits it (owners and the system always pass). Off: roles only inform.</span></div>
        <Toggle on={isRestricted(space)} on:change={(e) => { void setRestricted(e.detail) }} />
      </div>
      {#if openKind.roles.length === 0}<p class="muted">Define a role above first.</p>{/if}
      {#each openKind.roles as role (role._id)}
        <div class="asg">
          <div class="asg__head"><span class="role__n">{role.name}</span><span class="muted">{(assignment[role._id] ?? []).length} assigned{(assignment[role._id] ?? []).length > 0 ? `: ${(assignment[role._id] ?? []).slice(0, 4).map(nameOf).join(', ')}${(assignment[role._id] ?? []).length > 4 ? '…' : ''}` : ''}</span></div>
          <div class="asg__row">
            <AccountArrayEditor label={core.string.Members} value={assignment[role._id] ?? []} onChange={(refs) => { void assign(role, refs) }} kind={'regular'} size={'medium'} />
            <select class="sel" bind:value={groupPick[role._id]}><option value="">add a group…</option>{#each groups as g (g._id)}<option value={g._id}>{g.name} ({g.members.length})</option>{/each}</select>
            <button class="bbtn" disabled={(groupPick[role._id] ?? '') === ''} on:click={() => { void addGroup(role) }}>Add group members</button>
          </div>
        </div>
      {/each}
    {/if}
  </section>
{/if}

<style lang="scss">
  .intro { margin: 0 0 0.9rem; font-size: 0.8375rem; color: var(--theme-content-color); line-height: 1.5; max-width: 60rem; b { color: var(--theme-caption-color); } }
  .muted { margin: 0; font-size: 0.76rem; color: var(--theme-dark-color); }
  .grow { flex: 1; }
  .kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 0.6rem; margin-bottom: 0.9rem; }
  .kind { display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.8rem; background: var(--theme-panel-color); font: inherit; text-align: left; cursor: pointer; &:hover { border-color: var(--accent-brand); } &--on { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .kind__ic { display: inline-flex; width: 2rem; height: 2rem; align-items: center; justify-content: center; border-radius: 0.55rem; background: var(--accent-brand-soft); color: var(--accent-brand); :global(svg) { width: 1rem; height: 1rem; } }
  .kind__t { display: flex; flex-direction: column; min-width: 0; }
  .kind__n { font-weight: 700; color: var(--theme-caption-color); }
  .card { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 0.9rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); }
  .card__head { display: flex; align-items: center; gap: 0.6rem; }
  .card__t { font-weight: 700; color: var(--theme-caption-color); }
  .new { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.8rem; border: 1px dashed var(--accent-brand); border-radius: 0.7rem; }
  .input { padding: 0.5rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.9rem; outline: none; max-width: 24rem; &:focus { border-color: var(--accent-brand); } }
  .perms { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.35rem; &--tight { grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); } }
  .perm { display: flex; align-items: flex-start; gap: 0.45rem; padding: 0.4rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; font-size: 0.8125rem; color: var(--theme-content-color); cursor: pointer; span { display: flex; flex-direction: column; } b { color: var(--theme-caption-color); font-weight: 600; } small { font-size: 0.7rem; color: var(--theme-dark-color); } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); } }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .err { margin: 0; color: var(--negative-button-default); font-size: 0.8125rem; }
  .roles { display: flex; flex-direction: column; gap: 0.5rem; }
  .role { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.6rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.7rem; background: var(--theme-bg-color); }
  .role__head, .asg__head { display: flex; align-items: center; gap: 0.5rem; }
  .role__n { font-weight: 700; color: var(--theme-caption-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &--bad { color: var(--negative-button-default); } }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.3rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.8rem; cursor: pointer; &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--accent-brand); font-weight: 600; } }
  .lock { font-size: 0.7rem; }
  .enforce { display: flex; align-items: center; gap: 1rem; padding: 0.7rem 0.85rem; border: 1px solid var(--theme-divider-color); border-radius: 0.7rem; background: var(--theme-bg-color); }
  .enforce__t { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; b { color: var(--theme-caption-color); } }
  .asg { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.5rem 0; border-top: 1px solid var(--theme-divider-color); }
  .asg__row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .sel { padding: 0.35rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8rem; }
  .bbtn { padding: 0.35rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.45rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; &:hover { border-color: var(--accent-brand); } &:disabled { opacity: 0.5; cursor: default; } }
</style>
