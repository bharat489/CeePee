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
  The project-level home for the decision record.

  Project navigator specials receive `currentSpace`; the Decisions component
  is written against `space` so it can also sit inside an issue panel. This
  wrapper is the whole adapter, kept trivial on purpose.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { type Project } from '@hcengineering/tracker'

  import Decisions from './Decisions.svelte'

  export let currentSpace: Ref<Project>
</script>

<div class="project-decisions">
  <Decisions space={currentSpace} />
</div>

<style lang="scss">
  .project-decisions {
    padding: 1rem 1.25rem;
    max-width: 56rem;
  }
</style>
