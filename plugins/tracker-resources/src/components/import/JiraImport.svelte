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
  Import from Jira, via the CSV Jira exports ("Export → CSV (all fields)").

  The on-ramp for a switching team. Everything is previewed before a single
  issue is written: how statuses, priorities, people and types will map, and
  what will fall back. Epics come first, then issues, then sub-tasks, so
  parents exist before their children. Each imported issue keeps its Jira
  key in the first line of its description.

  Not imported (yet): labels, attachments, comments, history.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import core, { generateId, makeCollabId, SocialIdType, SortingOrder, type DocData, type Ref } from '@hcengineering/core'
  import { createMarkup, createQuery, getClient } from '@hcengineering/presentation'
  import task, { makeRank, type TaskType } from '@hcengineering/task'
  import { jsonToMarkup, type MarkupNode } from '@hcengineering/text'
  import { IssuePriority, type Issue, type IssueParentInfo, type IssueStatus, type Project } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const client = getClient()
  const projectQuery = createQuery()
  let projects: Project[] = []
  projectQuery.query(tracker.class.Project, { archived: false }, (r) => {
    projects = r
  })
  let projectId: Ref<Project> | undefined
  $: if (projectId === undefined && projects.length > 0) projectId = projects[0]._id
  $: project = projects.find((p) => p._id === projectId)

  // ---- csv ----------------------------------------------------------------
  function parseCsv (text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let q = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"'
            i++
          } else q = false
        } else cell += ch
      } else if (ch === '"') q = true
      else if (ch === ',') {
        row.push(cell)
        cell = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else cell += ch
    }
    if (cell !== '' || row.length > 0) {
      row.push(cell)
      rows.push(row)
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ''))
  }

  interface Row {
    key: string
    summary: string
    type: string
    status: string
    priority: string
    assignee: string
    description: string
    parent: string
    points?: number
    due?: number
    labels: string[]
  }

  function columns (header: string[], ...names: string[]): number[] {
    const h = header.map((c) => c.trim().toLowerCase())
    const out: number[] = []
    for (const n of names) h.forEach((c, i) => { if (c === n && !out.includes(i)) out.push(i) })
    if (out.length === 0) for (const n of names) h.forEach((c, i) => { if (c.includes(n) && !out.includes(i)) out.push(i) })
    return out
  }
  function first (r: string[], idx: number[]): string {
    for (const i of idx) {
      const v = (r[i] ?? '').trim()
      if (v !== '') return v
    }
    return ''
  }
  function parseJiraDate (s: string): number | undefined {
    if (s.trim() === '') return undefined
    const t = Date.parse(s)
    if (!Number.isNaN(t)) return t
    const m = /^(\d{1,2})\/(\w{3})\/(\d{2,4})/.exec(s.trim())
    if (m !== null) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3]
      const t2 = Date.parse(`${m[1]} ${m[2]} ${y}`)
      if (!Number.isNaN(t2)) return t2
    }
    return undefined
  }

  let csvText = ''
  let rows: Row[] = []
  let parseError = ''

  function analyze (text: string): void {
    parseError = ''
    rows = []
    const table = parseCsv(text)
    if (table.length < 2) {
      parseError = text.trim() === '' ? '' : 'Could not find a header row and at least one issue.'
      return
    }
    const header = table[0]
    const cKey = columns(header, 'issue key')
    const cSummary = columns(header, 'summary')
    if (cKey.length === 0 || cSummary.length === 0) {
      parseError = 'This does not look like a Jira export: no "Issue key" or "Summary" column.'
      return
    }
    const cType = columns(header, 'issue type')
    const cStatus = columns(header, 'status')
    const cPriority = columns(header, 'priority')
    const cAssignee = columns(header, 'assignee')
    const cDesc = columns(header, 'description')
    const cParent = columns(header, 'parent key', 'custom field (epic link)', 'parent')
    const cPoints = columns(header, 'custom field (story points)', 'custom field (story point estimate)', 'story points')
    const cDue = columns(header, 'due date')
    const cLabels = columns(header, 'labels')
    rows = table.slice(1).map((r) => ({
      key: first(r, cKey),
      summary: first(r, cSummary),
      type: first(r, cType),
      status: first(r, cStatus),
      priority: first(r, cPriority),
      assignee: first(r, cAssignee.filter((i) => !header[i].toLowerCase().includes(' id'))),
      description: first(r, cDesc),
      parent: first(r, cParent),
      points: (() => {
        const n = Number(first(r, cPoints))
        return Number.isNaN(n) || n <= 0 ? undefined : n
      })(),
      due: parseJiraDate(first(r, cDue)),
      labels: cLabels.map((i) => (r[i] ?? '').trim()).filter((v) => v !== '')
    })).filter((r) => r.summary !== '')
  }
  $: analyze(csvText)

  async function onFile (e: Event): Promise<void> {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (f === undefined) return
    csvText = await f.text()
  }

  // ---- mapping preview ----------------------------------------------------
  const PRIORITY: Record<string, IssuePriority> = {
    highest: IssuePriority.Urgent,
    blocker: IssuePriority.Urgent,
    critical: IssuePriority.Urgent,
    urgent: IssuePriority.Urgent,
    high: IssuePriority.High,
    major: IssuePriority.High,
    medium: IssuePriority.Medium,
    normal: IssuePriority.Medium,
    low: IssuePriority.Low,
    minor: IssuePriority.Low,
    lowest: IssuePriority.Low,
    trivial: IssuePriority.Low
  }
  interface Mapping {
    issueType: TaskType
    epicType?: TaskType
    statuses: IssueStatus[]
    defaultStatus: Ref<IssueStatus>
    people: Map<string, Ref<Person>>
    statusFor: (name: string) => Ref<IssueStatus>
    personFor: (name: string) => Ref<Person> | null
  }
  let mapping: Mapping | undefined
  let unmappedStatuses: string[] = []
  let unmatchedPeople: string[] = []

  async function buildMapping (p: Project): Promise<Mapping> {
    const ptype = await client.findOne(task.class.ProjectType, { _id: p.type })
    const types = ptype !== undefined ? await client.findAll(task.class.TaskType, { _id: { $in: ptype.tasks } }) : []
    const issueType = types.find((t) => t.name === 'Issue') ?? types[0]
    const epicType = types.find((t) => t.name === 'Epic')
    const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: issueType.statuses as Ref<IssueStatus>[] } })
    const byName = new Map(statuses.map((s) => [s.name.toLowerCase(), s._id]))
    const firstOf = (cat: Ref<any>): Ref<IssueStatus> | undefined =>
      (issueType.statuses as Ref<IssueStatus>[]).find((id) => statuses.find((s) => s._id === id)?.category === cat)
    const defaultStatus = p.defaultIssueStatus ?? (issueType.statuses[0] as Ref<IssueStatus>)
    const SYN: Record<string, Ref<IssueStatus> | undefined> = {
      'to do': firstOf(task.statusCategory.ToDo) ?? firstOf(task.statusCategory.UnStarted),
      open: firstOf(task.statusCategory.ToDo) ?? firstOf(task.statusCategory.UnStarted),
      backlog: firstOf(task.statusCategory.UnStarted) ?? firstOf(task.statusCategory.ToDo),
      'in progress': firstOf(task.statusCategory.Active),
      'in review': firstOf(task.statusCategory.Active),
      done: firstOf(task.statusCategory.Won),
      closed: firstOf(task.statusCategory.Won),
      resolved: firstOf(task.statusCategory.Won),
      cancelled: firstOf(task.statusCategory.Lost),
      canceled: firstOf(task.statusCategory.Lost),
      "won't do": firstOf(task.statusCategory.Lost)
    }
    const statusFor = (name: string): Ref<IssueStatus> => byName.get(name.toLowerCase()) ?? SYN[name.toLowerCase()] ?? defaultStatus

    const employees = await client.findAll(contact.mixin.Employee, {})
    const people = new Map<string, Ref<Person>>()
    for (const e of employees) people.set(formatName(e.name).toLowerCase(), e._id)
    const emails = await client.findAll(contact.class.SocialIdentity, { type: SocialIdType.EMAIL })
    for (const s of emails) people.set(s.value.toLowerCase(), s.attachedTo)
    const personFor = (name: string): Ref<Person> | null => {
      const k = name.trim().toLowerCase()
      if (k === '') return null
      const hit = people.get(k)
      if (hit !== undefined) return hit
      // "First Last" vs "Last First" and partial matches
      for (const [n, id] of people) if (n.includes(k) || k.includes(n)) return id
      return null
    }
    return { issueType, epicType, statuses, defaultStatus, people, statusFor, personFor }
  }

  async function refreshMapping (p: Project | undefined, list: Row[]): Promise<void> {
    if (p === undefined) {
      mapping = undefined
      return
    }
    const m = await buildMapping(p)
    mapping = m
    const known = new Set(m.statuses.map((s) => s.name.toLowerCase()))
    unmappedStatuses = Array.from(new Set(list.map((r) => r.status).filter((s) => s !== '' && !known.has(s.toLowerCase())))).filter(
      (s) => m.statusFor(s) === m.defaultStatus
    )
    unmatchedPeople = Array.from(new Set(list.map((r) => r.assignee).filter((a) => a !== '' && m.personFor(a) === null)))
  }
  $: void refreshMapping(project, rows)

  $: counts = {
    epics: rows.filter((r) => r.type.toLowerCase() === 'epic').length,
    subtasks: rows.filter((r) => /sub-?task/i.test(r.type)).length,
    labels: rows.filter((r) => r.labels.length > 0).length
  }

  // ---- import -------------------------------------------------------------
  let importing = false
  let done = 0
  let errors: string[] = []
  let finished = false

  function paragraphs (text: string): MarkupNode[] {
    return text
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map((p) => p.trim())
      .filter((p) => p !== '')
      .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }) as unknown as MarkupNode)
  }

  async function run (): Promise<void> {
    if (project === undefined || mapping === undefined || rows.length === 0) return
    importing = true
    finished = false
    done = 0
    errors = []
    const m = mapping
    const p = project
    const order = (r: Row): number => (r.type.toLowerCase() === 'epic' ? 0 : /sub-?task/i.test(r.type) ? 2 : 1)
    const sorted = [...rows].sort((a, b) => order(a) - order(b))
    const created = new Map<string, { _id: Ref<Issue>, title: string, identifier: string, parents: IssueParentInfo[] }>()

    const last = await client.findOne(tracker.class.Issue, { space: p._id }, { sort: { rank: SortingOrder.Descending } })
    let rank = last?.rank

    for (const r of sorted) {
      try {
        const isEpic = r.type.toLowerCase() === 'epic'
        const kind = (isEpic ? m.epicType?._id : undefined) ?? m.issueType._id
        const parent = r.parent !== '' ? created.get(r.parent.trim()) : undefined

        const inc = await client.updateDoc(tracker.class.Project, core.space.Space, p._id, { $inc: { sequence: 1 } }, true)
        const number = (inc as any).object.sequence as number
        const identifier = `${p.identifier}-${number}`
        const _id = generateId<Issue>()
        rank = makeRank(rank, undefined)

        const node = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: `Imported from Jira ${r.key}` }] },
            ...paragraphs(r.description)
          ]
        } as unknown as MarkupNode
        const description = await createMarkup(makeCollabId(tracker.class.Issue, _id, 'description'), jsonToMarkup(node))

        const value: DocData<Issue> = {
          title: r.summary,
          description,
          assignee: m.personFor(r.assignee),
          component: null,
          milestone: null,
          number,
          status: m.statusFor(r.status),
          priority: PRIORITY[r.priority.toLowerCase()] ?? IssuePriority.NoPriority,
          rank,
          comments: 0,
          subIssues: 0,
          startDate: null,
          dueDate: r.due ?? null,
          parents:
            parent !== undefined
              ? [{ parentId: parent._id, parentTitle: parent.title, space: p._id, identifier: parent.identifier }, ...parent.parents]
              : [],
          reportedTime: 0,
          remainingTime: 0,
          estimation: 0,
          reports: 0,
          relations: [],
          blockedBy: [],
          childInfo: [],
          kind,
          identifier,
          storyPoints: r.points
        }
        await client.addCollection(
          tracker.class.Issue,
          p._id,
          parent?._id ?? tracker.ids.NoParent,
          tracker.class.Issue,
          'subIssues',
          value,
          _id
        )
        created.set(r.key, { _id, title: r.summary, identifier, parents: value.parents })
      } catch (err: any) {
        errors = [...errors, `${r.key}: ${String(err?.message ?? err)}`]
      }
      done++
    }
    importing = false
    finished = true
  }
