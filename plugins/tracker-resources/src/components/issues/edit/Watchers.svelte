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
  Watchers: the people who receive this issue's notifications, as a visible
  list, with a watch/unwatch toggle. Reads the collaborators the platform
  already keeps; nothing new is tracked.
-->
<script lang="ts">
  import contact, { formatName } from '@hcengineering/contact'
  import core, { getCurrentAccount, type AccountUuid, type Collaborator } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'

  export let issue: Issue
  export let readonly: boolean = false

  const client = getClient()
  const meUuid = getCurrentAccount().uuid
  const query = createQuery()
  let collaborators: Collaborator[] = []
  $: query.query(core.class.Collaborator, { attachedTo: issue._id }, (r) => { collaborators = r })
  $: mine = collaborators.find((c) => c.collaborator === meUuid)

  let names = new Map<AccountUuid, string>()
  async function load (uuids: AccountUuid[]): Promise<void> {
    const missing = uuids.filter((u) => !names.has(u))
    if (missing.length === 0) return
    const employees = await client.findAll(contact.mixin.Employee, { personUuid: { $in: missing } })
    const next = new Map(names)
    for (const e of employees) if (e.personUuid !== undefined) next.set(e.personUuid, formatName(e.name))
    names = next
  }
  $: void load(collaborators.map((c) => c.collaborator))

  async function toggle (): Promise<void> {
    if (readonly) return
    if (mine !== undefined) await client.remove(mine)
    else await client.addCollection(core.class.Collaborator, issue.space, issue._id, issue._class, 'collaborators', { collaborator: meUuid })
  }
</script>

<div class="watch">
  <button class="watch__btn" class:watch__btn--on={mine !== undefined} disabled={readonly} on:click={toggle}>
    {mine !== undefined ? 'Watching' : 'Watch'} · {collaborators.length}
  </button>
  <div class="watch__list">
    {#each collaborators as c (c._id)}
      <span class="chip">{names.get(c.collaborator) ?? '…'}</span>
    {/each}
  </div>
</div>

<style lang="scss">
  .watch { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
  .watch__btn {
    align-self: flex-start; padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px;
    background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; transition: var(--transition-interactive);
    &:hover { background: var(--theme-button-hovered); }
    &--on { background: var(--accent-brand-soft); border-color: var(--accent-brand); color: var(--theme-caption-color); }
    &:disabled { cursor: default; }
  }
  .watch__list { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip { padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--theme-button-pressed); font-size: 0.7rem; color: var(--theme-content-color); }
</style>
