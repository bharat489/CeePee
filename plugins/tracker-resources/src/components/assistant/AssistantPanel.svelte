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
  Ask CeePee: the sidebar assistant. A greeting, suggested questions, a
  conversation, and a composer that understands @people, #channels, issue keys
  and / actions. Answers are real, clickable work items. No key required; a
  local model can be plugged in for free-form questions.
-->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount, tick } from 'svelte'

  import { answer, COMMANDS, firstName, loadCtx, peopleMatching, SUGGESTIONS, type Answer, type Ctx } from './engine'

  // sidebar widget props (unused but passed by the workbench)
  export let tab: unknown = undefined
  export let widgetState: unknown = undefined
  export let height: string | undefined = undefined
  export let width: string | undefined = undefined
  export let widget: unknown = undefined

  const client = getClient()
  let ctx: Ctx | undefined
  let name = ''
  interface Turn { q: string, a?: Answer, error?: string, at: number }
  let turns: Turn[] = []
  let input = ''
  let busy = false
  let inputEl: HTMLTextAreaElement | undefined
  let listEl: HTMLDivElement | undefined
  let copied = -1
  const hasModel = typeof window !== 'undefined' && (window as any).CEEPEE_AI?.url !== undefined && (window as any).CEEPEE_AI?.url !== ''

  onMount(async () => {
    ctx = await loadCtx(client, getCurrentEmployee())
    name = firstName(ctx.meName)
    await tick()
    inputEl?.focus()
  })

  async function ask (q: string): Promise<void> {
    const text = q.trim()
    if (text === '' || ctx === undefined || busy) return
    input = ''
    suggest = []
    const turn: Turn = { q: text, at: Date.now() }
    turns = [...turns, turn]
    busy = true
    try {
      ctx = await loadCtx(client, getCurrentEmployee())
      turn.a = await answer(ctx, text)
    } catch (e: any) {
      turn.error = String(e?.message ?? e)
    } finally {
      busy = false
      turns = turns
      await tick()
      listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' })
      inputEl?.focus()
    }
  }
  function open (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  async function copy (text: string, idx: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copied = idx
      setTimeout(() => { copied = -1 }, 1500)
    } catch {}
  }
  async function runAction (a: { label: string, run: () => Promise<string> }, idx: number): Promise<void> {
    const note = await a.run()
    turns[idx].a = { ...(turns[idx].a as Answer), note }
    turns = turns
  }

  // ---- @ and / suggestions --------------------------------------------------------------------
  let suggest: Array<{ label: string, insert: string, hint?: string }> = []
  function onInput (): void {
    const caret = inputEl?.selectionStart ?? input.length
    const before = input.slice(0, caret)
    const at = /(?:^|\s)@([\p{L}.'-]*)$/u.exec(before)
    const slash = /^\/([a-z]*)$/i.exec(before)
    if (at !== null && ctx !== undefined) {
      suggest = peopleMatching(ctx, at[1]).map((e) => ({ label: e.name.includes(',') ? e.name.split(',').reverse().join(' ').trim() : e.name, insert: '@' + (e.name.includes(',') ? e.name.split(',').reverse().join(' ').trim() : e.name) + ' ' }))
    } else if (slash !== null) {
      suggest = COMMANDS.filter((c) => c.cmd.startsWith('/' + slash[1].toLowerCase())).map((c) => ({ label: c.cmd, insert: c.cmd + ' ', hint: c.hint }))
    } else suggest = []
  }
  function pick (s: { insert: string }): void {
    const caret = inputEl?.selectionStart ?? input.length
    const before = input.slice(0, caret).replace(/(?:^|\s)@[\p{L}.'-]*$/u, (m) => (m.startsWith(' ') ? ' ' : '')).replace(/^\/[a-z]*$/i, '')
    input = before + s.insert + input.slice(caret)
    suggest = []
    inputEl?.focus()
  }
  function onKey (e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (suggest.length > 0) pick(suggest[0])
      else void ask(input)
    }
    if (e.key === 'Escape') suggest = []
  }
  const fmt = (t: number): string => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const _unused = [tab, widgetState, height, width, widget]
</script>

<div class="as">
  <div class="as__list" bind:this={listEl}>
    {#if turns.length === 0}
      <div class="as__hero">
        <span class="as__orb"><span class="as__orb-core" /></span>
        <h2 class="as__h">How can I help{name !== '' ? `, ${name}` : ''}?</h2>
        <div class="as__sugg">
          {#each SUGGESTIONS as s, k (s.prompt)}
            <button class="as__chip motion-rise" style="--i: {k}" on:click={() => { void ask(s.prompt) }}><span class="as__chip-ic">💬</span>{s.label}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#each turns as t, idx (t.at)}
      <div class="turn turn--q motion-rise"><span class="turn__q">{t.q}</span><span class="turn__t">{fmt(t.at)}</span></div>
      {#if t.a === undefined && t.error === undefined}
        <div class="turn turn--a"><span class="think"><i /><i /><i /></span></div>
      {:else if t.error !== undefined}
        <div class="turn turn--a"><b class="turn__title">Something went wrong</b><p class="turn__text">{t.error}</p></div>
      {:else if t.a !== undefined}
        <div class="turn turn--a motion-rise">
          <div class="turn__head"><b class="turn__title">{t.a.title}</b><span class="turn__src" class:turn__src--ai={t.a.source === 'ai'}>{t.a.source === 'ai' ? 'model' : 'from your data'}</span></div>
          {#if t.a.text}<p class="turn__text">{t.a.text}</p>{/if}
          {#if t.a.issues && t.a.issues.length > 0}
            <div class="rows">{#each t.a.issues as i (i._id)}<button class="row" on:click={() => { open(i) }}><span class="row__id">{i.identifier}</span><span class="row__title">{i.title}</span></button>{/each}</div>
          {/if}
          {#if t.a.groups}
            {#each t.a.groups as g (g.label)}
              <div class="grp"><span class="grp__l">{g.label}</span>{#each g.issues as i (i._id)}<button class="row" on:click={() => { open(i) }}><span class="row__id">{i.identifier}</span><span class="row__title">{i.title}</span></button>{/each}{#if g.issues.length === 0}<span class="muted">—</span>{/if}</div>
            {/each}
          {/if}
          <div class="turn__tools">
            {#if t.a.copyText}<button class="tool" on:click={() => { void copy(t.a?.copyText ?? '', idx) }}>{copied === idx ? 'copied ✓' : 'copy'}</button>{/if}
            {#if t.a.actions}{#each t.a.actions as a (a.label)}<button class="tool tool--go" on:click={() => { void runAction(a, idx) }}>{a.label}</button>{/each}{/if}
          </div>
          {#if t.a.note}<span class="turn__note">{t.a.note}</span>{/if}
        </div>
      {/if}
    {/each}
  </div>

  <div class="as__composer">
    {#if suggest.length > 0}
      <div class="as__menu">{#each suggest as s (s.insert)}<button class="as__menu-item" on:click={() => { pick(s) }}><b>{s.label}</b>{#if s.hint}<span>{s.hint}</span>{/if}</button>{/each}</div>
    {/if}
    <div class="as__box">
      <textarea class="as__input" rows="2" placeholder="Ask, @mention, or / for actions" bind:this={inputEl} bind:value={input} on:input={onInput} on:keydown={onKey} />
      <div class="as__bar">
        <span class="as__mode" title={hasModel ? 'Intents first, then your model' : 'Answers come from workspace queries; connect a local model to answer anything'}>{hasModel ? '✦ Auto' : '✦ Local'}</span>
        <span class="grow" />
        <button class="as__send" disabled={busy || input.trim() === ''} on:click={() => { void ask(input) }} title="Send">➤</button>
      </div>
    </div>
    <span class="as__foot">Answers come from your workspace. Verify before acting.</span>
  </div>
</div>

<style lang="scss">
  .as { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--theme-panel-color); }
  .as__list { flex: 1; min-height: 0; overflow: auto; padding: 0.75rem 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .as__hero { display: flex; flex-direction: column; align-items: center; gap: 0.8rem; padding: 2.5rem 0.5rem 1.5rem; text-align: center; }
  .as__orb { position: relative; width: 4.2rem; height: 4.2rem; border-radius: 50%; background: var(--accent-gradient); box-shadow: var(--accent-glow-strong); animation: asBreathe 3.4s ease-in-out infinite; }
  .as__orb-core { position: absolute; inset: 1.1rem; border-radius: 50%; background: #fff; opacity: 0.92; }
  .as__h { margin: 0; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em; color: var(--theme-caption-color); }
  .as__sugg { display: flex; flex-direction: column; gap: 0.35rem; width: 100%; max-width: 22rem; }
  .as__chip { display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.8rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease; &:hover { transform: translateX(3px); border-color: var(--accent-brand); } }
  .as__chip-ic { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 0.4rem; background: var(--accent-brand-soft); font-size: 0.8rem; }
  .turn { display: flex; flex-direction: column; gap: 0.3rem; max-width: 100%; }
  .turn--q { align-self: flex-end; align-items: flex-end; max-width: 85%; padding: 0.45rem 0.7rem; border-radius: 1rem 1rem 0.25rem 1rem; background: var(--chat-out, var(--accent-brand-soft)); }
  .turn__q { font-size: 0.85rem; color: var(--theme-caption-color); white-space: pre-wrap; }
  .turn__t { font-size: 0.6rem; opacity: 0.6; }
  .turn--a { align-self: stretch; padding: 0.6rem 0.75rem; border-radius: 0.25rem 1rem 1rem 1rem; border: 1px solid var(--theme-divider-color); background: var(--theme-bg-color); }
  .turn__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .turn__title { color: var(--theme-caption-color); font-size: 0.9rem; }
  .turn__src { font-size: 0.6rem; padding: 0.05rem 0.4rem; border-radius: 999px; background: var(--accent-brand-soft); color: var(--theme-dark-color); white-space: nowrap; &--ai { background: color-mix(in srgb, var(--primary-button-default) 25%, transparent); } }
  .turn__text { margin: 0; font-size: 0.8125rem; line-height: 1.5; color: var(--theme-content-color); white-space: pre-wrap; }
  .turn__tools { display: flex; gap: 0.3rem; }
  .tool { padding: 0.15rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.7rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--go { border-color: var(--accent-brand); } }
  .turn__note { font-size: 0.68rem; color: var(--theme-trans-color); }
  .rows { display: flex; flex-direction: column; }
  .row { display: flex; align-items: baseline; gap: 0.4rem; width: 100%; padding: 0.25rem 0.3rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); } }
  .row__id { flex-shrink: 0; font-size: 0.68rem; font-weight: 600; color: var(--accent-brand-ink); }
  .row__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grp { display: flex; flex-direction: column; margin-top: 0.3rem; }
  .grp__l { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); margin-bottom: 0.1rem; }
  .muted { font-size: 0.75rem; color: var(--theme-trans-color); }
  .think { display: inline-flex; gap: 0.25rem; padding: 0.2rem 0; i { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--accent-brand); animation: asDots 1s ease-in-out infinite; &:nth-child(2) { animation-delay: 0.15s; } &:nth-child(3) { animation-delay: 0.3s; } } }
  .as__composer { position: relative; display: flex; flex-direction: column; gap: 0.3rem; padding: 0.5rem 0.75rem 0.6rem; border-top: 1px solid var(--theme-divider-color); }
  .as__menu { position: absolute; left: 0.75rem; right: 0.75rem; bottom: calc(100% - 0.2rem); display: flex; flex-direction: column; padding: 0.3rem; border-radius: 0.7rem; background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); z-index: 2; }
  .as__menu-item { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.35rem 0.5rem; border: none; border-radius: 0.5rem; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.8rem; text-align: left; cursor: pointer; span { font-size: 0.7rem; color: var(--theme-trans-color); } &:hover { background: var(--theme-button-hovered); } }
  .as__box { display: flex; flex-direction: column; border: 1px solid var(--theme-divider-color); border-radius: 1rem; background: var(--theme-bg-color); transition: box-shadow 0.15s ease, border-color 0.15s ease; &:focus-within { border-color: var(--accent-brand-ring); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .as__input { border: none; background: transparent; padding: 0.55rem 0.75rem 0.2rem; color: var(--theme-caption-color); font: inherit; font-size: 0.85rem; resize: none; outline: none; }
  .as__bar { display: flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.5rem 0.45rem 0.75rem; }
  .as__mode { font-size: 0.7rem; font-weight: 600; color: var(--accent-brand-ink); }
  .grow { flex: 1; }
  .as__send { width: 2rem; height: 2rem; border: none; border-radius: 50%; background-image: var(--accent-gradient); color: #fff; font-size: 0.85rem; cursor: pointer; box-shadow: var(--accent-glow); &:disabled { background-image: none; background: var(--theme-button-pressed); color: var(--theme-trans-color); box-shadow: none; cursor: default; } }
  .as__foot { font-size: 0.65rem; color: var(--theme-trans-color); text-align: center; }
  @keyframes asBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
  @keyframes asDots { 0%, 100% { transform: translateY(0); opacity: 0.5; } 50% { transform: translateY(-4px); opacity: 1; } }
</style>
