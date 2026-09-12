<!--
// Copyright © 2026 Hardcore Engineering Inc.
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
  Form builder. A form is a fixed set of fields that creates an issue in
  this project: pick the field types, mark what is required, map answers to
  issue attributes (title, priority, assignee, due date, labels, severity,
  risk…); everything unmapped lands in the description. Forms can be filled
  in the app (shareable link) or published on the public portal.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type FormField, type IssueForm, type Project, type RequestType } from '@hcengineering/tracker'
  import { Button, getCurrentLocation, IconAdd, Label, showPopup } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import tracker from '../../plugin'
  import FormFill from './FormFill.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const fq = createQuery()
  const pq = createQuery()
  const rq = createQuery()
  let forms: IssueForm[] = []
  let project: Project | undefined
  let requestTypes: RequestType[] = []
  $: fq.query(tracker.class.IssueForm, { space: currentSpace }, (r) => { forms = r }, { sort: { name: SortingOrder.Ascending } })
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: rq.query(tracker.class.RequestType, { space: currentSpace }, (r) => { requestTypes = r })
  const integrationsUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8095` : ''

  const TYPES: Array<{ id: FormField['type'], label: string }> = [
    { id: 'text', label: 'Short text' }, { id: 'textarea', label: 'Long text' }, { id: 'select', label: 'Dropdown' }, { id: 'multiselect', label: 'Multiple choice' },
    { id: 'number', label: 'Number' }, { id: 'date', label: 'Date' }, { id: 'email', label: 'Email' }, { id: 'checkbox', label: 'Checkbox' }, { id: 'url', label: 'Link' }
  ]
  const MAPS: Array<{ id: NonNullable<FormField['mapTo']> | '', label: string }> = [
    { id: '', label: 'into the description' }, { id: 'title', label: '→ title' }, { id: 'description', label: '→ description body' }, { id: 'priority', label: '→ priority' },
    { id: 'assignee', label: '→ assignee (name or email)' }, { id: 'dueDate', label: '→ due date' }, { id: 'labels', label: '→ labels' }, { id: 'estimation', label: '→ estimation (h)' },
    { id: 'severity', label: '→ severity (1-4)' }, { id: 'risk', label: '→ risk' }, { id: 'portalEmail', label: '→ requester email' }
  ]

  // ---- editor ---------------------------------------------------------------
  let editing: IssueForm | undefined | null = null
  let draft: { name: string, slug: string, description: string, fields: FormField[], requestType: Ref<RequestType> | '', isPublic: boolean, successText: string } = blank()
  function blank (): typeof draft {
    return { name: '', slug: '', description: '', fields: [{ key: 'title', label: 'Summary', type: 'text', required: true, mapTo: 'title' }, { key: 'details', label: 'Details', type: 'textarea', mapTo: 'description' }], requestType: '', isPublic: false, successText: '' }
  }
  const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  function edit (f?: IssueForm): void {
    editing = f
    draft = f === undefined ? blank() : { name: f.name, slug: f.slug, description: f.description ?? '', fields: f.fields.map((x) => ({ ...x, options: x.options !== undefined ? [...x.options] : undefined })), requestType: f.requestType ?? '', isPublic: f.public, successText: f.successText ?? '' }
  }
  function addField (): void {
    const n = draft.fields.length + 1
    draft.fields = [...draft.fields, { key: `field${n}`, label: `Field ${n}`, type: 'text' }]
  }
  function move (i: number, d: -1 | 1): void {
    const j = i + d
    if (j < 0 || j >= draft.fields.length) return
    const next = [...draft.fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    draft.fields = next
  }
  async function save (): Promise<void> {
    if (draft.name.trim() === '') return
    const slug = draft.slug.trim() !== '' ? slugify(draft.slug) : slugify(draft.name)
    const fields = draft.fields.map((f, k) => ({
      ...f,
      key: (f.key.trim() !== '' ? f.key.trim() : `field${k + 1}`).replace(/[^a-zA-Z0-9_]/g, '_'),
      label: f.label.trim() || `Field ${k + 1}`,
      options: f.type === 'select' || f.type === 'multiselect' ? (f.options ?? []).map((o) => o.trim()).filter((o) => o !== '') : undefined,
      mapTo: f.mapTo === undefined || (f.mapTo as string) === '' ? undefined : f.mapTo
    }))
    const data = { name: draft.name.trim(), slug, description: draft.description.trim() || undefined, fields, requestType: draft.requestType === '' ? null : draft.requestType, public: draft.isPublic, successText: draft.successText.trim() || undefined }
    if (editing === undefined) await client.createDoc(tracker.class.IssueForm, currentSpace, { ...data, submissions: 0 })
    else if (editing !== null) await client.update(editing, data)
    editing = null
  }
  async function remove (f: IssueForm): Promise<void> {
    if (!confirm(`Delete form "${f.name}"?`)) return
    await client.remove(f)
  }
  function open (f: IssueForm): void {
    showPopup(FormFill, { form: f }, 'top')
  }
  function link (f: IssueForm): string {
    const loc = getCurrentLocation()
    return `${window.location.origin}/workbench/${loc.path[1]}/tracker/${currentSpace}/forms?form=${f._id}`
  }
  function publicLink (f: IssueForm): string {
    const slug = project?.portal?.enabled === true && project.portal.slug !== '' ? `/${project.portal.slug}` : ''
    return `${integrationsUrl}/portal${slug}/form/${f.slug}`
  }
  let copied = ''
  async function copy (f: IssueForm, pub: boolean): Promise<void> {
    try {
      await navigator.clipboard.writeText(pub ? publicLink(f) : link(f))
      copied = f._id + (pub ? 'p' : '')
      setTimeout(() => { copied = '' }, 1500)
    } catch {}
  }
  onMount(() => {
    const id = getCurrentLocation().query?.form
    if (id != null) {
      const stop = setInterval(() => {
        const f = forms.find((x) => x._id === id)
        if (f !== undefined) {
          clearInterval(stop)
          open(f)
        }
      }, 200)
      setTimeout(() => { clearInterval(stop) }, 8000)
    }
  })
  const optionsText = (f: FormField): string => (f.options ?? []).join(', ')
</script>

<div class="fm">
  <header class="fm__head">
    <span class="fm__title"><Label label={tracker.string.Forms} /></span>
    <span class="muted">Fixed questions that create an issue here. Share the in-app link with the team, or publish on the portal for people without an account.</span>
    <span class="grow" />
    <Button kind={'primary'} icon={IconAdd} label={tracker.string.NewForm} on:click={() => { edit(undefined) }} />
  </header>

  {#if editing !== null}
    <section class="card card--edit motion-pop">
      <div class="row">
        <input class="input input--w" placeholder="Form name, e.g. Bug report, Access request" bind:value={draft.name} />
        <input class="input" placeholder="slug (public URL)" bind:value={draft.slug} />
        <select class="input" bind:value={draft.requestType}><option value="">no request type</option>{#each requestTypes as t (t._id)}<option value={t._id}>{t.name}</option>{/each}</select>
        <label class="check"><input type="checkbox" bind:checked={draft.isPublic} /> public on the portal</label>
      </div>
      <input class="input" placeholder="Intro text shown above the fields (optional)" bind:value={draft.description} />
      <div class="fields">
        {#each draft.fields as f, i (i)}
          <div class="fld motion-rise" style="--i: {i}">
            <span class="fld__n">{i + 1}</span>
            <input class="input" placeholder="Label" bind:value={f.label} />
            <select class="input" bind:value={f.type}>{#each TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}</select>
            {#if f.type === 'select' || f.type === 'multiselect'}<input class="input input--w" placeholder="Options, comma-separated" value={optionsText(f)} on:change={(e) => { f.options = e.currentTarget.value.split(',').map((o) => o.trim()).filter((o) => o !== '') }} />{/if}
            <select class="input" bind:value={f.mapTo}>{#each MAPS as m (m.id)}<option value={m.id === '' ? undefined : m.id}>{m.label}</option>{/each}</select>
            <label class="check"><input type="checkbox" bind:checked={f.required} /> required</label>
            <input class="input input--s" placeholder="placeholder" bind:value={f.placeholder} />
            <span class="fld__tools"><button class="mini" on:click={() => { move(i, -1) }}>↑</button><button class="mini" on:click={() => { move(i, 1) }}>↓</button><button class="mini mini--x" on:click={() => { draft.fields = draft.fields.filter((_, k) => k !== i) }}>×</button></span>
          </div>
        {/each}
        <button class="lnk" on:click={addField}>+ add field</button>
      </div>
      <input class="input" placeholder="Thank-you text after submitting (optional)" bind:value={draft.successText} />
      <div class="row row--end"><Button kind={'ghost'} label={tracker.string.Cancel} on:click={() => { editing = null }} /><Button kind={'primary'} label={tracker.string.Save} disabled={draft.name.trim() === '' || draft.fields.length === 0} on:click={() => { void save() }} /></div>
    </section>
  {/if}

  {#each forms as f, idx (f._id)}
    <section class="card motion-rise" style="--i: {idx}">
      <div class="card__main">
        <span class="card__name">{f.name}{#if f.public}<span class="pill">public</span>{/if}</span>
        <span class="muted">{f.fields.length} field{f.fields.length === 1 ? '' : 's'} · {f.submissions ?? 0} submission{(f.submissions ?? 0) === 1 ? '' : 's'}{f.requestType != null ? ` · ${requestTypes.find((t) => t._id === f.requestType)?.name ?? ''}` : ''}</span>
        <span class="muted fields-line">{f.fields.map((x) => x.label + (x.required ? '*' : '')).join(' · ')}</span>
      </div>
      <div class="card__tools">
        <Button kind={'primary'} label={tracker.string.OpenForm} on:click={() => { open(f) }} />
        <button class="lnk" on:click={() => { void copy(f, false) }}>{copied === f._id ? 'copied' : 'copy in-app link'}</button>
        {#if f.public}<button class="lnk" title={publicLink(f)} on:click={() => { void copy(f, true) }}>{copied === f._id + 'p' ? 'copied' : 'copy public link'}</button>{/if}
        <button class="lnk" on:click={() => { edit(f) }}>edit</button>
        <button class="lnk lnk--bad" on:click={() => { void remove(f) }}>delete</button>
      </div>
    </section>
  {/each}
  {#if forms.length === 0 && editing === null}<p class="muted">No forms yet.</p>{/if}
  {#if forms.some((f) => f.public) && project?.portal?.enabled !== true}<p class="muted">Public forms are served on this project's portal; switch it on under Service desk → Portal, or they use the default portal.</p>{/if}
</div>

<style lang="scss">
  .fm { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.25rem; max-width: 64rem; overflow: auto; }
  .fm__head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .fm__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .fields-line { font-size: 0.75rem; }
  .card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); &--edit { flex-direction: column; align-items: stretch; gap: 0.6rem; border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .card__main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .card__name { font-weight: 600; color: var(--theme-caption-color); }
  .card__tools { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; flex-wrap: wrap; }
  .pill { margin-left: 0.4rem; padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--accent-brand-soft); color: var(--theme-caption-color); }
  .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; &--end { justify-content: flex-end; } }
  .input { padding: 0.35rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; &--w { flex: 1; min-width: 12rem; } &--s { width: 9rem; } }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); white-space: nowrap; }
  .fields { display: flex; flex-direction: column; gap: 0.35rem; }
  .fld { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; padding: 0.35rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; }
  .fld__n { width: 1.2rem; font-size: 0.7rem; color: var(--theme-trans-color); }
  .fld__tools { display: flex; gap: 0.2rem; margin-left: auto; }
  .mini { width: 1.5rem; height: 1.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.3rem; background: transparent; color: var(--theme-dark-color); font: inherit; cursor: pointer; &--x:hover { color: var(--negative-button-default); } }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; text-align: left; &:hover { text-decoration: underline; } &--bad { color: var(--negative-button-default); } }
</style>
