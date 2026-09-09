//
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
//

// A small query language for issues, in the spirit of JQL.
//
//   assignee = me AND status != done AND priority >= high
//   sprint = active AND assignee = none
//   project = CEE AND created > -30d
//   updated < -7d
//   "login button"            (free text searches the title)
//
// Clauses are joined with AND. Names are matched case-insensitively against
// the workspace; anything that does not resolve is reported rather than
// silently dropped, so an empty result never hides a typo.

import { type Person } from '@hcengineering/contact'
import { type DocumentQuery, type Ref, type StatusCategory } from '@hcengineering/core'
import task from '@hcengineering/task'
import { IssuePriority, type Issue, type IssueStatus, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'

export interface QueryContext {
  me: Ref<Person> | undefined
  statuses: Array<{ _id: Ref<IssueStatus>, name: string, category?: Ref<StatusCategory> }>
  projects: Array<{ _id: Ref<Project>, name: string, identifier: string }>
  sprints: Array<{ _id: Ref<Sprint>, name: string, state: string }>
  milestones: Array<{ _id: Ref<Milestone>, label: string }>
  people: Array<{ _id: Ref<Person>, name: string }>
}

export interface ParsedQuery {
  query: DocumentQuery<Issue>
  errors: string[]
  clauses: number
}

interface Clause {
  field: string
  op: string
  value: string
}

const CLAUSE = /^([a-zA-Z_]+)\s*(!=|>=|<=|=|>|<|~)\s*(.+)$/

function unquote (v: string): string {
  const t = v.trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
}

function eq (a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

const PRIORITY: Record<string, IssuePriority> = {
  urgent: IssuePriority.Urgent,
  high: IssuePriority.High,
  medium: IssuePriority.Medium,
  low: IssuePriority.Low,
  none: IssuePriority.NoPriority
}
// Lower number = more urgent. NoPriority (0) is outside the scale.
const SCALE = [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low]

function priorityQuery (op: string, value: string): any | undefined {
  const p = PRIORITY[value.toLowerCase()]
  if (p === undefined) return undefined
  if (op === '=') return p
  if (op === '!=') return { $ne: p }
  const idx = SCALE.indexOf(p)
  if (idx < 0) return undefined
  if (op === '>=') return { $in: SCALE.slice(0, idx + 1) }
  if (op === '>') return { $in: SCALE.slice(0, idx) }
  if (op === '<=') return { $in: SCALE.slice(idx) }
  if (op === '<') return { $in: SCALE.slice(idx + 1) }
  return undefined
}

const DAY = 86_400_000
function parseDate (value: string): { from: number, to: number } | undefined {
  const v = value.trim().toLowerCase()
  const now = Date.now()
  const sod = (t: number): number => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (v === 'now') return { from: now, to: now }
  if (v === 'today') return { from: sod(now), to: sod(now) + DAY }
  if (v === 'yesterday') return { from: sod(now) - DAY, to: sod(now) }
  const rel = /^([+-]?\d+)([dwmy])$/.exec(v)
  if (rel !== null) {
    const n = parseInt(rel[1], 10)
    const unit = { d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY }[rel[2]] ?? DAY
    const t = now + n * unit
    return { from: t, to: t }
  }
  const abs = Date.parse(value.trim())
  if (!Number.isNaN(abs)) return { from: sod(abs), to: sod(abs) + DAY }
  return undefined
}

function dateQuery (op: string, value: string): any | undefined {
  const d = parseDate(value)
  if (d === undefined) return undefined
  switch (op) {
    case '=':
      return { $gte: d.from, $lt: d.to === d.from ? d.from + DAY : d.to }
    case '!=':
      return { $not: { $gte: d.from, $lt: d.to === d.from ? d.from + DAY : d.to } }
    case '>':
    case '>=':
      return { $gte: op === '>' ? d.to : d.from }
    case '<':
    case '<=':
      return { $lt: op === '<' ? d.from : d.to }
  }
  return undefined
}

function numberQuery (op: string, value: string): any | undefined {
  const n = Number(value)
  if (Number.isNaN(n)) return undefined
  switch (op) {
    case '=':
      return n
    case '!=':
      return { $ne: n }
    case '>':
      return { $gt: n }
    case '>=':
      return { $gte: n }
    case '<':
      return { $lt: n }
    case '<=':
      return { $lte: n }
  }
  return undefined
}

function refList<T> (ids: T[], op: string): any {
  return op === '!=' ? { $nin: ids } : { $in: ids }
}

export function parseQuery (text: string, ctx: QueryContext): ParsedQuery {
  const query: Record<string, any> = {}
  const errors: string[] = []
  const free: string[] = []
  let clauses = 0

  const parts = text
    .split(/\s+and\s+/i)
    .map((p) => p.trim())
    .filter((p) => p !== '')

  for (const part of parts) {
    const m = CLAUSE.exec(part)
    if (m === null) {
      free.push(unquote(part))
      continue
    }
    const c: Clause = { field: m[1].toLowerCase(), op: m[2], value: unquote(m[3]) }
    clauses++
    const v = c.value
    const lower = v.toLowerCase()

    switch (c.field) {
      case 'assignee':
      case 'owner': {
        if (lower === 'me') {
          if (ctx.me === undefined) errors.push('assignee = me: you have no employee record')
          else query.assignee = c.op === '!=' ? { $ne: ctx.me } : ctx.me
        } else if (['none', 'empty', 'unassigned', 'null'].includes(lower)) {
          query.assignee = c.op === '!=' ? { $ne: null } : null
        } else {
          const hits = ctx.people.filter((p) => p.name.toLowerCase().includes(lower))
          if (hits.length === 0) errors.push(`assignee: no person matches "${v}"`)
          else query.assignee = refList(hits.map((p) => p._id), c.op)
        }
        break
      }
      case 'status': {
        if (lower === 'done' || lower === 'closed' || lower === 'resolved') {
          const ids = ctx.statuses
            .filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost)
            .map((s) => s._id)
          query.status = refList(ids, c.op)
        } else if (lower === 'open') {
          const ids = ctx.statuses
            .filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost)
            .map((s) => s._id)
          query.status = refList(ids, c.op)
        } else {
          const ids = ctx.statuses.filter((s) => eq(s.name, v)).map((s) => s._id)
          if (ids.length === 0) errors.push(`status: no status named "${v}"`)
          else query.status = refList(ids, c.op)
        }
        break
      }
      case 'priority': {
        const q = priorityQuery(c.op, v)
        if (q === undefined) errors.push(`priority: use urgent, high, medium, low or none (got "${v}")`)
        else query.priority = q
        break
      }
      case 'project': {
        const hits = ctx.projects.filter((p) => eq(p.identifier, v) || eq(p.name, v))
        if (hits.length === 0) errors.push(`project: no project "${v}"`)
        else query.space = refList(hits.map((p) => p._id), c.op)
        break
      }
      case 'sprint': {
        if (lower === 'active') {
          query.sprint = refList(ctx.sprints.filter((s) => s.state === 'active').map((s) => s._id), c.op)
        } else if (['none', 'empty', 'null', 'backlog'].includes(lower)) {
          query.sprint = c.op === '!=' ? { $ne: null } : null
        } else {
          const hits = ctx.sprints.filter((s) => eq(s.name, v))
          if (hits.length === 0) errors.push(`sprint: no sprint named "${v}"`)
          else query.sprint = refList(hits.map((s) => s._id), c.op)
        }
        break
      }
      case 'milestone':
      case 'fixversion': {
        if (['none', 'empty', 'null'].includes(lower)) {
          query.milestone = c.op === '!=' ? { $ne: null } : null
        } else {
          const hits = ctx.milestones.filter((mm) => eq(mm.label, v))
          if (hits.length === 0) errors.push(`milestone: no milestone named "${v}"`)
          else query.milestone = refList(hits.map((mm) => mm._id), c.op)
        }
        break
      }
      case 'created':
      case 'updated':
      case 'due': {
        const key = c.field === 'created' ? 'createdOn' : c.field === 'updated' ? 'modifiedOn' : 'dueDate'
        const q = dateQuery(c.op, v)
        if (q === undefined) errors.push(`${c.field}: use -7d, -2w, today, yesterday or a date (got "${v}")`)
        else query[key] = q
        break
      }
      case 'sla': {
        const q = dateQuery(c.op, v)
        if (q === undefined) errors.push(`sla: use now, today, -1d or a date (got "${v}")`)
        else query.slaDue = q
        break
      }
      case 'points':
      case 'storypoints': {
        const q = numberQuery(c.op, v)
        if (q === undefined) errors.push(`points: expected a number (got "${v}")`)
        else query.storyPoints = q
        break
      }
      case 'estimate':
      case 'estimation': {
        const q = numberQuery(c.op, v)
        if (q === undefined) errors.push(`estimate: expected a number of hours (got "${v}")`)
        else query.estimation = q
        break
      }
      case 'title':
      case 'text':
      case 'summary': {
        query.title = { $like: `%${v}%` }
        break
      }
      case 'label':
      case 'labels': {
        errors.push('labels are not queryable yet; use the Labels filter in the list')
        break
      }
      default:
        errors.push(`unknown field "${c.field}"`)
    }
  }

  if (free.length > 0) {
    query.title = { $like: `%${free.join(' ')}%` }
  }

  return { query: query as DocumentQuery<Issue>, errors, clauses: clauses + (free.length > 0 ? 1 : 0) }
}
