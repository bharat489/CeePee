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
  Development panel: branches, pull requests, commits and deployments
  linked to this issue. Fed by the GitHub, GitLab and Bitbucket webhooks on
  the integrations service; links can also be added by hand. A branch-name
  helper copies "type/KEY-12-slug" so the webhook can match it.
-->
<script lang="ts">
  import { SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type DevLink, type Issue } from '@hcengineering/tracker'

  import tracker from '../../../plugin'

  export let issue: Issue
  export let readonly = false

  const client = getClient()
  const q = createQuery()
  let links: DevLink[] = []
  $: q.query(tracker.class.DevLink, { attachedTo: issue._id }, (r) => { links = r }, { sort: { at: SortingOrder.Descending } })
  $: groups = [
    { kind: 'branch', label: 'Branches', list: links.filter((l) => l.kind === 'branch') },
    { kind: 'pr', label: 'Pull requests', list: links.filter((l) => l.kind === 'pr') },
    { kind: 'commit', label: 'Commits', list: links.filter((l) => l.kind === 'commit') },
    { kind: 'deploy', label: 'Deployments', list: links.filter((l) => l.kind === 'deploy') }
  ].filter((g) => g.list.length > 0)
  $: branchName = `feature/${issue.identifier}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`
  let copied = false
  async function copyBranch (): Promise<void> {
    try {
      await navigator.clipboard.writeText(branchName)
      copied = true
      setTimeout(() => { copied = false }, 1500)
    } catch {}
  }
  let adding = false
  let url = ''
  function guessKind (u: string): DevLink['kind'] {
    if (/\/pull\/|\/merge_requests\/|\/pull-requests\//.test(u)) return 'pr'
    if (/\/commit\/|\/commits\//.test(u)) return 'commit'
    if (/\/tree\/|\/branch\/|\/-\/tree\//.test(u)) return 'branch'
    return 'branch'
  }
  function providerOf (u: string): string {
    return /github\.com/.test(u) ? 'github' : /gitlab/.test(u) ? 'gitlab' : /bitbucket/.test(u) ? 'bitbucket' : 'other'
  }
  async function add (): Promise<void> {
    const u = url.trim()
    if (!/^https?:\/\//.test(u)) return
    const kind = guessKind(u)
    const title = u.replace(/^https?:\/\/[^/]+\//, '').slice(0, 80)
    await client.addCollection(tracker.class.DevLink, issue.space, issue._id, issue._class, 'devLinks', { kind, provider: providerOf(u), title, url: u, at: Date.now(), state: kind === 'pr' ? 'open' : undefined })
    url = ''
    adding = false
  }
  async function remove (l: DevLink): Promise<void> {
    await client.remove(l)
  }
  const stateClass = (s: string | undefined): string => (s === undefined ? '' : ['merged', 'success', 'deployed'].includes(s) ? 'ok' : ['closed', 'failed', 'failure', 'error'].includes(s) ? 'bad' : ['draft'].includes(s) ? 'dim' : 'open')
  const fmt = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<div class="dev">
  <div class="dev__head"><span class="dev__label">Development</span>{#if !readonly}<button class="lnk" title={branchName} on:click={() => { void copyBranch() }}>{copied ? 'copied' : 'copy branch name'}</button><button class="lnk" on:click={() => { adding = !adding }}>{adding ? 'cancel' : 'link URL'}</button>{/if}</div>
  {#if adding}
    <div class="add"><input class="input" placeholder="https://github.com/org/repo/pull/12" bind:value={url} on:keydown={(e) => { if (e.key === 'Enter') void add() }} /><button class="lnk" on:click={() => { void add() }}>add</button></div>
  {/if}
  {#each groups as g (g.kind)}
    <span class="grp">{g.label} · {g.list.length}</span>
    {#each g.list as l (l._id)}
      <div class="item">
        <a class="item__t" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>{l.title}</a>
        {#if l.state}<span class="st st--{stateClass(l.state)}">{l.state}</span>{/if}
        <span class="muted">{l.environment ? `${l.environment} · ` : ''}{l.repo ? `${l.repo} · ` : ''}{l.author ? `${l.author} · ` : ''}{fmt(l.at)}</span>
        {#if !readonly}<button class="x" title="Unlink" on:click={() => { void remove(l) }}>×</button>{/if}
      </div>
    {/each}
  {/each}
  {#if links.length === 0}<span class="muted">No branches, pull requests or deployments yet. Name a branch with {issue.identifier} in it and the webhook links it here.</span>{/if}
</div>

<style lang="scss">
  .dev { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .dev__head { display: flex; align-items: center; gap: 0.6rem; }
  .dev__label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .grp { margin-top: 0.2rem; font-size: 0.7rem; color: var(--theme-trans-color); }
  .item { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
  .item__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-button-default); &:hover { text-decoration: underline; } }
  .st { padding: 0.02rem 0.4rem; border-radius: 999px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--ok { background: var(--accent-brand); color: #1a2400; } &--bad { background: var(--negative-button-default); color: #fff; } &--dim { opacity: 0.6; } &--open { background: color-mix(in srgb, var(--primary-button-default) 25%, transparent); } }
  .muted { font-size: 0.7rem; color: var(--theme-trans-color); white-space: nowrap; }
  .x { border: none; background: transparent; color: var(--theme-trans-color); font: inherit; cursor: pointer; &:hover { color: var(--negative-button-default); } }
  .add { display: flex; gap: 0.4rem; align-items: center; }
  .input { flex: 1; padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.375rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.75rem; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.7rem; cursor: pointer; &:hover { text-decoration: underline; } }
</style>
