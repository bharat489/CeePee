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
  Public read-only link for one issue. Anyone with the link sees the title,
  status, priority, assignee, labels and description, nothing else. Stop
  sharing at any time; the link dies immediately.
-->
<script lang="ts">
  import { getIntegrationsUrl } from '@hcengineering/tracker'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let issue: Issue

  const client = getClient()
  const dispatch = createEventDispatcher()
  const q = createQuery()
  let live: Issue | undefined
  $: q.query(tracker.class.Issue, { _id: issue._id }, (r) => { live = r[0] })
  const integrationsUrl = getIntegrationsUrl()
  $: token = live?.shareToken ?? undefined
  $: url = token !== undefined && token !== '' ? `${integrationsUrl}/share/${token}` : ''
  let copied = false

  function makeToken (): string {
    const bytes = new Uint8Array(18)
    crypto.getRandomValues(bytes)
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  async function start (): Promise<void> {
    if (live === undefined) return
    await client.update(live, { shareToken: makeToken() })
  }
  async function stop (): Promise<void> {
    if (live === undefined) return
    await client.update(live, { shareToken: null })
  }
  async function copy (): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      copied = true
      setTimeout(() => { copied = false }, 1500)
    } catch {}
  }
</script>

<div class="sh">
  <span class="sh__title"><Label label={tracker.string.ShareIssue} /></span>
  <span class="muted">{issue.identifier} · {issue.title}</span>
  {#if url !== ''}
    <div class="sh__row"><input class="input" readonly value={url} on:focus={(e) => { e.currentTarget.select() }} /><Button kind={'primary'} label={copied ? tracker.string.Copied : tracker.string.CopyLink} on:click={() => { void copy() }} /></div>
    <p class="muted">Anyone with this link sees the title, status, priority, assignee, labels and description. Comments, attachments and sub-issues stay private. Search engines are told not to index it.</p>
    <div class="sh__row"><Button kind={'ghost'} label={tracker.string.StopSharing} on:click={() => { void stop() }} /><span class="grow" /><Button kind={'ghost'} label={tracker.string.Close} on:click={() => { dispatch('close') }} /></div>
  {:else}
    <p class="muted">Create a read-only link for people without an account: a customer, a contractor, a stakeholder. You can stop sharing later.</p>
    <div class="sh__row"><Button kind={'primary'} label={tracker.string.PublicLink} on:click={() => { void start() }} /><span class="grow" /><Button kind={'ghost'} label={tracker.string.Close} on:click={() => { dispatch('close') }} /></div>
  {/if}
</div>

<style lang="scss">
  .sh { display: flex; flex-direction: column; gap: 0.6rem; width: min(34rem, 92vw); padding: 1rem 1.1rem; border-radius: 0.9rem; background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); }
  .sh__title { font-weight: 700; color: var(--theme-caption-color); }
  .sh__row { display: flex; align-items: center; gap: 0.5rem; }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .input { flex: 1; min-width: 0; padding: 0.4rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
</style>
