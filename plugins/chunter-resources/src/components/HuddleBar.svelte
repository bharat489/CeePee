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
  Huddle bar: shown under a chat's header while someone is in the chat's call.
  Who is in it (with mute, camera, screen-share and speaking marks), how long
  it has been going, one button to join or leave without leaving the chat, and
  the chat's call history on demand. Stacks on phones.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { Avatar, getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import { SortingOrder, type Class, type Doc, type Ref } from '@hcengineering/core'
  import love, { MeetingStatus, type MeetingMinutes, type ParticipantInfo, type Room } from '@hcengineering/love'
  import { getResource } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import { deviceOptionsStore as deviceInfo } from '@hcengineering/ui'
  import { onDestroy } from 'svelte'
  import { readable, type Readable } from 'svelte/store'

  import { historyFor, huddleElapsed, huddleRoomName, huddlesEnabled, joinHuddle, leaveHuddle } from '../huddle'
  import { getChannelName } from '../utils'
  import HuddleHistory from './HuddleHistory.svelte'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let object: Doc | undefined = undefined

  const enabled = huddlesEnabled()
  const me = getCurrentEmployee()
  const roomQ = createQuery()
  const nameQ = createQuery()
  const partQ = createQuery()
  const minQ = createQuery()

  let title: string | undefined
  let room: Room | undefined
  let people: ParticipantInfo[] = []
  let minutes: MeetingMinutes | undefined
  $: void getChannelName(_id, _class, object).then((r) => { title = r })
  // the room linked to this chat; older rooms are found by their name
  $: if (enabled && title !== undefined) {
    const name = huddleRoomName(title)
    roomQ.query(love.class.Room, { chat: _id }, (r) => {
      if (r.length > 0) {
        nameQ.unsubscribe()
        room = r[0]
      } else {
        nameQ.query(love.class.Room, { name }, (byName) => { room = byName[0] })
      }
    })
  }
  $: if (room !== undefined) {
    partQ.query(love.class.ParticipantInfo, { room: room._id }, (r) => { people = r })
    minQ.query(love.class.MeetingMinutes, { attachedTo: room._id, status: MeetingStatus.Active }, (r) => { minutes = r[0] }, { sort: { createdOn: SortingOrder.Descending }, limit: 1 })
  } else {
    partQ.unsubscribe()
    minQ.unsubscribe()
    people = []
    minutes = undefined
  }
  $: persons = getPersonByPersonRefStore(people.map((p) => p.person))
  $: inCall = people.some((p) => p.person === me)
  $: since = minutes?.createdOn ?? people.reduce((m, p) => Math.min(m, p.createdOn ?? p.modifiedOn), Date.now())
  $: names = people.slice(0, 3).map((p) => p.name.split(' ')[0]).join(', ') + (people.length > 3 ? ` and ${people.length - 3} more` : '')
  $: sharing = people.find((p) => p.screen === true)

  // who LiveKit hears right now: only meaningful while we are connected to this call
  let speakers: Readable<Set<string>> = readable(new Set<string>())
  void getResource(love.function.HuddleSpeakers).then((fn) => { speakers = fn() as Readable<Set<string>> }).catch(() => {})

  // a one-second clock for the elapsed time, only while the bar is visible
  let now = Date.now()
  const clock = setInterval(() => { now = Date.now() }, 1000)
  onDestroy(() => { clearInterval(clock) })

  let busy = false
  async function act (): Promise<void> {
    if (busy || title === undefined) return
    busy = true
    try {
      if (inCall) await leaveHuddle()
      else await joinHuddle(title, _id, _class)
    } finally {
      busy = false
    }
  }
  $: mobile = $deviceInfo.isMobile
  $: showHistory = $historyFor === _id
</script>

