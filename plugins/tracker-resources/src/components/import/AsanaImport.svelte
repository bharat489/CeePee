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
  Import an Asana project from its CSV export (project menu → Export →
  CSV). Sections become statuses where the names match, completed tasks go
  to done, subtasks keep their parent, tags become labels, assignees match
  by email or name, due dates and notes come across.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { type Project } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { buildMapping, column, Importer, parseCsv, PRIORITY_WORDS, type Created } from './common'

  const projectQuery = createQuery()
  let projects: Project[] = []
  projectQuery.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  let projectId: Ref<Project> | undefined
  $: if (projectId === undefined && projects.length > 0) projectId = projects[0]._id
  $: project = projects.find((p) => p._id === projectId)

  interface Row {
    id: string
    name: string
    section: string
    assignee: string
    email: string
    due?: number
    completed?: number
    notes: string
    tags: string[]
    parent: string
    priority: string
  }
  let rows: Row[] = []
  let error = ''
  async function onFile (e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f === undefined) return
    error = ''
    const table = parseCsv(await f.text())
    if (table.length < 2) {
      error = 'Empty file.'
      return
    }
    const h = table[0]
    const cId = column(h, 'task id')
    const cName = column(h, 'name')
    if (cName < 0) {
      error = 'This does not look like an Asana export: no "Name" column.'
      return
    }
    const cSection = column(h, 'section/column', 'section')
    const cAssignee = column(h, 'assignee')
    const cEmail = column(h, 'assignee email')
    const cDue = column(h, 'due date')
    const cCompleted = column(h, 'completed at')
    const cNotes = column(h, 'notes')
    const cTags = column(h, 'tags')
    const cParent = column(h, 'parent task')
    const cPriority = column(h, 'priority')
    const get = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '')
    const date = (s: string): number | undefined => (s === '' ? undefined : Number.isNaN(Date.parse(s)) ? undefined : Date.parse(s))
    rows = table.slice(1).map((r): Row => ({
      id: get(r, cId),
      name: get(r, cName),
      section: get(r, cSection),
      assignee: get(r, cAssignee),
      email: get(r, cEmail),
      due: date(get(r, cDue)),
      completed: date(get(r, cCompleted)),
      notes: get(r, cNotes),
      tags: get(r, cTags).split(',').map((t) => t.trim()).filter((t) => t !== ''),
      parent: get(r, cParent),
      priority: get(r, cPriority)
    })).filter((r) => r.name !== '')
  }
  $: sections = Array.from(new Set(rows.map((r) => r.section).filter((s) => s !== '')))
  $: subtasks = rows.filter((r) => r.parent !== '').length

  let importing = false
  let done = 0
  let errors: string[] = []
  let finished = false
  async function run (): Promise<void> {
    if (project === undefined || rows.length === 0) return
    importing = true
    finished = false
    errors = []
    done = 0
    const m = await buildMapping(project)
    const imp = new Importer(m)
    const created = new Map<string, Created>()
    const ordered = [...rows.filter((r) => r.parent === ''), ...rows.filter((r) => r.parent !== '')]
    for (const r of ordered) {
      try {
        const parent = r.parent !== '' ? created.get(r.parent) : undefined
        const c = await imp.create({
          title: r.name,
          description: [r.notes, ...(r.section !== '' ? [`Section: ${r.section}`] : [])].filter((x) => x !== ''),
          status: r.completed !== undefined ? m.doneStatus ?? m.defaultStatus : r.section !== '' ? m.statusFor(r.section) : m.defaultStatus,
          assignee: m.personFor(r.email) ?? m.personFor(r.assignee),
          dueDate: r.due,
          labels: [...r.tags, ...(r.section !== '' ? [`section: ${r.section}`] : [])],
          priority: PRIORITY_WORDS[r.priority.toLowerCase()],
          parent
        }, 'Asana')
        created.set(r.name, c)
        if (r.id !== '') created.set(r.id, c)
      } catch (err: any) {
        errors = [...errors, `${r.name}: ${String(err?.message ?? err)}`]
      }
      done++
    }
    importing = false
    finished = true
  }
</script>

<div class="imp">
  <section class="card"><span class="card__step">1</span><div class="card__body"><span class="card__title">Target project</span><select class="select" bind:value={projectId}>{#each projects as p (p._id)}<option value={p._id}>{p.name} ({p.identifier})</option>{/each}</select></div></section>
  <section class="card"><span class="card__step">2</span><div class="card__body"><span class="card__title">Asana CSV export</span><p class="hint">Project menu (▾ next to the name) → Export / Print → CSV.</p><input class="file" type="file" accept=".csv,text/csv" on:change={onFile} />{#if error}<p class="err">{error}</p>{/if}</div></section>
  {#if rows.length > 0}
    <section class="card"><span class="card__step">3</span><div class="card__body">
      <span class="card__title">Preview</span>
      <ul class="facts">
        <li><b>{rows.length}</b> tasks · <b>{subtasks}</b> subtasks → <b>{project?.name}</b></li>
        <li>Sections → statuses where names match ({sections.join(', ') || 'none'}); otherwise the default status, with the section kept as a label.</li>
        <li>Completed tasks → done · assignees by email, then name · tags → labels · notes → description</li>
      </ul>
      <div class="actions"><Button kind={'primary'} label={tracker.string.ImportIssues} disabled={importing} on:click={() => { void run() }} /></div>
      {#if importing || finished}<div class="progress"><span class="progress__fill" style="width: {(done / rows.length) * 100}%" /></div><p class="hint">{done} / {rows.length}{#if finished} · done{/if}{#if errors.length > 0} · {errors.length} failed{/if}</p>{#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}{/if}
    </div></section>
  {/if}
</div>

<style lang="scss">
  .imp { display: flex; flex-direction: column; gap: 0.75rem; }
  .card { display: flex; gap: 0.9rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__step { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 1.6rem; height: 1.6rem; border-radius: 50%; background-image: var(--accent-gradient); color: #fff; font-size: 0.8rem; font-weight: 700; }
  .card__body { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-width: 0; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .hint { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .select { padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; }
  .file { font-size: 0.8125rem; color: var(--theme-content-color); }
  .err { margin: 0; color: var(--negative-button-default); font-size: 0.8125rem; }
  .facts { margin: 0; padding-left: 1.2rem; font-size: 0.875rem; color: var(--theme-content-color); line-height: 1.6; b { color: var(--theme-caption-color); } }
  .actions { display: flex; justify-content: flex-end; }
  .progress { height: 0.4rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .progress__fill { display: block; height: 100%; background-image: var(--accent-gradient); transition: width var(--motion-fast) linear; }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
</style>
