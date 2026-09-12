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
  Approval step on an issue. Request approval from named people; each
  approves or rejects with a note; the server refuses to start or finish
  work while approval is pending or rejected. Request types can require it
  automatically for new requests.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import { AccountRole, getCurrentAccount, hasAccountRole, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type ApprovalState, type Issue } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let issue: Issue
  export let readonly = false

  const client = getClient()
  const me = getCurrentEmployee()
  const canManage = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const eq = createQuery()
  let employees: Employee[] = []
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: nameOf = new Map(employees.map((e) => [e._id as Ref<Person>, formatName(e.name)]))
  $: a = issue.approval
  $: mine = a !== undefined && a.approvers.includes(me) && !a.decisions.some((d) => d.person === me)
  let picking = false
  let picked: Ref<Person>[] = []

  async function request (): Promise<void> {
    if (picked.length === 0) return
    const next: ApprovalState = { state: 'pending', approvers: picked, decisions: [], requestedOn: Date.now() }
    await client.update(issue, { approval: next })
    picking = false
    picked = []
  }
  async function decide (ok: boolean): Promise<void> {
    if (a === undefined) return
    const note = ok ? undefined : (prompt('Reason (optional)') ?? undefined)
    const decisions = [...a.decisions.filter((d) => d.person !== me), { person: me, ok, at: Date.now(), ...(note !== undefined && note !== '' ? { note } : {}) }]
    const rejected = decisions.some((d) => !d.ok)
    const allIn = a.approvers.every((p) => decisions.some((d) => d.person === p && d.ok))
    await client.update(issue, { approval: { ...a, decisions, state: rejected ? 'rejected' : allIn ? 'approved' : 'pending' } })
  }
  async function cancel (): Promise<void> {
    if (!confirm('Remove the approval requirement from this issue?')) return
    await client.update(issue, { approval: undefined } as any)
  }
  async function reopen (): Promise<void> {
    if (a === undefined) return
    await client.update(issue, { approval: { ...a, decisions: [], state: 'pending', requestedOn: Date.now() } })
  }
  const fmt = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<div class="appr">
  {#if a === undefined}
    {#if !readonly}
      {#if !picking}
        <button class="lnk" on:click={() => { picking = true }}>Request approval…</button>
      {:else}
        <div class="pick">
          <div class="chips">{#each employees as e (e._id)}<label class="chip" class:chip--on={picked.includes(e._id)}><input type="checkbox" checked={picked.includes(e._id)} on:change={() => { picked = picked.includes(e._id) ? picked.filter((p) => p !== e._id) : [...picked, e._id] }} />{formatName(e.name)}</label>{/each}</div>
          <div class="tools"><Button kind={'primary'} label={tracker.string.Approval} disabled={picked.length === 0} on:click={() => { void request() }} /><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { picking = false }} /></div>
        </div>
      {/if}
    {:else}<span class="muted">—</span>{/if}
  {:else}
    <div class="state state--{a.state}"><span class="state__pill">{a.state}</span><span class="muted">requested {fmt(a.requestedOn)} · {a.decisions.filter((d) => d.ok).length} / {a.approvers.length} approved</span></div>
    <ul class="list">
      {#each a.approvers as p (p)}
        {@const d = a.decisions.find((x) => x.person === p)}
        <li><span class="who">{nameOf.get(p) ?? '…'}</span><span class="dec" class:dec--ok={d?.ok === true} class:dec--no={d?.ok === false}>{d === undefined ? 'waiting' : d.ok ? `approved ${fmt(d.at)}` : `rejected ${fmt(d.at)}`}</span>{#if d?.note}<span class="muted">· {d.note}</span>{/if}</li>
      {/each}
    </ul>
    {#if !readonly}
      <div class="tools">
        {#if mine && a.state === 'pending'}<Button kind={'primary'} label={tracker.string.Approve} on:click={() => { void decide(true) }} /><Button kind={'ghost'} label={tracker.string.Reject} on:click={() => { void decide(false) }} />{/if}
        {#if a.state === 'rejected' && canManage}<button class="lnk" on:click={() => { void reopen() }}>ask again</button>{/if}
        {#if canManage}<button class="lnk lnk--bad" on:click={() => { void cancel() }}>remove requirement</button>{/if}
      </div>
    {/if}
  {/if}
</div>

<style lang="scss">
  .appr { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .muted { font-size: 0.75rem; color: var(--theme-trans-color); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.8125rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); font-size: 0.75rem; } }
  .pick { display: flex; flex-direction: column; gap: 0.4rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; padding: 0.15rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; font-size: 0.75rem; cursor: pointer; input { display: none; } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .tools { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
  .state { display: flex; align-items: center; gap: 0.5rem; }
  .state__pill { padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: var(--theme-button-pressed); color: var(--theme-caption-color); }
  .state--approved .state__pill { background: var(--accent-brand); color: #1a2400; }
  .state--rejected .state__pill { background: var(--negative-button-default); color: #fff; }
  .list { margin: 0; padding: 0; list-style: none; li { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.15rem 0; } }
  .who { font-weight: 600; color: var(--theme-caption-color); }
  .dec { font-size: 0.75rem; color: var(--theme-trans-color); &--ok { color: var(--accent-brand-ink, #6a8a00); } &--no { color: var(--negative-button-default); } }
</style>
