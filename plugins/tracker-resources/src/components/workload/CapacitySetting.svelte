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
  Capacity limits (Settings → Capacity): workspace defaults and, per person, the
  hours or points they can take in a week and how much of their week is on this
  work. The Workload view reads these.
-->
<script lang="ts">
  import contact, { formatName, type Employee } from '@hcengineering/contact'
  import core, { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Capacity, type CapacityDefaults } from '@hcengineering/tracker'
  import { addNotification, NotificationSeverity } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { icon } from '../projects/icons'

  const client = getClient()
  const eq = createQuery()
  const cq = createQuery()
  const dq = createQuery()
  let employees: Employee[] = []
  let capacities: Capacity[] = []
  let defaultsDoc: CapacityDefaults | undefined
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r.sort((a, b) => formatName(a.name).localeCompare(formatName(b.name))) })
  cq.query(tracker.class.Capacity, {}, (r) => { capacities = r })
  dq.query(tracker.class.CapacityDefaults, {}, (r) => { defaultsDoc = r[0]; syncDefaults() })

  // ---- defaults
  let hoursPerWeek = 40
  let pointsPerWeek: number | null = null
  let overloadPct = 100
  let unestimatedHours = 8
  let dirty = false
  function syncDefaults (): void {
    if (dirty) return
    hoursPerWeek = defaultsDoc?.hoursPerWeek ?? 40
    pointsPerWeek = defaultsDoc?.pointsPerWeek ?? null
    overloadPct = Math.round((defaultsDoc?.overloadThreshold ?? 1) * 100)
    unestimatedHours = defaultsDoc?.unestimatedHours ?? 8
  }
  async function saveDefaults (): Promise<void> {
    const data = {
      hoursPerWeek: Math.max(1, Number(hoursPerWeek) || 40),
      pointsPerWeek: pointsPerWeek !== null && Number(pointsPerWeek) > 0 ? Number(pointsPerWeek) : undefined,
      overloadThreshold: Math.max(0.1, (Number(overloadPct) || 100) / 100),
      unestimatedHours: Math.max(0, Number(unestimatedHours) || 0)
    }
    if (defaultsDoc === undefined) await client.createDoc(tracker.class.CapacityDefaults, core.space.Workspace, data)
    else await client.update(defaultsDoc, data)
    dirty = false
    addNotification('Capacity defaults saved', `${data.hoursPerWeek}h per week, overload above ${Math.round(data.overloadThreshold * 100)}%.`, undefined as any, {}, NotificationSeverity.Success)
  }

  // ---- per person
  $: capByEmployee = new Map(capacities.map((c) => [c.employee as string, c]))
  let search = ''
  $: visible = employees.filter((e) => search.trim() === '' || formatName(e.name).toLowerCase().includes(search.trim().toLowerCase()))

  async function setPerson (employee: Ref<Employee>, patch: { hoursPerWeek?: number | null, pointsPerWeek?: number | null, allocation?: number | null }): Promise<void> {
    const current = capByEmployee.get(employee as string)
    const next = {
      hoursPerWeek: patch.hoursPerWeek === undefined ? current?.hoursPerWeek ?? hoursPerWeek : patch.hoursPerWeek,
      pointsPerWeek: patch.pointsPerWeek === undefined ? current?.pointsPerWeek : patch.pointsPerWeek,
      allocation: patch.allocation === undefined ? current?.allocation : patch.allocation
    }
    const unsetHours = next.hoursPerWeek === null || Number.isNaN(next.hoursPerWeek)
    const empty = unsetHours && (next.pointsPerWeek == null) && (next.allocation == null || next.allocation === 1)
    if (empty) {
      if (current !== undefined) await client.remove(current)
      return
    }
    const data = {
      employee,
      hoursPerWeek: unsetHours ? hoursPerWeek : Math.max(0, Number(next.hoursPerWeek)),
      pointsPerWeek: next.pointsPerWeek == null ? undefined : Math.max(0, Number(next.pointsPerWeek)),
      allocation: next.allocation == null ? undefined : Math.min(1, Math.max(0, Number(next.allocation)))
    }
    if (current === undefined) await client.createDoc(tracker.class.Capacity, core.space.Workspace, data)
    else await client.update(current, data)
  }
  const num = (e: Event): number | null => {
    const v = (e.currentTarget as HTMLInputElement).value.trim()
    return v === '' ? null : Number(v)
  }
</script>

