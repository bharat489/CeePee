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
  Identity: which sign-in providers are live, how to add single sign-on,
  and how to provision people from an identity provider (SCIM). The
  providers themselves are configured on the account service; this page
  shows what it reports and tells an admin exactly which switch to flip.
-->
<script lang="ts">
  import { getAccountClient } from '../utils'
  import { Label } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import setting from '../plugin'

  interface Provider {
    name: string
    displayName?: string
  }
  let providers: Provider[] = []
  let loaded = false
  onMount(async () => {
    try {
      providers = (await getAccountClient().getProviders()) as Provider[]
    } catch {
      providers = []
    }
    loaded = true
  })
  const known = [
    { id: 'google', label: 'Google', env: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' },
    { id: 'github', label: 'GitHub', env: 'GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET' },
    { id: 'openid', label: 'OpenID Connect (Okta, Entra ID, Keycloak, Auth0, …)', env: 'OPENID_CLIENT_ID, OPENID_CLIENT_SECRET, OPENID_ISSUER' }
  ]
  $: live = new Set(providers.map((p) => p.name.toLowerCase()))
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
</script>

<div class="hulyComponent">
  <div class="id">
    <header class="id__head">
      <span class="id__title"><Label label={setting.string.Identity} /></span>
      <span class="id__sub"><Label label={setting.string.IdentityHint} /></span>
    </header>

    <section class="card motion-rise" style="--i: 0">
      <span class="card__title">Sign-in providers</span>
      {#each known as k, idx (k.id)}
        <div class="row motion-rise" style="--i: {idx}">
          <span class="dot" class:dot--on={live.has(k.id)} />
          <div class="row__main">
            <span class="row__name">{k.label}</span>
            <span class="row__hint">{live.has(k.id) ? 'Enabled on the account service.' : `Off. Set ${k.env} on the account service and restart it.`}</span>
          </div>
          <span class="pill" class:pill--on={live.has(k.id)}>{live.has(k.id) ? 'on' : 'off'}</span>
        </div>
      {/each}
      {#if loaded && providers.length === 0}<p class="muted">Email and password only. Callback URL for any provider: <code>{origin}/login/auth/&lt;provider&gt;</code></p>{/if}
    </section>

    <section class="card motion-rise" style="--i: 1">
      <span class="card__title">Single sign-on (SAML)</span>
      <p class="muted">The account service speaks OpenID Connect. For a SAML-only identity provider, put it behind an OIDC broker — Keycloak, Dex or Authentik all do this in a few minutes — and set <code>OPENID_ISSUER</code> to the broker. Users then sign in with the "OpenID" button; accounts are matched by email.</p>
    </section>

    <section class="card motion-rise" style="--i: 2">
      <span class="card__title">Provisioning (SCIM 2.0)</span>
      <p class="muted">The integrations service exposes <code>{origin.replace(/:\d+$/, '')}:8095/scim/v2</code>. In Okta, Entra ID or OneLogin, add a SCIM application with that base URL and the <code>SCIM_TOKEN</code> from the service's environment. Creating a user sends an auto-join invite with the role mapped from their group (<code>SCIM_ROLE_MAP</code>, e.g. <code>Admins=OWNER,Leads=MAINTAINER</code>); deactivating demotes them to read-only and keeps their history.</p>
    </section>

    <section class="card motion-rise" style="--i: 3">
      <span class="card__title">Workspace controls</span>
      <ul class="list">
        <li>Roles: Owner, Maintainer, User, Guest, Read-only guest — set per person under <b>Team</b>.</li>
        <li>Guest sign-up and read-only guests can be allowed or blocked under <b>General</b>.</li>
        <li>Every role change, invite and integration change is recorded in the <b>Audit log</b>.</li>
        <li>Password aging can be enforced from the account service (<code>updatePasswordAgingRule</code>).</li>
      </ul>
    </section>
  </div>
</div>

<style lang="scss">
  .id { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem 2rem; max-width: 56rem; overflow: auto; }
  .id__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .id__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .id__sub, .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); line-height: 1.5; }
  code { font-size: 0.75rem; padding: 0.05rem 0.3rem; border-radius: 0.25rem; background: var(--theme-button-pressed); color: var(--theme-caption-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .row { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; border-top: 1px solid var(--theme-divider-color); }
  .dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--theme-trans-color); flex-shrink: 0; &--on { background: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .row__main { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
  .row__name { color: var(--theme-caption-color); font-weight: 500; }
  .row__hint { font-size: 0.75rem; color: var(--theme-dark-color); }
  .pill { padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--on { background: var(--accent-brand-soft); color: var(--accent-brand-ink); } }
  .list { margin: 0; padding-left: 1.2rem; font-size: 0.8125rem; color: var(--theme-content-color); line-height: 1.7; }
</style>
