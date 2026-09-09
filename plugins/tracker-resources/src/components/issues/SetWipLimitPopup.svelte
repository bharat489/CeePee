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
  Work-in-progress limit for one board column. Stored on the project, keyed
  by status, so it follows the board rather than the status definition --
  the same status can carry different limits in different projects.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import presentation, { getClient } from '@hcengineering/presentation'
  import { type IssueStatus, type Project } from '@hcengineering/tracker'
  import { Button, EditBox, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let project: Project
  export let status: Ref<IssueStatus>

  const client = getClient()
  const dispatch = createEventDispatcher()

  let value: number | undefined = project.wipLimits?.[status]

  async function save (clear: boolean = false): Promise<void> {
    const next = { ...(project.wipLimits ?? {}) } as Record<Ref<IssueStatus>, number>
    const n = clear ? NaN : Math.floor(Number(value))
    if (Number.isNaN(n) || n <= 0) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete next[status]
    } else {
      next[status] = n
    }
    await client.update(project, { wipLimits: next })
    dispatch('close')
  }
</script>

<div class="wip">
  <span class="wip__title"><Label label={tracker.string.SetWipLimit} /></span>
  <p class="wip__hint"><Label label={tracker.string.WipLimitHint} /></p>
  <EditBox bind:value format={'number'} placeholder={tracker.string.WipLimit} kind={'default'} autoFocus />
  <div class="wip__actions">
    <Button
      kind={'ghost'}
      label={tracker.string.ClearWipLimit}
      on:click={() => {
        void save(true)
      }}
    />
    <Button
      kind={'primary'}
      label={presentation.string.Save}
      on:click={() => {
        void save()
      }}
    />
  </div>
</div>

<style lang="scss">
  .wip {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: 20rem;
    padding: 1rem;
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.75rem;
    box-shadow: var(--theme-popup-shadow);
  }
  .wip__title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .wip__hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .wip__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
