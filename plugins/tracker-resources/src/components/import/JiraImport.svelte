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
  Import from Jira, via the CSV Jira exports ("Export → CSV (all fields)").

  Everything is previewed before a single issue is written. Epics come
  first, then issues, then sub-tasks, so parents exist before children.
  Brought across: summary, description, type, status, priority, assignee,
  due date, story points, labels, comments, work logs, sprints, fix and
  affects versions, parent links. Custom fields and attachment URLs are
  appended to the description (attachments themselves need Jira auth and
  cannot be fetched from a CSV). History is not in the export.
-->
<script lang="ts">
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import core, { generateId, makeCollabId, SocialIdType, SortingOrder, type DocData, type Ref } from '@hcengineering/core'
  import { createMarkup, createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task, { makeRank, type TaskType } from '@hcengineering/task'
  import { jsonToMarkup, type MarkupNode } from '@hcengineering/text'
  import { IssuePriority, MilestoneStatus, type Issue, type IssueParentInfo, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { paragraphs } from '../../createIssueDoc'

  const client = getClient()
  const projectQuery = createQuery()
  let projects: Project[] = []
  projectQuery.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
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
    comments: Array<{ date?: number, author: string, body: string }>
    worklogs: Array<{ date?: number, author: string, seconds: number, comment: string }>
    sprint: string
    fixVersions: string[]
    affectsVersions: string[]
    custom: Array<{ name: string, value: string }>
    attachments: string[]
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
  function all (r: string[], idx: number[]): string[] {
    return idx.map((i) => (r[i] ?? '').trim()).filter((v) => v !== '')
  }
  function parseJiraDate (s: string): number | undefined {
    if (s.trim() === '') return undefined
    const t = Date.parse(s)
    if (!Number.isNaN(t)) return t
    const m = /^(\d{1,2})\/(\w{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i.exec(s.trim())
    if (m !== null) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3]
      const t2 = Date.parse(`${m[1]} ${m[2]} ${y}${m[4] !== undefined ? ` ${m[4]}:${m[5]} ${m[6] ?? ''}` : ''}`)
      if (!Number.isNaN(t2)) return t2
    }
    return undefined
  }
  // Jira packs comments as "date;author;body" and work logs as "comment;date;author;seconds"
  function splitPacked (v: string, n: number): string[] {
    const parts = v.split(';')
    if (parts.length <= n) return parts
    return [...parts.slice(0, n - 1), parts.slice(n - 1).join(';')]
  }

  let csvText = ''
  let rows: Row[] = []
  let parseError = ''
  let knownColumns: string[] = []

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
    const known = new Set<number>()
    const take = (...names: string[]): number[] => {
      const idx = columns(header, ...names)
      idx.forEach((i) => known.add(i))
      return idx
    }
    take('issue key')
    take('summary')
    const cType = take('issue type')
    const cStatus = take('status')
    const cPriority = take('priority')
    const cAssignee = take('assignee').filter((i) => !header[i].toLowerCase().includes(' id'))
    const cDesc = take('description')
    const cParent = take('parent key', 'custom field (epic link)', 'parent')
    const cPoints = take('custom field (story points)', 'custom field (story point estimate)', 'story points')
    const cDue = take('due date')
    const cLabels = take('labels')
    const cComments = take('comment')
    const cWorklogs = take('log work')
    const cSprint = take('sprint')
    const cFix = take('fix version/s', 'fix versions')
    const cAffects = take('affects version/s', 'affects versions')
    const cAttach = take('attachment')
    // noise columns nobody wants copied into a description
    for (const n of ['issue id', 'project', 'created', 'updated', 'resolved', 'reporter', 'creator', 'resolution', 'status category', 'watchers', 'votes', 'security level', 'time spent', 'original estimate', 'remaining estimate', 'work ratio', 'environment', 'last viewed', 'parent summary', 'parent id', 'issue type id', 'status id', 'priority id', 'project key', 'project name', 'project type', 'project lead', 'project description', 'project url']) {
      columns(header, n).forEach((i) => known.add(i))
    }
    const cCustom = header.map((h, i) => ({ h, i })).filter(({ h, i }) => !known.has(i) && h.trim() !== '' && !/(id|uuid)$/i.test(h.trim()))
    knownColumns = cCustom.map((c) => c.h.replace(/^custom field \((.*)\)$/i, '$1'))

    rows = table.slice(1).map((r): Row => ({
      key: first(r, cKey),
      summary: first(r, cSummary),
      type: first(r, cType),
      status: first(r, cStatus),
      priority: first(r, cPriority),
      assignee: first(r, cAssignee),
      description: first(r, cDesc),
      parent: first(r, cParent),
      points: (() => {
        const n = Number(first(r, cPoints))
        return Number.isNaN(n) || n <= 0 ? undefined : n
      })(),
      due: parseJiraDate(first(r, cDue)),
      labels: all(r, cLabels),
      comments: all(r, cComments).map((v) => {
        const [d, a, b] = splitPacked(v, 3)
        return { date: parseJiraDate(d ?? ''), author: a ?? '', body: b ?? v }
      }),
      worklogs: all(r, cWorklogs).map((v) => {
        const [c, d, a, s] = splitPacked(v, 4)
        return { comment: c ?? '', date: parseJiraDate(d ?? ''), author: a ?? '', seconds: Number(s ?? 0) || 0 }
      }),
      sprint: all(r, cSprint).pop() ?? '',
      fixVersions: all(r, cFix),
      affectsVersions: all(r, cAffects),
      custom: cCustom.map(({ h, i }) => ({ name: h.replace(/^custom field \((.*)\)$/i, '$1'), value: (r[i] ?? '').trim() })).filter((c) => c.value !== ''),
      attachments: all(r, cAttach).map((v) => splitPacked(v, 4)[3] ?? v)
    })).filter((r) => r.summary !== '')
  }
  $: analyze(csvText)

  // ---- Jira Cloud REST API import (via the integrations service) ------------------
  const integrationsUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8095` : ''
  let apiBase = ''
  let apiEmail = ''
  let apiToken = ''
  let apiJql = ''
  let apiInbound = ''
  let apiAttachments = true
  let apiHistory = true
  let apiComments = true
  let apiWorklogs = true
  let apiJob: { id: string, state: string, total: number, done: number, created: number, attachments: number, errors: string[] } | undefined
  let apiError = ''
  let apiTimer: ReturnType<typeof setInterval> | undefined
  async function startApiImport (): Promise<void> {
    apiError = ''
    if (project === undefined) return
    try {
      const r = await fetch(`${integrationsUrl}/inbound/jira-import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiInbound}` },
        body: JSON.stringify({ baseUrl: apiBase.trim(), email: apiEmail.trim(), token: apiToken.trim(), jql: apiJql.trim(), project: project.identifier, attachments: apiAttachments, history: apiHistory, comments: apiComments, worklogs: apiWorklogs })
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      apiJob = j
      if (apiTimer !== undefined) clearInterval(apiTimer)
      apiTimer = setInterval(() => { void pollApi() }, 2000)
    } catch (e: any) {
      apiError = String(e?.message ?? e) + (integrationsUrl !== '' ? ` — is the integrations service running at ${integrationsUrl} with INBOUND_TOKEN set?` : '')
    }
  }
  async function pollApi (): Promise<void> {
    if (apiJob === undefined) return
    try {
      const r = await fetch(`${integrationsUrl}/inbound/jira-import/${apiJob.id}`, { headers: { authorization: `Bearer ${apiInbound}` } })
      if (r.ok) apiJob = await r.json()
      if (apiJob !== undefined && apiJob.state !== 'running' && apiTimer !== undefined) {
        clearInterval(apiTimer)
        apiTimer = undefined
      }
    } catch {}
  }

  async function onFile (e: Event): Promise<void> {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (f === undefined) return
    csvText = await f.text()
  }

  // ---- mapping ----------------------------------------------------------------
  const PRIORITY: Record<string, IssuePriority> = { highest: IssuePriority.Urgent, blocker: IssuePriority.Urgent, critical: IssuePriority.Urgent, urgent: IssuePriority.Urgent, high: IssuePriority.High, major: IssuePriority.High, medium: IssuePriority.Medium, normal: IssuePriority.Medium, low: IssuePriority.Low, minor: IssuePriority.Low, lowest: IssuePriority.Low, trivial: IssuePriority.Low }
  interface Mapping {
    issueType: TaskType
    epicType?: TaskType
    statuses: IssueStatus[]
    defaultStatus: Ref<IssueStatus>
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
    const firstOf = (cat: Ref<any>): Ref<IssueStatus> | undefined => (issueType.statuses as Ref<IssueStatus>[]).find((id) => statuses.find((s) => s._id === id)?.category === cat)
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
      for (const [n, id] of people) if (n.includes(k) || k.includes(n)) return id
      return null
    }
    return { issueType, epicType, statuses, defaultStatus, statusFor, personFor }
  }
  async function refreshMapping (p: Project | undefined, list: Row[]): Promise<void> {
    if (p === undefined) {
      mapping = undefined
      return
    }
    const m = await buildMapping(p)
    mapping = m
    const known = new Set(m.statuses.map((s) => s.name.toLowerCase()))
    unmappedStatuses = Array.from(new Set(list.map((r) => r.status).filter((s) => s !== '' && !known.has(s.toLowerCase())))).filter((s) => m.statusFor(s) === m.defaultStatus)
    unmatchedPeople = Array.from(new Set([...list.map((r) => r.assignee), ...list.flatMap((r) => r.worklogs.map((w) => w.author))].filter((a) => a !== '' && m.personFor(a) === null)))
  }
  $: void refreshMapping(project, rows)

  $: counts = {
    epics: rows.filter((r) => r.type.toLowerCase() === 'epic').length,
    subtasks: rows.filter((r) => /sub-?task/i.test(r.type)).length,
    labels: Array.from(new Set(rows.flatMap((r) => r.labels))).length,
    comments: rows.reduce((a, r) => a + r.comments.length, 0),
    worklogs: rows.reduce((a, r) => a + r.worklogs.length, 0),
    sprints: Array.from(new Set(rows.map((r) => r.sprint).filter((s) => s !== ''))).length,
    versions: Array.from(new Set(rows.flatMap((r) => [...r.fixVersions, ...r.affectsVersions]))).length,
    attachments: rows.reduce((a, r) => a + r.attachments.length, 0)
  }

  // ---- import ----------------------------------------------------------------
  let importing = false
  let done = 0
  let errors: string[] = []
  let finished = false
  let includeComments = true
  let includeWorklogs = true

  async function findOrCreateTag (title: string, cache: Map<string, { _id: Ref<any>, color: number }>): Promise<{ _id: Ref<any>, color: number }> {
    const key = title.toLowerCase()
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const existing = await client.findOne(tags.class.TagElement, { targetClass: tracker.class.Issue, title })
    if (existing !== undefined) {
      cache.set(key, existing)
      return existing
    }
    const color = Math.floor(Math.random() * 20)
    const _id = await client.createDoc(tags.class.TagElement, core.space.Workspace, { title, description: '', targetClass: tracker.class.Issue, color, category: tags.category.NoCategory })
    const el = { _id, color }
    cache.set(key, el)
    return el
  }
  async function findOrCreateSprint (name: string, p: Project, cache: Map<string, Ref<Sprint>>): Promise<Ref<Sprint>> {
    const hit = cache.get(name)
    if (hit !== undefined) return hit
    const existing = await client.findOne(tracker.class.Sprint, { space: p._id, name })
    if (existing !== undefined) {
      cache.set(name, existing._id)
      return existing._id
    }
    const id = await client.createDoc(tracker.class.Sprint, p._id, { name, startDate: Date.now(), endDate: Date.now() + 14 * 86_400_000, state: 'planned', carriedOverTo: null })
    cache.set(name, id)
    return id
  }
  async function findOrCreateMilestone (label: string, p: Project, cache: Map<string, Ref<Milestone>>): Promise<Ref<Milestone>> {
    const hit = cache.get(label)
    if (hit !== undefined) return hit
    const existing = await client.findOne(tracker.class.Milestone, { space: p._id, label })
    if (existing !== undefined) {
      cache.set(label, existing._id)
      return existing._id
    }
    const id = await client.createDoc(tracker.class.Milestone, p._id, { label, description: '', status: MilestoneStatus.Planned, comments: 0, attachments: 0, startDate: null, targetDate: Date.now() + 30 * 86_400_000 })
    cache.set(label, id)
    return id
  }
  function markup (lines: string[]): string {
    return jsonToMarkup({ type: 'doc', content: lines.flatMap((l) => paragraphs(l)) } as unknown as MarkupNode)
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
    const tagCache = new Map<string, { _id: Ref<any>, color: number }>()
    const sprintCache = new Map<string, Ref<Sprint>>()
    const milestoneCache = new Map<string, Ref<Milestone>>()
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

        const extra: string[] = []
        for (const c of r.custom) extra.push(`${c.name}: ${c.value}`)
        for (const a of r.attachments) extra.push(`Attachment: ${a}`)
        const node = { type: 'doc', content: [...paragraphs(`Imported from Jira ${r.key}`), ...paragraphs(r.description), ...(extra.length > 0 ? paragraphs(extra.join('\n\n')) : [])] } as unknown as MarkupNode
        const description = await createMarkup(makeCollabId(tracker.class.Issue, _id, 'description'), jsonToMarkup(node))

        const milestone = r.fixVersions.length > 0 ? await findOrCreateMilestone(r.fixVersions[0], p, milestoneCache) : null
        const affects = r.affectsVersions.length > 0 ? await findOrCreateMilestone(r.affectsVersions[0], p, milestoneCache) : null
        const sprint = r.sprint !== '' && !isEpic ? await findOrCreateSprint(r.sprint, p, sprintCache) : null
        const value: DocData<Issue> = {
          title: r.summary,
          description,
          assignee: m.personFor(r.assignee),
          component: null,
          milestone,
          affectsMilestone: affects,
          sprint,
          number,
          status: m.statusFor(r.status),
          priority: PRIORITY[r.priority.toLowerCase()] ?? IssuePriority.NoPriority,
          rank,
          comments: 0,
          subIssues: 0,
          startDate: null,
          dueDate: r.due ?? null,
          parents: parent !== undefined ? [{ parentId: parent._id, parentTitle: parent.title, space: p._id, identifier: parent.identifier }, ...parent.parents] : [],
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
        await client.addCollection(tracker.class.Issue, p._id, parent?._id ?? tracker.ids.NoParent, tracker.class.Issue, 'subIssues', value, _id)
        created.set(r.key, { _id, title: r.summary, identifier, parents: value.parents })

        for (const l of r.labels) {
          const tag = await findOrCreateTag(l, tagCache)
          await client.addCollection(tags.class.TagReference, p._id, _id, tracker.class.Issue, 'labels', { tag: tag._id, title: l, color: tag.color })
        }
        if (includeComments) {
          for (const c of r.comments) {
            const when = c.date !== undefined ? new Date(c.date).toLocaleDateString() : ''
            await client.addCollection('chunter:class:ChatMessage' as any, p._id, _id, tracker.class.Issue, 'comments', { message: markup([`${c.author}${when !== '' ? ` · ${when}` : ''} (from Jira):`, c.body]), attachments: 0 } as any)
          }
        }
        if (includeWorklogs) {
          for (const w of r.worklogs) {
            if (w.seconds <= 0) continue
            await client.addCollection(tracker.class.TimeSpendReport, p._id, _id, tracker.class.Issue, 'reports', { employee: m.personFor(w.author) as any, date: w.date ?? null, value: Math.round((w.seconds / 3600) * 100) / 100, description: w.comment })
          }
        }
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
        <select class="select" bind:value={projectId}>{#each projects as p (p._id)}<option value={p._id}>{p.name} ({p.identifier})</option>{/each}</select>
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

    <section class="card motion-rise" style="--i: 2">
      <span class="card__step">or</span>
      <div class="card__body">
        <span class="card__title">Or import straight from Jira Cloud (REST API)</span>
        <p class="hint">Brings attachments and change history too. Runs on the integrations service with your Jira API token; nothing is stored. Create a token at id.atlassian.com → Security → API tokens.</p>
        <div class="grid2">
          <input class="select" placeholder="https://your-site.atlassian.net" bind:value={apiBase} />
          <input class="select" placeholder="you@company.com" bind:value={apiEmail} />
          <input class="select" type="password" placeholder="Jira API token" bind:value={apiToken} />
          <input class="select" placeholder="JQL, e.g. project = ABC ORDER BY created ASC" bind:value={apiJql} />
          <input class="select" type="password" placeholder="Integrations INBOUND_TOKEN" bind:value={apiInbound} />
        </div>
        <div class="opts">
          <label class="check"><input type="checkbox" bind:checked={apiAttachments} /> attachments</label>
          <label class="check"><input type="checkbox" bind:checked={apiHistory} /> change history</label>
          <label class="check"><input type="checkbox" bind:checked={apiComments} /> comments</label>
          <label class="check"><input type="checkbox" bind:checked={apiWorklogs} /> work logs</label>
        </div>
        <div class="actions"><Button kind={'primary'} label={tracker.string.ImportIssues} disabled={apiBase.trim() === '' || apiEmail.trim() === '' || apiToken.trim() === '' || apiJql.trim() === '' || apiInbound.trim() === '' || apiJob?.state === 'running'} on:click={() => { void startApiImport() }} /></div>
        {#if apiError !== ''}<p class="err">{apiError}</p>{/if}
        {#if apiJob !== undefined}
          <div class="progress"><span class="progress__fill" style="width: {apiJob.total === 0 ? (apiJob.state === 'running' ? 5 : 100) : (apiJob.done / apiJob.total) * 100}%" /></div>
          <p class="hint">{apiJob.state} · {apiJob.done} / {apiJob.total} issues · {apiJob.created} created · {apiJob.attachments} attachments{#if apiJob.errors.length > 0} · {apiJob.errors.length} failed{/if}</p>
          {#if apiJob.errors.length > 0}<ul class="errs">{#each apiJob.errors.slice(0, 20) as e}<li>{e}</li>{/each}</ul>{/if}
        {/if}
      </div>
    </section>

    {#if rows.length > 0 && mapping !== undefined}
      <section class="card motion-rise" style="--i: 3">
        <span class="card__step">3</span>
        <div class="card__body">
          <span class="card__title">Preview</span>
          <ul class="facts">
            <li><b>{rows.length}</b> issues · <b>{counts.epics}</b> epics · <b>{counts.subtasks}</b> sub-tasks → <b>{project?.name}</b></li>
            <li><b>{counts.labels}</b> labels (created if missing) · <b>{counts.sprints}</b> sprints (created as planned) · <b>{counts.versions}</b> versions → milestones</li>
            <li><b>{counts.comments}</b> comments · <b>{counts.worklogs}</b> work logs · <b>{counts.attachments}</b> attachment links (appended to descriptions)</li>
            {#if knownColumns.length > 0}<li>Custom fields kept in descriptions: <i>{knownColumns.slice(0, 8).join(', ')}{knownColumns.length > 8 ? '…' : ''}</i></li>{/if}
            <li>Statuses map by name; unknown ones go to the default status{#if unmappedStatuses.length > 0}: <i>{unmappedStatuses.join(', ')}</i>{/if}</li>
            <li>People match by name or email{#if unmatchedPeople.length > 0}; not found, left unassigned: <i>{unmatchedPeople.slice(0, 10).join(', ')}{unmatchedPeople.length > 10 ? '…' : ''}</i>{/if}</li>
            <li>Priorities: Highest/Blocker → Urgent, High → High, Medium → Medium, Low/Lowest → Low</li>
            <li>Not importable from CSV: attachment files, change history.</li>
          </ul>
          <div class="opts">
            <label class="check"><input type="checkbox" bind:checked={includeComments} /> import comments</label>
            <label class="check"><input type="checkbox" bind:checked={includeWorklogs} /> import work logs</label>
          </div>
          <div class="actions"><Button kind={'primary'} label={tracker.string.ImportIssues} disabled={importing || rows.length === 0} on:click={run} /></div>
          {#if importing || finished}
            <div class="progress"><span class="progress__fill" style="width: {(done / rows.length) * 100}%" /></div>
            <p class="hint">{done} / {rows.length}{#if finished} · done{/if}{#if errors.length > 0} · {errors.length} failed{/if}</p>
            {#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}
          {/if}
        </div>
      </section>
    {/if}
  </div>
</div>

<style lang="scss">
  .imp { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem 2rem; max-width: 56rem; overflow: auto; }
  .imp__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .imp__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .imp__sub, .hint { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .card { display: flex; gap: 0.9rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__step { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 1.6rem; height: 1.6rem; border-radius: 50%; background-image: var(--accent-gradient); color: #fff; font-size: 0.8rem; font-weight: 700; }
  .card__body { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-width: 0; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .select, .paste { padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .paste { min-height: 8rem; font-family: var(--mono-font, ui-monospace, Menlo, monospace); font-size: 0.75rem; resize: vertical; }
  .file { font-size: 0.8125rem; color: var(--theme-content-color); }
  .err { margin: 0; color: var(--negative-button-default); font-size: 0.8125rem; }
  .facts { margin: 0; padding-left: 1.2rem; font-size: 0.875rem; color: var(--theme-content-color); line-height: 1.6; b { color: var(--theme-caption-color); } i { color: var(--theme-dark-color); } }
  .opts { display: flex; gap: 1rem; }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .actions { display: flex; justify-content: flex-end; }
  .progress { height: 0.4rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .progress__fill { display: block; height: 100%; background-image: var(--accent-gradient); transition: width var(--motion-fast) linear; }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.5rem; }
</style>
