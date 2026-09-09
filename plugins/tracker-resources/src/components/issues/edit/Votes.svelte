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
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'

  export let issue: Issue
  export let readonly: boolean = false

  const client = getClient()
  const me = getCurrentEmployee()
  $: votes = issue.votes ?? []
  $: mine = me !== undefined && votes.includes(me)

  let names: string[] = []
  async function load (ids: Ref<Person>[]): Promise<void> {
    if (ids.length === 0) {
      names = []
      return
    }
    const people = await client.findAll(contact.class.Person, { _id: { $in: ids } })
    names = people.map((p) => formatName(p.name))
  }
  $: void load(votes)

  async function toggle (): Promise<void> {
    if (me === undefined || readonly) return
    const next = mine ? votes.filter((v) => v !== me) : [...votes, me]
    await client.update(issue, { votes: next, voteCount: next.length })
  }
</script>

<div class="votes">
  <button class="votes__btn" class:votes__btn--on={mine} disabled={readonly} on:click={toggle} title={names.join(', ')}>
    <span class="votes__icon">▲</span>
    <span>{votes.length}</span>
  </button>
  {#if names.length > 0}<span class="votes__who">{names.slice(0, 3).join(', ')}{names.length > 3 ? ` +${names.length - 3}` : ''}</span>{/if}
</div>

<style lang="scss">
  .votes { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
  .votes__btn {
    display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px;
    background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; transition: var(--transition-interactive), transform var(--motion-fast) var(--ease-standard);
    &:hover { background: var(--theme-button-hovered); }
    &:active { transform: scale(0.95); }
    &--on { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--theme-caption-color); .votes__icon { color: var(--accent-brand-ink); } }
    &:disabled { cursor: default; }
  }
  .votes__icon { font-size: 0.7rem; }
  .votes__who { font-size: 0.75rem; color: var(--theme-trans-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
