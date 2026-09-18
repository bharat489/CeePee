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
  Appearance. Pick a vibe (colour family), corners, motion, theme and text
  size. Everything applies live and is remembered on this device.
-->
<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import { getContext } from 'svelte'
  import { type Readable } from 'svelte/store'

  import tracker from '../../plugin'
  import { getCorners, getMotion, getVibe, setCorners, setMotion, setVibe, VIBES, type Corners, type Motion, type Vibe } from '../../vibe'

  const themeCtx = getContext<{ currentTheme: Readable<string>, setTheme: (t: string) => void } | undefined>('theme')
  const fontCtx = getContext<{ currentFontSize: Readable<string>, setFontSize: (f: string) => void } | undefined>('fontsize')
  let vibe: Vibe = getVibe()
  let corners: Corners = getCorners()
  let motion: Motion = getMotion()
  let theme = 'theme-system'
  let font = 'normal-font'
  themeCtx?.currentTheme.subscribe((t) => { theme = t })
  fontCtx?.currentFontSize.subscribe((f) => { font = f })

  function pickVibe (v: Vibe): void {
    vibe = v
    setVibe(v)
  }
  function pickCorners (c: Corners): void {
    corners = c
    setCorners(c)
  }
  function pickMotion (m: Motion): void {
    motion = m
    setMotion(m)
  }
  const THEMES = [{ id: 'theme-system', l: 'Match system' }, { id: 'theme-dark', l: 'Dark' }, { id: 'theme-light', l: 'Light' }]
  const FONTS = [{ id: 'normal-font', l: 'Comfortable' }, { id: 'small-font', l: 'Compact' }]
  const CORNERS: Array<{ id: Corners, l: string, hint: string }> = [{ id: 'rounded', l: 'Rounded', hint: 'soft corners everywhere' }, { id: 'pill', l: 'Pill', hint: 'fully round buttons' }, { id: 'sharp', l: 'Sharp', hint: 'tight, editorial' }]
  const MOTIONS: Array<{ id: Motion, l: string, hint: string }> = [{ id: 'full', l: 'Full', hint: 'lifts, rises, confetti on done' }, { id: 'reduced', l: 'Reduced', hint: 'cuts instead of animations' }]
</script>

<div class="hulyComponent">
  <div class="ap">
    <header class="ap__head">
      <span class="ap__title ceepee-gradient-text"><Label label={tracker.string.Appearance} /></span>
      <span class="muted">Make it yours. Changes apply instantly and stay on this device.</span>
    </header>

    <section class="card motion-rise" style="--i: 0">
      <span class="card__title"><Label label={tracker.string.Vibe} /></span>
      <div class="vibes">
        {#each VIBES as v (v.id)}
          <button class="vibe" class:vibe--on={vibe === v.id} on:click={() => { pickVibe(v.id) }}>
            <span class="vibe__swatch" style="background: linear-gradient(135deg, {v.colors[0]} 0%, {v.colors[1]} 55%, {v.colors[2]} 100%)">
              <span class="vibe__chip" style="background: {v.colors[2]}" />
            </span>
            <span class="vibe__name">{v.name}</span>
            <span class="vibe__tag">{v.tagline}</span>
          </button>
        {/each}
      </div>
    </section>

    <div class="two">
      <section class="card motion-rise" style="--i: 1">
        <span class="card__title">Corners</span>
        <div class="opts">{#each CORNERS as c (c.id)}<button class="opt" class:opt--on={corners === c.id} on:click={() => { pickCorners(c.id) }}><b>{c.l}</b><span>{c.hint}</span></button>{/each}</div>
      </section>
      <section class="card motion-rise" style="--i: 2">
        <span class="card__title">Motion</span>
        <div class="opts">{#each MOTIONS as m (m.id)}<button class="opt" class:opt--on={motion === m.id} on:click={() => { pickMotion(m.id) }}><b>{m.l}</b><span>{m.hint}</span></button>{/each}</div>
      </section>
      <section class="card motion-rise" style="--i: 3">
        <span class="card__title">Theme</span>
        <div class="opts">{#each THEMES as t (t.id)}<button class="opt" class:opt--on={theme === t.id} disabled={themeCtx === undefined} on:click={() => { themeCtx?.setTheme(t.id) }}><b>{t.l}</b></button>{/each}</div>
      </section>
      <section class="card motion-rise" style="--i: 4">
        <span class="card__title">Density</span>
        <div class="opts">{#each FONTS as f (f.id)}<button class="opt" class:opt--on={font === f.id} disabled={fontCtx === undefined} on:click={() => { fontCtx?.setFontSize(f.id) }}><b>{f.l}</b></button>{/each}</div>
      </section>
    </div>

    <section class="card card--preview motion-rise" style="--i: 5">
      <span class="card__title">Preview</span>
      <div class="pv">
        <span class="pv__btn">Primary action</span>
        <span class="pv__chip">selected</span>
        <span class="pv__ring" />
        <span class="pv__bar"><span class="pv__fill" /></span>
        <span class="pv__text ceepee-gradient-text">CeePee</span>
      </div>
      <p class="muted">Buttons, selection bars, focus rings, progress and titles all follow the vibe.</p>
    </section>
  </div>
</div>

<style lang="scss">
  .ap { display: flex; flex-direction: column; gap: 0.9rem; padding: 1rem 1.25rem; overflow: auto; }
  .ap__head { display: flex; flex-direction: column; gap: 0.2rem; }
  .ap__title { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); min-width: 0; &--preview { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.9rem; }
  .vibes { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.7rem; }
  .vibe { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem; border: 2px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; text-align: left; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; &:hover { transform: translateY(-2px); box-shadow: var(--card-lift-shadow); } &--on { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .vibe__swatch { position: relative; display: block; height: 4.2rem; border-radius: 0.6rem; }
  .vibe__chip { position: absolute; right: 0.5rem; bottom: 0.5rem; width: 1.1rem; height: 1.1rem; border-radius: 50%; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.6); }
  .vibe__name { font-weight: 700; color: var(--theme-caption-color); }
  .vibe__tag { font-size: 0.75rem; color: var(--theme-trans-color); }
  .opts { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .opt { display: flex; flex-direction: column; gap: 0.1rem; min-width: 7rem; padding: 0.5rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.7rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; text-align: left; cursor: pointer; b { color: var(--theme-caption-color); } span { font-size: 0.72rem; color: var(--theme-trans-color); } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); } &:disabled { opacity: 0.5; cursor: default; } }
  .pv { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.6rem 0; }
  .pv__btn { padding: 0.45rem 1rem; border-radius: 0.6rem; background-image: var(--accent-gradient); color: #fff; font-weight: 600; box-shadow: var(--accent-glow); }
  .pv__chip { padding: 0.15rem 0.6rem; border: 1px solid var(--accent-brand); border-radius: 999px; background: var(--accent-brand-soft); color: var(--theme-caption-color); font-size: 0.75rem; font-weight: 600; }
  .pv__ring { width: 2rem; height: 2rem; border-radius: 50%; background: var(--theme-button-pressed); box-shadow: 0 0 0 3px var(--accent-brand-ring); }
  .pv__bar { display: inline-block; width: 8rem; height: 0.5rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .pv__fill { display: block; width: 62%; height: 100%; background-image: var(--accent-gradient); }
  .pv__text { font-size: 1.5rem; font-weight: 900; letter-spacing: 0.08em; }
</style>
