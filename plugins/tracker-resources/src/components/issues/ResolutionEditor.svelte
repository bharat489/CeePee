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
  Resolution: why the issue stopped being open, as distinct from the status
  that closed it.

  Only rendered for terminal statuses. Asking "why did this close?" about an
  issue that is still in progress is noise, and a field that is usually
  irrelevant is a field people learn to ignore.

  The reopen case matters as much as the close: when an issue moves back out
  of a terminal status the resolution is cleared, so a stale reason never
  outlives the closure it described.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Resolution } from '@hcengineering/tracker'
  import { DropdownLabels, type DropdownTextItem, getPlatformColorDef, themeStore } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let value: Issue
  export let readonly: boolean = false

  const client = getClient()
  const resolutionQuery = createQuery()
  const statusQuery = createQuery()

  let resolutions: Resolution[] = []
  let statuses: IssueStatus[] = []

  resolutionQuery.query(tracker.class.Resolution, {}, (res) => {
    resolutions = res
  })

  $: statusQuery.query(tracker.class.IssueStatus, { space: value.space }, (res) => {
    statuses = res
  })

  $: category = statuses.find((s) => s._id === value.status)?.category
  // Won and Lost are both terminal. Lost especially needs a reason -- that is
  // the case where "why?" is actually asked.
  $: isTerminal = category === task.statusCategory.Won || category === task.statusCategory.Lost

  const NONE = '$none'
  $: items = [
    { id: NONE, label: '—' },
    ...resolutions.map((r): DropdownTextItem => ({ id: r._id, label: r.name }))
  ] as DropdownTextItem[]

  $: selected = value.resolution ?? NONE

  function colorOf (id: string): string | undefined {
    const r = resolutions.find((x) => x._id === id)
    return r === undefined ? undefined : getPlatformColorDef(r.color, $themeStore.dark).color
  }

  async function change (id: string): Promise<void> {
    const next = id === NONE ? null : (id as Ref<Resolution>)
    if ((value.resolution ?? null) === next) return
    await client.update(value, { resolution: next })
  }

  // Clearing on reopen is done here rather than in a trigger so it stays
  // visible to whoever is reading this component: leaving a resolution on a
  // reopened issue is the bug this field exists to avoid.
  $: if (!isTerminal && value.resolution != null && !readonly) {
    void client.update(value, { resolution: null })
  }
</script>

{#if isTerminal}
  <div class="resolution">
    <span class="resolution__dot" style:background={colorOf(selected) ?? 'transparent'} />
    <DropdownLabels
      label={tracker.string.Resolution}
      kind={'regular'}
      size={'medium'}
      disabled={readonly}
      {items}
      {selected}
      on:selected={(e) => {
        void change(e.detail)
      }}
    />
  </div>
{/if}

<style lang="scss">
  .resolution {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .resolution__dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
