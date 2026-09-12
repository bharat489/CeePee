<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2026 Hardcore Engineering Inc.
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
  Loading state: the orbit loader on a faint aurora, with an optional label
  that shimmers and rotating phrases after a couple of seconds so a slow
  load never looks frozen.
-->
<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import Spinner from './Spinner.svelte'
  import { ButtonSize } from '../types'

  export let shrink: boolean = false
  export let label: string = ''
  export let size: ButtonSize = 'medium'

  const dispatch = createEventDispatcher()
  const PHRASES = ['Syncing your workspace', 'Aligning the timeline', 'Fetching what changed', 'Almost there']
  let phrase = ''
  let slow = false
  let timer: any
  let ticker: any
  onMount(() => {
    timer = setTimeout(() => {
      dispatch('progress')
    }, 50)
    if (!shrink) {
      let k = 0
      ticker = setInterval(() => {
        slow = true
        phrase = PHRASES[k++ % PHRASES.length]
      }, 2200)
    }
    return () => {
      clearTimeout(timer)
    }
  })
  onDestroy(() => {
    clearTimeout(timer)
    clearInterval(ticker)
  })
</script>

<div class="spinner-container" class:fullSize={!shrink}>
  {#if !shrink}<span class="aurora" aria-hidden="true" />{/if}
  <div data-label={label} class="inner flex-row-center" class:labeled={label !== ''}>
    <Spinner size={shrink ? size : size === 'medium' ? 'x-large' : size} />
    <slot />
  </div>
  {#if !shrink && slow}<span class="phrase">{phrase}<span class="dots"><i>.</i><i>.</i><i>.</i></span></span>{/if}
</div>

<style lang="scss">
  .spinner-container {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.9rem;
    overflow: hidden;

    &.fullSize {
      width: 100%;
      height: 100%;
    }
  }
  .aurora {
    position: absolute;
    inset: -20%;
    pointer-events: none;
    background:
      radial-gradient(40% 35% at 30% 35%, color-mix(in srgb, var(--accent-brand, #c0f010) 14%, transparent), transparent 70%),
      radial-gradient(35% 40% at 70% 65%, color-mix(in srgb, var(--primary-button-default, #2b6bea) 14%, transparent), transparent 70%);
    filter: blur(24px);
    animation: aurora-drift 9s ease-in-out infinite alternate;
    opacity: 0;
    animation-delay: 0.3s;
    animation-fill-mode: forwards;
  }
  @keyframes aurora-drift {
    0% { transform: translate(-3%, 2%) scale(1); opacity: 0; }
    15% { opacity: 1; }
    100% { transform: translate(3%, -2%) scale(1.08); opacity: 1; }
  }
  @keyframes makeVisible {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
  .spinner-container .inner {
    position: relative;
    opacity: 0;
    animation: makeVisible 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.25s forwards;

    &.labeled::after {
      position: absolute;
      content: attr(data-label);
      bottom: -1rem;
      left: 50%;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-weight: 600;
      font-size: 0.5rem;
      color: var(--dark-color);
      transform: translateX(-50%);
      background: linear-gradient(90deg, var(--dark-color) 0%, var(--caption-color) 50%, var(--dark-color) 100%);
      background-size: 200% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shimmer 2.4s linear infinite;
    }
  }
  @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  .phrase {
    position: relative;
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: var(--dark-color);
    animation: makeVisible 0.4s ease forwards;
  }
  .dots i { font-style: normal; animation: blink 1.2s infinite; &:nth-child(2) { animation-delay: 0.2s; } &:nth-child(3) { animation-delay: 0.4s; } }
  @keyframes blink { 0%, 60%, 100% { opacity: 0.2; } 30% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .aurora { animation: none; opacity: 1; }
    .spinner-container .inner.labeled::after { animation: none; -webkit-text-fill-color: var(--dark-color); }
  }
</style>
