<!--
//
// Copyright © 2023 Hardcore Engineering Inc.
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
//
-->
<script lang="ts">
  import { Person } from '@hcengineering/contact'
  import { EmployeePresenter, getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import { Document, DocumentSnapshot } from '@hcengineering/document'
  import { TimeSince, showPopup } from '@hcengineering/ui'
  import SnapshotPopup from './SnapshotPopup.svelte'

  export let value: DocumentSnapshot
  export let doc: Document | undefined = undefined
  export let readonly: boolean = false

  function open (): void {
    if (doc !== undefined) showPopup(SnapshotPopup, { doc, snapshot: value, readonly }, 'center')
  }

  let employee: Person | undefined
  $: if (value.createdBy !== undefined) {
    getPersonByPersonIdCb(value.createdBy, (p) => {
      employee = p ?? undefined
    })
  } else {
    employee = undefined
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="container flex-col flex-gap-2 flex-no-shrink" class:clickable={doc !== undefined} on:click={open}>
  <div class="flex-between h-8">
    <div class="fs-bold overflow-label">
      {value.title}
    </div>
    <div class="time">
      <TimeSince value={value.createdOn} />
    </div>
  </div>
  <EmployeePresenter value={employee} disabled />
</div>

<style lang="scss">
  .container {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    background: var(--theme-button-hovered);
  }
  .time {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
</style>
