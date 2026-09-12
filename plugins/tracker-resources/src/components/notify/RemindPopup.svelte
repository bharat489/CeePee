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
<!-- "Remind me about this issue": presets or a custom time, with a note; delivered to the inbox. -->
<script lang="ts">
  import { getCurrentAccount } from '@hcengineering/core'
  import { Card, getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let issue: Issue

  const client = getClient()
  const dispatch = createEventDispatcher()
  const HOUR = 3_600_000
  const DAY = 24 * HOUR
  function at (h: number, daysAhead: number): number {
    const d = new Date()
    d.setDate(d.getDate() + daysAhead)
    d.setHours(h, 0, 0, 0)
    return d.getTime()
  }
  function nextMonday (): number {
    const d = new Date()
    const add = ((8 - d.getDay()) % 7) || 7
    d.setDate(d.getDate() + add)
    d.setHours(9, 0, 0, 0)
    return d.getTime()
  }
  const PRESETS = [
    { l: 'In 1 hour', t: () => Date.now() + HOUR },
    { l: 'In 3 hours', t: () => Date.now() + 3 * HOUR },
    { l: 'Tomorrow 9:00', t: () => at(9, 1) },
    { l: 'In 3 days', t: () => at(9, 3) },
    { l: 'Next Monday 9:00', t: () => nextMonday() },
    { l: 'In a week', t: () => at(9, 7) }
  ]
  let picked = PRESETS[2].t()
  let custom = ''
  let note = ''
  $: when = custom !== '' ? new Date(custom).getTime() : picked
  async function save (): Promise<void> {
    if (Number.isNaN(when) || when < Date.now() - DAY) return
    await client.createDoc(tracker.class.Reminder, issue.space, { issue: issue._id, user: getCurrentAccount().uuid, at: when, note: note.trim() || undefined, fired: false })
    dispatch('close')
  }
</script>

<Card label={tracker.string.RemindMe} okLabel={tracker.string.Save} canSave={!Number.isNaN(when)} okAction={() => { void save() }} on:close={() => { dispatch('close') }} width={'small'}>
  <div class="rm">
    <span class="rm__issue"><b>{issue.identifier}</b> {issue.title}</span>
    <div class="chips">
      {#each PRESETS as p}<button class="chip" class:chip--on={custom === '' && picked === p.t()} on:click={() => { picked = p.t(); custom = '' }}>{p.l}</button>{/each}
    </div>
    <label class="field"><span>Or pick a time</span><input class="input" type="datetime-local" bind:value={custom} /></label>
    <input class="input" placeholder="Note to self (optional)" bind:value={note} />
    <span class="muted">You get an inbox notification (and a push, if enabled) at {new Date(when).toLocaleString()}.</span>
  </div>
</Card>

<style lang="scss">
  .rm { display: flex; flex-direction: column; gap: 0.6rem; min-width: 22rem; }
  .rm__issue { font-size: 0.875rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.25rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .field { display: flex; flex-direction: column; gap: 0.2rem; span { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); } }
  .input { padding: 0.4rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .muted { font-size: 0.75rem; color: var(--theme-trans-color); }
</style>