</script>

<div class="hulyComponent">
  <div class="imp">
    <header class="imp__head">
      <span class="imp__title"><Label label={tracker.string.JiraImport} /></span>
      <span class="imp__sub"><Label label={tracker.string.JiraImportHint} /></span>
    </header>

    <section class="card motion-rise" style="--i: 0">
      <span class="card__step">1</span>
      <div class="card__body">
        <span class="card__title">Target project</span>
        <select class="select" bind:value={projectId}>
          {#each projects as p (p._id)}
            <option value={p._id}>{p.name} ({p.identifier})</option>
          {/each}
        </select>
      </div>
    </section>

    <section class="card motion-rise" style="--i: 1">
      <span class="card__step">2</span>
      <div class="card__body">
        <span class="card__title">Jira CSV export</span>
        <p class="hint">In Jira: Filters → search → Export → CSV (all fields). Upload the file or paste its contents.</p>
        <input class="file" type="file" accept=".csv,text/csv" on:change={onFile} />
        <textarea class="paste" bind:value={csvText} placeholder="Summary,Issue key,Issue Type,Status,Priority,Assignee,…" spellcheck="false" />
        {#if parseError !== ''}<p class="err">{parseError}</p>{/if}
      </div>
    </section>

    {#if rows.length > 0 && mapping !== undefined}
      <section class="card motion-rise" style="--i: 2">
        <span class="card__step">3</span>
        <div class="card__body">
          <span class="card__title">Preview</span>
          <ul class="facts">
            <li><b>{rows.length}</b> issues · <b>{counts.epics}</b> epics · <b>{counts.subtasks}</b> sub-tasks</li>
            <li>Statuses map by name to <b>{project?.name}</b>; unknown ones go to the default status{#if unmappedStatuses.length > 0}: <i>{unmappedStatuses.join(', ')}</i>{/if}</li>
            <li>Assignees match by name or email{#if unmatchedPeople.length > 0}; not found, left unassigned: <i>{unmatchedPeople.join(', ')}</i>{/if}</li>
            <li>Priorities: Highest/Blocker → Urgent, High → High, Medium → Medium, Low/Lowest → Low</li>
            {#if counts.labels > 0}<li>Labels on {counts.labels} issues are not imported</li>{/if}
          </ul>
          <div class="actions">
            <Button kind={'primary'} label={tracker.string.ImportIssues} disabled={importing || rows.length === 0} on:click={run} />
          </div>
          {#if importing || finished}
            <div class="progress"><span class="progress__fill" style="width: {(done / rows.length) * 100}%" /></div>
            <p class="hint">{done} / {rows.length}{#if finished} · done{/if}{#if errors.length > 0} · {errors.length} failed{/if}</p>
            {#if errors.length > 0}
              <ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>
            {/if}
          {/if}
        </div>
      </section>
    {/if}
  </div>
</div>

<style lang="scss">
  .imp {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem 2rem;
    max-width: 56rem;
    overflow: auto;
  }
  .imp__head {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .imp__title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .imp__sub,
  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .card {
    display: flex;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    background: var(--theme-panel-color);
  }
  .card__step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background-image: var(--accent-gradient);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .card__body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }
  .card__title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .select,
  .paste {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.4rem;
    background: var(--theme-bg-color);
    color: var(--theme-caption-color);
    font: inherit;
    font-size: 0.875rem;
    outline: none;
    &:focus {
      border-color: var(--accent-brand);
    }
  }
  .paste {
    min-height: 8rem;
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.75rem;
    resize: vertical;
  }
  .file {
    font-size: 0.8125rem;
    color: var(--theme-content-color);
  }
  .err {
    margin: 0;
    color: var(--negative-button-default);
    font-size: 0.8125rem;
  }
  .facts {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.875rem;
    color: var(--theme-content-color);
    line-height: 1.6;
    b {
      color: var(--theme-caption-color);
    }
    i {
      color: var(--theme-dark-color);
    }
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .progress {
    height: 0.4rem;
    border-radius: 999px;
    background: var(--theme-button-pressed);
    overflow: hidden;
  }
  .progress__fill {
    display: block;
    height: 100%;
    background-image: var(--accent-gradient);
    transition: width var(--motion-fast) linear;
  }
  .errs {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.75rem;
    color: var(--negative-button-default);
  }
</style>
