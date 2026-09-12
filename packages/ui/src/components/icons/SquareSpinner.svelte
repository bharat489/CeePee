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
  Loading indicator: an open arc echoing the brand's C mark.

  Two motions run at once so the spinner reads as alive rather than
  mechanical: the whole ring rotates at a constant rate, while the arc
  itself lengthens and shortens. The offset periods (1.5s against 2s)
  mean the two never resolve into an obvious loop.

  The component name is unchanged so every existing call site keeps
  working; only the visual differs.
-->
<script lang="ts">
  export let size: 'small' | 'medium' | 'large' = 'medium'
</script>

<div
  class="spinner {size === 'small' ? 'size-small' : size === 'medium' ? 'size-medium' : 'size-large'}"
  role="progressbar"
  aria-label="Loading"
>
  <svg class="spinner__svg" viewBox="0 0 50 50" aria-hidden="true">
    <circle class="spinner__track" cx="25" cy="25" r="20" fill="none" />
    <circle class="spinner__arc" cx="25" cy="25" r="20" fill="none" stroke-linecap="round" />
  </svg>
</div>

<style lang="scss">
  .spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.1875rem;
    height: 2.1875rem;
  }
  .size-small {
    width: 1.75rem;
    height: 1.75rem;
  }
  .size-medium {
    width: 2.1875rem;
    height: 2.1875rem;
  }
  .size-large {
    width: 3.5rem;
    height: 3.5rem;
  }

  .spinner__svg {
    width: 100%;
    height: 100%;
    animation: spinnerRotate 1.5s linear infinite;
    transform-origin: center;
  }

  .spinner__track {
    stroke: var(--theme-divider-color, rgba(128, 128, 128, 0.22));
    stroke-width: 3.5;
  }

  .spinner__arc {
    // Brand chartreuse, overridable per surface. Deepened slightly from the
    // logo's lightest green so it still carries on a white background.
    stroke: var(--brand-accent-color, #c0f010);
    stroke-width: 3.5;
    stroke-dasharray: 1 126;
    // 2πr with r=20 is ~125.7, so the dash pattern is expressed against 126.
    animation: spinnerDash 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    filter: drop-shadow(0 0 5px rgba(192, 240, 16, 0.4));
  }

  @keyframes spinnerRotate {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes spinnerDash {
    0% {
      stroke-dasharray: 1 126;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 84 126;
      stroke-dashoffset: -30;
    }
    100% {
      stroke-dasharray: 84 126;
      stroke-dashoffset: -124;
    }
  }

  // Motion is decorative here; the arc still communicates "busy" without it.
  @media (prefers-reduced-motion: reduce) {
    .spinner__svg {
      animation: none;
    }
    .spinner__arc {
      animation: spinnerPulse 1.8s ease-in-out infinite;
      stroke-dasharray: 84 126;
      stroke-dashoffset: -30;
    }
    @keyframes spinnerPulse {
      0%,
      100% {
        opacity: 0.35;
      }
      50% {
        opacity: 1;
      }
    }
  }
</style>
