//
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
//

// Shared pieces for the Trello, Asana and GitHub importers: CSV parsing,
// status and people mapping, and creating one issue with labels, comments
// and a parent.

import contact, { formatName, type Person } from '@hcengineering/contact'
import core, { generateId, makeCollabId, SocialIdType, SortingOrder, type DocData, type Ref } from '@hcengineering/core'
import { createMarkup, getClient } from '@hcengineering/presentation'
import tags from '@hcengineering/tags'
import task, { makeRank, type TaskType } from '@hcengineering/task'
import { jsonToMarkup, type MarkupNode } from '@hcengineering/text'
import { IssuePriority, type Issue, type IssueParentInfo, type IssueStatus, type Project } from '@hcengineering/tracker'

import tracker from '../../plugin'
import { paragraphs } from '../../createIssueDoc'

export function parseCsv (text: string): string[][] {
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

export function column (header: string[], ...names: string[]): number {
  const h = header.map((c) => c.trim().toLowerCase())
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase())
    if (i >= 0) return i
  }
  for (const n of names) {
    const i = h.findIndex((c) => c.includes(n.toLowerCase()))
    if (i >= 0) return i
  }
  return -1
}

export const PRIORITY_WORDS: Record<string, IssuePriority> = { highest: IssuePriority.Urgent, urgent: IssuePriority.Urgent, critical: IssuePriority.Urgent, blocker: IssuePriority.Urgent, p0: IssuePriority.Urgent, high: IssuePriority.High, p1: IssuePriority.High, medium: IssuePriority.Medium, normal: IssuePriority.Medium, p2: IssuePriority.Medium, low: IssuePriority.Low, lowest: IssuePriority.Low, minor: IssuePriority.Low, p3: IssuePriority.Low }

export interface Mapping {
  project: Project
  issueType: TaskType
  epicType?: TaskType
  statuses: IssueStatus[]
  defaultStatus: Ref<IssueStatus>
  doneStatus: Ref<IssueStatus> | undefined
  activeStatus: Ref<IssueStatus> | undefined
  statusFor: (name: string) => Ref<IssueStatus>
  personFor: (nameOrEmail: string) => Ref<Person> | null
}

export async function buildMapping (p: Project): Promise<Mapping> {
  const client = getClient()
  const ptype = await client.findOne(task.class.ProjectType, { _id: p.type })
  const types = ptype !== undefined ? await client.findAll(task.class.TaskType, { _id: { $in: ptype.tasks } }) : []
  const issueType = types.find((t) => t.name === 'Issue') ?? types[0]
  const epicType = types.find((t) => t.name === 'Epic')
  const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: issueType.statuses as Ref<IssueStatus>[] } })
  const byName = new Map(statuses.map((s) => [s.name.toLowerCase(), s._id]))
  const firstOf = (cat: Ref<any>): Ref<IssueStatus> | undefined => (issueType.statuses as Ref<IssueStatus>[]).find((id) => statuses.find((s) => s._id === id)?.category === cat)
  const defaultStatus = p.defaultIssueStatus !== undefined && String(p.defaultIssueStatus) !== '' ? p.defaultIssueStatus : (issueType.statuses[0] as Ref<IssueStatus>)
  const doneStatus = firstOf(task.statusCategory.Won)
  const activeStatus = firstOf(task.statusCategory.Active)
  const SYN: Record<string, Ref<IssueStatus> | undefined> = {
    'to do': firstOf(task.statusCategory.ToDo) ?? firstOf(task.statusCategory.UnStarted),
    todo: firstOf(task.statusCategory.ToDo) ?? firstOf(task.statusCategory.UnStarted),
    open: firstOf(task.statusCategory.ToDo) ?? firstOf(task.statusCategory.UnStarted),
    backlog: firstOf(task.statusCategory.UnStarted) ?? firstOf(task.statusCategory.ToDo),
    'in progress': activeStatus,
    doing: activeStatus,
    'in review': activeStatus,
    review: activeStatus,
    done: doneStatus,
    closed: doneStatus,
    complete: doneStatus,
    completed: doneStatus,
    resolved: doneStatus,
    cancelled: firstOf(task.statusCategory.Lost),
    canceled: firstOf(task.statusCategory.Lost)
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
  return { project: p, issueType, epicType, statuses, defaultStatus, doneStatus, activeStatus, statusFor, personFor }
}

