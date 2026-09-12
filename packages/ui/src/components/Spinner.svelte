<!--
// Copyright © 2020 Anticrm Platform Contributors.
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
  Orbit loader: three rings on different axes and speeds around a glowing
  core. Pure CSS, scales with the size prop, honours reduced motion.
-->
<script lang="ts">
  import type { ButtonSize } from '../types'

  export let size: ButtonSize = 'medium'
</script>

<div class="orbit orbit-{size}" role="progressbar" aria-busy="true" aria-label="Loading">
  <span class="orbit__core" />
  <span class="orbit__ring orbit__ring--a" />
  <span class="orbit__ring orbit__ring--b" />
  <span class="orbit__ring orbit__ring--c" />
</div>

<style lang="scss">
  .orbit {
    --orbit-accent: var(--accent-brand, #c0f010);
    --orbit-secondary: var(--primary-button-default, #2b6bea);
    --orbit-ink: var(--caption-color, currentColor);
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    perspective: 400px;

    &-inline { width: 0.75rem; height: 0.75rem; }
    &-small { width: 1rem; height: 1rem; }
    &-medium { width: 1.5rem; height: 1.5rem; }
    &-large { width: 2rem; height: 2rem; }
    &-x-large { width: 3rem; height: 3rem; }
  }
  .orbit__core {
    position: absolute;
    inset: 36%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, #fff, var(--orbit-accent) 55%, transparent 72%);
    box-shadow: 0 0 6px var(--orbit-accent), 0 0 14px color-mix(in srgb, var(--orbit-accent) 55%, transparent);
    animation: orbit-pulse 1.6s ease-in-out infinite;
  }
  .orbit__ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid transparent;
    border-top-color: var(--orbit-ink);
    border-right-color: color-mix(in srgb, var(--orbit-ink) 35%, transparent);
    transform-style: preserve-3d;
    &--a { animation: orbit-a 1.4s linear infinite; }
    &--b { inset: 12%; border-top-color: var(--orbit-accent); border-right-color: color-mix(in srgb, var(--orbit-accent) 35%, transparent); animation: orbit-b 1.9s linear infinite; }
    &--c { inset: 24%; border-top-color: var(--orbit-secondary); border-right-color: color-mix(in srgb, var(--orbit-secondary) 35%, transparent); animation: orbit-c 1.1s linear infinite reverse; }
  }
  @keyframes orbit-a { from { transform: rotateX(62deg) rotateZ(0deg); } to { transform: rotateX(62deg) rotateZ(360deg); } }
  @keyframes orbit-b { from { transform: rotateY(62deg) rotateZ(0deg); } to { transform: rotateY(62deg) rotateZ(360deg); } }
  @keyframes orbit-c { from { transform: rotateZ(0deg); } to { transform: rotateZ(360deg); } }
  @keyframes orbit-pulse { 0%, 100% { transform: scale(0.85); opacity: 0.85; } 50% { transform: scale(1.1); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .orbit__ring, .orbit__core { animation-duration: 6s; }
  }
</style>
