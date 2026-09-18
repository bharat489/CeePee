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
  The CeePee mark: an orbit emblem and a chamfered, extended wordmark drawn as
  strokes, the last E streaking out to the right. Colours come from the vibe
  gradient so the logo always matches the interface. Animated: the letters
  draw themselves in, the streak sweeps out, the moon rides the orbit and the
  core breathes. Reduced motion shows the finished mark at once.
-->
<script lang="ts">
  export let height: string = '2rem'
  export let wordmark: boolean = true
  export let glow: boolean = true
  export let animated: boolean = true
  const uid = `cp${Math.random().toString(36).slice(2, 8)}`
</script>

<svg class="cp-logo" class:cp-logo--glow={glow} class:cp-logo--animated={animated} style:height viewBox="0 0 {wordmark ? 660 : 100} 100" xmlns="http://www.w3.org/2000/svg" aria-label="CeePee" role="img">
  <defs>
    <linearGradient id="{uid}-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" style="stop-color: var(--vibe-a, #7c3aed)" />
      <stop offset="0.55" style="stop-color: var(--vibe-b, #ec4899)" />
      <stop offset="1" style="stop-color: var(--vibe-c, #f97316)" />
    </linearGradient>
    <linearGradient id="{uid}-streak" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" style="stop-color: var(--vibe-c, #f97316)" stop-opacity="1" />
      <stop offset="1" style="stop-color: var(--vibe-c, #f97316)" stop-opacity="0" />
    </linearGradient>
    <path id="{uid}-orbit" d="M 94 50 A 44 15 0 1 1 6 50 A 44 15 0 1 1 94 50" transform="rotate(-28 50 50)" />
  </defs>
  <!-- emblem: tilted orbit, breathing core, one moon riding the orbit -->
  <g class="cp-logo__emblem">
    <use href="#{uid}-orbit" fill="none" stroke="url(#{uid}-grad)" stroke-width="6" class="cp-logo__orbit" />
    <circle cx="50" cy="50" r="13" fill="url(#{uid}-grad)" class="cp-logo__core" />
    <circle cx="50" cy="50" r="5" fill="#fff" fill-opacity="0.9" class="cp-logo__core" />
    <circle r="5.5" fill="#fff" class="cp-logo__moon">
      {#if animated}<animateMotion dur="5s" repeatCount="indefinite" rotate="auto"><mpath href="#{uid}-orbit" /></animateMotion>{:else}<set attributeName="cx" to="86" /><set attributeName="cy" to="30" />{/if}
    </circle>
  </g>
  {#if wordmark}
    <!-- wordmark: C E E P E E, monoline with 45° chamfers, last E extended -->
    <g class="cp-logo__word" fill="none" stroke="url(#{uid}-grad)" stroke-width="13" stroke-linejoin="miter" stroke-linecap="butt">
      <path class="cp-logo__glyph" style="--i: 0" d="M182 24 L170 12 H134 L122 24 V76 L134 88 H170 L182 76" />
      <path class="cp-logo__glyph" style="--i: 1" d="M264 12 H216 L204 24 V76 L216 88 H264 M204 50 H252" />
      <path class="cp-logo__glyph" style="--i: 2" d="M346 12 H298 L286 24 V76 L298 88 H346 M286 50 H334" />
      <path class="cp-logo__glyph" style="--i: 3" d="M368 88 V24 L380 12 H416 L428 24 V40 L416 52 H368" />
      <path class="cp-logo__glyph" style="--i: 4" d="M510 12 H462 L450 24 V76 L462 88 H510 M450 50 H498" />
      <path class="cp-logo__glyph" style="--i: 5" d="M592 12 H544 L532 24 V76 L544 88 H592" />
    </g>
    <path class="cp-logo__streak" d="M532 50 H655" fill="none" stroke="url(#{uid}-streak)" stroke-width="13" />
  {/if}
</svg>

<style lang="scss">
  .cp-logo { display: block; width: auto; overflow: visible; &--glow { filter: drop-shadow(0 0 14px var(--accent-brand-soft, rgba(168, 85, 247, 0.16))); } }
  .cp-logo__core { transform-origin: 50px 50px; }
  .cp-logo__glyph { stroke-dasharray: 420; stroke-dashoffset: 0; }
  .cp-logo__streak { stroke-dasharray: 130; stroke-dashoffset: 0; }
  .cp-logo--animated {
    .cp-logo__glyph { animation: cpDraw 1.1s cubic-bezier(0.2, 0.8, 0.3, 1) both; animation-delay: calc(0.15s + var(--i, 0) * 0.12s); }
    .cp-logo__streak { animation: cpStreak 0.9s cubic-bezier(0.2, 0.8, 0.3, 1) both; animation-delay: 0.95s; }
    .cp-logo__core { animation: cpBreathe 3.2s ease-in-out infinite; }
    .cp-logo__orbit { animation: cpOrbitIn 1s ease-out both; }
  }
  @keyframes cpDraw { from { stroke-dashoffset: 420; opacity: 0.2; } to { stroke-dashoffset: 0; opacity: 1; } }
  @keyframes cpStreak { from { stroke-dashoffset: 130; opacity: 0; } to { stroke-dashoffset: 0; opacity: 1; } }
  @keyframes cpBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
  @keyframes cpOrbitIn { from { opacity: 0; transform: rotate(-28deg) scale(0.6); transform-origin: 50px 50px; } to { opacity: 1; transform: rotate(0deg) scale(1); transform-origin: 50px 50px; } }
  @media (prefers-reduced-motion: reduce) { .cp-logo--animated .cp-logo__glyph, .cp-logo--animated .cp-logo__streak, .cp-logo--animated .cp-logo__core, .cp-logo--animated .cp-logo__orbit { animation: none; } }
</style>
