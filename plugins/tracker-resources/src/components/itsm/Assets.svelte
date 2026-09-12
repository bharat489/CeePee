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
  Asset register for one project: the servers, laptops, services and
  licences the team supports. Issues link to assets from their side panel,
  so "what is broken" and "what does it run on" stay connected. Small on
  purpose: a name, a kind, a serial, an owner, a status, a location, notes.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue, type Project, type SupportAsset } from '@hcengineering/tracker'
  import { Button, IconAdd, Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const aq = createQuery()
  const eq = createQuery()
  const iq = createQuery()
  let assets: SupportAsset[] = []
  let employees: Employee[] = []
  let linked: Issue[] = []
  $: aq.query(tracker.class.Asset, { space: currentSpace }, (r) => { assets = r }, { sort: { name: SortingOrder.Ascending } })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: iq.query(tracker.class.Issue, { space: currentSpace, assets: { $exists: true } }, (r) => { linked = r.filter((i) => (i.assets ?? []).length > 0) }, { limit: 3000 })
  $: nameOf = new Map(employees.map((e) => [e._id as Ref<Person>, formatName(e.name)]))
  $: issuesFor = (id: Ref<SupportAsset>): Issue[] => linked.filter((i) => (i.assets ?? []).includes(id))

  const KINDS = ['Server', 'Laptop', 'Phone', 'Service', 'Licence', 'Network', 'Database', 'Other']
  const STATUSES: Array<SupportAsset['status']> = ['in-use', 'spare', 'repair', 'retired']
  let filter = ''
  let statusFilter: SupportAsset['status'] | '' = ''
  $: shown = assets.filter((a) => (statusFilter === '' || a.status === statusFilter) && (filter.trim() === '' || `${a.name} ${a.kind} ${a.serial ?? ''} ${a.location ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase())))

  let editing: SupportAsset | undefined | null = null
  let f = { name: '', kind: 'Server', serial: '', owner: '' as Ref<Person> | '', status: 'in-use' as SupportAsset['status'], location: '', notes: '' }
  function edit (a?: SupportAsset): void {
    editing = a
    f = { name: a?.name ?? '', kind: a?.kind ?? 'Server', serial: a?.serial ?? '', owner: (a?.owner ?? '') as Ref<Person> | '', status: a?.status ?? 'in-use', location: a?.location ?? '', notes: a?.notes ?? '' }
  }
  async function save (): Promise<void> {
    if (f.name.trim() === '') return
    const data = { name: f.name.trim(), kind: f.kind, serial: f.serial.trim() || undefined, owner: f.owner === '' ? null : f.owner, status: f.status, location: f.location.trim() || undefined, notes: f.notes.trim() || undefined }
    if (editing === undefined) await client.createDoc(tracker.class.Asset, currentSpace, data)
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (a: SupportAsset): Promise<void> {
    if (!confirm(`Delete asset "${a.name}"? Issues keep working; the link disappears.`)) return
    await client.remove(a)
  }
  function open (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  function exportCsv (): void {
    const esc = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['Name', 'Kind', 'Serial', 'Owner', 'Status', 'Location', 'Open issues', 'Notes'].map(esc).join(','), ...assets.map((a) => [a.name, a.kind, a.serial ?? '', a.owner != null ? nameOf.get(a.owner) ?? '' : '', a.status, a.location ?? '', issuesFor(a._id).length, a.notes ?? ''].map(esc).join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const el = document.createElement('a')
    el.href = URL.createObjectURL(blob)
    el.download = 'assets.csv'
    el.click()
    URL.revokeObjectURL(el.href)
  }
</script>

<div class="as">
  <header class="as__head">
    <span class="as__title"><Label label={tracker.string.Assets} /></span>
    <input class="input" placeholder="search name, kind, serial, location" bind:value={filter} />
    <select class="input" bind:value={statusFilter}><option value="">any status</option>{#each STATUSES as s}<option value={s}>{s}</option>{/each}</select>
    <span class="muted">{shown.length} of {assets.length}</span>
    <span class="grow" />
    <Button kind={'ghost'} label={tracker.string.ExportCsv} disabled={assets.length === 0} on:click={exportCsv} />
    <Button kind={'primary'} icon={IconAdd} label={tracker.string.Add} on:click={() => { edit(undefined) }} />
  </header>

  {#if editing !== null}
    <section class="form motion-pop">
      <div class="form__row">
        <input class="input input--w" placeholder="Name, e.g. prod-db-01, MacBook Pro (Anita)" bind:value={f.name} />
        <select class="input" bind:value={f.kind}>{#each KINDS as k}<option value={k}>{k}</option>{/each}</select>
        <select class="input" bind:value={f.status}>{#each STATUSES as s}<option value={s}>{s}</option>{/each}</select>
      </div>
      <div class="form__row">
        <input class="input" placeholder="Serial / ID" bind:value={f.serial} />
        <select class="input" bind:value={f.owner}><option value="">no owner</option>{#each employees as e (e._id)}<option value={e._id}>{formatName(e.name)}</option>{/each}</select>
        <input class="input" placeholder="Location / region" bind:value={f.location} />
      </div>
      <textarea class="input input--area" placeholder="Notes: vendor, warranty, runbook link…" bind:value={f.notes} />
      <div class="form__row"><Button kind={'primary'} label={tracker.string.Save} on:click={() => { void save() }} /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} /></div>
    </section>
  {/if}

  <div class="table-wrap">
    <table class="table">
      <thead><tr><th class="th th--l">Asset</th><th class="th th--l">Kind</th><th class="th th--l">Serial</th><th class="th th--l">Owner</th><th class="th">Status</th><th class="th th--l">Location</th><th class="th">Issues</th><th class="th"></th></tr></thead>
      <tbody>
        {#each shown as a, idx (a._id)}
          <tr class="motion-rise" style="--i: {Math.min(idx, 12)}">
            <td class="td td--l"><b>{a.name}</b>{#if a.notes}<div class="muted">{a.notes}</div>{/if}</td>
            <td class="td td--l">{a.kind}</td>
            <td class="td td--l mono">{a.serial ?? ''}</td>
            <td class="td td--l">{a.owner != null ? nameOf.get(a.owner) ?? '…' : '—'}</td>
            <td class="td"><span class="pill pill--{a.status}">{a.status}</span></td>
            <td class="td td--l">{a.location ?? ''}</td>
            <td class="td">{#each issuesFor(a._id) as i (i._id)}<button class="lnk" on:click={() => { open(i) }}>{i.identifier}</button> {/each}{#if issuesFor(a._id).length === 0}—{/if}</td>
            <td class="td"><button class="lnk" on:click={() => { edit(a) }}>edit</button> <button class="lnk lnk--bad" on:click={() => { void remove(a) }}>delete</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if shown.length === 0}<p class="muted">No assets{assets.length > 0 ? ' match' : ' yet. Add the things the team supports; issues can then be linked to them from their side panel'}.</p>{/if}
  </div>
</div>

<style lang="scss">
  .as { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.25rem; overflow: auto; }
  .as__head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .as__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .grow { flex: 1; }
  .input { padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--w { flex: 1; min-width: 14rem; } &--area { min-height: 3.5rem; resize: vertical; } }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .form { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px dashed var(--accent-brand); border-radius: 0.6rem; }
  .form__row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .table-wrap { overflow-x: auto; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--theme-divider-color); text-align: center; white-space: nowrap; &--l { text-align: left; } }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .td { color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .mono { font-family: var(--mono-font, ui-monospace, Menlo, monospace); font-size: 0.75rem; }
  .pill { padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--in-use { background: var(--accent-brand-soft); } &--repair { background: color-mix(in srgb, #f5a623 25%, transparent); } &--retired { opacity: 0.6; } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
</style>
