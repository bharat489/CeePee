<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { createEventDispatcher, onMount } from 'svelte'
  import SquareSpinner from './icons/SquareSpinner.svelte'

  export let shrink: boolean = false
  export let label: string = ''
  export let size: 'small' | 'medium' | 'large' = 'small'

  const dispatch = createEventDispatcher()
  let timer: any

  // Hold the indicator back briefly. Most loads resolve inside this window, and
  // a spinner that appears and vanishes in 200ms reads as a flicker -- it makes
  // a fast app feel less stable than showing nothing at all.
  const REVEAL_DELAY_MS = 280
  let visible = false
  let revealTimer: any

  onMount(() => {
    timer = setTimeout(() => {
      dispatch('progress')
    }, 50)
    revealTimer = setTimeout(() => {
      visible = true
    }, REVEAL_DELAY_MS)
    return () => {
      clearTimeout(timer)
      clearTimeout(revealTimer)
    }
  })
</script>

<div class="spinner-container" class:fullSize={!shrink}>
  <div class="spinner-reveal" class:visible>
    <div data-label={label} class="flex-row-center flex-gap-2" class:labeled={label !== ''}>
      <SquareSpinner {size} />
      <slot />
    </div>
    <slot name="actions" />
  </div>
</div>

<style lang="scss">
  .spinner-container {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    flex-direction: column;

    &.fullSize {
      width: 100%;
      height: 100%;
    }
  }

  .spinner-reveal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;

    opacity: 0;
    transform: translateY(0.25rem) scale(0.98);
    transition:
      opacity 0.32s ease,
      transform 0.32s cubic-bezier(0.2, 0.7, 0.3, 1);

    &.visible {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner-reveal {
      transition: opacity 0.2s ease;
      transform: none;

      &.visible {
        transform: none;
      }
    }
  }
</style>
