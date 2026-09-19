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
  User groups: named sets of people. Apply a group to projects, teamspaces
  and channels and the server keeps their membership in step (adding new
  members, removing people the group added when they leave it). Groups also
  feed role assignments and page permissions.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type UserGroup } from '@hcengineering/contact'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import core, { SortingOrder, type AccountUuid, type Ref, type Space } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Button, IconAdd, Label } from '@hcengineering/ui'

  import { recordAudit } from '../../audit'
  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import { ago } from './sections'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const gq = createQuery()
  const sq = createQuery()
  const eq = createQuery()
  let groups: UserGroup[] = []
  let spaces: Space[] = []
  let employees: Employee[] = []
  gq.query(contact.class.UserGroup, {}, (r) => { groups = r }, { sort: { name: SortingOrder.Ascending } })
  sq.query(core.class.Space, { archived: false }, (r) => { spaces = r.filter((s) => hierarchy.isDerived(s._class, core.class.TypedSpace) || s._class === ('chunter:class:Channel' as Ref<any>)) }, { sort: { name: SortingOrder.Ascending } })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: byUuid = new Map(employees.filter((e) => e.personUuid != null).map((e) => [e.personUuid as AccountUuid, e]))
  $: kinds = Array.from(new Set(spaces.map((s) => s._class))).map((c) => ({ _class: c, label: hierarchy.getClass(c).label, spaces: spaces.filter((s) => s._class === c) }))

  // editor
  let editing: UserGroup | null | undefined = null
  let name = ''
  let description = ''
  let members: AccountUuid[] = []
  let picked: Ref<Space>[] = []
  let busy = false
  let error = ''
  let search = ''
  function edit (g?: UserGroup): void {
    editing = g
    name = g?.name ?? ''
    description = g?.description ?? ''
    members = [...(g?.members ?? [])]
    picked = [...(g?.spaces ?? [])]
    error = ''
  }
  function toggleSpace (id: Ref<Space>): void {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
  }
  async function save (): Promise<void> {
    if (name.trim() === '') {
      error = 'Give the group a name.'
      return
    }
    busy = true
    try {
      const data = { name: name.trim(), description: description.trim(), members, spaces: picked }
      if (editing === undefined) {
        const id = await client.createDoc(contact.class.UserGroup, core.space.Workspace, { ...data, color: Math.floor(Math.random() * 16) })
        void recordAudit('group.created', id, `${data.name}: ${members.length} members, ${picked.length} spaces`)
      } else if (editing != null) {
        await client.update(editing, data)
        void recordAudit('group.updated', editing._id, `${data.name}: ${members.length} members, ${picked.length} spaces`)
      }
      editing = null
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      busy = false
    }
  }
  async function remove (g: UserGroup): Promise<void> {
    if (!confirm(`Delete group "${g.name}"? People it added to ${g.spaces.length} space${g.spaces.length === 1 ? '' : 's'} are removed from them.`)) return
    await client.remove(g)
    void recordAudit('group.deleted', g._id, g.name)
  }
  $: shown = groups.filter((g) => search.trim() === '' || g.name.toLowerCase().includes(search.trim().toLowerCase()))
  const spaceName = (id: Ref<Space>): string => spaces.find((s) => s._id === id)?.name ?? '…'
  const initials = (e: Employee | undefined, uuid: string): string => (e !== undefined ? formatName(e.name).split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : uuid.slice(0, 2).toUpperCase())
</script>

<div class="top">
  <label class="search">{@html icon('filter')}<input placeholder="Search groups" bind:value={search} /></label>
  <span class="muted">{groups.length} group{groups.length === 1 ? '' : 's'}</span>
  <span class="grow" />
  <Button kind={'primary'} icon={IconAdd} label={tracker.string.NewGroup} on:click={() => { edit(undefined) }} />
</div>