export function markupOf (lines: string[]): string {
  return jsonToMarkup({ type: 'doc', content: lines.flatMap((l) => paragraphs(l)) } as unknown as MarkupNode)
}

export interface Created {
  _id: Ref<Issue>
  title: string
  identifier: string
  parents: IssueParentInfo[]
}

export interface NewIssue {
  title: string
  description: string[]
  status?: Ref<IssueStatus>
  priority?: IssuePriority
  assignee?: Ref<Person> | null
  dueDate?: number
  labels?: string[]
  comments?: Array<{ author: string, date?: number, body: string }>
  parent?: Created
  isEpic?: boolean
  storyPoints?: number
  externalLinks?: Array<{ url: string, label: string }>
}

export class Importer {
  private readonly client = getClient()
  private readonly tagCache = new Map<string, { _id: Ref<any>, color: number }>()
  private rank: string | undefined
  private ready = false

  constructor (readonly m: Mapping) {}

  private async init (): Promise<void> {
    if (this.ready) return
    const last = await this.client.findOne(tracker.class.Issue, { space: this.m.project._id }, { sort: { rank: SortingOrder.Descending } })
    this.rank = last?.rank
    this.ready = true
  }

  async tag (title: string): Promise<{ _id: Ref<any>, color: number }> {
    const key = title.toLowerCase()
    const hit = this.tagCache.get(key)
    if (hit !== undefined) return hit
    const existing = await this.client.findOne(tags.class.TagElement, { targetClass: tracker.class.Issue, title })
    if (existing !== undefined) {
      this.tagCache.set(key, existing)
      return existing
    }
    const color = Math.floor(Math.random() * 20)
    const _id = await this.client.createDoc(tags.class.TagElement, core.space.Workspace, { title, description: '', targetClass: tracker.class.Issue, color, category: tags.category.NoCategory })
    const el = { _id, color }
    this.tagCache.set(key, el)
    return el
  }

  async create (n: NewIssue, source: string): Promise<Created> {
    await this.init()
    const { m, client } = this
    const p = m.project
    const kind = (n.isEpic === true ? m.epicType?._id : undefined) ?? m.issueType._id
    const inc = await client.updateDoc(tracker.class.Project, core.space.Space, p._id, { $inc: { sequence: 1 } }, true)
    const number = (inc as any).object.sequence as number
    const identifier = `${p.identifier}-${number}`
    const _id = generateId<Issue>()
    this.rank = makeRank(this.rank, undefined)
    const node = { type: 'doc', content: [...paragraphs(`Imported from ${source}`), ...n.description.flatMap((l) => paragraphs(l))] } as unknown as MarkupNode
    const description = await createMarkup(makeCollabId(tracker.class.Issue, _id, 'description'), jsonToMarkup(node))
    const parent = n.parent
    const value: DocData<Issue> = {
      title: n.title,
      description,
      assignee: n.assignee ?? null,
      component: null,
      milestone: null,
      sprint: null,
      number,
      status: n.status ?? m.defaultStatus,
      priority: n.priority ?? IssuePriority.NoPriority,
      rank: this.rank,
      comments: 0,
      subIssues: 0,
      startDate: null,
      dueDate: n.dueDate ?? null,
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
      ...(n.storyPoints !== undefined ? { storyPoints: n.storyPoints } : {}),
      ...(n.externalLinks !== undefined && n.externalLinks.length > 0 ? { externalLinks: n.externalLinks } : {})
    }
    await client.addCollection(tracker.class.Issue, p._id, parent?._id ?? tracker.ids.NoParent, tracker.class.Issue, 'subIssues', value, _id)
    for (const l of n.labels ?? []) {
      if (l.trim() === '') continue
      const t = await this.tag(l.trim())
      await client.addCollection(tags.class.TagReference, p._id, _id, tracker.class.Issue, 'labels', { tag: t._id, title: l.trim(), color: t.color })
    }
    for (const c of n.comments ?? []) {
      const when = c.date !== undefined ? new Date(c.date).toLocaleDateString() : ''
      await client.addCollection('chunter:class:ChatMessage' as any, p._id, _id, tracker.class.Issue, 'comments', { message: markupOf([`${c.author}${when !== '' ? ` · ${when}` : ''} (from ${source}):`, c.body]), attachments: 0 } as any)
    }
    return { _id, title: n.title, identifier, parents: value.parents }
  }
}
