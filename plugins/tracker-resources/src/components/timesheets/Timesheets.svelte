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
  Timesheets: hours reported per person per day for one week, from the time
  reports people already log on issues. This is a summary of work people
  chose to record, not a measure of presence -- nothing here is inferred.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type TimeSpendReport } from '@hcengineering/tracker'
  import { Button, IconBack, IconForward, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const client = getClient()
  const query = createQuery()
  const DAY = 86_400_000

  function startOfWeek (t: number): number {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    const dow = (d.getDay() + 6) % 7 // Monday = 0
    return d.getTime() - dow * DAY
  }
  let weekStart = startOfWeek(Date.now())
  $: days = Array.from({ length: 7 }, (_, i) => weekStart + i * DAY)

  let reports: TimeSpendReport[] = []
  $: query.query(
    tracker.class.TimeSpendReport,
    { date: { $gte: weekStart, $lt: weekStart + 7 * DAY } },
    (r) => {
      reports = r
    },
    { limit: 5000 }
  )

  let names = new Map<string, string>()
  async function resolveNames (list: TimeSpendReport[]): Promise<void> {
    const ids = Array.from(new Set(list.map((r) => r.employee).filter((e): e is NonNullable<typeof e> => e != null)))
    const missing = ids.filter((id) => !names.has(id))
    if (missing.length === 0) return
    const people = await client.findAll(contact.class.Person, { _id: { $in: missing as unknown as Ref<Person>[] } })
    const next = new Map(names)
    for (const p of people) next.set(p._id, formatName(p.name))
    names = next
  }
  $: void resolveNames(reports)

  interface Row {
    key: string
    name: string
    cells: number[]
    total: number
  }
  $: rows = ((): Row[] => {
    const by = new Map<string, number[]>()
    for (const r of reports) {
      const key = r.employee ?? 'none'
      const cells = by.get(key) ?? Array.from({ length: 7 }, () => 0)
      const idx = r.date != null ? Math.floor((r.date - weekStart) / DAY) : -1
      if (idx >= 0 && idx < 7) cells[idx] += r.value
      by.set(key, cells)
    }
    return Array.from(by.entries())
      .map(([key, cells]) => ({
        key,
        name: key === 'none' ? '—' : names.get(key) ?? '…',
        cells,
        total: cells.reduce((a, b) => a + b, 0)
      }))
      .sort((a, b) => b.total - a.total)
  })()
  $: dayTotals = days.map((_, i) => rows.reduce((a, r) => a + r.cells[i], 0))
  $: grand = dayTotals.reduce((a, b) => a + b, 0)

  function fmt (h: number): string {
    return h === 0 ? '' : Math.round(h * 10) / 10 + ''
  }
  function fmtDay (t: number): string {
    return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
  }
  function fmtRange (): string {
    const a = new Date(weekStart)
    const b = new Date(weekStart + 6 * DAY)
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }
  const isToday = (t: number): boolean => startOfWeek(Date.now()) <= t && Math.floor((Date.now() - t) / DAY) === 0
</script>

<div class="sheet">
  <header class="sheet__head">
    <span class="sheet__title"><Label label={tracker.string.Timesheets} /></span>
    <div class="sheet__nav">
      <Button
        icon={IconBack}
        kind={'ghost'}
        on:click={() => {
          weekStart -= 7 * DAY
        }}
      />
      <span class="sheet__range">{fmtRange()}</span>
      <Button
        icon={IconForward}
        kind={'ghost'}
        on:click={() => {
          weekStart += 7 * DAY
        }}
      />
      <Button
        kind={'ghost'}
        label={tracker.string.ThisWeek}
        on:click={() => {
          weekStart = startOfWeek(Date.now())
        }}
      />
    </div>
  </header>

  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th class="th th--name"><Label label={tracker.string.Person} /></th>
          {#each days as d}
            <th class="th" class:th--today={isToday(d)}>{fmtDay(d)}</th>
          {/each}
          <th class="th th--total"><Label label={tracker.string.Total} /></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r, idx (r.key)}
          <tr class="tr motion-rise" style="--i: {idx}">
            <td class="td td--name">{r.name}</td>
            {#each r.cells as c, i}
              <td class="td td--num" class:td--today={isToday(days[i])}>{fmt(c)}</td>
            {/each}
            <td class="td td--num td--total">{fmt(r.total)}</td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr><td class="td td--empty" colspan="9"><Label label={tracker.string.NoTimeReported} /></td></tr>
        {/if}
      </tbody>
      {#if rows.length > 0}
        <tfoot>
          <tr>
            <td class="td td--name td--foot"><Label label={tracker.string.Total} /></td>
            {#each dayTotals as t}
              <td class="td td--num td--foot">{fmt(t)}</td>
            {/each}
            <td class="td td--num td--foot td--total">{fmt(grand)}</td>
          </tr>
        </tfoot>
      {/if}
    </table>
  </div>
</div>

<style lang="scss">
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    overflow: auto;
  }
  .sheet__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .sheet__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .sheet__nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .sheet__range {
    min-width: 9rem;
    text-align: center;
    font-size: 0.875rem;
    color: var(--theme-caption-color);
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
  }
  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .th,
  .td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--theme-divider-color);
    white-space: nowrap;
  }
  .th {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-align: right;
    color: var(--theme-dark-color);
    background: var(--theme-comp-header-color);
    &--name {
      text-align: left;
    }
    &--today {
      color: var(--accent-brand-ink);
      background: var(--accent-brand-soft);
    }
  }
  .td {
    color: var(--theme-content-color);
    &--name {
      color: var(--theme-caption-color);
      font-weight: 500;
    }
    &--num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    &--today {
      background: var(--accent-brand-soft);
    }
    &--total {
      font-weight: 600;
      color: var(--theme-caption-color);
    }
    &--foot {
      border-bottom: none;
      background: var(--theme-comp-header-color);
      font-weight: 600;
    }
    &--empty {
      text-align: center;
      color: var(--theme-trans-color);
      border-bottom: none;
    }
  }
  .tr:hover .td {
    background: var(--theme-button-hovered);
  }
</style>