{#if editing !== null}
  <section class="editor motion-pop">
    <div class="row">
      <label class="field"><span>Name</span><input class="input" placeholder="Platform team" bind:value={name} /></label>
      <label class="field field--wide"><span>Description</span><input class="input" placeholder="Everyone who ships the platform" bind:value={description} /></label>
    </div>
    <div class="field">
      <span>Members · {members.length}</span>
      <AccountArrayEditor label={core.string.Members} value={members} onChange={(refs) => { members = refs }} kind={'regular'} size={'medium'} />
    </div>
    <div class="field">
      <span>Applied to · {picked.length} space{picked.length === 1 ? '' : 's'}</span>
      <p class="muted">Members join these spaces automatically and leave them when they leave the group. Owners of a space are never removed.</p>
      {#each kinds as k (k._class)}
        <div class="kind">
          <span class="kind__l"><Label label={k.label} /></span>
          <div class="chips">
            {#each k.spaces as s (s._id)}
              <button class="chip" class:chip--on={picked.includes(s._id)} on:click={() => { toggleSpace(s._id) }}>{s.name}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    {#if error !== ''}<p class="err">{error}</p>{/if}
    <div class="actions">
      <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} />
      <Button kind={'primary'} label={tracker.string.Save} loading={busy} on:click={() => { void save() }} />
    </div>
  </section>
{/if}

{#if shown.length === 0 && editing === null}
  <div class="none motion-pop">
    <span class="none__big">👥</span>
    <b>No groups yet</b>
    <span class="muted">Create a group such as "Engineering" or "Support", add people, and apply it to the projects and teamspaces they should be in. Membership then follows the group.</span>
  </div>
{/if}

<div class="list">
  {#each shown as g, k (g._id)}
    <article class="group motion-rise" style="--i: {Math.min(k, 12)}">
      <div class="group__head">
        <span class="group__tile" style="--h: {(g.color ?? 0) * 23}">{g.name.slice(0, 1).toUpperCase()}</span>
        <div class="group__titles">
          <span class="group__name">{g.name}</span>
          {#if g.description}<span class="muted">{g.description}</span>{/if}
        </div>
        <span class="grow" />
        <button class="lnk" on:click={() => { edit(g) }}>edit</button>
        <button class="lnk lnk--bad" on:click={() => { void remove(g) }}>delete</button>
      </div>
      <div class="group__body">
        <div class="faces">
          {#each g.members.slice(0, 8) as m (m)}<span class="face" title={byUuid.get(m) !== undefined ? formatName(byUuid.get(m)?.name ?? '') : m}>{initials(byUuid.get(m), m)}</span>{/each}
          {#if g.members.length > 8}<span class="face face--more">+{g.members.length - 8}</span>{/if}
          {#if g.members.length === 0}<span class="muted">no members</span>{/if}
        </div>
        <div class="chips chips--soft">
          {#each g.spaces as s (s)}<span class="chip chip--soft">{spaceName(s)}</span>{/each}
          {#if g.spaces.length === 0}<span class="muted">not applied to any space</span>{/if}
        </div>
      </div>
      <span class="group__meta">{g.members.length} member{g.members.length === 1 ? '' : 's'} · {g.spaces.length} space{g.spaces.length === 1 ? '' : 's'} · updated {ago(g.modifiedOn)}</span>
    </article>
  {/each}
</div>

<style lang="scss">
  .top { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.9rem; flex-wrap: wrap; }
  .grow { flex: 1; }
  .search { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); color: var(--theme-dark-color); min-width: 14rem; :global(svg) { width: 0.9rem; height: 0.9rem; } input { flex: 1; border: none; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; } }
  .muted { margin: 0; font-size: 0.78rem; color: var(--theme-dark-color); line-height: 1.4; }
  .editor { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 1rem; padding: 1rem 1.1rem; border: 1px dashed var(--accent-brand); border-radius: 0.9rem; background: var(--theme-panel-color); }
  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 12rem; > span { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); } &--wide { flex: 1; } }
  .input { padding: 0.5rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.9rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .kind { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.35rem; }
  .kind__l { font-size: 0.75rem; font-weight: 600; color: var(--theme-content-color); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.25rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.78rem; cursor: pointer; &:hover { border-color: var(--accent-brand); } &--on { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--accent-brand); font-weight: 600; } &--soft { cursor: default; background: var(--theme-button-default); border-color: transparent; } }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .err { margin: 0; font-size: 0.8125rem; color: var(--negative-button-default); }
  .none { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; max-width: 30rem; margin: 2rem auto; padding: 1.5rem; border: 1px dashed var(--theme-divider-color); border-radius: 1rem; text-align: center; b { color: var(--theme-caption-color); } }
  .none__big { font-size: 2rem; }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 0.75rem; }
  .group { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); }
  .group__head { display: flex; align-items: center; gap: 0.6rem; }
  .group__tile { display: inline-flex; align-items: center; justify-content: center; width: 2.2rem; height: 2.2rem; border-radius: 0.6rem; background: hsl(var(--h) 70% 55%); color: #fff; font-weight: 700; }
  .group__titles { display: flex; flex-direction: column; min-width: 0; }
  .group__name { font-weight: 700; color: var(--theme-caption-color); }
  .group__body { display: flex; flex-direction: column; gap: 0.4rem; }
  .faces { display: flex; align-items: center; gap: 0.2rem; flex-wrap: wrap; }
  .face { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--accent-brand-soft); color: var(--accent-brand); font-size: 0.62rem; font-weight: 700; &--more { background: var(--theme-button-default); color: var(--theme-content-color); } }
  .group__meta { font-size: 0.7rem; color: var(--theme-trans-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
</style>
