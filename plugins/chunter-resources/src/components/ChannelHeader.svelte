<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
<script lang="ts">
  import { Class, Doc, Ref } from '@hcengineering/core'
  import { getDocTitle } from '@hcengineering/view-resources'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Channel } from '@hcengineering/chunter'
  import { ActivityMessagesFilter, WithReferences } from '@hcengineering/activity'
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import view from '@hcengineering/view'
  import Header from './Header.svelte'
  import chunter from '../plugin'
  import { getObjectIcon, getChannelName } from '../utils'
  import love, { type ParticipantInfo, type Room } from '@hcengineering/love'
  import { historyFor, huddleRoomName, huddlesEnabled, joinHuddle, leaveHuddle } from '../huddle'

  // huddles: one call room per chat; the button reflects who is in it
  const callsEnabled = huddlesEnabled()
  const me = getCurrentEmployee()
  const roomQ = createQuery()
  const partQ = createQuery()
  let room: Room | undefined
  let participants: ParticipantInfo[] = []
  let calling = false
  // the room linked to this chat; older rooms are found by their name
  const nameQ = createQuery()
  $: if (callsEnabled && title !== undefined && object !== undefined) {
    const name = huddleRoomName(title)
    roomQ.query(love.class.Room, { chat: object._id }, (r) => {
      if (r.length > 0) {
        nameQ.unsubscribe()
        room = r[0]
      } else {
        nameQ.query(love.class.Room, { name }, (byName) => { room = byName[0] })
      }
    })
  }
  $: if (room !== undefined) {
    partQ.query(love.class.ParticipantInfo, { room: room._id }, (r) => { participants = r })
  } else {
    partQ.unsubscribe()
    participants = []
  }
  $: inCall = participants.some((p) => p.person === me)
  async function startCall (): Promise<void> {
    if (title === undefined || calling) return
    calling = true
    try {
      if (inCall) await leaveHuddle()
      else await joinHuddle(title, object?._id, object?._class)
    } finally {
      calling = false
    }
  }
  import PinnedMessages from './PinnedMessages.svelte'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let object: WithReferences<Doc> | undefined
  export let allowClose: boolean = false
  export let canOpen: boolean = false
  export let withAside: boolean = false
  export let withSearch: boolean = true
  export let withPresence: boolean = true
  export let isAsideShown: boolean = false
  export let filters: Ref<ActivityMessagesFilter>[] = []
  export let canOpenInSidebar: boolean = false
  export let closeOnEscape: boolean = true

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let title: string | undefined = undefined
  let description: string | undefined = undefined
  let realWidth: number

  $: void updateDescription(_id, _class, object)

  $: void getChannelName(_id, _class, object).then((res) => {
    title = res
  })

  async function updateDescription (_id: Ref<Doc>, _class: Ref<Class<Doc>>, object?: Doc): Promise<void> {
    if (hierarchy.isDerived(_class, chunter.class.DirectMessage) || hierarchy.isDerived(_class, contact.class.Person)) {
      description = undefined
    } else if (hierarchy.isDerived(_class, chunter.class.Channel)) {
      description = (object as Channel)?.topic
    } else {
      const hasId = hierarchy.classHierarchyMixin(_class, view.mixin.ObjectIdentifier) !== undefined
      description = hasId ? await getDocTitle(client, _id, _class, object) : undefined
    }
  }

  $: isPerson =
    hierarchy.isDerived(_class, chunter.class.DirectMessage) || hierarchy.isDerived(_class, contact.class.Person)
</script>

<Header
  bind:filters
  {object}
  icon={getObjectIcon(_class)}
  iconProps={{ value: object, showStatus: true }}
  label={title}
  intlLabel={chunter.string.Channel}
  {description}
  titleKind={isPerson ? 'default' : 'breadcrumbs'}
  withFilters={false}
  {allowClose}
  {canOpen}
  {withAside}
  {isAsideShown}
  {withSearch}
  {withPresence}
  {canOpenInSidebar}
  {closeOnEscape}
  bind:realWidth
  on:aside-toggled
  on:close
>
  {#if object}
    <PinnedMessages
      {_id}
      {_class}
      space={object.space}
      withRefs={(object.references ?? 0) > 0}
      iconOnly={realWidth < 380}
      on:select
    />
  {/if}
  <svelte:fragment slot="actions">
    {#if callsEnabled && object !== undefined}
      <button class="call-btn" class:call-btn--busy={calling} class:call-btn--live={!inCall && participants.length > 0} class:call-btn--leave={inCall} title={inCall ? 'Leave the huddle' : participants.length > 0 ? `Join the huddle (${participants.length} in the call)` : 'Start a huddle in this chat'} on:click={() => { void startCall() }}>
        {#if inCall}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5C5.5 2.5 10.5 2.5 14 5.5l-2 2.5c-2.4-1.6-5.6-1.6-8 0z" fill="currentColor"/></svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 6.5l4-2v7l-4-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        {/if}
        <span class="call-btn__l">{inCall ? 'Leave' : participants.length > 0 ? `Join · ${participants.length}` : 'Huddle'}</span>
      </button>
      <button class="call-btn call-btn--ghost" class:call-btn--on={$historyFor === object._id} title="Past calls in this chat" on:click={() => { historyFor.set($historyFor === object?._id ? undefined : object?._id) }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    {/if}
  </svelte:fragment>
</Header>

<style lang="scss">
  .call-btn--ghost { background: transparent !important; color: var(--theme-dark-color) !important; box-shadow: none !important; padding: 0 0.4rem !important; }
  .call-btn--ghost.call-btn--on { color: var(--accent-brand) !important; }
  .call-btn { display: inline-flex; align-items: center; gap: 0.35rem; height: 2rem; padding: 0 0.7rem; border: none; border-radius: 0.5rem; background: var(--accent-gradient, var(--primary-button-default)); color: #fff; font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; box-shadow: var(--accent-glow, none); transition: transform var(--motion-fast, 0.12s) var(--ease-standard, ease); &:hover { transform: translateY(-1px); } &--busy { opacity: 0.6; pointer-events: none; } }
  .call-btn--live { background: #16a34a; animation: call-live 1.6s ease-in-out infinite; }
  .call-btn--leave { background: #e11d48; }
  @keyframes call-live { 0%, 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.45); } 50% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); } }
  .call-btn__l { @media (max-width: 40rem) { display: none; } }
</style>
