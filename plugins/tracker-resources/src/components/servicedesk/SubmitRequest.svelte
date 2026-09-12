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
  Submit a request: the customer-facing form. Pick what kind of help, say
  what happened; while typing, matching knowledge-base documents appear so
  the answer may already exist. Works for guests invited to the workspace,
  which is how an internal service desk reaches its customers here.
-->
<script lang="ts">
  import { type Class, type Doc, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type Project, type RequestType } from '@hcengineering/tracker'
  import { Button, Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'
  import { createIssueDoc } from '../../createIssueDoc'

  const client = getClient()
  const pq = createQuery()
  const tq = createQuery()
  let projects: Project[] = []
  let types: RequestType[] = []
  pq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  tq.query(tracker.class.RequestType, {}, (r) => { types = r })
  $: withTypes = projects.filter((p) => types.some((t) => t.space === p._id))
  let projectId: Ref<Project> | undefined
  $: if (projectId === undefined && withTypes.length > 0) projectId = withTypes[0]._id
  $: project = withTypes.find((p) => p._id === projectId)
  $: projectTypes = types.filter((t) => t.space === projectId)
  let typeId: Ref<RequestType> | undefined
  $: if ((typeId === undefined || !projectTypes.some((t) => t._id === typeId)) && projectTypes.length > 0) typeId = projectTypes[0]._id
  $: type = projectTypes.find((t) => t._id === typeId)

  let title = ''
  let body = ''
  let busy = false
  let created: Ref<Issue> | undefined
  let createdKey = ''

  // ---- knowledge base suggestions -------------------------------------------
  const DOC_CLASS = 'document:class:Document' as Ref<Class<Doc>>
  let suggestions: Array<{ _id: Ref<Doc>, title: string }> = []
  let timer: ReturnType<typeof setTimeout> | undefined
  function suggest (text: string): void {
    if (timer !== undefined) clearTimeout(timer)
    const words = text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 4).slice(0, 4)
    if (words.length === 0) {
      suggestions = []
      return
    }
    timer = setTimeout(async () => {
      try {
        const found = new Map<Ref<Doc>, { _id: Ref<Doc>, title: string }>()
        for (const w of words) {
          const docs = await client.findAll(DOC_CLASS, { title: { $like: `%${w}%` } } as any, { limit: 5 })
          for (const d of docs) found.set(d._id, { _id: d._id, title: (d as any).title ?? '' })
        }
        suggestions = Array.from(found.values()).slice(0, 5)
      } catch {
        suggestions = []
      }
    }, 350)
  }
  $: suggest(title)

  async function submit (): Promise<void> {
    if (project === undefined || type === undefined || title.trim() === '') return
    busy = true
    try {
      const ptype = await client.findOne(task.class.ProjectType, { _id: project.type })
      const taskTypes = ptype !== undefined ? await client.findAll(task.class.TaskType, { _id: { $in: ptype.tasks } }) : []
      const issueType = taskTypes.find((t) => t.name === 'Issue') ?? taskTypes[0]
      const status = project.defaultIssueStatus ?? (issueType.statuses[0] as Issue['status'])
      const id = await createIssueDoc(project, {
        title: title.trim(),
        status,
        kind: issueType._id,
        priority: type.priority,
        requestType: type._id,
        slaDue: type.slaHours !== undefined && type.slaHours > 0 ? Date.now() + type.slaHours * 3_600_000 : null
      }, body)
      const doc = await client.findOne(tracker.class.Issue, { _id: id })
      created = id
      createdKey = doc?.identifier ?? ''
      title = ''
      body = ''
    } finally {
      busy = false
    }
  }
</script>

<div class="req">
  <header class="req__head">
    <span class="req__title"><Label label={tracker.string.SubmitRequest} /></span>
    <span class="req__sub"><Label label={tracker.string.SubmitRequestHint} /></span>
  </header>

  {#if withTypes.length === 0}
    <p class="muted">No project offers request types yet. A project maintainer adds them under Service desk → Request types.</p>
  {:else if created !== undefined}
    <section class="card motion-pop">
      <span class="card__title">Request {createdKey} submitted</span>
      <p class="muted">You will be notified as it progresses. When it is resolved you can rate how it went.</p>
      <div class="actions">
        <Button kind={'ghost'} label={tracker.string.OpenIssue} on:click={() => { if (created !== undefined) showPanel(view.component.EditDoc, created, tracker.class.Issue, 'content') }} />
        <Button kind={'primary'} label={tracker.string.SubmitAnother} on:click={() => { created = undefined }} />
      </div>
    </section>
  {:else}
    <section class="card motion-rise">
      {#if withTypes.length > 1}
        <label class="field"><span>Where</span><select class="input" bind:value={projectId}>{#each withTypes as p (p._id)}<option value={p._id}>{p.name}</option>{/each}</select></label>
      {/if}
      <div class="types">
        {#each projectTypes as t (t._id)}
          <button class="typecard" class:typecard--on={typeId === t._id} on:click={() => { typeId = t._id }}>
            <span class="typecard__name">{t.name}</span>
            {#if t.description}<span class="typecard__desc">{t.description}</span>{/if}
            {#if t.slaHours}<span class="typecard__sla">response within {t.slaHours}h</span>{/if}
          </button>
        {/each}
      </div>
      <label class="field"><span>What happened</span><input class="input" placeholder="One line" bind:value={title} /></label>
      {#if suggestions.length > 0}
        <div class="kb motion-pop">
          <span class="kb__title">This might already be answered</span>
          {#each suggestions as s (s._id)}
            <button class="kb__item" on:click={() => { showPanel(view.component.EditDoc, s._id, DOC_CLASS, 'content') }}>📄 {s.title}</button>
          {/each}
        </div>
      {/if}
      <label class="field"><span>Details</span><textarea class="input input--area" placeholder="Steps, what you expected, what you saw" bind:value={body} /></label>
      <div class="actions"><Button kind={'primary'} label={tracker.string.SubmitRequest} disabled={busy || title.trim() === '' || type === undefined} on:click={submit} /></div>
    </section>
  {/if}
</div>

<style lang="scss">
  .req { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; max-width: 44rem; overflow: auto; }
  .req__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .req__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .req__sub, .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.1rem 1.25rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__title { font-weight: 600; font-size: 1rem; color: var(--theme-caption-color); }
  .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--theme-dark-color); }
  .input { padding: 0.55rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.9375rem; font-weight: 400; text-transform: none; letter-spacing: 0; outline: none; transition: var(--transition-interactive); &:focus { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } &--area { min-height: 8rem; resize: vertical; } }
  .types { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.5rem; }
  .typecard { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.7rem 0.8rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: transparent; font: inherit; text-align: left; cursor: pointer; transition: var(--transition-interactive), transform var(--motion-fast) var(--ease-standard); &:hover { background: var(--theme-button-hovered); transform: translateY(-1px); } &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); } }
  .typecard__name { font-weight: 600; color: var(--theme-caption-color); }
  .typecard__desc { font-size: 0.75rem; color: var(--theme-dark-color); }
  .typecard__sla { font-size: 0.7rem; color: var(--accent-brand-ink); }
  .kb { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.6rem 0.75rem; border: 1px solid var(--primary-button-default); border-radius: 0.6rem; }
  .kb__title { font-size: 0.75rem; font-weight: 600; color: var(--theme-caption-color); }
  .kb__item { border: none; background: transparent; padding: 0.2rem 0.3rem; border-radius: 0.3rem; color: var(--primary-button-default); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
