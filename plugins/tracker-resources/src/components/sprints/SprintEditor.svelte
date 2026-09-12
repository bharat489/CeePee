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
  Sprint field on an issue. Only sprints that are still open are offered;
  a completed sprint is history and takes no new work.
-->
<script lang="ts">
  import { type DocumentQuery, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { type Issue, type Sprint } from '@hcengineering/tracker'
  import { ObjectBox } from '@hcengineering/view-resources'

  import tracker from '../../plugin'

  export let value: Issue
  export let readonly: boolean = false

  const client = getClient()

  let docQuery: DocumentQuery<Sprint>
  $: docQuery = { space: value.space, state: { $ne: 'completed' } }

  async function onChange (e: CustomEvent<Ref<Sprint> | null | undefined>): Promise<void> {
    const next = e.detail ?? null
    if ((value.sprint ?? null) === next) return
    await client.update(value, { sprint: next })
  }
</script>

<ObjectBox
  _class={tracker.class.Sprint}
  value={value.sprint}
  {docQuery}
  label={tracker.string.NoSprint}
  icon={tracker.icon.Milestone}
  searchField={'name'}
  kind={'link'}
  size={'medium'}
  width={'100%'}
  allowDeselect
  showNavigate={false}
  {readonly}
  on:change={onChange}
/>
