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
<!-- Forward a message (text and attachments) to another channel or direct message. -->
<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import chunter, { type ChatMessage, type Channel, type DirectMessage } from '@hcengineering/chunter'
  import { getCurrentAccount, type Ref, type Space } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { ObjectPresenter } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  import chunterRes from '../plugin'

  export let message: ChatMessage

  const client = getClient()
  const dispatch = createEventDispatcher()
  const me = getCurrentAccount().uuid
  const cq = createQuery()
  const dq = createQuery()
  let channels: Channel[] = []
  let dms: DirectMessage[] = []
  cq.query(chunter.class.Channel, { archived: false }, (r) => { channels = r.filter((c) => !c.private || c.members.includes(me)) })
  dq.query(chunter.class.DirectMessage, { members: me }, (r) => { dms = r })
  let search = ''
  let busy: Ref<Space> | undefined
  let done: Ref<Space> | undefined
  $: targets = ([...channels, ...dms] as Space[]).filter((s) => s._id !== message.attachedTo)
  $: shown = search.trim() === '' ? targets : targets.filter((s) => (s.name ?? '').toLowerCase().includes(search.trim().toLowerCase()))

  async function forward (target: Space): Promise<void> {
    busy = target._id
    try {
      const att: Attachment[] = await client.findAll(attachment.class.Attachment, { attachedTo: message._id })
      const html = `<p><em>↪ Forwarded</em></p>${message.message}`
      const id = await client.addCollection(chunter.class.ChatMessage, target._id, target._id, target._class, 'messages', { message: html, attachments: att.length })
      for (const a of att) {
        await client.addCollection(attachment.class.Attachment, target._id, id, chunter.class.ChatMessage, 'attachments', { name: a.name, file: a.file, type: a.type, size: a.size, lastModified: a.lastModified, metadata: a.metadata })
      }
      done = target._id
      setTimeout(() => { dispatch('close') }, 500)
    } finally {
      busy = undefined
    }
  }
</script>

<div class="fw">
  <span class="fw__title"><Label label={chunterRes.string.ForwardTo} /></span>
  <input class="fw__search" placeholder="Search channels and people" bind:value={search} />
  <div class="fw__list">
    {#each shown as s (s._id)}
      <button class="fw__row" disabled={busy !== undefined} on:click={() => { void forward(s) }}>
        <span class="fw__name"><ObjectPresenter value={s} /></span>
        <span class="fw__act">{done === s._id ? 'sent ✓' : busy === s._id ? '…' : 'send'}</span>
      </button>
    {/each}
    {#if shown.length === 0}<span class="fw__empty">Nothing matches.</span>{/if}
  </div>
</div>

<style lang="scss">
  .fw { display: flex; flex-direction: column; gap: 0.5rem; width: min(24rem, 92vw); padding: 0.9rem 1rem; border-radius: 1rem; background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); }
  .fw__title { font-weight: 700; color: var(--theme-caption-color); }
  .fw__search { padding: 0.45rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .fw__list { display: flex; flex-direction: column; gap: 0.15rem; max-height: 18rem; overflow: auto; }
  .fw__row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0.5rem; border: none; border-radius: 0.6rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &:disabled { opacity: 0.7; cursor: default; } }
  .fw__name { min-width: 0; overflow: hidden; }
  .fw__act { flex-shrink: 0; padding: 0.15rem 0.6rem; border-radius: 999px; background: var(--accent-brand-soft); color: var(--theme-caption-color); font-size: 0.7rem; font-weight: 600; }
  .fw__empty { font-size: 0.8125rem; color: var(--theme-trans-color); }
</style>
