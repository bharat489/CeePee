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
  Live participants (avatars, names, count), how long the call has been going,
  and one button to join or leave without leaving the conversation. Hidden
  when nobody is in the call or calls are not configured.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { Avatar, getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import { type Class, type Doc, type Ref } from '@hcengineering/core'
  import love, { type ParticipantInfo, type Room } from '@hcengineering/love'
  import { createQuery } from '@hcengineering/presentation'
  import { onDestroy } from 'svelte'

  import { huddleElapsed, huddleRoomName, huddlesEnabled, joinHuddle, leaveHuddle } from '../huddle'
  import { getChannelName } from '../utils'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let object: Doc | undefined = undefined

  const enabled = huddlesEnabled()
  const me = getCurrentEmployee()
  const roomQ = createQuery()
  const partQ = createQuery()

  let title: string | undefined
  let room: Room | undefined
  let people: ParticipantInfo[] = []
  $: void getChannelName(_id, _class, object).then((r) => { title = r })
  $: if (enabled && title !== undefined) {
    roomQ.query(love.class.Room, { name: huddleRoomName(title) }, (r) => { room = r[0] })
  }
  $: if (room !== undefined) {
    partQ.query(love.class.ParticipantInfo, { room: room._id }, (r) => { people = r })
  } else {
    partQ.unsubscribe()
    people = []
  }
  $: persons = getPersonByPersonRefStore(people.map((p) => p.person))
  $: inCall = people.some((p) => p.person === me)
  $: since = people.reduce((m, p) => Math.min(m, p.modifiedOn), Date.now())
  $: names = people.slice(0, 3).map((p) => p.name.split(' ')[0]).join(', ') + (people.length > 3 ? ` and ${people.length - 3} more` : '')

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
      else await joinHuddle(title)
    } finally {
      busy = false
    }
  }
</script>

{#if enabled && people.length > 0}
  <div class="huddle" class:huddle--in={inCall} role="status">
    <span class="huddle__dot" aria-hidden="true" />
    <div class="huddle__text">
      <span class="huddle__title">{inCall ? 'You are in this huddle' : 'Huddle in progress'}</span>
      <span class="huddle__meta">{people.length} {people.length === 1 ? 'person' : 'people'} · {huddleElapsed(since, now)} · {names}</span>
    </div>
    <div class="huddle__faces" aria-hidden="true">
      {#each people.slice(0, 6) as p (p._id)}
        <span class="huddle__face" title={p.name}><Avatar person={$persons.get(p.person)} name={p.name} size={'x-small'} variant={'circle'} /></span>
      {/each}
      {#if people.length > 6}<span class="huddle__more">+{people.length - 6}</span>{/if}
    </div>
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
{/if}

<style lang="scss">
  .huddle {
    display: flex; align-items: center; gap: 0.75rem; margin: 0.5rem 1rem 0; padding: 0.5rem 0.75rem 0.5rem 0.9rem;
    border-radius: 0.75rem; color: #e2e8f0;
    background: linear-gradient(90deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    animation: huddle-in var(--motion-base, 0.2s) var(--ease-standard, ease) both;
    &--in { background: linear-gradient(90deg, #052e16 0%, #064e3b 60%, #0f766e 100%); }
  }
  @keyframes huddle-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .huddle__dot { position: relative; flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); animation: huddle-pulse 1.6s ease-out infinite; }
  @keyframes huddle-pulse { 0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); } 100% { box-shadow: 0 0 0 0.6rem rgba(34, 197, 94, 0); } }
  .huddle__text { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
  .huddle__title { font-size: 0.8125rem; font-weight: 700; color: #fff; }
  .huddle__meta { font-size: 0.75rem; color: rgba(226, 232, 240, 0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .huddle__faces { display: flex; align-items: center; flex: none; }
  .huddle__face { display: inline-flex; margin-left: -0.35rem; border: 2px solid #1e1b4b; border-radius: 50%; &:first-child { margin-left: 0; } }
  .huddle--in .huddle__face { border-color: #064e3b; }
  .huddle__more { margin-left: 0.35rem; font-size: 0.72rem; font-weight: 600; color: rgba(226, 232, 240, 0.8); }
  .huddle__btn {
    display: inline-flex; align-items: center; gap: 0.35rem; flex: none; height: 1.9rem; padding: 0 0.8rem; border: none; border-radius: 999px;
    background: #22c55e; color: #052e16; font: inherit; font-size: 0.8125rem; font-weight: 700; cursor: pointer;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); transition: transform var(--motion-fast, 0.12s) var(--ease-standard, ease), box-shadow var(--motion-fast, 0.12s) var(--ease-standard, ease);
    &:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(34, 197, 94, 0.45); }
    &:disabled { opacity: 0.6; cursor: default; }
    &--leave { background: #f43f5e; color: #fff; &:hover { box-shadow: 0 4px 14px rgba(244, 63, 94, 0.45); } }
  }
  @media (max-width: 40rem) { .huddle__faces { display: none; } .huddle { margin: 0.4rem 0.5rem 0; } }
</style>
