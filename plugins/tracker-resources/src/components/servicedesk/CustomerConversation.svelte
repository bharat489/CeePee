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
  The customer-visible side of a request. Ordinary comments stay internal;
  only what is written here (and what the customer writes in the portal)
  shows on the portal's status page. Shown for requests raised through the
  service desk or portal.
-->
<script lang="ts">
  import { formatName, getCurrentEmployee } from '@hcengineering/contact'
  import contact from '@hcengineering/contact'
  import { SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type CustomerReply, type Issue } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let issue: Issue
  export let readonly = false

  const client = getClient()
  const q = createQuery()
  let replies: CustomerReply[] = []
  $: q.query(tracker.class.CustomerReply, { attachedTo: issue._id }, (r) => { replies = r }, { sort: { at: SortingOrder.Ascending } })
  let text = ''
  let myName = ''
  void client.findOne(contact.class.Person, { _id: getCurrentEmployee() }).then((p) => { myName = p !== undefined ? formatName(p.name) : '' })
  async function send (): Promise<void> {
    if (text.trim() === '') return
    await client.addCollection(tracker.class.CustomerReply, issue.space, issue._id, issue._class, 'customerReplies', { text: text.trim(), fromCustomer: false, author: myName, at: Date.now() })
    text = ''
  }
  const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<div class="cc">
  {#if issue.portalEmail}<span class="muted">Customer: {issue.portalEmail}</span>{/if}
  {#each replies as r (r._id)}
    <div class="msg" class:msg--customer={r.fromCustomer}><span class="msg__head">{r.fromCustomer ? `${r.author || 'Customer'}` : r.author || 'Team'} · {fmt(r.at)}</span><span class="msg__text">{r.text}</span></div>
  {/each}
  {#if replies.length === 0}<span class="muted">Nothing sent to the customer yet. Internal comments are never shown to them.</span>{/if}
  {#if !readonly}
    <textarea class="input" rows="2" placeholder="Reply to the customer (visible in the portal)…" bind:value={text} />
    <div class="tools"><Button kind={'primary'} label={tracker.string.Send} disabled={text.trim() === ''} on:click={() => { void send() }} /></div>
  {/if}
</div>

<style lang="scss">
  .cc { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { font-size: 0.75rem; color: var(--theme-trans-color); }
  .msg { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.4rem 0.6rem; border-radius: 0.5rem; background: var(--theme-button-pressed); &--customer { background: var(--accent-brand-soft); } }
  .msg__head { font-size: 0.7rem; color: var(--theme-dark-color); }
  .msg__text { white-space: pre-wrap; color: var(--theme-caption-color); }
  .input { padding: 0.4rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; resize: vertical; }
  .tools { display: flex; justify-content: flex-end; }
</style>
