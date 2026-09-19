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
  Organisation console (owners). One page for the questions a buyer asks:
  who is in, what is public, what is connected, how long records are kept,
  where the audit stream goes, and how to take the data out. Counts only,
  never per-person activity.
-->
<script lang="ts">
  import { getIntegrationsUrl } from '@hcengineering/tracker'
  import contact, { getCurrentEmployee, type Employee } from '@hcengineering/contact'
  import core, { AccountRole, getCurrentAccount, hasAccountRole, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type AuditPolicy, type Issue, type Project } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import tracker from '../../plugin'

  const client = getClient()
  const isOwner = hasAccountRole(getCurrentAccount(), AccountRole.Owner)
  const pq = createQuery()
  const eq = createQuery()
  const polQ = createQuery()
  let projects: Project[] = []
  let employees: Employee[] = []
  let policy: AuditPolicy | undefined
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  eq.query(contact.mixin.Employee, {}, (r) => { employees = r })
  polQ.query(tracker.class.AuditPolicy, {}, (r) => {
    policy = r[0]
    if (!touched) {
      retention = String(policy?.retentionDays ?? 0)
      siemUrl = policy?.siemUrl ?? ''
      siemSecret = policy?.siemSecret ?? ''
    }
  })
  $: active = employees.filter((e) => e.active)
  $: guests = active.filter((e) => e.role === 'GUEST').length

  interface Row { project: Project, open: number, total: number, rules: number, forms: number }
  let rows: Row[] = []
  let counts = { shared: 0, ideasPublic: 0, schemes: 0, forms: 0, rules: 0, portals: 0 }
  let loading = false
  async function load (list: Project[]): Promise<void> {
    if (list.length === 0) return
    loading = true
    try {
      const statuses = await client.findAll(tracker.class.IssueStatus, {})
      const open = statuses.filter((s) => s.category !== 'task:statuscategory:Won' && s.category !== 'task:statuscategory:Lost').map((s) => s._id)
      const out: Row[] = []
      for (const p of list) {
        const total = (await client.findAll(tracker.class.Issue, { space: p._id }, { limit: 1, total: true })).total
        const openN = (await client.findAll(tracker.class.Issue, { space: p._id, status: { $in: open } }, { limit: 1, total: true })).total
        const rules = (await client.findAll(tracker.class.AutomationRule, { space: p._id }, { limit: 1, total: true })).total
        const forms = (await client.findAll(tracker.class.IssueForm, { space: p._id }, { limit: 1, total: true })).total
        out.push({ project: p, open: openN, total, rules, forms })
      }
      rows = out
      const shared = await client.findAll(tracker.class.Issue, { shareToken: { $exists: true } }, { limit: 500 })
      counts = {
        shared: shared.filter((i) => i.shareToken != null && i.shareToken !== '').length,
        ideasPublic: (await client.findAll(tracker.class.Idea, { public: true }, { limit: 1, total: true })).total,
        schemes: (await client.findAll(tracker.class.WorkflowScheme, {}, { limit: 1, total: true })).total,
        forms: out.reduce((a, r) => a + r.forms, 0),
        rules: out.reduce((a, r) => a + r.rules, 0),
        portals: list.filter((p) => p.portal?.enabled === true).length
      }
    } finally {
      loading = false
    }
  }
  $: void load(projects)

  // ---- integrations health ------------------------------------------------------
  const integrationsUrl = getIntegrationsUrl()
  let health: Record<string, unknown> | undefined
  let healthErr = ''
  onMount(async () => {
    try {
      const r = await fetch(`${integrationsUrl}/health`)
      health = await r.json()
    } catch (e: any) {
      healthErr = 'integrations service not reachable'
    }
  })
  const flag = (k: string): string => (health === undefined ? '…' : health[k] === true ? 'on' : health[k] === false ? 'off' : String(health[k] ?? '—'))

  // ---- audit & compliance -------------------------------------------------------
  let touched = false
  let retention = '0'
  let siemUrl = ''
  let siemSecret = ''
  let savedAt = 0
  async function savePolicy (): Promise<void> {
    const data = { retentionDays: Math.max(0, Math.floor(Number(retention) || 0)), siemUrl: siemUrl.trim(), siemSecret: siemSecret.trim() }
    if (policy !== undefined) await client.update(policy, data)
    else await client.createDoc(tracker.class.AuditPolicy, core.space.Workspace, data)
    touched = false
    savedAt = Date.now()
  }
  async function testSiem (): Promise<void> {
    await client.createDoc(tracker.class.AuditEvent, core.space.Workspace, { kind: 'siem.test', actor: getCurrentEmployee(), target: 'siem', details: 'Test event from the organisation console' })
    alert('A test audit event was written. If the SIEM URL is set, the server has forwarded it.')
  }

  // ---- export ----------------------------------------------------------------------
  let exporting = false
  async function exportJson (): Promise<void> {
    exporting = true
    try {
      const issues: Issue[] = await client.findAll(tracker.class.Issue, {}, { limit: 20000 })
      const data = {
        exportedAt: new Date().toISOString(),
        projects: projects.map((p) => ({ id: p._id, name: p.name, identifier: p.identifier, private: p.private })),
        issues: issues.map((i) => ({ id: i._id, key: i.identifier, project: i.space, title: i.title, status: i.status, priority: i.priority, assignee: i.assignee, parent: i.attachedTo, estimation: i.estimation, dueDate: i.dueDate, createdOn: i.createdOn, modifiedOn: i.modifiedOn, labels: undefined }))
      }
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ceepee-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => { URL.revokeObjectURL(url) }, 5000)
    } finally {
      exporting = false
    }
  }
  const projectName = (id: Ref<Project>): string => projects.find((p) => p._id === id)?.name ?? ''
