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
  Docs tab: the project's documents, kept in a Documents teamspace named after
  the project (created on first use). Lists the pages, opens them, and makes
  new ones from page templates (PRD, spec, meeting notes, decision record,
  postmortem…) whose structure is written into the page on creation. The
  Documents app shows the same space with its full tree.
-->
<script lang="ts">
  import core, { generateId, getCurrentAccount, makeCollabId, SortingOrder, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
  import { createMarkup, createQuery, DOC_TEMPLATES, docTemplateMarkup, getClient, type DocTemplate } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/task'
  import { type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'
  import { icon } from './icons'

  export let currentSpace: Ref<Project>

  // the Documents plugin, addressed by id so this page needs no build dependency on it
  const TEAMSPACE = 'document:class:Teamspace' as Ref<Class<Space>>
  const DOCUMENT = 'document:class:Document' as Ref<Class<Doc>>
  const TEAMSPACE_TYPE = 'document:spaceType:DefaultTeamspaceType'
  const NO_PARENT = 'document:ids:NoParent'

  const client = getClient()
  const pq = createQuery()
  const tq = createQuery()
  const dq = createQuery()
  let project: Project | undefined
  let spaces: Space[] = []
  let docs: Array<Doc & { title: string, modifiedOn: number, parent?: string }> = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  tq.query(TEAMSPACE, { archived: false }, (r) => { spaces = r })
  $: teamspace = project !== undefined ? spaces.find((s) => s.name.toLowerCase() === project?.name.toLowerCase() || s.name.toUpperCase() === project?.identifier) : undefined
  $: if (teamspace !== undefined) dq.query(DOCUMENT, { space: teamspace._id } as any, (r) => { docs = r as any }, { sort: { modifiedOn: SortingOrder.Descending }, limit: 200 })

  let busy = false
  async function createSpace (): Promise<void> {
    if (project === undefined) return
    busy = true
    try {
      await client.createDoc(TEAMSPACE, core.space.Space, { name: project.name, description: `Documents for ${project.name}`, private: project.private, members: project.members, owners: project.owners ?? [], archived: false, autoJoin: project.autoJoin, type: TEAMSPACE_TYPE } as any)
    } finally {
      busy = false
    }
  }

  // new page: pick a template, name it, create it with the template's structure already in place
  let picking = false
  let picked: DocTemplate = DOC_TEMPLATES[0]
  let title = ''
  let titleTouched = false
  let search = ''
  let creating = false
  let error = ''
  const CATEGORIES = ['All', 'Product', 'Engineering', 'Meetings', 'Team'] as const
  let category: (typeof CATEGORIES)[number] = 'All'
  $: shown = DOC_TEMPLATES.filter((t) => (category === 'All' || t.category === category) && (search.trim() === '' || `${t.name} ${t.tagline}`.toLowerCase().includes(search.trim().toLowerCase())))
  function choose (t: DocTemplate): void {
    picked = t
    if (!titleTouched) title = t.id === 'blank' ? '' : t.name
  }
  function openPicker (): void {
    picking = true
    error = ''
    title = ''
    titleTouched = false
    picked = DOC_TEMPLATES[0]
  }
  async function newDoc (): Promise<void> {
    if (teamspace === undefined || creating) return
    creating = true
    error = ''
    try {
      const id = generateId<Doc>()
      const markup = docTemplateMarkup(picked.id)
      const content = markup === null ? null : await createMarkup(makeCollabId(DOCUMENT, id, 'content'), markup)
      const name = title.trim() !== '' ? title.trim() : picked.id === 'blank' ? 'Untitled' : picked.name
      await client.createDoc(DOCUMENT, teamspace._id, { title: name, content, attachments: 0, embeddings: 0, labels: 0, comments: 0, references: 0, rank: makeRank(undefined, undefined), parent: NO_PARENT } as any, id)
      picking = false
      showPanel(view.component.EditDoc, id, DOCUMENT, 'content')
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      creating = false
    }
  }
  const open = (d: Doc): void => { showPanel(view.component.EditDoc, d._id, d._class, 'content') }
  const ago = (t: number): string => { const d = Math.floor((Date.now() - t) / 86_400_000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago` }
  const me = getCurrentAccount().uuid
  const emojiOf = (d: Doc & { title: string }): string => DOC_TEMPLATES.find((t) => t.id !== 'blank' && d.title.toLowerCase().startsWith(t.name.toLowerCase()))?.emoji ?? '📝'
</script>

<div class="pd">
  {#if teamspace === undefined}
    <div class="pd__empty motion-pop">
      <span class="pd__big">📄</span>
      <b>No docs space yet</b>
      <span class="muted">Specs, meeting notes, runbooks and decisions live next to the work. One click creates a Documents space named "{project?.name ?? ''}" with the same members.</span>
      <Button kind={'primary'} icon={IconAdd} label={tracker.string.CreateDocsSpace} loading={busy} on:click={() => { void createSpace() }} />
    </div>
  {:else}
    <header class="pd__head">
      <span class="pd__title">{teamspace.name}</span>
      <span class="muted">{docs.length} page{docs.length === 1 ? '' : 's'}{teamspace.members.includes(me) ? '' : ' · you are not a member of this space'}</span>
      <span class="grow" />
      <Button kind={'primary'} icon={IconAdd} label={tracker.string.NewPage} on:click={openPicker} />
    </header>

    {#if picking}
      <section class="picker motion-pop">
        <div class="picker__head">
          <b>New page</b>
          <span class="muted">Pick a template. The structure is written into the page; edit anything afterwards.</span>
          <span class="grow" />
          <button class="x" title="Close" on:click={() => { picking = false }}>{@html icon('close')}</button>
        </div>
        <div class="picker__tools">
          <label class="search">{@html icon('filter')}<input placeholder="Search templates" bind:value={search} /></label>
          <div class="cats">{#each CATEGORIES as c}<button class="cat" class:cat--on={category === c} on:click={() => { category = c }}>{c}</button>{/each}</div>
        </div>
        <div class="picker__grid">
          {#each shown as t, k (t.id)}
            <button class="tpl motion-rise" style="--i: {k}" class:tpl--on={picked.id === t.id} on:click={() => { choose(t) }} on:dblclick={() => { void newDoc() }}>
              <span class="tpl__emoji">{t.emoji}</span>
              <span class="tpl__name">{t.name}</span>
              <span class="tpl__tag">{t.tagline}</span>
              <span class="tpl__cat">{t.category}</span>
            </button>
          {/each}
          {#if shown.length === 0}<p class="muted">No template matches “{search}”.</p>{/if}
        </div>
        <div class="picker__form">
          <label class="field"><span>Page title</span><input class="input" placeholder={picked.id === 'blank' ? 'Untitled' : picked.name} bind:value={title} on:input={() => { titleTouched = true }} on:keydown={(e) => { if (e.key === 'Enter') void newDoc() }} /></label>
          <Button kind={'primary'} label={tracker.string.NewPage} loading={creating} on:click={() => { void newDoc() }} />
          <Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { picking = false }} />
        </div>
        {#if error !== ''}<p class="err">{error}</p>{/if}
      </section>
    {/if}

    {#if docs.length > 0}
      <div class="pd__list">
        {#each docs as d, k (d._id)}
          <button class="pd__row motion-rise" style="--i: {Math.min(k, 12)}" on:click={() => { open(d) }}><span class="pd__ic">{emojiOf(d)}</span><span class="pd__name">{d.title}</span><span class="muted">{ago(d.modifiedOn)}</span></button>
        {/each}
      </div>
    {:else if !picking}
      <div class="pd__none motion-pop">
        <span class="muted">No pages yet. Start from a template:</span>
        <div class="quick">
          {#each DOC_TEMPLATES.slice(1, 6) as t (t.id)}
            <button class="quick__b" on:click={() => { openPicker(); choose(t) }}><span>{t.emoji}</span>{t.name}</button>
          {/each}
          <button class="quick__b quick__b--more" on:click={openPicker}>All templates</button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style lang="scss">
  .pd { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.25rem; overflow: auto; }
  .pd__empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; max-width: 30rem; margin: 3rem auto; padding: 1.5rem; border: 1px dashed var(--accent-brand); border-radius: 1rem; text-align: center; color: var(--theme-content-color); b { color: var(--theme-caption-color); font-size: 1.05rem; } }
  .pd__big { font-size: 2.2rem; }
  .pd__head { display: flex; align-items: center; gap: 0.6rem; }
  .pd__title { font-weight: 700; color: var(--theme-caption-color); }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.78rem; color: var(--theme-trans-color); }
  .pd__list { display: flex; flex-direction: column; gap: 0.2rem; }
  .pd__row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .pd__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pd__none { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem; border: 1px dashed var(--theme-divider-color); border-radius: 0.8rem; }
  .quick { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .quick__b { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8rem; cursor: pointer; &:hover { border-color: var(--accent-brand); } &--more { color: var(--accent-brand); font-weight: 600; } }

  .picker { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); }
  .picker__head { display: flex; align-items: center; gap: 0.6rem; b { color: var(--theme-caption-color); } }
  .x { display: inline-flex; padding: 0.3rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--theme-dark-color); cursor: pointer; &:hover { background: var(--theme-button-hovered); } :global(svg) { width: 1rem; height: 1rem; } }
  .picker__tools { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .search { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-dark-color); min-width: 14rem; :global(svg) { width: 0.9rem; height: 0.9rem; } input { flex: 1; border: none; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.85rem; outline: none; } }
  .cats { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .cat { padding: 0.3rem 0.65rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--on { background: var(--accent-brand-soft); color: var(--accent-brand); font-weight: 600; } }
  .picker__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr)); gap: 0.6rem; }
  .tpl { display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; padding: 0.8rem 0.85rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; text-align: left; cursor: pointer; transition: border-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
    &:hover { transform: translateY(-2px); box-shadow: var(--accent-glow); }
    &--on { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .tpl__emoji { font-size: 1.4rem; }
  .tpl__name { font-weight: 600; color: var(--theme-caption-color); font-size: 0.875rem; }
  .tpl__tag { font-size: 0.74rem; color: var(--theme-dark-color); line-height: 1.4; }
  .tpl__cat { margin-top: 0.25rem; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-trans-color); }
  .picker__form { display: flex; align-items: flex-end; gap: 0.6rem; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 14rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--theme-dark-color); }
  .input { padding: 0.5rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.9375rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .err { margin: 0; font-size: 0.8125rem; color: var(--negative-button-default); }
</style>
