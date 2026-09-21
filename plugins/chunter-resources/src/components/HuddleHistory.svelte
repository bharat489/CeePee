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
  Past calls of a chat: when, how long, who. Each row opens the call's
  meeting minutes (transcript, notes, recording).
-->
<script lang="ts">
  import contact, { formatName, type Employee } from '@hcengineering/contact'
  import core, { SortingOrder, type Collaborator, type Ref } from '@hcengineering/core'
  import love, { MeetingStatus, type MeetingMinutes, type Room } from '@hcengineering/love'
  import { createQuery } from '@hcengineering/presentation'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import { huddleElapsed } from '../huddle'

  export let room: Room
  export let limit = 20

  const mq = createQuery()
  const cq = createQuery()
  const eq = createQuery()
  let minutes: MeetingMinutes[] = []
  let collaborators: Collaborator[] = []
  let employees: Employee[] = []
  $: mq.query(
    love.class.MeetingMinutes,
    { attachedTo: room._id, status: MeetingStatus.Finished },
    (r) => { minutes = r },
    { sort: { createdOn: SortingOrder.Descending }, limit }
  )
  $: if (minutes.length > 0) {
    cq.query(core.class.Collaborator, { attachedTo: { $in: minutes.map((m) => m._id) } }, (r) => { collaborators = r })
  }
  eq.query(contact.mixin.Employee, {}, (r) => { employees = r })
  $: byAccount = new Map(employees.filter((e) => e.personUuid !== undefined).map((e) => [e.personUuid as string, e]))
  const peopleOf = (m: MeetingMinutes): string[] =>
    collaborators
      .filter((c) => c.attachedTo === m._id)
      .map((c) => byAccount.get(c.collaborator as string))
      .filter((e): e is Employee => e !== undefined)
      .map((e) => formatName(e.name).split(' ')[0])
  const when = (t: number | undefined): string =>
    t === undefined ? '' : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  function open (m: MeetingMinutes): void {
    showPanel(view.component.EditDoc, m._id as Ref<MeetingMinutes>, love.class.MeetingMinutes, 'content')
  }
</script>

<div class="hh">
  <div class="hh__head"><b>Call history</b><span class="hh__muted">{minutes.length === 0 ? 'no calls yet' : `${minutes.length} call${minutes.length === 1 ? '' : 's'}`}</span></div>
  {#each minutes as m (m._id)}
    {@const who = peopleOf(m)}
    <button class="hh__row" type="button" on:click={() => { open(m) }}>
      <span class="hh__when">{when(m.createdOn)}</span>
      <span class="hh__dur">{m.meetingEnd !== undefined && m.createdOn !== undefined ? huddleElapsed(m.createdOn, m.meetingEnd) : '—'}</span>
      <span class="hh__who">{who.length === 0 ? 'no one recorded' : who.slice(0, 4).join(', ') + (who.length > 4 ? ` +${who.length - 4}` : '')}</span>
      <span class="hh__extra">{#if (m.transcription ?? 0) > 0}transcript{/if}{#if (m.messages ?? 0) > 0} · notes{/if}</span>
    </button>
  {/each}
</div>

<style lang="scss">
  .hh { display: flex; flex-direction: column; gap: 0.1rem; margin: 0.35rem 1rem 0; padding: 0.5rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .hh__head { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; b { font-size: 0.8125rem; color: var(--theme-caption-color); } }
  .hh__muted { font-size: 0.72rem; color: var(--theme-dark-color); }
  .hh__row { display: grid; grid-template-columns: 8rem 4rem 1fr auto; gap: 0.6rem; align-items: center; padding: 0.3rem 0.4rem; border: none; border-radius: 0.4rem; background: transparent; font: inherit; font-size: 0.78rem; color: var(--theme-content-color); text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .hh__when { color: var(--theme-caption-color); font-weight: 600; white-space: nowrap; }
  .hh__dur { font-variant-numeric: tabular-nums; color: var(--theme-dark-color); }
  .hh__who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hh__extra { font-size: 0.7rem; color: var(--theme-dark-color); white-space: nowrap; }
  @media (max-width: 40rem) { .hh__row { grid-template-columns: 1fr auto; } .hh__who, .hh__extra { display: none; } }
</style>