</script>

<div class="hulyComponent">
  <div class="oc">
    <header class="oc__head">
      <span class="oc__title ceepee-gradient-text"><Label label={tracker.string.OrgConsole} /></span>
      <span class="muted">Who is in, what is public, what is connected, and how records are kept. Counts only; nobody's activity is tracked here.</span>
    </header>

    <div class="tiles">
      <div class="tile motion-rise" style="--i: 0"><span class="tile__n">{active.length}</span><span class="tile__l">members{guests > 0 ? ` · ${guests} guests` : ''}</span></div>
      <div class="tile motion-rise" style="--i: 1"><span class="tile__n">{projects.length}</span><span class="tile__l">projects</span></div>
      <div class="tile motion-rise" style="--i: 2"><span class="tile__n">{rows.reduce((a, r) => a + r.open, 0)}</span><span class="tile__l">open issues</span></div>
      <div class="tile motion-rise" style="--i: 3"><span class="tile__n">{counts.rules}</span><span class="tile__l">automation rules</span></div>
      <div class="tile motion-rise" style="--i: 4"><span class="tile__n">{counts.portals}</span><span class="tile__l">public portals</span></div>
      <div class="tile motion-rise" style="--i: 5"><span class="tile__n">{counts.shared}</span><span class="tile__l">shared issue links</span></div>
    </div>

    <div class="two">
      <section class="card motion-rise" style="--i: 1">
        <span class="card__title">Projects</span>
        <div class="table-wrap"><table class="table">
          <thead><tr><th class="th th--l">Project</th><th class="th">Open</th><th class="th">Total</th><th class="th">Rules</th><th class="th">Forms</th><th class="th">Portal</th><th class="th">Private</th></tr></thead>
          <tbody>{#each rows as r (r.project._id)}<tr><td class="td td--l"><b>{r.project.name}</b> <span class="muted">{r.project.identifier}</span></td><td class="td">{r.open}</td><td class="td">{r.total}</td><td class="td">{r.rules}</td><td class="td">{r.forms}</td><td class="td">{r.project.portal?.enabled === true ? `/${r.project.portal.slug}` : '—'}</td><td class="td">{r.project.private ? 'yes' : 'no'}</td></tr>{/each}</tbody>
        </table></div>
        {#if loading}<span class="muted">counting…</span>{/if}
      </section>

      <section class="card motion-rise" style="--i: 2">
        <span class="card__title">Public surfaces</span>
        <div class="kv"><span>Portals</span><b>{counts.portals}</b></div>
        <div class="kv"><span>Public forms</span><b>{counts.forms}</b></div>
        <div class="kv"><span>Public ideas</span><b>{counts.ideasPublic}</b></div>
        <div class="kv"><span>Shared issue links</span><b>{counts.shared}</b></div>
        <div class="kv"><span>Workflow schemes</span><b>{counts.schemes}</b></div>
        <span class="card__title">Integrations service</span>
        {#if healthErr !== ''}<span class="muted">{healthErr} at {integrationsUrl}</span>{:else}
          <div class="kv"><span>Workspace</span><b>{flag('workspace')}</b></div>
          <div class="kv"><span>Portal</span><b>{flag('portal')}</b></div>
          <div class="kv"><span>Inbound webhooks</span><b>{flag('inbound')}</b></div>
          <div class="kv"><span>SCIM</span><b>{flag('scim')}</b></div>
          <div class="kv"><span>Slack</span><b>{flag('slack')}</b></div>
          <div class="kv"><span>Teams</span><b>{flag('teams')}</b></div>
        {/if}
      </section>

      <section class="card motion-rise" style="--i: 3">
        <span class="card__title">Audit and compliance</span>
        <label class="fld"><span>Keep audit records for (days, 0 = forever)</span><input class="input" type="number" min="0" bind:value={retention} disabled={!isOwner} on:input={() => { touched = true }} /></label>
        <label class="fld"><span>Stream events to a SIEM (HTTPS URL, one JSON event per change)</span><input class="input" placeholder="https://siem.example.com/ingest/ceepee" bind:value={siemUrl} disabled={!isOwner} on:input={() => { touched = true }} /></label>
        <label class="fld"><span>Shared secret (sent as a bearer token)</span><input class="input" type="password" bind:value={siemSecret} disabled={!isOwner} on:input={() => { touched = true }} /></label>
        {#if isOwner}<div class="row"><Button kind={'primary'} label={tracker.string.Save} disabled={!touched} on:click={() => { void savePolicy() }} /><button class="lnk" on:click={() => { void testSiem() }}>send a test event</button>{#if savedAt > 0 && Date.now() - savedAt < 3000}<span class="muted">saved</span>{/if}</div>{/if}
        <span class="muted">Events cover issues, projects, rules, forms, workflow schemes, audit policy and admin actions. The audit log itself is under Settings → Audit log.</span>
      </section>

      <section class="card motion-rise" style="--i: 4">
        <span class="card__title">Your data</span>
        <span class="muted">Everything stays on your server. Take a copy any time: projects and issues as one JSON file. Per-project CSV lives in each project's reports; backups of the whole database are in Settings → Backup.</span>
        <div class="row"><Button kind={'primary'} label={tracker.string.ExportJson} loading={exporting} on:click={() => { void exportJson() }} /></div>
      </section>
    </div>
  </div>
</div>

<style lang="scss">
  .oc { display: flex; flex-direction: column; gap: 0.9rem; padding: 1rem 1.25rem; overflow: auto; }
  .oc__head { display: flex; flex-direction: column; gap: 0.2rem; }
  .oc__title { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.6rem; }
  .tile { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.8rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); background-image: var(--accent-gradient-soft); }
  .tile__n { font-size: 1.6rem; font-weight: 800; color: var(--theme-caption-color); }
  .tile__l { font-size: 0.75rem; color: var(--theme-dark-color); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 0.9rem; }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); min-width: 0; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .table-wrap { overflow-x: auto; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); text-align: center; white-space: nowrap; &--l { text-align: left; } }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .td { color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .kv { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.8125rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .fld { display: flex; flex-direction: column; gap: 0.2rem; span { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); } }
  .input { padding: 0.4rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { text-decoration: underline; } }
</style>