<div class="cap">
  <header class="cap__head">
    <span class="cap__ic">{@html icon('users')}</span>
    <div>
      <h1>Capacity</h1>
      <p class="muted">How much work each person can take in a week. The Workload view compares open work against these numbers and flags overload.</p>
    </div>
  </header>

  <section class="card">
    <h2>Workspace defaults</h2>
    <p class="muted">Used for everyone without a row below.</p>
    <div class="form">
      <label><span>Hours per week</span><input type="number" min="1" step="1" bind:value={hoursPerWeek} on:input={() => { dirty = true }} /></label>
      <label><span>Story points per week</span><input type="number" min="0" step="1" placeholder="not used" bind:value={pointsPerWeek} on:input={() => { dirty = true }} /></label>
      <label><span>Overloaded above</span><span class="unit"><input type="number" min="10" step="5" bind:value={overloadPct} on:input={() => { dirty = true }} />%</span></label>
      <label><span>Hours for an unestimated item</span><input type="number" min="0" step="1" bind:value={unestimatedHours} on:input={() => { dirty = true }} /></label>
      <button class="btn btn--primary" disabled={!dirty && defaultsDoc !== undefined} on:click={() => { void saveDefaults() }}>{defaultsDoc === undefined ? 'Save defaults' : 'Save changes'}</button>
    </div>
  </section>

  <section class="card">
    <div class="card__row">
      <div>
        <h2>Per person</h2>
        <p class="muted">Leave a field blank to use the default. Allocation is the share of the week on this work (50 for a half-time person).</p>
      </div>
      <input class="search" placeholder="Find a person" bind:value={search} />
    </div>
    <table class="tbl">
      <thead><tr><th>Person</th><th class="num">Hours / week</th><th class="num">Points / week</th><th class="num">Allocation %</th><th class="num">Effective</th></tr></thead>
      <tbody>
        {#each visible as e (e._id)}
          {@const c = capByEmployee.get(e._id)}
          <tr>
            <td><b>{formatName(e.name)}</b>{#if c !== undefined}<span class="pill">custom</span>{/if}</td>
            <td class="num"><input type="number" min="0" step="1" placeholder={String(hoursPerWeek)} value={c?.hoursPerWeek ?? ''} on:change={(ev) => { void setPerson(e._id, { hoursPerWeek: num(ev) }) }} /></td>
            <td class="num"><input type="number" min="0" step="1" placeholder={pointsPerWeek === null ? '—' : String(pointsPerWeek)} value={c?.pointsPerWeek ?? ''} on:change={(ev) => { void setPerson(e._id, { pointsPerWeek: num(ev) }) }} /></td>
            <td class="num"><input type="number" min="0" max="100" step="5" placeholder="100" value={c?.allocation !== undefined ? Math.round(c.allocation * 100) : ''} on:change={(ev) => { const v = num(ev); void setPerson(e._id, { allocation: v === null ? null : v / 100 }) }} /></td>
            <td class="num muted">{Math.round((c?.hoursPerWeek ?? hoursPerWeek) * (c?.allocation ?? 1) * 10) / 10}h</td>
          </tr>
        {/each}
        {#if visible.length === 0}<tr><td colspan="5" class="muted">No people match.</td></tr>{/if}
      </tbody>
    </table>
  </section>
</div>

<style lang="scss">
  .cap { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem 1.5rem; max-width: 64rem; overflow: auto; height: 100%; }
  .cap__head { display: flex; gap: 0.75rem; align-items: flex-start; h1 { margin: 0; font-size: 1.35rem; color: var(--theme-caption-color); } p { margin: 0.2rem 0 0; } }
  .cap__ic { display: inline-flex; margin-top: 0.3rem; color: var(--accent-brand); :global(svg) { width: 1.4rem; height: 1.4rem; } }
  .muted { color: var(--theme-dark-color); font-size: 0.8rem; }
  .card { border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); padding: 1rem 1.25rem; h2 { margin: 0; font-size: 1rem; color: var(--theme-caption-color); } p { margin: 0.15rem 0 0.75rem; } }
  .card__row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1.25rem; label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; color: var(--theme-dark-color); } }
  input[type='number'], .search { width: 8rem; padding: 0.35rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.45rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.85rem; }
  .search { width: 14rem; }
  .unit { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--theme-content-color); input { width: 5rem; } }
  .btn { padding: 0.45rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-button-default); color: var(--theme-content-color); font: inherit; font-size: 0.85rem; cursor: pointer; &--primary { background: var(--primary-button-default); border-color: transparent; color: #fff; } &:disabled { opacity: 0.5; cursor: default; } }
  .tbl { width: 100%; border-collapse: collapse; th, td { padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); text-align: left; font-size: 0.85rem; } th { font-size: 0.75rem; color: var(--theme-dark-color); font-weight: 600; } td b { color: var(--theme-caption-color); } .num { text-align: right; } .num input { width: 6rem; text-align: right; } }
  .pill { margin-left: 0.4rem; padding: 0.05rem 0.4rem; border-radius: 999px; background: var(--theme-button-hovered); font-size: 0.65rem; color: var(--theme-dark-color); }
</style>
