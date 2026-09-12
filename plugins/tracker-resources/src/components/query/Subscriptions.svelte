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
  Scheduled emails of a query's results or a dashboard's headline numbers.
  Opened from the query page or a dashboard; lists what you already have.
  The integrations service sends them when the mail service is configured.
-->
<script lang="ts">
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import core, { SocialIdType, SortingOrder, type Ref } from '@hcengineering/core'
  import { Card, createQuery, getClient } from '@hcengineering/presentation'
  import { type Dashboard, type QuerySubscription, type SavedQuery } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let kind: 'query' | 'dashboard' = 'query'
  export let query: string | undefined = undefined
  export let savedQuery: Ref<SavedQuery> | undefined = undefined
  export let dashboard: Ref<Dashboard> | undefined = undefined
  export let name = ''

  const client = getClient()
  const me = getCurrentEmployee()
  const dispatch = createEventDispatcher()
  const q = createQuery()
  let mine: QuerySubscription[] = []
  q.query(tracker.class.QuerySubscription, { owner: me }, (r) => { mine = r }, { sort: { createdOn: SortingOrder.Descending } })

  let schedule: 'daily' | 'weekly' = 'daily'
  let hour = 8
  let weekday = 1
  let recipients = ''
  void client.findOne(contact.class.SocialIdentity, { attachedTo: me, type: SocialIdType.EMAIL }).then((s) => { if (s !== undefined && recipients === '') recipients = s.value })
  $: title = name !== '' ? name : kind === 'dashboard' ? 'Dashboard' : (query ?? '').slice(0, 50)

  async function create (): Promise<void> {
    const to = recipients.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (to.length === 0) return
    await client.createDoc(tracker.class.QuerySubscription, core.space.Workspace, {
      name: title,
      kind,
      ...(kind === 'query' ? { query: query ?? '', ...(savedQuery !== undefined ? { savedQuery } : {}) } : { dashboard }),
      schedule,
      hour: Math.min(23, Math.max(0, Number(hour) || 8)),
      ...(schedule === 'weekly' ? { weekday: Number(weekday) } : {}),
      recipients: to,
      owner: me,
      enabled: true
    })
  }
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const fmt = (t: number | undefined): string => (t === undefined ? 'never' : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
</script>

<Card label={tracker.string.Subscriptions} okLabel={tracker.string.Add} canSave={recipients.includes('@')} okAction={() => { void create() }} on:close={() => { dispatch('close') }} width={'medium'}>
  <div class="sub">
    <p class="muted">Email <b>{title}</b> to:</p>
    <input class="input" placeholder="you@company.com, team@company.com" bind:value={recipients} />
    <div class="row">
      <select class="input" bind:value={schedule}><option value="daily">every day</option><option value="weekly">every week</option></select>
      {#if schedule === 'weekly'}<select class="input" bind:value={weekday}>{#each DAYS as d, k}<option value={k}>{d}</option>{/each}</select>{/if}
      <label class="knob">at <input class="input input--n" type="number" min="0" max="23" bind:value={hour} />:00</label>
    </div>
    <p class="muted">Sent by the integrations service in its local time; needs MAIL_URL configured. Query emails carry the matching issues as a table; dashboard emails carry each widget's headline number.</p>
    {#if mine.length > 0}
      <span class="head">Your scheduled emails</span>
      {#each mine as s (s._id)}
        <div class="item">
          <div class="item__main"><b>{s.name}</b><span class="muted">{s.kind} · {s.schedule === 'weekly' ? DAYS[s.weekday ?? 1] + 's' : 'daily'} at {String(s.hour).padStart(2, '0')}:00 → {s.recipients.join(', ')} · last sent {fmt(s.lastSent)}{s.lastError ? ` · ${s.lastError}` : ''}</span></div>
          <label class="knob"><input type="checkbox" checked={s.enabled} on:change={(e) => { void client.update(s, { enabled: e.currentTarget.checked }) }} /> on</label>
          <Button kind={'ghost'} label={tracker.string.Delete} on:click={() => { void client.remove(s) }} />
        </div>
      {/each}
    {/if}
  </div>
</Card>

<style lang="scss">
  .sub { display: flex; flex-direction: column; gap: 0.5rem; min-width: 26rem; max-width: 40rem; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); b { color: var(--theme-caption-color); } }
  .input { padding: 0.35rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--n { width: 4rem; } }
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .knob { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .head { margin-top: 0.5rem; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; border-top: 1px solid var(--theme-divider-color); font-size: 0.8125rem; }
  .item__main { display: flex; flex-direction: column; flex: 1; min-width: 0; b { color: var(--theme-caption-color); } .muted { font-size: 0.75rem; } }
</style>
