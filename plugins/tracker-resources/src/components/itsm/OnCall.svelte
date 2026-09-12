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
  On-call rotations. People take turns of N days starting on a date,
  handing off at a set hour; the page shows who holds the pager now and the
  next handoffs. New incidents at or below a severity are assigned to the
  person on call by the server, with no paging service involved. Alerts
  reach people through the usual channels: in-app, email, Slack or Teams
  via automation rules.
-->
<script lang="ts">
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type OnCallRotation, type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const rq = createQuery()
  const eq = createQuery()
  let rotations: OnCallRotation[] = []
  let employees: Employee[] = []
  $: rq.query(tracker.class.OnCallRotation, { space: currentSpace }, (r) => { rotations = r })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: nameOf = new Map(employees.map((e) => [e._id as Ref<Person>, formatName(e.name)]))
  const DAY = 86_400_000

  function shiftIndex (r: OnCallRotation, at: number): number {
    const start = new Date(r.startsOn)
    start.setHours(r.handoffHour, 0, 0, 0)
    const n = Math.floor((at - start.getTime()) / (Math.max(1, r.shiftDays) * DAY))
    return ((n % Math.max(1, r.people.length)) + r.people.length) % Math.max(1, r.people.length)
  }
  function current (r: OnCallRotation, at = Date.now()): Ref<Person> | undefined {
    return r.people.length === 0 ? undefined : r.people[shiftIndex(r, at)]
  }
  function nextHandoff (r: OnCallRotation, at = Date.now()): number {
    const start = new Date(r.startsOn)
    start.setHours(r.handoffHour, 0, 0, 0)
    const len = Math.max(1, r.shiftDays) * DAY
    const n = Math.floor((at - start.getTime()) / len)
    return start.getTime() + (n + 1) * len
  }
  function upcoming (r: OnCallRotation, count = 5): Array<{ at: number, who: Ref<Person> | undefined }> {
    const out: Array<{ at: number, who: Ref<Person> | undefined }> = []
    let t = nextHandoff(r)
    for (let k = 0; k < count; k++) {
      out.push({ at: t, who: current(r, t + 1000) })
      t += Math.max(1, r.shiftDays) * DAY
    }
    return out
  }

  let editing: OnCallRotation | undefined | null = null
  let f = { name: '', people: [] as Ref<Person>[], startsOn: new Date().toISOString().slice(0, 10), shiftDays: 7, handoffHour: 9, autoAssignSeverity: 2 as number | '' }
  function edit (r?: OnCallRotation): void {
    editing = r
    f = { name: r?.name ?? '', people: [...(r?.people ?? [])], startsOn: new Date(r?.startsOn ?? Date.now()).toISOString().slice(0, 10), shiftDays: r?.shiftDays ?? 7, handoffHour: r?.handoffHour ?? 9, autoAssignSeverity: r?.autoAssignSeverity ?? 2 }
  }
  function togglePerson (id: Ref<Person>): void {
    f.people = f.people.includes(id) ? f.people.filter((p) => p !== id) : [...f.people, id]
  }
  function move (id: Ref<Person>, dir: -1 | 1): void {
    const i = f.people.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= f.people.length) return
    const next = [...f.people]
    ;[next[i], next[j]] = [next[j], next[i]]
    f.people = next
  }
  async function save (): Promise<void> {
    if (f.name.trim() === '' || f.people.length === 0) return
    const data = { name: f.name.trim(), people: f.people, startsOn: new Date(f.startsOn).getTime(), shiftDays: Math.max(1, Number(f.shiftDays) || 7), handoffHour: Math.min(23, Math.max(0, Number(f.handoffHour) || 0)), autoAssignSeverity: f.autoAssignSeverity === '' ? undefined : Number(f.autoAssignSeverity) }
    if (editing === undefined) await client.createDoc(tracker.class.OnCallRotation, currentSpace, data)
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (r: OnCallRotation): Promise<void> {
    if (!confirm(`Delete rotation "${r.name}"?`)) return
    await client.remove(r)
  }
  const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<div class="oc">
  <header class="oc__head">
    <span class="oc__title"><Label label={tracker.string.OnCall} /></span>
    <span class="muted">Whoever is on call is assigned new incidents automatically (severity at or below the rotation's threshold).</span>
    <span class="grow" />
    <Button kind={'primary'} icon={IconAdd} label={tracker.string.Add} on:click={() => { edit(undefined) }} />
  </header>

  {#if editing !== null}
    <section class="form motion-pop">
      <div class="form__row">
        <input class="input input--w" placeholder="Rotation name, e.g. Platform primary" bind:value={f.name} />
        <label class="knob">starts <input class="input" type="date" bind:value={f.startsOn} /></label>
        <label class="knob">every <input class="input input--n" type="number" min="1" bind:value={f.shiftDays} /> days</label>
        <label class="knob">handoff at <input class="input input--n" type="number" min="0" max="23" bind:value={f.handoffHour} />:00</label>
        <label class="knob">auto-assign severity ≤ <select class="input" bind:value={f.autoAssignSeverity}><option value="">off</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
      </div>
      <div class="people">
        <span class="muted">Order of turns (click to add or remove, arrows to reorder):</span>
        <div class="chips">
          {#each f.people as id, k (id)}
            <span class="chip chip--on"><button class="chipbtn" on:click={() => { move(id, -1) }} disabled={k === 0}>◀</button>{nameOf.get(id) ?? '…'}<button class="chipbtn" on:click={() => { move(id, 1) }} disabled={k === f.people.length - 1}>▶</button><button class="chipbtn" on:click={() => { togglePerson(id) }}>×</button></span>
          {/each}
        </div>
        <div class="chips">
          {#each employees.filter((e) => !f.people.includes(e._id)) as e (e._id)}<button class="chip" on:click={() => { togglePerson(e._id) }}>+ {formatName(e.name)}</button>{/each}
        </div>
      </div>
      <div class="form__row"><Button kind={'primary'} label={tracker.string.Save} disabled={f.name.trim() === '' || f.people.length === 0} on:click={() => { void save() }} /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} /></div>
    </section>
  {/if}

  <div class="grid">
    {#each rotations as r, idx (r._id)}
      {@const now = current(r)}
      <section class="card motion-rise" style="--i: {idx}">
        <div class="card__head"><span class="card__title">{r.name}</span><span class="tools"><button class="lnk" on:click={() => { edit(r) }}>edit</button><button class="lnk lnk--bad" on:click={() => { void remove(r) }}>delete</button></span></div>
        <div class="now"><span class="now__label">On call now</span><span class="now__who">{now !== undefined ? nameOf.get(now) ?? '…' : '—'}</span><span class="muted">until {fmt(nextHandoff(r))}</span></div>
        <span class="muted">{r.people.length} people · {r.shiftDays}-day shifts · handoff {String(r.handoffHour).padStart(2, '0')}:00{r.autoAssignSeverity !== undefined ? ` · auto-assigns severity ≤ ${r.autoAssignSeverity}` : ''}</span>
        <ul class="sched">{#each upcoming(r) as u}<li><span class="sched__at">{fmt(u.at)}</span><span>{u.who !== undefined ? nameOf.get(u.who) ?? '…' : '—'}</span></li>{/each}</ul>
      </section>
    {/each}
  </div>
  {#if rotations.length === 0}<p class="muted">No rotation yet. Add one with the people who take turns; incidents raised through the service desk will land with whoever is on call.</p>{/if}
</div>

<style lang="scss">
  .oc { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.25rem; overflow: auto; }
  .oc__head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .oc__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .input { padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--w { flex: 1; min-width: 14rem; } &--n { width: 4rem; } }
  .knob { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .form { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem; border: 1px dashed var(--accent-brand); border-radius: 0.6rem; }
  .form__row { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
  .people { display: flex; flex-direction: column; gap: 0.35rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.75rem; cursor: pointer; &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .chipbtn { border: none; background: transparent; padding: 0 0.15rem; color: var(--theme-dark-color); font: inherit; font-size: 0.7rem; cursor: pointer; &:disabled { opacity: 0.3; } }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 0.75rem; }
  .card { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__head { display: flex; align-items: center; justify-content: space-between; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .tools { display: flex; gap: 0.5rem; }
  .now { display: flex; align-items: baseline; gap: 0.6rem; }
  .now__label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .now__who { font-size: 1.25rem; font-weight: 700; color: var(--theme-caption-color); }
  .sched { margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; color: var(--theme-content-color); li { display: flex; gap: 0.75rem; padding: 0.2rem 0; border-top: 1px solid var(--theme-divider-color); } }
  .sched__at { min-width: 11rem; color: var(--theme-trans-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
</style>
