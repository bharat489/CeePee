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
  The CeePee mark, drawn as vectors after the 3D render: a big glossy white C
  with a lime rim, four ring "e"s each holding a lime orb, and a tall P. Being
  vector it stays crisp at any size and sits on any background. The orbit
  emblem keeps its own animation; the letters pop in one after another, the
  orbs breathe with a lime halo, glints travel across the glossy faces and
  the whole word floats. Reduced motion shows the finished mark at once.
-->
<script lang="ts">
  export let height: string = '2rem'
  export let wordmark: boolean = true
  export let emblem: boolean = true
  export let animated: boolean = true
  const uid = `cp${Math.random().toString(36).slice(2, 8)}`
</script>

<span class="cp-logo" class:cp-logo--animated={animated} style:height>
  {#if emblem}
    <svg class="cp-emblem" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="{uid}-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style="stop-color: var(--vibe-a, #7c3aed)" />
          <stop offset="0.55" style="stop-color: var(--vibe-b, #ec4899)" />
          <stop offset="1" style="stop-color: var(--vibe-c, #f97316)" />
        </linearGradient>
        <path id="{uid}-orbit" d="M 94 50 A 44 15 0 1 1 6 50 A 44 15 0 1 1 94 50" transform="rotate(-28 50 50)" />
      </defs>
      <use href="#{uid}-orbit" fill="none" stroke="url(#{uid}-grad)" stroke-width="6" class="cp-emblem__orbit" />
      <circle cx="50" cy="50" r="13" fill="url(#{uid}-grad)" class="cp-emblem__core" />
      <circle cx="50" cy="50" r="5" fill="#fff" fill-opacity="0.9" class="cp-emblem__core" />
      <circle r="5.5" fill="#fff">
        {#if animated}<animateMotion dur="5s" repeatCount="indefinite"><mpath href="#{uid}-orbit" /></animateMotion>{:else}<set attributeName="cx" to="86" /><set attributeName="cy" to="30" />{/if}
      </circle>
    </svg>
  {/if}
  {#if wordmark}
    <!-- WORDMARK-START -->
    <svg class="cp-word" viewBox="0 0 1816 513" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CeePee">
      <defs>
        <linearGradient id="{uid}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset="0.55" stop-color="#f4f6f8" /><stop offset="1" stop-color="#c9d0d8" /></linearGradient>
        <linearGradient id="{uid}-lime" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ff4a" /><stop offset="1" stop-color="#9ccf00" /></linearGradient>
        <radialGradient id="{uid}-orb" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="#f6ffa8" /><stop offset="0.38" stop-color="#c9f21a" /><stop offset="1" stop-color="#78b300" /></radialGradient>
        <filter id="{uid}-sh" x="-10%" y="-25%" width="120%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity="0.35" /></filter>
        <filter id="{uid}-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18" /></filter>
      </defs>
      <g class="cp-word__all" filter="url(#{uid}-sh)">
        <!-- C -->
        <g class="cp-letter" style="--i: 0">
          <path d="M388.8 385.2 A186 186 0 1 1 388.8 126.8" fill="none" stroke="url(#{uid}-lime)" stroke-width="10" />
          <path d="M418.5 403.2 A220 220 0 1 1 418.5 108.8" fill="none" stroke="url(#{uid}-w)" stroke-width="62" />
          <ellipse class="cp-glint" style="--g: 0" cx="150" cy="120" rx="46" ry="14" transform="rotate(-38 150 120)" fill="#fff" />
        </g>
        <!-- e -->
        <g class="cp-letter" style="--i: 1">
          <circle class="cp-halo" cx="560" cy="340" r="58" fill="#c8f21c" filter="url(#{uid}-glow)" />
          <circle cx="560" cy="340" r="62" fill="none" stroke="url(#{uid}-lime)" stroke-width="8" />
          <path d="M617.4 421.9 A100 100 0 1 1 655.1 370.9" fill="none" stroke="url(#{uid}-w)" stroke-width="44" />
          <rect x="560" y="322" width="124" height="36" rx="4" fill="url(#{uid}-w)" />
          <circle class="cp-orb" cx="560" cy="340" r="40" fill="url(#{uid}-orb)" />
          <circle cx="546" cy="324" r="8" fill="#fff" fill-opacity="0.85" />
        </g>
        <g class="cp-letter" style="--i: 2">
          <circle class="cp-halo" cx="840" cy="340" r="58" fill="#c8f21c" filter="url(#{uid}-glow)" />
          <circle cx="840" cy="340" r="62" fill="none" stroke="url(#{uid}-lime)" stroke-width="8" />
          <path d="M897.4 421.9 A100 100 0 1 1 935.1 370.9" fill="none" stroke="url(#{uid}-w)" stroke-width="44" />
          <rect x="840" y="322" width="124" height="36" rx="4" fill="url(#{uid}-w)" />
          <circle class="cp-orb" cx="840" cy="340" r="40" fill="url(#{uid}-orb)" />
          <circle cx="826" cy="324" r="8" fill="#fff" fill-opacity="0.85" />
        </g>
        <!-- P -->
        <g class="cp-letter" style="--i: 3">
          <path d="M1094.6 68.1 A132 132 0 0 1 1094.6 331.9" fill="none" stroke="url(#{uid}-lime)" stroke-width="10" />
          <path d="M1022 30 H1090 A170 170 0 0 1 1090 370 H1022" fill="none" stroke="url(#{uid}-w)" stroke-width="62" />
          <rect x="985" y="0" width="74" height="513" rx="8" fill="url(#{uid}-w)" />
          <ellipse class="cp-glint" style="--g: 1" cx="1022" cy="90" rx="10" ry="52" fill="#fff" />
        </g>
        <!-- e e -->
        <g class="cp-letter" style="--i: 4">
          <circle class="cp-halo" cx="1405" cy="340" r="58" fill="#c8f21c" filter="url(#{uid}-glow)" />
          <circle cx="1405" cy="340" r="62" fill="none" stroke="url(#{uid}-lime)" stroke-width="8" />
          <path d="M1462.4 421.9 A100 100 0 1 1 1500.1 370.9" fill="none" stroke="url(#{uid}-w)" stroke-width="44" />
          <rect x="1405" y="322" width="124" height="36" rx="4" fill="url(#{uid}-w)" />
          <circle class="cp-orb" cx="1405" cy="340" r="40" fill="url(#{uid}-orb)" />
          <circle cx="1391" cy="324" r="8" fill="#fff" fill-opacity="0.85" />
        </g>
        <g class="cp-letter" style="--i: 5">
          <circle class="cp-halo" cx="1685" cy="340" r="58" fill="#c8f21c" filter="url(#{uid}-glow)" />
          <circle cx="1685" cy="340" r="62" fill="none" stroke="url(#{uid}-lime)" stroke-width="8" />
          <path d="M1742.4 421.9 A100 100 0 1 1 1780.1 370.9" fill="none" stroke="url(#{uid}-w)" stroke-width="44" />
          <rect x="1685" y="322" width="124" height="36" rx="4" fill="url(#{uid}-w)" />
          <circle class="cp-orb" cx="1685" cy="340" r="40" fill="url(#{uid}-orb)" />
          <circle cx="1671" cy="324" r="8" fill="#fff" fill-opacity="0.85" />
        </g>
      </g>
    </svg>
    <!-- WORDMARK-END -->
  {/if}
</span>

<style lang="scss">
  .cp-logo { display: inline-flex; align-items: center; gap: 0.6em; height: 2rem; }
  .cp-emblem { height: 100%; width: auto; overflow: visible; filter: drop-shadow(0 0 10px var(--accent-brand-soft, rgba(168, 85, 247, 0.16))); }
  .cp-word { height: 100%; width: auto; overflow: visible; }
  .cp-emblem__core { transform-origin: 50px 50px; }
  .cp-letter, .cp-orb, .cp-halo, .cp-glint { transform-box: fill-box; transform-origin: center; }
  .cp-halo { opacity: 0.35; }
  .cp-glint { opacity: 0; }
  .cp-logo--animated {
    .cp-emblem__core { animation: cpBreathe 3.2s ease-in-out infinite; }
    .cp-emblem__orbit { animation: cpOrbitIn 1s ease-out both; }
    .cp-word__all { animation: cpFloat 6s ease-in-out infinite; animation-delay: 1.2s; }
    .cp-letter { animation: cpPop 0.75s cubic-bezier(0.2, 0.9, 0.3, 1.3) both; animation-delay: calc(var(--i, 0) * 0.11s); }
    .cp-orb { animation: cpOrb 2.8s ease-in-out infinite; animation-delay: calc(var(--i, 0) * 0.3s); }
    .cp-halo { animation: cpHalo 2.8s ease-in-out infinite; animation-delay: calc(var(--i, 0) * 0.3s); }
    .cp-glint { animation: cpGlint 5.5s ease-in-out infinite; animation-delay: calc(1.4s + var(--g, 0) * 2.2s); }
  }
  @keyframes cpBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
  @keyframes cpOrbitIn { from { opacity: 0; transform: scale(0.6); transform-origin: 50px 50px; } to { opacity: 1; transform: scale(1); transform-origin: 50px 50px; } }
  @keyframes cpFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5%); } }
  @keyframes cpPop { from { opacity: 0; transform: scale(0.35) translateY(20%); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes cpOrb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.09); } }
  @keyframes cpHalo { 0%, 100% { opacity: 0.25; transform: scale(0.9); } 50% { opacity: 0.6; transform: scale(1.25); } }
  @keyframes cpGlint { 0%, 78%, 100% { opacity: 0; transform: translateX(-20%); } 84% { opacity: 0.95; } 90% { opacity: 0; transform: translateX(25%); } }
  @media (prefers-reduced-motion: reduce) { .cp-logo--animated * { animation: none !important; } .cp-glint { opacity: 0; } }
</style>
