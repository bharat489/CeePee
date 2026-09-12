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
  Satisfaction survey for a resolved request. Shown only to the person who
  raised it, once, after resolution. One rating and an optional sentence;
  the Satisfaction report aggregates them.
-->
<script lang="ts">
  import { getCurrentAccount } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus } from '@hcengineering/tracker'
  import { createQuery } from '@hcengineering/presentation'

  import tracker from '../../../plugin'

  export let issue: Issue

  const client = getClient()
  const mySocialIds = getCurrentAccount().socialIds
  const statusQ = createQuery()
  let statuses: IssueStatus[] = []
  statusQ.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  $: cat = statuses.find((s) => s._id === issue.status)?.category
  $: done = cat === task.statusCategory.Won || cat === task.statusCategory.Lost
  $: show = issue.requestType != null && done && issue.createdBy !== undefined && mySocialIds.includes(issue.createdBy) && issue.csat === undefined

  let rating = 0
  let hover = 0
  let comment = ''
  let saved = false
  async function submit (): Promise<void> {
    if (rating === 0) return
    await client.update(issue, { csat: rating, csatComment: comment.trim() === '' ? undefined : comment.trim() })
    saved = true
  }
</script>

{#if show && !saved}
  <div class="csat motion-pop">
    <span class="csat__q">How did we do on this request?</span>
    <div class="csat__stars">
      {#each [1, 2, 3, 4, 5] as v}
        <button class="star" class:star--on={v <= (hover || rating)} on:mouseenter={() => { hover = v }} on:mouseleave={() => { hover = 0 }} on:click={() => { rating = v }}>★</button>
      {/each}
    </div>
    <input class="csat__in" placeholder="Anything we should know? (optional)" bind:value={comment} />
    <button class="csat__ok" disabled={rating === 0} on:click={submit}>Send</button>
  </div>
{:else if saved}
  <p class="csat__thanks">Thanks — your rating is recorded.</p>
{/if}

<style lang="scss">
  .csat { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem; margin: 0.5rem 0; border: 1px solid var(--accent-brand); border-radius: 0.6rem; background: var(--accent-brand-soft); }
  .csat__q { font-size: 0.875rem; font-weight: 600; color: var(--theme-caption-color); }
  .csat__stars { display: flex; gap: 0.15rem; }
  .star { border: none; background: transparent; color: var(--theme-trans-color); font-size: 1.4rem; line-height: 1; cursor: pointer; transition: color var(--motion-fast), transform var(--motion-fast) var(--ease-emphasis); &--on { color: #f5a623; } &:hover { transform: scale(1.2); } }
  .csat__in { padding: 0.35rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; outline: none; }
  .csat__ok { align-self: flex-start; padding: 0.3rem 0.8rem; border: none; border-radius: 999px; background-image: var(--accent-gradient); color: #fff; font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; &:disabled { opacity: 0.4; cursor: default; } }
  .csat__thanks { margin: 0.5rem 0; font-size: 0.8125rem; color: var(--accent-brand-ink); }
</style>
