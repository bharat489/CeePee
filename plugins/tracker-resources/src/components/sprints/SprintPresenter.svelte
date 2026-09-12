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
<script lang="ts">
  import { type Sprint } from '@hcengineering/tracker'

  export let value: Sprint | undefined
  export let inline: boolean = false
  export let disabled: boolean = false
</script>

{#if value}
  <span
    class="sprint-presenter overflow-label"
    class:inline
    class:disabled
    class:active={value.state === 'active'}
    class:done={value.state === 'completed'}
    title={value.goal ?? value.name}
  >
    <span class="dot" />
    {value.name}
  </span>
{/if}

<style lang="scss">
  .sprint-presenter {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    color: var(--theme-content-color);
    &.disabled {
      opacity: 0.6;
    }
    &.done {
      color: var(--theme-trans-color);
    }
  }
  .dot {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--theme-trans-color);
    .active & {
      background: var(--accent-brand);
      box-shadow: 0 0 0 3px var(--accent-brand-soft);
    }
  }
</style>
