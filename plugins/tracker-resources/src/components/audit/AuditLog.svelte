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
  Audit log: who changed what, when. Two sources merged: the activity feed
  the platform writes for every document change, and the admin events
  screens record for actions that bypass the document store (roles,
  invites, integrations). Exportable; retention is a workspace policy.
  A record of edits to shared work -- not of presence or reading.
-->
<script lang="ts">
  import activity, { type DocUpdateMessage } from '@hcengineering/activity'
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import core, { AccountRole, getCurrentAccount, hasAccountRole, SortingOrder, type Class, type Doc, type PersonId, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type AuditEvent, type AuditPolicy } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const isAdmin = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const feedQ = createQuery()
  const eventsQ = createQuery()
  const policyQ = createQuery()
  const DAY = 86_400_000

  let days = 7
  let limit = 200
  let who = ''
  let kind: 'all' | 'docs' | 'admin' = 'all'
  let messages: DocUpdateMessage[] = []
  let events: AuditEvent[] = []
  let policy: AuditPolicy | undefined

  $: feedQ.query(activity.class.DocUpdateMessage, { createdOn: { $gte: Date.now() - days * DAY } }, (r) => { messages = r }, { limit, sort: { createdOn: SortingOrder.Descending } })
  $: eventsQ.query(tracker.class.AuditEvent, { createdOn: { $gte: Date.now() - days * DAY } }, (r) => { events = r }, { limit, sort: { createdOn: SortingOrder.Descending } })
  policyQ.query(tracker.class.AuditPolicy, {}, (r) => { policy = r[0] })

  // names: social ids (feed) and person refs (admin events)
  let names = new Map<string, string>()
  function nameOfSocial (id: PersonId | undefined): string {
    if (id === undefined) return ''
    const n = names.get(id)
    if (n !== undefined) return n
    names.set(id, '…')
    getPersonByPersonIdCb(id, (p: Readonly<Person> | null) => { names = new Map(names).set(id, p !== null ? formatName(p.name) : 'system') })
    return '…'
  }
  async function resolvePersons (ids: Array<Ref<Person> | undefined>): Promise<void> {
    const missing = Array.from(new Set(ids.filter((x): x is Ref<Person> => x !== undefined))).filter((id) => !names.has(id))
    if (missing.length === 0) return
    const people = await client.findAll(contact.class.Person, { _id: { $in: missing } })
    const next = new Map(names)
    for (const p of people) next.set(p._id, formatName(p.name))
    names = next
  }
  $: void resolvePersons(events.map((e) => e.actor))

  interface Row {
    id: string
    when: number
    who: string
    action: string
    object: string
    objectLabel?: any
    change: string
    open?: () => void
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
    if (u === undefined) return m.updateCollection ?? ''
    const set = u.set.filter((v) => v !== null && v !== '').map(String)
    const added = u.added.length > 0 ? ` +${u.added.length}` : ''
    const removed = u.removed.length > 0 ? ` −${u.removed.length}` : ''
    return `${u.attrKey}${set.length > 0 ? ' → ' + set.map((s) => (s.length > 40 ? s.slice(0, 39) + '…' : s)).join(', ') : ''}${added}${removed}`
  }
  $: rows = ((): Row[] => {
    const a: Row[] = kind === 'admin' ? [] : messages.map((m) => ({
      id: m._id,
      when: m.createdOn ?? m.modifiedOn,
      who: nameOfSocial(m.createdBy ?? m.modifiedBy),
      action: m.action,
      object: m.objectClass,
      objectLabel: classLabel(m.objectClass),
      change: summary(m),
      open: () => { showPanel(view.component.EditDoc, m.objectId, m.objectClass, 'content') }
    }))
    const b: Row[] = kind === 'docs' ? [] : events.map((e) => ({
      id: e._id,
      when: e.createdOn ?? e.modifiedOn,
      who: e.actor !== undefined ? names.get(e.actor) ?? '…' : 'system',
      action: e.kind,
      object: e.target,
      change: e.details
    }))
    const all = [...a, ...b].sort((x, y) => y.when - x.when)
    const w = who.trim().toLowerCase()
    return w === '' ? all : all.filter((r) => r.who.toLowerCase().includes(w))
  })()

  function when (ts: number): string {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  function exportCsv (): void {
    const esc = (s: unknown): string => `"${String(s ?? '').replace(/"/g, '""')}"`
    const lines = [['When', 'Who', 'Action', 'Object', 'Change'].map(esc).join(','), ...rows.map((r) => [new Date(r.when).toISOString(), r.who, r.action, r.object, r.change].map(esc).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function setRetention (): Promise<void> {
    const v = prompt('Keep audit records for how many days? (0 = forever)', String(policy?.retentionDays ?? 0))
    if (v === null) return
    const n = Math.max(0, Math.floor(Number(v)))
    if (Number.isNaN(n)) return
    if (policy !== undefined) await client.update(policy, { retentionDays: n })
    else await client.createDoc(tracker.class.AuditPolicy, core.space.Workspace, { retentionDays: n })
  }
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
        <select class="audit__select" bind:value={kind}><option value="all">everything</option><option value="docs">document changes</option><option value="admin">admin actions</option></select>
        <select class="audit__select" bind:value={days}><option value={1}>24h</option><option value={7}>7d</option><option value={30}>30d</option><option value={90}>90d</option><option value={365}>1y</option></select>
        <button class="btn" disabled={rows.length === 0} on:click={exportCsv}><Label label={tracker.string.ExportCsv} /></button>
        {#if isAdmin}<button class="btn" on:click={setRetention}>Retention: {policy?.retentionDays ? `${policy.retentionDays}d` : 'forever'}</button>{/if}
      </div>
    </header>

    <div class="table-wrap">
      <table class="table">
        <thead><tr><th class="th">When</th><th class="th">Who</th><th class="th">Action</th><th class="th">Object</th><th class="th">Change</th></tr></thead>
        <tbody>
          {#each rows as r, idx (r.id)}
            <tr class="tr motion-rise" class:tr--link={r.open !== undefined} style="--i: {Math.min(idx, 12)}" on:click={() => r.open?.()}>
              <td class="td td--when">{when(r.when)}</td>
              <td class="td td--who">{r.who}</td>
              <td class="td"><span class="pill pill--{r.action}">{r.action}</span></td>
              <td class="td td--obj">{#if r.objectLabel !== undefined}<Label label={r.objectLabel} />{:else}{r.object}{/if}</td>
              <td class="td td--change">{r.change}</td>
            </tr>
          {/each}
          {#if rows.length === 0}<tr><td class="td td--empty" colspan="5"><Label label={tracker.string.NothingToShow} /></td></tr>{/if}
        </tbody>
      </table>
    </div>
    {#if messages.length >= limit}<button class="more" on:click={() => { limit += 200 }}><Label label={tracker.string.LoadMore} /></button>{/if}
  </div>
</div>

<style lang="scss">
  .audit { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem 2rem; overflow: auto; }
  .audit__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; > div:first-child { display: flex; flex-direction: column; gap: 0.15rem; } }
  .audit__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .audit__sub { font-size: 0.8125rem; color: var(--theme-dark-color); }
  .audit__filters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .audit__input, .audit__select, .btn { padding: 0.4rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .btn { cursor: pointer; &:hover:not(:disabled) { background: var(--theme-button-hovered); } &:disabled { opacity: 0.4; cursor: default; } }
  .table-wrap { overflow-x: auto; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--theme-divider-color); text-align: left; white-space: nowrap; }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); background: var(--theme-comp-header-color); }
  .tr--link { cursor: pointer; &:hover .td { background: var(--theme-button-hovered); } }
  .td { color: var(--theme-content-color); &--when { color: var(--theme-trans-color); font-variant-numeric: tabular-nums; } &--who { color: var(--theme-caption-color); font-weight: 500; } &--change { max-width: 28rem; overflow: hidden; text-overflow: ellipsis; font-family: var(--mono-font, ui-monospace, Menlo, monospace); font-size: 0.75rem; } &--empty { text-align: center; color: var(--theme-trans-color); border-bottom: none; } }
  .pill { padding: 0.05rem 0.45rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--create { background: var(--accent-brand-soft); color: var(--accent-brand-ink); } &--remove { background: rgba(203, 75, 66, 0.15); color: var(--negative-button-default); } }
  .more { align-self: center; padding: 0.5rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
</style>
