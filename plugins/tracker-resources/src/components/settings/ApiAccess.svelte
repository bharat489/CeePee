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
  Settings → API access. Your personal API token for this workspace (the
  same token your browser session uses, scoped to your account and role),
  the REST endpoints with copy-paste examples, and the integrations service
  endpoints. Tokens are signed JWTs: rotate the server secret to revoke all.
-->
<script lang="ts">
  import { getMetadata } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const token = getMetadata(presentation.metadata.Token) ?? ''
  const workspace = getMetadata(presentation.metadata.WorkspaceUuid) ?? ''
  const endpoint = (getMetadata(presentation.metadata.Endpoint) ?? '').replace(/^ws/, 'http').replace(/\/$/, '')
  const front = typeof window !== 'undefined' ? window.location.origin : ''
  const integrations = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8095` : ''
  let reveal = false
  let copied = ''
  async function copy (what: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copied = what
      setTimeout(() => { copied = '' }, 1500)
    } catch {}
  }
  const mask = (t: string): string => (t.length > 12 ? `${t.slice(0, 6)}…${t.slice(-4)}` : '••••')
  $: examples = [
    { title: 'Find issues', code: `curl -H "Authorization: Bearer $TOKEN" \\\n  "${endpoint}/api/v1/find-all/${workspace}?class=tracker:class:Issue&query=${encodeURIComponent('{"status":{"$ne":null}}')}&options=${encodeURIComponent('{"limit":20,"sort":{"modifiedOn":-1}}')}"` },
    { title: 'Find one project by key', code: `curl -H "Authorization: Bearer $TOKEN" \\\n  "${endpoint}/api/v1/find-all/${workspace}?class=tracker:class:Project&query=${encodeURIComponent('{"identifier":"CEE"}')}&options=${encodeURIComponent('{"limit":1}')}"` },
    { title: 'Update an issue (transaction)', code: `curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\\n  "${endpoint}/api/v1/tx/${workspace}" \\\n  -d '{"_class":"core:class:TxUpdateDoc","objectClass":"tracker:class:Issue","objectSpace":"<projectId>","objectId":"<issueId>","operations":{"priority":1},"space":"core:space:Tx","modifiedBy":"","modifiedOn":0,"_id":"<newId>"}'` },
    { title: 'Full-text search', code: `curl -H "Authorization: Bearer $TOKEN" \\\n  "${endpoint}/api/v1/search-fulltext/${workspace}?query=${encodeURIComponent('{"query":"login bug"}')}&options=${encodeURIComponent('{"limit":10}')}"` },
    { title: 'Load the model (classes and attributes)', code: `curl -H "Authorization: Bearer $TOKEN" "${endpoint}/api/v1/load-model/${workspace}"` },
    { title: 'Create an issue through the integrations service', code: `curl -X POST -H "Authorization: Bearer $INBOUND_TOKEN" -H "Content-Type: application/json" \\\n  "${integrations}/inbound/generic?project=CEE" \\\n  -d '{"title":"Payment page times out","description":"Steps…","priority":"high"}'` }
  ]
</script>

<div class="hulyComponent">
  <div class="api">
    <header class="api__head">
      <span class="api__title"><Label label={tracker.string.ApiAccess} /></span>
      <span class="api__sub">Everything the app does over WebSocket is also reachable over REST with the same token. Node and browser clients: the <code>@hcengineering/api-client</code> package (<code>connect</code> for WebSocket, <code>connectRest</code> for HTTP).</span>
    </header>

    <section class="card">
      <span class="card__title">Your API token</span>
      <p class="hint">Scoped to your account and workspace role, so anything it does shows up as you. Treat it like a password.</p>
      <div class="row">
        <code class="tok">{reveal ? token : mask(token)}</code>
        <button class="lnk" on:click={() => { reveal = !reveal }}>{reveal ? 'hide' : 'reveal'}</button>
        <button class="lnk" on:click={() => { void copy('token', token) }}>{copied === 'token' ? 'copied' : 'copy'}</button>
      </div>
      <div class="kv"><span>REST base</span><code>{endpoint}/api/v1/…/{workspace}</code><button class="lnk" on:click={() => { void copy('base', `${endpoint}/api/v1`) }}>{copied === 'base' ? 'copied' : 'copy'}</button></div>
      <div class="kv"><span>Workspace id</span><code>{workspace}</code><button class="lnk" on:click={() => { void copy('ws', workspace) }}>{copied === 'ws' ? 'copied' : 'copy'}</button></div>
      <div class="kv"><span>App URL</span><code>{front}</code></div>
      <div class="kv"><span>Integrations</span><code>{integrations}</code></div>
      <p class="hint">Revocation: tokens are signed with the server secret; changing <code>SERVER_SECRET</code> and restarting invalidates every token at once. Inbound automation tokens are per rule and can be regenerated in the rule builder.</p>
    </section>

    <section class="card">
      <span class="card__title">Endpoints</span>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Method</th><th>Path</th><th>What</th></tr></thead>
        <tbody>
          <tr><td>GET</td><td><code>/api/v1/find-all/{'{ws}'}?class=&amp;query=&amp;options=</code></td><td>Query any class; <code>query</code> and <code>options</code> are JSON (Mongo-style operators, <code>lookup</code>, <code>sort</code>, <code>limit</code>).</td></tr>
          <tr><td>POST</td><td><code>/api/v1/tx/{'{ws}'}</code></td><td>Apply a transaction: TxCreateDoc, TxUpdateDoc, TxRemoveDoc, TxMixin. The body is the transaction document.</td></tr>
          <tr><td>GET</td><td><code>/api/v1/search-fulltext/{'{ws}'}?query=&amp;options=</code></td><td>Full-text search across indexed documents.</td></tr>
          <tr><td>GET</td><td><code>/api/v1/load-model/{'{ws}'}</code></td><td>Classes, attributes, mixins: the schema.</td></tr>
          <tr><td>GET</td><td><code>/api/v1/account/{'{ws}'}</code></td><td>The calling account.</td></tr>
          <tr><td>POST</td><td><code>/api/v1/ensure-person/{'{ws}'}</code></td><td>Find or create a person for an external identity.</td></tr>
          <tr><td>POST</td><td><code>{integrations}/inbound/{'{generic|email|sentry|github|gitlab|bitbucket|deploy}'}</code></td><td>Create or update issues from outside systems; bearer <code>INBOUND_TOKEN</code>.</td></tr>
          <tr><td>POST</td><td><code>{integrations}/inbound/rule/{'{ruleId}'}?token=</code></td><td>Fire an automation rule with a JSON payload.</td></tr>
          <tr><td>POST</td><td><code>{integrations}/inbound/jira-import</code></td><td>Start a Jira Cloud import job; <code>GET …/{'{jobId}'}</code> for progress.</td></tr>
          <tr><td>GET</td><td><code>{integrations}/portal/…</code></td><td>Public help centre (no auth).</td></tr>
          <tr><td>*</td><td><code>{integrations}/scim/v2/…</code></td><td>SCIM 2.0 user provisioning; bearer <code>SCIM_TOKEN</code>.</td></tr>
        </tbody>
      </table></div>
      <p class="hint">Class ids look like <code>tracker:class:Issue</code>, <code>tracker:class:Project</code>, <code>contact:class:Person</code>. Issue fields: <code>title, status, priority (0 none, 1 urgent … 4 low), assignee, space (project), identifier, dueDate, estimation, labels</code> (via <code>tags:class:TagReference</code>).</p>
    </section>

    <section class="card">
      <span class="card__title">Examples</span>
      <p class="hint">Set <code>TOKEN</code> to the token above.</p>
      {#each examples as e}
        <div class="ex"><div class="ex__head"><b>{e.title}</b><button class="lnk" on:click={() => { void copy(e.title, e.code) }}>{copied === e.title ? 'copied' : 'copy'}</button></div><pre class="code">{e.code}</pre></div>
      {/each}
    </section>
  </div>
</div>

<style lang="scss">
  .api { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem 2rem; max-width: 62rem; overflow: auto; }
  .api__head { display: flex; flex-direction: column; gap: 0.2rem; }
  .api__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .api__sub, .hint { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); line-height: 1.5; }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .tok { padding: 0.3rem 0.6rem; border-radius: 0.4rem; background: var(--theme-button-pressed); color: var(--theme-caption-color); font-size: 0.75rem; word-break: break-all; }
  .kv { display: grid; grid-template-columns: 8rem 1fr auto; align-items: center; gap: 0.6rem; font-size: 0.8125rem; color: var(--theme-content-color); code { font-size: 0.75rem; color: var(--theme-caption-color); word-break: break-all; } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } }
  .table-wrap { overflow-x: auto; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; th, td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); text-align: left; vertical-align: top; color: var(--theme-content-color); } th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); } code { font-size: 0.75rem; } }
  .ex { display: flex; flex-direction: column; gap: 0.2rem; }
  .ex__head { display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; b { color: var(--theme-caption-color); } }
  .code { margin: 0; padding: 0.6rem 0.8rem; border-radius: 0.5rem; background: var(--theme-button-pressed); color: var(--theme-caption-color); font-size: 0.75rem; white-space: pre-wrap; word-break: break-all; }
</style>
