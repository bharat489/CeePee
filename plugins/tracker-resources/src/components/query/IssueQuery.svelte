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
  Query: ask about issues in a small language (see parse.ts). Autocomplete
  offers fields, operators and real values from the workspace; errors are
  shown next to the results, never swallowed. Results can be saved as a
  named query for the sidebar of this screen.
-->
<script lang="ts">
  import activity from '@hcengineering/activity'
  import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import core, { getCurrentAccount, SortingOrder, type PersonId, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task from '@hcengineering/task'
  import { IssuePriority, type Component as TComponent, type Issue, type IssueStatus, type Milestone, type Project, type Resolution, type SavedQuery, type Sprint } from '@hcengineering/tracker'
  import { Label, showPanel, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount, tick } from 'svelte'

  import tracker from '../../plugin'
  import { compile, suggest, type Aux, type Change, type QueryContext, type Suggestion } from './parse'
  import Subscriptions from './Subscriptions.svelte'

  const client = getClient()
  const me = getCurrentEmployee()
  const mySocialIds = getCurrentAccount().socialIds

  // ---- reference data ----------------------------------------------------
  const q1 = createQuery()
  const q2 = createQuery()
  const q3 = createQuery()
  const q4 = createQuery()
  const q5 = createQuery()
  const q6 = createQuery()
  let statuses: IssueStatus[] = []
  let projects: Project[] = []
  let sprints: Sprint[] = []
  let milestones: Milestone[] = []
  let components: TComponent[] = []
  let resolutions: Resolution[] = []
  q1.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  q2.query(tracker.class.Project, {}, (r) => { projects = r })
  q3.query(tracker.class.Sprint, {}, (r) => { sprints = r })
  q4.query(tracker.class.Milestone, {}, (r) => { milestones = r })
  q5.query(tracker.class.Component, {}, (r) => { components = r })
  q6.query(tracker.class.Resolution, {}, (r) => { resolutions = r })

  let people: QueryContext['people'] = []
  let types: QueryContext['types'] = []
  let labels: string[] = []
  let refsLoaded = false
  async function loadRefs (): Promise<void> {
    if (refsLoaded) return
    const [persons, socials, taskTypes, tagElements] = await Promise.all([
      client.findAll(contact.class.Person, {}, { limit: 2000 }),
      client.findAll(contact.class.SocialIdentity, {}, { limit: 5000 }),
      client.findAll(task.class.TaskType, {}),
      client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }, { limit: 1000 })
    ])
    const byPerson = new Map<Ref<Person>, PersonId[]>()
    for (const s of socials) byPerson.set(s.attachedTo, [...(byPerson.get(s.attachedTo) ?? []), s._id])
    people = persons.map((p) => ({ _id: p._id, name: formatName(p.name), socialIds: byPerson.get(p._id) ?? [] }))
    types = Array.from(new Map(taskTypes.map((t) => [t.name, t])).values()).map((t) => ({ _id: t._id, name: t.name }))
    labels = Array.from(new Set(tagElements.map((t) => t.title))).sort()
    refsLoaded = true
  }
  onMount(() => {
    void loadRefs()
  })

  $: ctx = {
    me,
    mySocialIds,
    statuses: statuses.map((s) => ({ _id: s._id, name: s.name, category: s.category })),
    projects: projects.map((p) => ({ _id: p._id, name: p.name, identifier: p.identifier })),
    sprints: sprints.map((s) => ({ _id: s._id, name: s.name, state: s.state })),
    milestones: milestones.map((m) => ({ _id: m._id, label: m.label })),
    people,
    components: components.map((c) => ({ _id: c._id, label: c.label })),
    types,
    resolutions: resolutions.map((r) => ({ _id: r._id, name: r.name })),
    labels
  } satisfies QueryContext

  // ---- input + autocomplete -------------------------------------------------
  let input = ''
  let inputEl: HTMLInputElement | undefined
  let sugg: { replaceFrom: number, items: Suggestion[] } = { replaceFrom: 0, items: [] }
  let selected = 0
  let showSugg = false

  function refreshSuggestions (): void {
    const caret = inputEl?.selectionStart ?? input.length
    const head = input.slice(0, caret)
    sugg = suggest(head, ctx)
    selected = 0
    showSugg = sugg.items.length > 0
  }
  function accept (s: Suggestion): void {
    const caret = inputEl?.selectionStart ?? input.length
    const tail = input.slice(caret)
    input = input.slice(0, sugg.replaceFrom) + s.text + ' ' + tail.replace(/^\s+/, '')
    showSugg = false
    void tick().then(() => {
      const pos = sugg.replaceFrom + s.text.length + 1
      inputEl?.setSelectionRange(pos, pos)
      inputEl?.focus()
      refreshSuggestions()
    })
  }
  function onKey (e: KeyboardEvent): void {
    if (showSugg && sugg.items.length > 0) {
      if (e.key === 'ArrowDown') {
        selected = (selected + 1) % sugg.items.length
        e.preventDefault()
        return
      }
      if (e.key === 'ArrowUp') {
        selected = (selected - 1 + sugg.items.length) % sugg.items.length
        e.preventDefault()
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && e.ctrlKey === false && e.altKey === false && /[^\s]$/.test(input.slice(0, inputEl?.selectionStart ?? input.length)) && sugg.replaceFrom < (inputEl?.selectionStart ?? input.length))) {
        accept(sugg.items[selected])
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        showSugg = false
        e.preventDefault()
        return
      }
    }
    if (e.key === 'Enter') {
      showSugg = false
      void run()
      e.preventDefault()
    }
  }

  // ---- execution ---------------------------------------------------------
  let results: Issue[] = []
  let errors: string[] = []
  let ran = false
  let busy = false
  let truncated = false
  const LIMIT = 5000

  const examples = [
    'assignee = me AND status != done',
    'priority >= high AND updated < -7d',
    'sprint = active AND assignee is empty',
    'labels in (bug, regression) AND NOT status = done',
    'status changed to "In Progress" after -7d',
    'assignee was none before -1d ORDER BY priority'
  ]

  async function loadAux (issues: Issue[], needLabels: boolean, historyFields: Set<string>): Promise<Aux> {
    const aux: Aux = { labels: new Map(), history: new Map() }
    const ids = issues.map((i) => i._id)
    if (ids.length === 0) return aux
    if (needLabels) {
      const refs = await client.findAll(tags.class.TagReference, { attachedTo: { $in: ids } }, { limit: 20000 })
      for (const r of refs) {
        const set = aux.labels.get(r.attachedTo as Ref<Issue>) ?? new Set<string>()
        set.add(r.title.toLowerCase())
        aux.labels.set(r.attachedTo as Ref<Issue>, set)
      }
    }
    if (historyFields.size > 0) {
      const msgs = await client.findAll(
        activity.class.DocUpdateMessage,
        { objectClass: tracker.class.Issue, objectId: { $in: ids }, action: 'update' },
        { limit: 50000, sort: { createdOn: SortingOrder.Ascending } }
      )
      for (const m of msgs) {
        const u = m.attributeUpdates
        if (u === undefined || !historyFields.has(u.attrKey)) continue
        const c: Change = { field: u.attrKey, at: m.createdOn ?? m.modifiedOn, value: u.set[0] ?? null, by: m.createdBy }
        const id = m.objectId as Ref<Issue>
        aux.history.set(id, [...(aux.history.get(id) ?? []), c])
      }
    }
    return aux
  }

  async function run (): Promise<void> {
    const text = input.trim()
    if (text === '') return
    busy = true
    try {
      await loadRefs()
      const plan = compile(text, ctx)
      errors = plan.errors
      if (plan.clauses === 0 || plan.errors.length > 0) {
        results = []
        ran = true
        return
      }
      const candidates = await client.findAll(tracker.class.Issue, plan.query, { limit: LIMIT, sort: { modifiedOn: SortingOrder.Descending } })
      truncated = candidates.length >= LIMIT
      const aux = await loadAux(candidates, plan.needsLabels, plan.historyFields)
      let out = candidates.filter((i) => plan.test(i, aux))
      if (plan.order !== undefined) {
        const f = plan.order.field
        const key: keyof Issue | undefined =
          f === 'priority' ? 'priority' : f === 'created' ? 'createdOn' : f === 'updated' ? 'modifiedOn' : f === 'due' ? 'dueDate' : f === 'points' ? 'storyPoints' : f === 'estimate' ? 'estimation' : f === 'title' ? 'title' : f === 'key' ? 'number' : undefined
        if (key === undefined) errors = [...errors, `ORDER BY: cannot sort by "${f}"`]
        else {
          const dir = plan.order.desc ? -1 : 1
          out = [...out].sort((a, b) => {
            const av = (a[key] as any) ?? (key === 'priority' ? 99 : Number.MAX_SAFE_INTEGER)
            const bv = (b[key] as any) ?? (key === 'priority' ? 99 : Number.MAX_SAFE_INTEGER)
            return (av < bv ? -1 : av > bv ? 1 : 0) * dir
          })
        }
      }
      results = out
      ran = true
    } finally {
      busy = false
    }
  }

  // ---- saved queries: shared class; anything saved in this browser before is migrated once ----
  const savedQ = createQuery()
  let saved: SavedQuery[] = []
  savedQ.query(tracker.class.SavedQuery, {}, (r) => { saved = r.filter((x) => x.shared || x.owner === me).sort((a, b) => a.name.localeCompare(b.name)) })
  onMount(() => {
    try {
      const old = JSON.parse(localStorage.getItem('ceepee.savedQueries') ?? '[]') as Array<{ name: string, text: string }>
      if (old.length > 0) {
        void (async () => {
          for (const x of old) await client.createDoc(tracker.class.SavedQuery, core.space.Workspace, { name: x.name, text: x.text, owner: me, shared: false })
          localStorage.removeItem('ceepee.savedQueries')
        })()
      }
    } catch {}
  })
  async function saveQuery (): Promise<void> {
    const name = prompt('Name this query', input.slice(0, 40))
    if (name === null || name.trim() === '') return
    const existing = saved.find((x) => x.name === name.trim() && x.owner === me)
    if (existing !== undefined) await client.update(existing, { text: input })
    else await client.createDoc(tracker.class.SavedQuery, core.space.Workspace, { name: name.trim(), text: input, owner: me, shared: false })
  }
  async function removeSaved (x: SavedQuery): Promise<void> {
    await client.remove(x)
  }
  function subscribe (): void {
    showPopup(Subscriptions, { kind: 'query', query: input, name: input.slice(0, 50) }, 'top')
  }

  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))
  $: projectName = new Map(projects.map((p) => [p._id, p.identifier]))
  $: personName = new Map(people.map((p) => [p._id, p.name]))
  const prio: Record<IssuePriority, string> = {
    [IssuePriority.Urgent]: 'Urgent',
    [IssuePriority.High]: 'High',
    [IssuePriority.Medium]: 'Medium',
    [IssuePriority.Low]: 'Low',
    [IssuePriority.NoPriority]: ''
  }
  function open (issue: Issue): void {
    showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
  }
  function exportCsv (): void {
    const esc = (s: unknown): string => `"${String(s ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Key', 'Title', 'Status', 'Priority', 'Assignee', 'Project', 'Points', 'Estimate', 'Due', 'Updated'].map(esc).join(','),
      ...results.map((i) =>
        [i.identifier, i.title, statusName.get(i.status) ?? '', prio[i.priority], i.assignee != null ? personName.get(i.assignee) ?? '' : '', projectName.get(i.space) ?? '', i.storyPoints ?? '', i.estimation ?? '', i.dueDate != null ? new Date(i.dueDate).toISOString().slice(0, 10) : '', new Date(i.modifiedOn).toISOString()]
          .map(esc)
          .join(',')
      )
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'issues.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }
</script>

<div class="q">
  <aside class="q__side">
    <span class="q__side-title"><Label label={tracker.string.SavedQueries} /></span>
    {#if saved.length === 0}<span class="q__hint">—</span>{/if}
    {#each saved as s, idx (s._id)}
      <div class="saved motion-rise" style="--i: {idx}">
        <button
          class="saved__name"
          title={s.text}
          on:click={() => {
            input = s.text
            void run()
          }}
        >
          {s.name}
        </button>
        {#if s.owner === me}
          <button class="saved__x" title={s.shared ? 'Shared with everyone' : 'Only you see this'} on:click={() => { void client.update(s, { shared: !s.shared }) }}>{s.shared ? '👥' : '🔒'}</button>
          <button class="saved__x" title="Remove" on:click={() => { void removeSaved(s) }}>×</button>
        {:else}
          <span class="saved__x" title="Shared by a teammate">👥</span>
        {/if}
      </div>
    {/each}
  </aside>

  <div class="q__main">
    <header class="q__head">
      <span class="q__title"><Label label={tracker.string.Query} /></span>
      <span class="q__hint"><Label label={tracker.string.QueryHint} /></span>
      <span class="q__hint">functions: membersOf("Team") · linkedIssues(KEY-1) · subtasksOf(KEY-1) · issueHistory() · watchedIssues() · votedIssues() · openSprints() · releasedVersions() · componentsLeadByUser() · startOfWeek() · startOfDay(-3d) · endOfMonth()</span>
    </header>

    <div class="q__form">
      <div class="q__inputwrap">
        <input
          bind:this={inputEl}
          bind:value={input}
          class="q__input"
          type="text"
          placeholder="assignee = me AND (status != done OR priority = urgent)"
          autocomplete="off"
          spellcheck="false"
          on:input={refreshSuggestions}
          on:focus={refreshSuggestions}
          on:click={refreshSuggestions}
          on:keydown={onKey}
          on:blur={() => {
            setTimeout(() => {
              showSugg = false
            }, 150)
          }}
        />
        {#if showSugg}
          <ul class="sugg motion-pop">
            {#each sugg.items as s, i (s.text)}
              <li>
                <button
                  class="sugg__item"
                  class:sugg__item--selected={i === selected}
                  on:mousedown|preventDefault={() => {
                    accept(s)
                  }}
                >
                  <span>{s.text}</span>
                  {#if s.hint}<span class="sugg__hint">{s.hint}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <button
        class="q__go"
        disabled={busy || input.trim() === ''}
        on:click={() => {
          void run()
        }}
      >
        ↵
      </button>
      <button class="q__btn" disabled={input.trim() === ''} on:click={saveQuery}><Label label={tracker.string.SaveQuery} /></button>
      <button class="q__btn" disabled={input.trim() === ''} on:click={subscribe}><Label label={tracker.string.EmailSchedule} /></button>
      <button class="q__btn" disabled={results.length === 0} on:click={exportCsv}>CSV</button>
    </div>

    {#if !ran}
      <div class="q__examples">
        {#each examples as e, idx}
          <button
            class="chip motion-rise"
            style="--i: {idx}"
            on:click={() => {
              input = e
              void run()
            }}
          >
            {e}
          </button>
        {/each}
      </div>
    {/if}

    {#if errors.length > 0}
      <ul class="q__errors">
        {#each errors as e}<li>{e}</li>{/each}
      </ul>
    {/if}

    {#if ran && errors.length === 0}
      <div class="q__count">
        {results.length} <Label label={tracker.string.Issues} />{#if truncated} · <Label label={tracker.string.QueryTruncated} />{/if}
      </div>
      <div class="q__list">
        {#each results.slice(0, 500) as i, idx (i._id)}
          <button
            class="row motion-rise"
            style="--i: {Math.min(idx, 12)}"
            on:click={() => {
              open(i)
            }}
          >
            <span class="row__id">{i.identifier}</span>
            <span class="row__title">{i.title}</span>
            <span class="row__meta">{prio[i.priority]}</span>
            <span class="row__meta">{i.assignee != null ? personName.get(i.assignee) ?? '' : ''}</span>
            <span class="row__meta row__meta--status">{statusName.get(i.status) ?? ''}</span>
            <span class="row__meta">{projectName.get(i.space) ?? ''}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .q {
    display: grid;
    grid-template-columns: 12rem 1fr;
    gap: 1rem;
    padding: 1rem 1.25rem;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }
  .q__side {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-right: 0.75rem;
    border-right: 1px solid var(--theme-divider-color);
  }
  .q__side-title {
    margin-bottom: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-dark-color);
  }
  .saved {
    display: flex;
    align-items: center;
    border-radius: 0.375rem;
    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .saved__name {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .saved__x {
    border: none;
    background: transparent;
    color: var(--theme-trans-color);
    font: inherit;
    cursor: pointer;
    padding: 0 0.4rem;
    &:hover {
      color: var(--negative-button-default);
    }
  }
  .q__main {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }
  .q__head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .q__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .q__hint {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .q__form {
    display: flex;
    gap: 0.4rem;
    align-items: stretch;
  }
  .q__inputwrap {
    position: relative;
    flex: 1;
  }
  .q__input {
    width: 100%;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.6rem;
    background: var(--theme-panel-color);
    color: var(--theme-caption-color);
    font: inherit;
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.9375rem;
    outline: none;
    transition: var(--transition-interactive);
    &:focus {
      border-color: var(--accent-brand);
      box-shadow: 0 0 0 3px var(--accent-brand-soft);
    }
    &::placeholder {
      color: var(--theme-trans-color);
    }
  }
  .sugg {
    position: absolute;
    left: 0;
    top: calc(100% + 0.25rem);
    z-index: 20;
    margin: 0;
    padding: 0.25rem;
    min-width: 14rem;
    max-height: 16rem;
    overflow-y: auto;
    list-style: none;
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.5rem;
    box-shadow: var(--theme-popup-shadow);
  }
  .sugg__item {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.35rem 0.6rem;
    border: none;
    border-radius: 0.35rem;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    &--selected,
    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
    }
  }
  .sugg__hint {
    color: var(--theme-trans-color);
    font-family: inherit;
  }
  .q__go {
    width: 2.6rem;
    border: none;
    border-radius: 0.6rem;
    background-image: var(--accent-gradient);
    color: #fff;
    font: inherit;
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
  .q__btn {
    padding: 0 0.8rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.6rem;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    &:hover:not(:disabled) {
      background: var(--theme-button-hovered);
    }
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
  .q__examples {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 999px;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.75rem;
    cursor: pointer;
    transition: var(--transition-interactive);
    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
      border-color: var(--accent-brand);
    }
  }
  .q__errors {
    margin: 0;
    padding: 0.5rem 0.75rem 0.5rem 1.5rem;
    border: 1px solid var(--negative-button-default);
    border-radius: 0.5rem;
    color: var(--negative-button-default);
    font-size: 0.8125rem;
  }
  .q__count {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .q__list {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 5rem 1fr 4rem 8rem 7rem 4rem;
    align-items: baseline;
    gap: 0.75rem;
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: none;
    border-bottom: 1px solid var(--theme-divider-color);
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .row__id {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .row__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-caption-color);
  }
  .row__meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    &--status {
      color: var(--theme-content-color);
    }
  }
  @media (max-width: 900px) {
    .q {
      grid-template-columns: 1fr;
    }
    .q__side {
      border-right: none;
      border-bottom: 1px solid var(--theme-divider-color);
      padding: 0 0 0.5rem;
    }
    .row {
      grid-template-columns: 4rem 1fr 6rem;
      .row__meta:not(.row__meta--status) {
        display: none;
      }
    }
  }
</style>
