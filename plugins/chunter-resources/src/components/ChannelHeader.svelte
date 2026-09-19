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
  import { getClient } from '@hcengineering/presentation'
  import { Channel } from '@hcengineering/chunter'
  import { ActivityMessagesFilter, WithReferences } from '@hcengineering/activity'
  import contact from '@hcengineering/contact'
  import view from '@hcengineering/view'
  import Header from './Header.svelte'
  import chunter from '../plugin'
  import { getObjectIcon, getChannelName } from '../utils'
  import core, { getCurrentAccount, AccountRole } from '@hcengineering/core'
  import { getMetadata, getResource } from '@hcengineering/platform'
  import love, { RoomAccess, RoomType, type Room } from '@hcengineering/love'

  // calls need a media server; without LIVEKIT_WS the button stays hidden
  const callsEnabled = (getMetadata(love.metadata.WebSocketURL) ?? '') !== '' && getCurrentAccount().role !== AccountRole.ReadOnlyGuest
  let calling = false
  async function startCall (): Promise<void> {
    if (object === undefined || calling) return
    calling = true
    try {
      const roomName = `Call · ${title}`
      let room: Room | undefined = await client.findOne(love.class.Room, { name: roomName })
      if (room === undefined) {
        // place the new room below everything else on the main floor
        const rooms = await client.findAll(love.class.Room, { floor: love.ids.MainFloor })
        const y = rooms.reduce((m, r) => Math.max(m, r.y + r.height), 0)
        const id = await client.createDoc(love.class.Room, core.space.Workspace, {
          name: roomName,
          type: RoomType.Video,
          access: RoomAccess.Open,
          floor: love.ids.MainFloor,
          width: 3,
          height: 2,
          x: 0,
          y,
          language: 'en',
          startWithTranscription: false,
          startWithRecording: false,
          description: null
        })
        room = await client.findOne(love.class.Room, { _id: id })
      }
      if (room === undefined) return
      const join = await getResource(love.function.JoinRoomCall)
      await join(room)
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
      <button class="call-btn" class:call-btn--busy={calling} title="Start a call in this channel" on:click={() => { void startCall() }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 6.5l4-2v7l-4-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <span class="call-btn__l">Call</span>
      </button>
    {/if}
  </svelte:fragment>
</Header>

<style lang="scss">
  .call-btn { display: inline-flex; align-items: center; gap: 0.35rem; height: 2rem; padding: 0 0.7rem; border: none; border-radius: 0.5rem; background: var(--accent-gradient, var(--primary-button-default)); color: #fff; font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; box-shadow: var(--accent-glow, none); transition: transform var(--motion-fast, 0.12s) var(--ease-standard, ease); &:hover { transform: translateY(-1px); } &--busy { opacity: 0.6; pointer-events: none; } }
  .call-btn__l { @media (max-width: 40rem) { display: none; } }
</style>
