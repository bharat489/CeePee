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
  Approvals on an issue: every approval request filed for its status moves,
  who was asked, who has signed, and the buttons an approver needs. The
  section only appears when there is something to show.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee } from '@hcengineering/contact'
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue, type IssueStatus } from '@hcengineering/tracker'

  import { REQUEST_CLASS, type ApprovalRequest } from '../../../approvals'
  import tracker from '../../../plugin'
  import { icon } from '../../projects/icons'

  export let issue: Issue

  const client = getClient()
  const me = getCurrentEmployee()
  const rq = createQuery()
  const sq = createQuery()
  const eq = createQuery()
  let requests: ApprovalRequest[] = []
  let statuses: IssueStatus[] = []
  let people: Employee[] = []
  $: rq.query(REQUEST_CLASS, { attachedTo: issue._id } as any, (r) => { requests = r.sort((a, b) => (b.createdOn ?? 0) - (a.createdOn ?? 0)) })
  sq.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  eq.query(contact.mixin.Employee, {}, (r) => { people = r })
  const nameOf = (id: Ref<Employee>): string => { const p = people.find((x) => x._id === id); return p !== undefined ? formatName(p.name) : '…' }
  const targetOf = (r: ApprovalRequest): string => { const s = (r.tx as any)?.operations?.status; return statuses.find((x) => x._id === s)?.name ?? 'next status' }
  const canDecide = (r: ApprovalRequest): boolean => r.status === 'Active' && r.requested.includes(me) && !r.approved.includes(me)
  async function approve (r: ApprovalRequest): Promise<void> {
    await client.update(r, { $push: { approved: me } } as any)
  }
  async function reject (r: ApprovalRequest): Promise<void> {
    await client.update(r, { rejected: me, status: 'Rejected' } as any)
  }
  async function withdraw (r: ApprovalRequest): Promise<void> {
    await client.update(r, { status: 'Cancelled' } as any)
  }
</script>

{#if requests.length > 0}
  <section class="ap">
    <div class="ap__head"><span class="ap__ic">{@html icon('check')}</span><span class="ap__t">Approvals</span><span class="muted">{requests.filter((r) => r.status === 'Active').length} pending</span></div>
    {#each requests as r (r._id)}
      <div class="req" class:req--done={r.status === 'Completed'} class:req--bad={r.status === 'Rejected'} class:req--off={r.status === 'Cancelled'}>
        <div class="req__main">
          <span class="req__title">Move to <b>{targetOf(r)}</b></span>
          <span class="muted">{r.status === 'Active' ? `waiting · ${r.approved.length}/${r.requiredApprovesCount} approved` : r.status === 'Completed' ? 'approved and applied' : r.status === 'Rejected' ? `rejected by ${r.rejected !== undefined ? nameOf(r.rejected) : 'an approver'}` : 'withdrawn'} · asked {r.requested.map(nameOf).join(', ')}{#if r.approved.length > 0} · signed {r.approved.map(nameOf).join(', ')}{/if}</span>
        </div>
        <div class="req__tools">
          {#if canDecide(r)}
            <button class="bbtn bbtn--ok" on:click={() => { void approve(r) }}>Approve</button>
            <button class="bbtn bbtn--bad" on:click={() => { void reject(r) }}>Reject</button>
          {:else if r.status === 'Active'}
            <button class="lnk" on:click={() => { void withdraw(r) }}>withdraw</button>
          {/if}
        </div>
      </div>
    {/each}
  </section>
{/if}

<style lang="scss">
  .ap { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.75rem 0; padding: 0.75rem 0.9rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .ap__head { display: flex; align-items: center; gap: 0.4rem; }
  .ap__ic { display: inline-flex; color: var(--accent-brand); :global(svg) { width: 0.95rem; height: 0.95rem; } }
  .ap__t { font-weight: 700; color: var(--theme-caption-color); }
  .muted { font-size: 0.75rem; color: var(--theme-dark-color); }
  .req { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0; border-top: 1px solid var(--theme-divider-color); &--done .req__title { color: #15803d; } &--bad .req__title { color: var(--negative-button-default); } &--off { opacity: 0.55; } }
  .req__main { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
  .req__title { font-size: 0.875rem; color: var(--theme-caption-color); b { font-weight: 700; } }
  .req__tools { display: flex; align-items: center; gap: 0.35rem; flex: none; }
  .bbtn { padding: 0.3rem 0.7rem; border: none; border-radius: 0.45rem; font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; color: #fff; &--ok { background: #16a34a; } &--bad { background: var(--negative-button-default); } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; }
</style>
