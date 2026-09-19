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
  GIF and sticker picker for the composer. GIF search uses Tenor or Giphy
  when the front is configured with a key (GIF_PROVIDER / GIF_API_KEY);
  without one, paste any GIF link or upload a file. Stickers are big emoji,
  sent as a message of their own. The picked GIF is fetched and attached like
  any other file, so it lives in the workspace's own storage.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'

  const dispatch = createEventDispatcher<{ close: { kind: 'gif', file: File } | { kind: 'sticker', emoji: string } | { kind: 'upload' } | undefined }>()

  interface Gif { id: string, preview: string, url: string, title: string }
  const cfg = (typeof window !== 'undefined' ? (window as any).CEEPEE_GIF : undefined) as { provider?: string, key?: string } | undefined
  const provider = (cfg?.provider ?? 'tenor').toLowerCase()
  const key = cfg?.key ?? ''
  const canSearch = key !== ''

  let tab: 'gifs' | 'stickers' | 'link' = 'gifs'
  let q = ''
  let gifs: Gif[] = []
  let loading = false
  let err = ''
  let link = ''
  let timer: ReturnType<typeof setTimeout> | undefined

  async function search (term: string): Promise<void> {
    if (!canSearch) return
    loading = true
    err = ''
    try {
      if (provider === 'giphy') {
        const url = term.trim() === '' ? `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=30&rating=pg` : `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(term)}&limit=30&rating=pg`
        const j = await (await fetch(url)).json()
        gifs = (j.data ?? []).map((g: any) => ({ id: g.id, preview: g.images?.fixed_width_small?.url ?? g.images?.preview_gif?.url, url: g.images?.fixed_width?.url ?? g.images?.original?.url, title: g.title ?? '' }))
      } else {
        const base = term.trim() === '' ? 'https://tenor.googleapis.com/v2/featured' : 'https://tenor.googleapis.com/v2/search'
        const url = `${base}?key=${encodeURIComponent(key)}&client_key=ceepee&limit=30&media_filter=tinygif,gif&contentfilter=medium${term.trim() !== '' ? `&q=${encodeURIComponent(term)}` : ''}`
        const j = await (await fetch(url)).json()
        gifs = (j.results ?? []).map((g: any) => ({ id: g.id, preview: g.media_formats?.tinygif?.url, url: g.media_formats?.gif?.url ?? g.media_formats?.tinygif?.url, title: g.content_description ?? '' }))
      }
    } catch (e: any) {
      err = 'GIF search failed'
    } finally {
      loading = false
    }
  }
  function onInput (): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => { void search(q) }, 350)
  }
  onMount(() => { void search('') })

  async function pick (url: string, name: string): Promise<void> {
    loading = true
    err = ''
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(String(r.status))
      const blob = await r.blob()
      const type = blob.type !== '' ? blob.type : 'image/gif'
      dispatch('close', { kind: 'gif', file: new File([blob], name.endsWith('.gif') ? name : `${name}.gif`, { type }) })
    } catch (e: any) {
      err = 'That GIF could not be fetched (the site blocks cross-origin downloads). Try another, or download it and upload.'
    } finally {
      loading = false
    }
  }
  function useLink (): void {
    const u = link.trim()
    if (!/^https?:\/\//.test(u)) return
    void pick(u, 'gif')
  }

  const STICKERS = ['😂', '🤣', '😍', '🥰', '😎', '🤩', '🥳', '😭', '😤', '🤔', '🙄', '😴', '🤯', '🫡', '🫠', '🤝', '👍', '👎', '👏', '🙏', '💪', '🔥', '✨', '🎉', '🎯', '🚀', '💡', '✅', '❌', '⚡', '💯', '❤️', '💜', '🧡', '💛', '💚', '💙', '🖤', '🫶', '👀', '🍕', '☕', '🍻', '🎂', '🌈', '🌟', '🐱', '🐶', '🦄', '🐢', '🦊', '🐼', '🤖', '👾', '🎮', '🏆', '🥇', '📣', '🧠', '🛠️']
</script>

<div class="gif">
  <div class="gif__tabs">
    <button class="gif__tab" class:gif__tab--on={tab === 'gifs'} on:click={() => { tab = 'gifs' }}>GIFs</button>
    <button class="gif__tab" class:gif__tab--on={tab === 'stickers'} on:click={() => { tab = 'stickers' }}>Stickers</button>
    <button class="gif__tab" class:gif__tab--on={tab === 'link'} on:click={() => { tab = 'link' }}>From link</button>
    <span class="grow" />
    <button class="gif__tab" on:click={() => { dispatch('close', { kind: 'upload' }) }}>Upload</button>
  </div>
  {#if tab === 'gifs'}
    {#if canSearch}
      <input class="gif__search" placeholder="Search {provider === 'giphy' ? 'Giphy' : 'Tenor'}…" bind:value={q} on:input={onInput} />
      {#if err !== ''}<span class="gif__err">{err}</span>{/if}
      <div class="gif__grid">
        {#each gifs as g (g.id)}
          <button class="gif__cell" title={g.title} disabled={loading} on:click={() => { void pick(g.url, g.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'gif') }}><img src={g.preview} alt={g.title} loading="lazy" /></button>
        {/each}
      </div>
      {#if loading}<span class="gif__hint">Loading…</span>{/if}
      <span class="gif__hint">Powered by {provider === 'giphy' ? 'GIPHY' : 'Tenor'}. The GIF is copied into your workspace when you pick it.</span>
    {:else}
      <div class="gif__setup">
        <span class="gif__big">🎞️</span>
        <b>GIF search needs a free key</b>
        <span class="gif__hint">Get a Tenor key (Google Cloud, free) or a Giphy key, set <code>GIF_PROVIDER</code> and <code>GIF_API_KEY</code> on the front service, and this tab turns into search. Until then, paste a GIF link or upload one.</span>
        <div class="row"><button class="gif__btn" on:click={() => { tab = 'link' }}>Paste a link</button><button class="gif__btn" on:click={() => { dispatch('close', { kind: 'upload' }) }}>Upload a GIF</button></div>
      </div>
    {/if}
  {:else if tab === 'stickers'}
    <div class="gif__stickers">
      {#each STICKERS as s}<button class="gif__sticker" on:click={() => { dispatch('close', { kind: 'sticker', emoji: s }) }}>{s}</button>{/each}
    </div>
    <span class="gif__hint">Stickers send as a big emoji on its own.</span>
  {:else}
    <input class="gif__search" placeholder="https://media.giphy.com/…/giphy.gif" bind:value={link} on:keydown={(e) => { if (e.key === 'Enter') useLink() }} />
    {#if err !== ''}<span class="gif__err">{err}</span>{/if}
    <div class="row"><button class="gif__btn gif__btn--primary" disabled={loading} on:click={useLink}>{loading ? 'Fetching…' : 'Attach this GIF'}</button></div>
    <span class="gif__hint">Right-click any GIF on the web → Copy image address, paste it here.</span>
  {/if}
</div>

<style lang="scss">
  .gif { display: flex; flex-direction: column; gap: 0.5rem; width: min(26rem, 94vw); max-height: 70vh; padding: 0.7rem; border-radius: 1rem; background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); }
  .gif__tabs { display: flex; gap: 0.25rem; }
  .grow { flex: 1; }
  .gif__tab { padding: 0.25rem 0.7rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.78rem; cursor: pointer; &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .gif__search { padding: 0.45rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .gif__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; overflow: auto; max-height: 46vh; }
  .gif__cell { padding: 0; border: none; border-radius: 0.6rem; overflow: hidden; background: var(--theme-button-pressed); cursor: pointer; aspect-ratio: 1; img { width: 100%; height: 100%; object-fit: cover; display: block; } &:hover { outline: 2px solid var(--accent-brand); } &:disabled { opacity: 0.6; } }
  .gif__hint { font-size: 0.72rem; color: var(--theme-trans-color); }
  .gif__err { font-size: 0.75rem; color: var(--negative-button-default); }
  .gif__setup { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 0.8rem 0.4rem; text-align: center; color: var(--theme-content-color); b { color: var(--theme-caption-color); } code { font-size: 0.72rem; } }
  .gif__big { font-size: 2.2rem; }
  .row { display: flex; gap: 0.4rem; justify-content: center; }
  .gif__btn { padding: 0.35rem 0.8rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.78rem; cursor: pointer; &--primary { border-color: transparent; background-image: var(--accent-gradient); color: #fff; } &:disabled { opacity: 0.6; } }
  .gif__stickers { display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.15rem; max-height: 46vh; overflow: auto; }
  .gif__sticker { border: none; border-radius: 0.6rem; background: transparent; font-size: 1.65rem; line-height: 1; padding: 0.3rem 0; cursor: pointer; transition: transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1.4); &:hover { transform: scale(1.3); background: var(--theme-button-hovered); } }
</style>
