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
<!-- Value editor for a "People (multiple)" attribute: pick any number of employees. -->
<script lang="ts">
  import { type Employee } from '@hcengineering/contact'
  import { UserBoxList } from '@hcengineering/contact-resources'
  import { type Ref } from '@hcengineering/core'
  import { type IntlString } from '@hcengineering/platform'

  import tracker from '../../plugin'

  export let value: Ref<Employee>[] | undefined
  export let onChange: (value: Ref<Employee>[] | undefined) => void
  export let readonly: boolean = false
  export let label: IntlString | undefined = undefined

  function update (e: CustomEvent<Ref<Employee>[]>): void {
    onChange(e.detail.length === 0 ? undefined : e.detail)
  }
</script>

<UserBoxList items={value ?? []} label={label ?? tracker.string.PersonList} {readonly} on:update={update} />
