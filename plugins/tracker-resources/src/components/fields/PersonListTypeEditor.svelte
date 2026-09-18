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
<!-- Type editor (Settings → Classes) for the "People (multiple)" attribute type. Nothing to configure. -->
<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'

  import tracker from '../../plugin'

  export let type: any = undefined
  export let editable: boolean = true

  const dispatch = createEventDispatcher()
  onMount(() => {
    dispatch('change', { type: { _class: tracker.class.TypePersonList, label: tracker.string.PersonList } })
  })
</script>

<span class="hint" class:hint--ro={!editable || type !== undefined}><Label label={tracker.string.PersonList} /> · several people from the workspace, shown as stacked avatars</span>

<style lang="scss">
  .hint { font-size: 0.8125rem; color: var(--theme-trans-color); &--ro { opacity: 0.85; } }
</style>
