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
  Security controls: who may come in (guest sign-up, read-only guests,
  invites), what leaves (audit retention, SIEM streaming), and identity
  (SCIM provisioning, two-factor, API tokens). Every switch here is backed
  by the account service or the audit policy; nothing is decorative.
-->
<script lang="ts">
  import { getAccountClient } from '@hcengineering/contact-resources'
  import core, { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { getIntegrationsUrl, type AuditPolicy } from '@hcengineering/tracker'
  import { Button, Toggle } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import { recordAudit } from '../../audit'
  import tracker from '../../plugin'
  import { goCategory } from './sections'

  const client = getClient()
  const accountClient = getAccountClient()
  const me = getCurrentAccount()
  const owner = hasAccountRole(me, AccountRole.Owner)

  let wsName = ''
  let guestSignUp = false
  let readOnlyGuests = false
  let loaded = false
  let notice = ''
  onMount(async () => {
    try {
      const info = await accountClient.getWorkspaceInfo()
      wsName = info.name ?? ''
      guestSignUp = info.allowGuestSignUp === true
      readOnlyGuests = info.allowReadOnlyGuest === true
    } finally {
      loaded = true
    }
  })
  async function setGuestSignUp (on: boolean): Promise<void> {
    await accountClient.updateAllowGuestSignUp(on)
    guestSignUp = on
    void recordAudit('security.guestSignUp', String(on))
    notice = on ? 'Anyone with an invite link can now sign up as a guest.' : 'Guest sign-up is off.'
  }
  async function setReadOnlyGuests (on: boolean): Promise<void> {
    await accountClient.updateAllowReadOnlyGuests(on)
    readOnlyGuests = on
    void recordAudit('security.readOnlyGuests', String(on))
    notice = on ? 'Read-only guest links are on.' : 'Read-only guest links are off.'
  }
  let renaming = false
  async function rename (): Promise<void> {
    if (wsName.trim() === '') return
    await accountClient.updateWorkspaceName(wsName.trim())
    void recordAudit('workspace.renamed', wsName.trim())
    renaming = false
    notice = 'Workspace renamed.'
  }

  // audit policy
  const pq = createQuery()
  let policy: AuditPolicy | undefined
  let retention = 0
  let siemUrl = ''
  let siemSecret = ''
  let policyLoaded = false
  pq.query(tracker.class.AuditPolicy, {}, (r) => {
    policy = r[0]
    if (!policyLoaded) {
      retention = policy?.retentionDays ?? 0
      siemUrl = policy?.siemUrl ?? ''
      siemSecret = policy?.siemSecret ?? ''
      policyLoaded = true
    }
  })
  $: policyDirty = policyLoaded && (retention !== (policy?.retentionDays ?? 0) || siemUrl !== (policy?.siemUrl ?? '') || siemSecret !== (policy?.siemSecret ?? ''))
  async function savePolicy (): Promise<void> {
    const data = { retentionDays: Math.max(0, Math.floor(Number(retention) || 0)), siemUrl: siemUrl.trim(), siemSecret: siemSecret.trim() }
    if (policy === undefined) await client.createDoc(tracker.class.AuditPolicy, core.space.Workspace, data)
    else await client.update(policy, data)
    void recordAudit('security.auditPolicy', `retention ${data.retentionDays}d, siem ${data.siemUrl !== '' ? 'on' : 'off'}`)
    notice = 'Retention and streaming saved.'
  }
  const integrations = getIntegrationsUrl()
</script>

{#if notice !== ''}<p class="notice">{notice}</p>{/if}

<div class="grid">
  <section class="card motion-rise" style="--i: 0">
    <span class="card__t">Access</span>
    <div class="row"><div class="row__t"><b>Workspace name</b><span class="muted">Shown on invites, emails and the login screen.</span></div>
      {#if renaming}<input class="input" bind:value={wsName} /><Button kind={'primary'} label={tracker.string.Save} on:click={() => { void rename() }} />{:else}<span class="val">{wsName || '…'}</span><button class="lnk" disabled={!owner} on:click={() => { renaming = true }}>rename</button>{/if}
    </div>
    <div class="row"><div class="row__t"><b>Guest sign-up</b><span class="muted">People who open an invite link can create a guest account themselves. Off means every account is created by an invite you send.</span></div><Toggle on={guestSignUp} disabled={!loaded || !owner} on:change={(e) => { void setGuestSignUp(e.detail) }} /></div>
    <div class="row"><div class="row__t"><b>Read-only guest links</b><span class="muted">Public "view only" links to issues and pages. Off disables every such link at once.</span></div><Toggle on={readOnlyGuests} disabled={!loaded || !owner} on:change={(e) => { void setReadOnlyGuests(e.detail) }} /></div>
    <div class="links"><button class="link" on:click={() => { goCategory('guestPermissions') }}>Guest permissions <small>what guests may see and do, per app</small></button><button class="link" on:click={() => { goCategory('invites') }}>Invite settings <small>expiry, limits, default role</small></button></div>
  </section>

  <section class="card motion-rise" style="--i: 1">
    <span class="card__t">Audit and retention</span>
    <div class="row"><div class="row__t"><b>Keep audit events for</b><span class="muted">Older audit events, activity entries and automation runs are deleted by the hourly sweep. 0 keeps everything.</span></div><span class="inline"><input class="input input--n" type="number" min="0" bind:value={retention} /> days</span></div>
    <div class="row"><div class="row__t"><b>Stream to a SIEM</b><span class="muted">Every audited change is POSTed as JSON to this HTTPS endpoint as it happens (Splunk, Datadog, Elastic, your own collector).</span></div></div>
    <input class="input" placeholder="https://collector.example.com/ceepee" bind:value={siemUrl} />
    <input class="input" placeholder="shared secret sent as Authorization: Bearer …" bind:value={siemSecret} />
    <div class="actions"><Button kind={'primary'} label={tracker.string.Save} disabled={!policyDirty} on:click={() => { void savePolicy() }} /></div>
    <div class="links"><button class="link" on:click={() => { goCategory('audit') }}>Audit log <small>browse and export events</small></button></div>
  </section>

  <section class="card motion-rise" style="--i: 2">
    <span class="card__t">Identity</span>
    <div class="row"><div class="row__t"><b>SCIM provisioning</b><span class="muted">Okta, Entra ID, Google and JumpCloud create, update and deactivate people through the SCIM endpoint on the integrations service.</span></div></div>
    <code class="code">{integrations}/scim/v2</code>
    <div class="row"><div class="row__t"><b>Single sign-on</b><span class="muted">The account service signs people in through the OAuth providers configured on the server (GitHub, Google and OpenID Connect via the provider environment). SCIM plus a provider gives a full SSO flow; passwords stay possible unless you turn them off there.</span></div></div>
    <div class="links"><button class="link" on:click={() => { goCategory('api-access') }}>API access <small>SCIM token, API tokens</small></button><button class="link" on:click={() => { goCategory('identity') }}>Identity settings <small>social identities, two-factor</small></button><button class="link" on:click={() => { goCategory('password') }}>Password <small>your own credentials</small></button></div>
  </section>

  <section class="card motion-rise" style="--i: 3">
    <span class="card__t">Data</span>
    <div class="row"><div class="row__t"><b>Export</b><span class="muted">Take everything out as CSV or JSON; per project or the whole workspace.</span></div><button class="lnk" on:click={() => { goCategory('export') }}>open</button></div>
    <div class="row"><div class="row__t"><b>Import</b><span class="muted">Jira, CSV and other sources, with field mapping and a dry run.</span></div><button class="lnk" on:click={() => { goCategory('jira-import') }}>open</button></div>
    <div class="row"><div class="row__t"><b>Backup</b><span class="muted">Workspace backups on the backup service.</span></div><button class="lnk" on:click={() => { goCategory('backup') }}>open</button></div>
    <div class="row"><div class="row__t"><b>Organisation console</b><span class="muted">Public surfaces, connected services and everything a compliance reviewer asks first.</span></div><button class="lnk" on:click={() => { goCategory('org-console') }}>open</button></div>
  </section>
</div>

<style lang="scss">
  .notice { margin: 0 0 0.6rem; font-size: 0.8125rem; color: var(--accent-brand); font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 0.75rem; }
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); }
  .card__t { font-weight: 700; color: var(--theme-caption-color); }
  .row { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; border-top: 1px solid var(--theme-divider-color); &:first-of-type { border-top: none; } }
  .row__t { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; b { font-size: 0.875rem; color: var(--theme-caption-color); } }
  .muted { margin: 0; font-size: 0.76rem; color: var(--theme-dark-color); line-height: 1.4; }
  .val { font-weight: 600; color: var(--theme-caption-color); }
  .inline { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .input { padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.85rem; outline: none; &:focus { border-color: var(--accent-brand); } &--n { width: 5rem; } }
  .actions { display: flex; justify-content: flex-end; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.78rem; cursor: pointer; &:hover { text-decoration: underline; } &:disabled { opacity: 0.5; cursor: default; } }
  .links { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.2rem; }
  .link { display: flex; flex-direction: column; padding: 0.45rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; font-weight: 600; text-align: left; cursor: pointer; small { font-weight: 400; font-size: 0.7rem; color: var(--theme-dark-color); } &:hover { border-color: var(--accent-brand); } }
  .code { display: block; padding: 0.35rem 0.55rem; border-radius: 0.4rem; background: var(--theme-button-pressed); color: var(--theme-caption-color); font-size: 0.75rem; word-break: break-all; }
</style>