{#if enabled && people.length > 0}
  <div class="huddle" class:huddle--in={inCall} class:huddle--mobile={mobile} role="status">
    <div class="huddle__row">
      <span class="huddle__dot" aria-hidden="true" />
      <div class="huddle__text">
        <span class="huddle__title">{inCall ? 'You are in this huddle' : 'Huddle in progress'}{#if sharing !== undefined} · <span class="huddle__share">{sharing.name.split(' ')[0]} is sharing a screen</span>{/if}</span>
        <span class="huddle__meta">{people.length} {people.length === 1 ? 'person' : 'people'} · {huddleElapsed(since, now)} · {names}</span>
      </div>
      {#if !mobile}
        <div class="huddle__faces" aria-hidden="true">
          {#each people.slice(0, 8) as p (p._id)}
            <span class="huddle__face" class:huddle__face--speaking={inCall && $speakers.has(p.person)} title="{p.name}{p.mic === false ? ' · muted' : ''}{p.cam === true ? ' · camera on' : ''}{p.screen === true ? ' · sharing' : ''}">
              <Avatar person={$persons.get(p.person)} name={p.name} size={'x-small'} variant={'circle'} />
              {#if p.screen === true}<span class="badge badge--share">⇧</span>{:else if p.mic === false}<span class="badge badge--mute">✕</span>{:else if p.cam === true}<span class="badge badge--cam">●</span>{/if}
            </span>
          {/each}
          {#if people.length > 8}<span class="huddle__more">+{people.length - 8}</span>{/if}
        </div>
      {/if}
      <button class="huddle__btn" class:huddle__btn--leave={inCall} disabled={busy} on:click={() => { void act() }}>
        {#if inCall}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5C5.5 2.5 10.5 2.5 14 5.5l-2 2.5c-2.4-1.6-5.6-1.6-8 0z" fill="currentColor"/></svg>
          <span>Leave</span>
        {:else}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 6.5l4-2v7l-4-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          <span>Join</span>
        {/if}
      </button>
    </div>
    {#if mobile}
      <div class="huddle__people">
        {#each people as p (p._id)}
          <span class="huddle__chip" class:huddle__chip--speaking={inCall && $speakers.has(p.person)}>
            <Avatar person={$persons.get(p.person)} name={p.name} size={'x-small'} variant={'circle'} />
            <span>{p.name.split(' ')[0]}</span>
            {#if p.screen === true}<span class="badge badge--share">⇧</span>{:else if p.mic === false}<span class="badge badge--mute">✕</span>{/if}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/if}
{#if enabled && showHistory}
  {#if room !== undefined}
    <HuddleHistory {room} />
  {:else}
    <div class="huddle__none">No calls in this chat yet.</div>
  {/if}
{/if}

<style lang="scss">
  .huddle {
    display: flex; flex-direction: column; gap: 0.4rem; margin: 0.5rem 1rem 0; padding: 0.5rem 0.75rem 0.5rem 0.9rem;
    border-radius: 0.75rem; color: #e2e8f0;
    background: linear-gradient(90deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    animation: huddle-in var(--motion-base, 0.2s) var(--ease-standard, ease) both;
    &--in { background: linear-gradient(90deg, #052e16 0%, #064e3b 60%, #0f766e 100%); }
    &--mobile { margin: 0.4rem 0.5rem 0; padding: 0.45rem 0.6rem; }
  }
  .huddle__row { display: flex; align-items: center; gap: 0.75rem; }
  @keyframes huddle-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .huddle__dot { position: relative; flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); animation: huddle-pulse 1.6s ease-out infinite; }
  @keyframes huddle-pulse { 0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); } 100% { box-shadow: 0 0 0 0.6rem rgba(34, 197, 94, 0); } }
  .huddle__text { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
  .huddle__title { font-size: 0.8125rem; font-weight: 700; color: #fff; }
  .huddle__share { font-weight: 500; color: #fde68a; }
  .huddle__meta { font-size: 0.75rem; color: rgba(226, 232, 240, 0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .huddle__faces { display: flex; align-items: center; flex: none; }
  .huddle__face { position: relative; display: inline-flex; margin-left: -0.35rem; border: 2px solid #1e1b4b; border-radius: 50%; transition: box-shadow 0.15s; &:first-child { margin-left: 0; } &--speaking { box-shadow: 0 0 0 2px #22c55e, 0 0 10px rgba(34, 197, 94, 0.8); } }
  .huddle--in .huddle__face { border-color: #064e3b; }
  .badge { position: absolute; right: -0.2rem; bottom: -0.2rem; display: inline-flex; align-items: center; justify-content: center; width: 0.85rem; height: 0.85rem; border-radius: 50%; font-size: 0.55rem; font-weight: 800; line-height: 1; border: 1px solid #0f172a; &--mute { background: #f43f5e; color: #fff; } &--cam { background: #38bdf8; color: #0c4a6e; } &--share { background: #fbbf24; color: #78350f; } }
  .huddle__more { margin-left: 0.35rem; font-size: 0.72rem; font-weight: 600; color: rgba(226, 232, 240, 0.8); }
  .huddle__people { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .huddle__chip { position: relative; display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem 0.15rem 0.2rem; border-radius: 999px; background: rgba(255, 255, 255, 0.1); font-size: 0.75rem; &--speaking { box-shadow: 0 0 0 2px #22c55e; } .badge { position: static; } }
  .huddle__btn {
    display: inline-flex; align-items: center; gap: 0.35rem; flex: none; height: 1.9rem; padding: 0 0.8rem; border: none; border-radius: 999px;
    background: #22c55e; color: #052e16; font: inherit; font-size: 0.8125rem; font-weight: 700; cursor: pointer;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); transition: transform var(--motion-fast, 0.12s) var(--ease-standard, ease), box-shadow var(--motion-fast, 0.12s) var(--ease-standard, ease);
    &:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(34, 197, 94, 0.45); }
    &:disabled { opacity: 0.6; cursor: default; }
    &--leave { background: #f43f5e; color: #fff; &:hover { box-shadow: 0 4px 14px rgba(244, 63, 94, 0.45); } }
  }
  .huddle__none { margin: 0.35rem 1rem 0; padding: 0.5rem 0.75rem; border: 1px dashed var(--theme-divider-color); border-radius: 0.75rem; font-size: 0.78rem; color: var(--theme-dark-color); }
</style>
