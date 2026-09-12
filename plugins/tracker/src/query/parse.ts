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

// A query language for issues, in the spirit of JQL.
//
//   assignee = me AND (status != done OR priority = urgent)
//   NOT labels IN (bug, regression) AND sprint = active
//   status CHANGED TO "In Progress" AFTER -7d BY me
//   assignee WAS none BEFORE -1d
//   project = CEE AND created > -30d ORDER BY priority ASC
//   "login button"                         (free text searches the title)
//
// Grammar (case-insensitive keywords):
//   query   := expr [ORDER BY field [ASC|DESC]]
//   expr    := term (OR term)*
//   term    := factor (AND factor)*
//   factor  := NOT factor | '(' expr ')' | clause
//   clause  := field op value
//            | field [NOT] IN '(' value (',' value)* ')'
//            | field IS [NOT] EMPTY
//            | field CHANGED [FROM v] [TO v] [AFTER d] [BEFORE d] [BY p]
//            | field WAS v [AFTER d] [BEFORE d]
//            | text
//
// Execution: the top-level AND chain pushes what it can down to the server
// as a DocumentQuery; the full tree is then evaluated in memory over the
// candidates. Anything that does not resolve is reported, never dropped.

import { type Person } from '@hcengineering/contact'
import { type DocumentQuery, type PersonId, type Ref, type StatusCategory } from '@hcengineering/core'
import task from '@hcengineering/task'
import type { Issue, IssueStatus, Milestone, Project, Sprint } from '../index'

// Numeric values of IssuePriority, spelled out so this module has no runtime
// import from the plugin index (which re-exports it): NoPriority 0, Urgent 1, High 2, Medium 3, Low 4.
const IssuePriority = { NoPriority: 0, Urgent: 1, High: 2, Medium: 3, Low: 4 }
type IssuePriority = number

// ---- context ------------------------------------------------------------

export interface QueryContext {
  me: Ref<Person> | undefined
  mySocialIds: PersonId[]
  statuses: Array<{ _id: Ref<IssueStatus>, name: string, category?: Ref<StatusCategory> }>
  projects: Array<{ _id: Ref<Project>, name: string, identifier: string }>
  sprints: Array<{ _id: Ref<Sprint>, name: string, state: string }>
  milestones: Array<{ _id: Ref<Milestone>, label: string }>
  people: Array<{ _id: Ref<Person>, name: string, socialIds: PersonId[] }>
  components: Array<{ _id: string, label: string }>
  types: Array<{ _id: string, name: string }>
  resolutions: Array<{ _id: string, name: string }>
  labels: string[]
}

/** Per-issue auxiliary data the evaluator may need. */
export interface Aux {
  labels: Map<Ref<Issue>, Set<string>>
  history: Map<Ref<Issue>, Change[]>
}
export interface Change {
  field: string
  at: number
  value: unknown
  by?: PersonId
}

export interface Plan {
  /** Server-side query for candidates. */
  query: DocumentQuery<Issue>
  /** In-memory predicate over candidates. */
  test: (issue: Issue, aux: Aux) => boolean
  needsLabels: boolean
  needsHistory: boolean
  /** Fields whose history is needed (status, assignee, priority ...). */
  historyFields: Set<string>
  order?: { field: string, desc: boolean }
  errors: string[]
  /** Number of clauses understood. 0 means "nothing to search". */
  clauses: number
}

// ---- tokenizer ------------------------------------------------------------

type Tok =
  | { t: 'word', v: string }
  | { t: 'str', v: string }
  | { t: 'op', v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }

function tokenize (text: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      let s = ''
      while (j < text.length && text[j] !== ch) s += text[j++]
      out.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    if (ch === '(') {
      out.push({ t: 'lp' })
      i++
      continue
    }
    if (ch === ')') {
      out.push({ t: 'rp' })
      i++
      continue
    }
    if (ch === ',') {
      out.push({ t: 'comma' })
      i++
      continue
    }
    const two = text.slice(i, i + 2)
    if (['!=', '>=', '<=', '!~'].includes(two)) {
      out.push({ t: 'op', v: two })
      i += 2
      continue
    }
    if (['=', '>', '<', '~'].includes(ch)) {
      out.push({ t: 'op', v: ch })
      i++
      continue
    }
    let j = i
    let w = ''
    while (j < text.length && !/[\s()",'=<>!~]/.test(text[j])) w += text[j++]
    if (w === '') {
      i++
      continue
    }
    out.push({ t: 'word', v: w })
    i = j
  }
  return out
}

// ---- ast ------------------------------------------------------------------

type Node =
  | { k: 'and', items: Node[] }
  | { k: 'or', items: Node[] }
  | { k: 'not', item: Node }
  | { k: 'cmp', field: string, op: string, value: string }
  | { k: 'in', field: string, values: string[], negate: boolean }
  | { k: 'empty', field: string, negate: boolean }
  | { k: 'changed', field: string, from?: string, to?: string, after?: string, before?: string, by?: string }
  | { k: 'was', field: string, value: string, after?: string, before?: string }
  | { k: 'text', value: string }

class Parser {
  i = 0
  errors: string[] = []
  order?: { field: string, desc: boolean }
  constructor (readonly toks: Tok[]) {}

  peekWord (w: string, offset = 0): boolean {
    const t = this.toks[this.i + offset]
    return t !== undefined && t.t === 'word' && t.v.toLowerCase() === w
  }
  takeWord (): string | undefined {
    const t = this.toks[this.i]
    if (t !== undefined && (t.t === 'word' || t.t === 'str')) {
      this.i++
      return t.v
    }
    return undefined
  }
  value (): string | undefined {
    const t = this.toks[this.i]
    if (t === undefined) return undefined
    if (t.t === 'word' || t.t === 'str') {
      this.i++
      // a bare value may run several words until a keyword/operator/paren:  status = In Progress
      let v = t.v
      if (t.t === 'word') {
        while (true) {
          const n = this.toks[this.i]
          if (n === undefined || n.t !== 'word') break
          if (KEYWORDS.has(n.v.toLowerCase())) break
          v += ' ' + n.v
          this.i++
        }
      }
      return v
    }
    return undefined
  }

  parse (): Node | undefined {
    if (this.toks.length === 0) return undefined
    const e = this.expr()
    if (this.peekWord('order') && this.peekWord('by', 1)) {
      this.i += 2
      const f = this.takeWord()
      let desc = false
      if (this.peekWord('desc')) {
        desc = true
        this.i++
      } else if (this.peekWord('asc')) this.i++
      if (f !== undefined) this.order = { field: f.toLowerCase(), desc }
    }
    if (this.i < this.toks.length) {
      const rest = this.toks.slice(this.i).map((t) => ('v' in t ? t.v : t.t)).join(' ')
      this.errors.push(`could not understand: ${rest}`)
    }
    return e
  }
  expr (): Node {
    const items = [this.term()]
    while (this.peekWord('or')) {
      this.i++
      items.push(this.term())
    }
    return items.length === 1 ? items[0] : { k: 'or', items }
  }
  term (): Node {
    const items = [this.factor()]
    while (true) {
      if (this.peekWord('and')) {
        this.i++
        items.push(this.factor())
      } else if (this.canStartFactor()) {
        // implicit AND between adjacent clauses
        items.push(this.factor())
      } else break
    }
    return items.length === 1 ? items[0] : { k: 'and', items }
  }
  canStartFactor (): boolean {
    const t = this.toks[this.i]
    if (t === undefined) return false
    if (t.t === 'rp' || t.t === 'comma' || t.t === 'op') return false
    if (t.t === 'word' && ['or', 'and', 'order'].includes(t.v.toLowerCase())) return false
    return true
  }
  factor (): Node {
    if (this.peekWord('not')) {
      this.i++
      return { k: 'not', item: this.factor() }
    }
    const t = this.toks[this.i]
    if (t?.t === 'lp') {
      this.i++
      const e = this.expr()
      if (this.toks[this.i]?.t === 'rp') this.i++
      else this.errors.push('missing )')
      return e
    }
    return this.clause()
  }
  clause (): Node {
    const t = this.toks[this.i]
    if (t === undefined) return { k: 'text', value: '' }
    if (t.t === 'str') {
      this.i++
      return { k: 'text', value: t.v }
    }
    if (t.t !== 'word') {
      this.i++
      this.errors.push(`unexpected ${'v' in t ? t.v : t.t}`)
      return { k: 'text', value: '' }
    }
    const field = t.v.toLowerCase()
    const next = this.toks[this.i + 1]
    if (next === undefined) {
      this.i++
      return { k: 'text', value: t.v }
    }
    if (next.t === 'op') {
      this.i += 2
      const v = this.value()
      if (v === undefined) {
        this.errors.push(`${field} ${next.v}: missing value`)
        return { k: 'text', value: '' }
      }
      return { k: 'cmp', field, op: next.v, value: v }
    }
    if (next.t === 'word') {
      const kw = next.v.toLowerCase()
      if (kw === 'in' || (kw === 'not' && this.peekWord('in', 2))) {
        const negate = kw === 'not'
        this.i += negate ? 3 : 2
        const values: string[] = []
        if (this.toks[this.i]?.t === 'lp') {
          this.i++
          while (this.i < this.toks.length && this.toks[this.i].t !== 'rp') {
            const v = this.value()
            if (v !== undefined) values.push(v)
            if (this.toks[this.i]?.t === 'comma') this.i++
            else if (this.toks[this.i]?.t !== 'rp') break
          }
          if (this.toks[this.i]?.t === 'rp') this.i++
          else this.errors.push(`${field} in: missing )`)
        } else {
          const v = this.value()
          if (v !== undefined) values.push(v)
        }
        return { k: 'in', field, values, negate }
      }
      if (kw === 'is') {
        this.i += 2
        let negate = false
        if (this.peekWord('not')) {
          negate = true
          this.i++
        }
        if (this.peekWord('empty') || this.peekWord('null')) this.i++
        else this.errors.push(`${field} is: expected EMPTY`)
        return { k: 'empty', field, negate }
      }
      if (kw === 'changed') {
        this.i += 2
        const n: Node = { k: 'changed', field }
        while (true) {
          if (this.peekWord('from')) {
            this.i++
            n.from = this.value()
          } else if (this.peekWord('to')) {
            this.i++
            n.to = this.value()
          } else if (this.peekWord('after')) {
            this.i++
            n.after = this.value()
          } else if (this.peekWord('before')) {
            this.i++
            n.before = this.value()
          } else if (this.peekWord('by')) {
            this.i++
            n.by = this.value()
          } else break
        }
        return n
      }
      if (kw === 'was') {
        this.i += 2
        const value = this.value() ?? ''
        const n: Node = { k: 'was', field, value }
        while (true) {
          if (this.peekWord('after')) {
            this.i++
            n.after = this.value()
          } else if (this.peekWord('before')) {
            this.i++
            n.before = this.value()
          } else break
        }
        return n
      }
    }
    // plain word: free text
    this.i++
    return { k: 'text', value: t.v }
  }
}

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is', 'changed', 'was', 'from', 'to', 'after', 'before', 'by', 'order', 'empty', 'null'])

// ---- values ---------------------------------------------------------------

const PRIORITY: Record<string, IssuePriority> = {
  urgent: IssuePriority.Urgent,
  highest: IssuePriority.Urgent,
  high: IssuePriority.High,
  medium: IssuePriority.Medium,
  low: IssuePriority.Low,
  lowest: IssuePriority.Low,
  none: IssuePriority.NoPriority
}
const SCALE = [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low]

const DAY = 86_400_000
export function parseDate (value: string): { from: number, to: number } | undefined {
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
  if (v === 'startofweek') {
    const d = new Date(sod(now))
    const dow = (d.getDay() + 6) % 7
    return { from: d.getTime() - dow * DAY, to: d.getTime() - dow * DAY }
  }
  const rel = /^([+-]?\d+)([hdwmy])$/.exec(v)
  if (rel !== null) {
    const n = parseInt(rel[1], 10)
    const unit = { h: 3_600_000, d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY }[rel[2]] ?? DAY
    const t = now + n * unit
    return { from: t, to: t }
  }
  const abs = Date.parse(value.trim())
  if (!Number.isNaN(abs)) return { from: sod(abs), to: sod(abs) + DAY }
  return undefined
}

function eq (a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// ---- resolution: leaf → { pushdown, test } -------------------------------

interface Leaf {
  push?: Record<string, any>
  test: (i: Issue, aux: Aux) => boolean
}

const DATE_FIELDS: Record<string, keyof Issue> = { created: 'createdOn', updated: 'modifiedOn', due: 'dueDate', sla: 'slaDue', start: 'startDate' }
const NUM_FIELDS: Record<string, keyof Issue> = { points: 'storyPoints', storypoints: 'storyPoints', estimate: 'estimation', estimation: 'estimation', reported: 'reportedTime' }

function cmpNumber (op: string, n: number): { push: any, test: (x: number | undefined | null) => boolean } {
  const t = (x: number | undefined | null): boolean => {
    const v = x ?? 0
    switch (op) {
      case '=':
        return v === n
      case '!=':
        return v !== n
      case '>':
        return v > n
      case '>=':
        return v >= n
      case '<':
        return v < n
      case '<=':
        return v <= n
    }
    return false
  }
  const push =
    op === '='
      ? n
      : op === '!='
        ? { $ne: n }
        : op === '>'
          ? { $gt: n }
          : op === '>='
            ? { $gte: n }
            : op === '<'
              ? { $lt: n }
              : { $lte: n }
  return { push, test: t }
}

function cmpDate (op: string, d: { from: number, to: number }): { push: any, test: (x: number | undefined | null) => boolean } {
  const to = d.to === d.from ? d.from + DAY : d.to
  switch (op) {
    case '=':
      return { push: { $gte: d.from, $lt: to }, test: (x) => x != null && x >= d.from && x < to }
    case '!=':
      return { push: undefined, test: (x) => !(x != null && x >= d.from && x < to) }
    case '>':
      return { push: { $gte: d.to }, test: (x) => x != null && x >= d.to }
    case '>=':
      return { push: { $gte: d.from }, test: (x) => x != null && x >= d.from }
    case '<':
      return { push: { $lt: d.from }, test: (x) => x != null && x < d.from }
    default:
      return { push: { $lt: to }, test: (x) => x != null && x < to }
  }
}

function refLeaf (key: keyof Issue, ids: Array<string | null>, negate: boolean): Leaf {
  const set = new Set(ids)
  const push = negate ? { [key]: { $nin: ids } } : { [key]: { $in: ids } }
  return { push, test: (i) => set.has((i[key] as any) ?? null) !== negate }
}

function resolveValues (field: string, values: string[], ctx: QueryContext, errors: string[]): Array<string | null> | undefined {
  const out: Array<string | null> = []
  for (const raw of values) {
    const v = raw.trim()
    const lower = v.toLowerCase()
    const none = ['none', 'empty', 'null', 'unassigned'].includes(lower)
    switch (field) {
      case 'assignee':
      case 'owner': {
        if (lower === 'me') {
          if (ctx.me === undefined) errors.push('assignee = me: no employee record')
          else out.push(ctx.me)
        } else if (none) out.push(null)
        else {
          const hits = ctx.people.filter((p) => p.name.toLowerCase().includes(lower))
          if (hits.length === 0) errors.push(`assignee: no person matches "${v}"`)
          out.push(...hits.map((p) => p._id))
        }
        break
      }
      case 'status': {
        if (['done', 'closed', 'resolved'].includes(lower)) {
          out.push(...ctx.statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id))
        } else if (lower === 'open') {
          out.push(...ctx.statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id))
        } else if (lower === 'active' || lower === 'inprogress') {
          out.push(...ctx.statuses.filter((s) => s.category === task.statusCategory.Active).map((s) => s._id))
        } else {
          const ids = ctx.statuses.filter((s) => eq(s.name, v)).map((s) => s._id)
          if (ids.length === 0) errors.push(`status: no status named "${v}"`)
          out.push(...ids)
        }
        break
      }
      case 'project': {
        const hits = ctx.projects.filter((p) => eq(p.identifier, v) || eq(p.name, v))
        if (hits.length === 0) errors.push(`project: no project "${v}"`)
        out.push(...hits.map((p) => p._id))
        break
      }
      case 'sprint': {
        if (lower === 'active') out.push(...ctx.sprints.filter((s) => s.state === 'active').map((s) => s._id))
        else if (none || lower === 'backlog') out.push(null)
        else {
          const hits = ctx.sprints.filter((s) => eq(s.name, v))
          if (hits.length === 0) errors.push(`sprint: no sprint named "${v}"`)
          out.push(...hits.map((s) => s._id))
        }
        break
      }
      case 'milestone':
      case 'fixversion':
      case 'affectsversion': {
        if (none) out.push(null)
        else {
          const hits = ctx.milestones.filter((m) => eq(m.label, v))
          if (hits.length === 0) errors.push(`milestone: no milestone named "${v}"`)
          out.push(...hits.map((m) => m._id))
        }
        break
      }
      case 'component': {
        if (none) out.push(null)
        else {
          const hits = ctx.components.filter((c) => eq(c.label, v))
          if (hits.length === 0) errors.push(`component: no component "${v}"`)
          out.push(...hits.map((c) => c._id))
        }
        break
      }
      case 'type':
      case 'kind':
      case 'issuetype': {
        const hits = ctx.types.filter((t) => eq(t.name, v))
        if (hits.length === 0) errors.push(`type: no issue type "${v}"`)
        out.push(...hits.map((t) => t._id))
        break
      }
      case 'resolution': {
        if (none) out.push(null)
        else {
          const hits = ctx.resolutions.filter((r) => eq(r.name, v))
          if (hits.length === 0) errors.push(`resolution: no resolution "${v}"`)
          out.push(...hits.map((r) => r._id))
        }
        break
      }
      case 'priority': {
        const p = PRIORITY[lower]
        if (p === undefined) errors.push(`priority: use urgent, high, medium, low or none (got "${v}")`)
        else out.push(String(p))
        break
      }
      case 'reporter':
      case 'creator': {
        if (lower === 'me') out.push(...ctx.mySocialIds)
        else {
          const hits = ctx.people.filter((p) => p.name.toLowerCase().includes(lower))
          if (hits.length === 0) errors.push(`reporter: no person matches "${v}"`)
          for (const h of hits) out.push(...h.socialIds)
        }
        break
      }
      default:
        errors.push(`unknown field "${field}"`)
        return undefined
    }
  }
  return out
}

const REF_KEYS: Record<string, keyof Issue> = {
  assignee: 'assignee',
  owner: 'assignee',
  status: 'status',
  project: 'space',
  sprint: 'sprint',
  milestone: 'milestone',
  fixversion: 'milestone',
  affectsversion: 'affectsMilestone',
  component: 'component',
  type: 'kind',
  kind: 'kind',
  issuetype: 'kind',
  resolution: 'resolution',
  reporter: 'createdBy',
  creator: 'createdBy'
}

function leafFor (n: Node, ctx: QueryContext, errors: string[], needs: { labels: boolean, history: Set<string> }): Leaf {
  const TRUE: Leaf = { test: () => true }
  switch (n.k) {
    case 'text': {
      if (n.value.trim() === '') return TRUE
      const v = n.value.toLowerCase()
      return { push: { title: { $like: `%${n.value}%` } }, test: (i) => i.title.toLowerCase().includes(v) }
    }
    case 'empty': {
      const key = REF_KEYS[n.field] ?? (n.field === 'labels' || n.field === 'label' ? undefined : DATE_FIELDS[n.field] ?? NUM_FIELDS[n.field])
      if (n.field === 'labels' || n.field === 'label') {
        needs.labels = true
        return { test: (i, aux) => (aux.labels.get(i._id)?.size ?? 0) === 0 !== n.negate }
      }
      if (key === undefined) {
        errors.push(`unknown field "${n.field}"`)
        return TRUE
      }
      return {
        push: n.negate ? { [key]: { $ne: null } } : { [key]: null },
        test: (i) => ((i[key] as any) == null) !== n.negate
      }
    }
    case 'in': {
      if (n.field === 'labels' || n.field === 'label') {
        needs.labels = true
        const set = new Set(n.values.map((v) => v.toLowerCase()))
        return { test: (i, aux) => [...(aux.labels.get(i._id) ?? [])].some((l) => set.has(l)) !== n.negate }
      }
      const key = REF_KEYS[n.field]
      if (key === undefined) {
        errors.push(`${n.field} IN: unsupported field`)
        return TRUE
      }
      const ids = resolveValues(n.field, n.values, ctx, errors)
      if (ids === undefined) return TRUE
      if (n.field === 'priority') {
        const nums = ids.map((x) => Number(x))
        const set = new Set(nums)
        return { push: { priority: n.negate ? { $nin: nums } : { $in: nums } }, test: (i) => set.has(i.priority) !== n.negate }
      }
      return refLeaf(key, ids, n.negate)
    }
    case 'cmp': {
      const f = n.field
      const v = n.value
      const lower = v.toLowerCase()
      if (f === 'labels' || f === 'label') {
        needs.labels = true
        if (n.op === '~' || n.op === '!~') {
          return { test: (i, aux) => [...(aux.labels.get(i._id) ?? [])].some((l) => l.includes(lower)) !== (n.op === '!~') }
        }
        return { test: (i, aux) => (aux.labels.get(i._id)?.has(lower) ?? false) !== (n.op === '!=') }
      }
      if (['title', 'text', 'summary'].includes(f)) {
        const neg = n.op === '!=' || n.op === '!~'
        return { push: neg ? undefined : { title: { $like: `%${v}%` } }, test: (i) => i.title.toLowerCase().includes(lower) !== neg }
      }
      if (f === 'key' || f === 'id' || f === 'identifier') {
        const neg = n.op === '!='
        return { push: neg ? { identifier: { $ne: v.toUpperCase() } } : { identifier: v.toUpperCase() }, test: (i) => (i.identifier.toLowerCase() === lower) !== neg }
      }
      if (f === 'parent') {
        errors.push('parent: use  parent = KEY-1  via the sub-issues view for now')
        return TRUE
      }
      if (f === 'priority' && ['>', '>=', '<', '<='].includes(n.op)) {
        const p = PRIORITY[lower]
        const idx = p !== undefined ? SCALE.indexOf(p) : -1
        if (idx < 0) {
          errors.push(`priority: use urgent, high, medium or low with ${n.op}`)
          return TRUE
        }
        const list = n.op === '>=' ? SCALE.slice(0, idx + 1) : n.op === '>' ? SCALE.slice(0, idx) : n.op === '<=' ? SCALE.slice(idx) : SCALE.slice(idx + 1)
        const set = new Set(list)
        return { push: { priority: { $in: list } }, test: (i) => set.has(i.priority) }
      }
      if (DATE_FIELDS[f] !== undefined) {
        const d = parseDate(v)
        if (d === undefined) {
          errors.push(`${f}: use -7d, -2w, today, yesterday, now or a date (got "${v}")`)
          return TRUE
        }
        const key = DATE_FIELDS[f]
        const c = cmpDate(n.op, d)
        return { push: c.push !== undefined ? { [key]: c.push } : undefined, test: (i) => c.test(i[key] as any) }
      }
      if (NUM_FIELDS[f] !== undefined) {
        const num = Number(v)
        if (Number.isNaN(num)) {
          errors.push(`${f}: expected a number (got "${v}")`)
          return TRUE
        }
        const key = NUM_FIELDS[f]
        const c = cmpNumber(n.op, num)
        return { push: { [key]: c.push }, test: (i) => c.test(i[key] as any) }
      }
      if (f === 'votes') {
        const c = cmpNumber(n.op, Number(v))
        return { test: (i) => c.test((i as any).voteCount) }
      }
      const key = REF_KEYS[f]
      if (key === undefined) {
        errors.push(`unknown field "${f}"`)
        return TRUE
      }
      if (n.op === '~' || n.op === '!~') {
        // name contains, for people and names
        const ids = resolveValues(f, [v], ctx, errors)
        if (ids === undefined) return TRUE
        return refLeaf(key, ids, n.op === '!~')
      }
      const ids = resolveValues(f, [v], ctx, errors)
      if (ids === undefined) return TRUE
      if (f === 'priority') {
        const nums = ids.map((x) => Number(x))
        const set = new Set(nums)
        return { push: { priority: n.op === '!=' ? { $nin: nums } : { $in: nums } }, test: (i) => set.has(i.priority) !== (n.op === '!=') }
      }
      return refLeaf(key, ids, n.op === '!=')
    }
    case 'changed': {
      const key = REF_KEYS[n.field] ?? (n.field === 'priority' ? 'priority' : undefined)
      if (key === undefined || !['status', 'assignee', 'priority', 'milestone', 'sprint', 'component'].includes(key)) {
        errors.push(`${n.field} CHANGED: history is kept for status, assignee, priority, milestone, sprint, component`)
        return TRUE
      }
      needs.history.add(key)
      const from = n.from !== undefined ? resolveValues(n.field, [n.from], ctx, errors) : undefined
      const to = n.to !== undefined ? resolveValues(n.field, [n.to], ctx, errors) : undefined
      const after = n.after !== undefined ? parseDate(n.after)?.from : undefined
      const before = n.before !== undefined ? parseDate(n.before)?.to : undefined
      if (n.after !== undefined && after === undefined) errors.push(`AFTER: bad date "${n.after}"`)
      if (n.before !== undefined && before === undefined) errors.push(`BEFORE: bad date "${n.before}"`)
      let by: Set<PersonId> | undefined
      if (n.by !== undefined) {
        by = new Set(n.by.toLowerCase() === 'me' ? ctx.mySocialIds : ctx.people.filter((p) => p.name.toLowerCase().includes(n.by?.toLowerCase() ?? '')).flatMap((p) => p.socialIds))
      }
      const norm = (x: unknown): string | null => (x == null ? null : key === 'priority' ? String(x) : String(x))
      return {
        test: (i, aux) => {
          const changes = (aux.history.get(i._id) ?? []).filter((c) => c.field === key)
          for (let idx = 0; idx < changes.length; idx++) {
            const c = changes[idx]
            if (after !== undefined && c.at < after) continue
            if (before !== undefined && c.at > before) continue
            if (to !== undefined && !to.includes(norm(c.value))) continue
            if (from !== undefined) {
              const prev = idx > 0 ? norm(changes[idx - 1].value) : undefined
              if (prev === undefined || !from.includes(prev)) continue
            }
            if (by !== undefined && (c.by === undefined || !by.has(c.by))) continue
            return true
          }
          return false
        }
      }
    }
    case 'was': {
      const key = REF_KEYS[n.field] ?? (n.field === 'priority' ? 'priority' : undefined)
      if (key === undefined || !['status', 'assignee', 'priority', 'milestone', 'sprint', 'component'].includes(key)) {
        errors.push(`${n.field} WAS: history is kept for status, assignee, priority, milestone, sprint, component`)
        return TRUE
      }
      needs.history.add(key)
      const ids = resolveValues(n.field, [n.value], ctx, errors)
      if (ids === undefined) return TRUE
      const after = n.after !== undefined ? parseDate(n.after)?.from : undefined
      const before = n.before !== undefined ? parseDate(n.before)?.to : undefined
      const norm = (x: unknown): string | null => (x == null ? null : String(x))
      const want = new Set(ids.map((x) => (x == null ? null : String(x))))
      return {
        test: (i, aux) => {
          const changes = (aux.history.get(i._id) ?? []).filter((c) => c.field === key)
          // intervals: [changes[k].at, changes[k+1].at) hold changes[k].value; the last runs to now
          const cur = norm((i as any)[key])
          const from = after ?? 0
          const to = before ?? Number.MAX_SAFE_INTEGER
          if (changes.length === 0) return want.has(cur) && (i.createdOn ?? 0) <= to
          for (let k = 0; k < changes.length; k++) {
            const start = changes[k].at
            const end = k + 1 < changes.length ? changes[k + 1].at : Number.MAX_SAFE_INTEGER
            if (start <= to && end >= from && want.has(norm(changes[k].value))) return true
          }
          return false
        }
      }
    }
    default:
      return TRUE
  }
}

// ---- compile --------------------------------------------------------------

export function compile (text: string, ctx: QueryContext): Plan {
  const errors: string[] = []
  const toks = tokenize(text)
  const parser = new Parser(toks)
  const ast = parser.parse()
  errors.push(...parser.errors)
  const needs = { labels: false, history: new Set<string>() }

  if (ast === undefined) {
    return { query: {}, test: () => true, needsLabels: false, needsHistory: false, historyFields: new Set(), errors, clauses: 0 }
  }

  let clauses = 0
  const build = (n: Node): Leaf => {
    switch (n.k) {
      case 'and': {
        const parts = n.items.map(build)
        const push: Record<string, any> = {}
        for (const p of parts) if (p.push !== undefined) Object.assign(push, p.push)
        return { push, test: (i, a) => parts.every((p) => p.test(i, a)) }
      }
      case 'or': {
        const parts = n.items.map(build)
        return { test: (i, a) => parts.some((p) => p.test(i, a)) }
      }
      case 'not': {
        const p = build(n.item)
        return { test: (i, a) => !p.test(i, a) }
      }
      default:
        clauses++
        return leafFor(n, ctx, errors, needs)
    }
  }
  const root = build(ast)
  return {
    query: (root.push ?? {}) as DocumentQuery<Issue>,
    test: root.test,
    needsLabels: needs.labels,
    needsHistory: needs.history.size > 0,
    historyFields: needs.history,
    order: parser.order,
    errors,
    clauses
  }
}

// ---- autocomplete ---------------------------------------------------------

export const FIELDS = [
  'assignee', 'status', 'priority', 'project', 'sprint', 'milestone', 'affectsversion', 'component', 'type', 'resolution',
  'labels', 'reporter', 'created', 'updated', 'due', 'sla', 'start', 'points', 'estimate', 'reported', 'votes', 'title', 'key'
]
export const OPERATORS = ['=', '!=', '>', '>=', '<', '<=', '~', 'in', 'not in', 'is empty', 'is not empty', 'changed', 'was']

export interface Suggestion {
  text: string
  hint?: string
}

/** Suggestions for the token at the end of `text`. */
export function suggest (text: string, ctx: QueryContext): { replaceFrom: number, items: Suggestion[] } {
  const m = /(\S*)$/.exec(text)
  const partial = (m?.[1] ?? '').toLowerCase()
  const replaceFrom = text.length - (m?.[1].length ?? 0)
  const before = text.slice(0, replaceFrom).trim()
  const toks = tokenize(before)
  const last = toks[toks.length - 1]
  const prev = toks[toks.length - 2]
  const filt = (items: Suggestion[]): Suggestion[] =>
    items.filter((s) => s.text.toLowerCase().startsWith(partial) || (partial !== '' && s.text.toLowerCase().includes(partial))).slice(0, 12)

  // after an operator (or IN/TO/FROM/WAS) → values for the field
  const opLike = last !== undefined && (last.t === 'op' || (last.t === 'word' && ['in', 'to', 'from', 'was', 'by'].includes(last.v.toLowerCase())) || last.t === 'lp' || last.t === 'comma')
  if (opLike) {
    let field: string | undefined
    for (let k = toks.length - 1; k >= 0; k--) {
      const t = toks[k]
      if (t.t === 'word' && FIELDS.includes(t.v.toLowerCase())) {
        field = t.v.toLowerCase()
        break
      }
    }
    if (last.t === 'word' && last.v.toLowerCase() === 'by') field = 'assignee'
    const q = (s: string): string => (/[\s,()]/.test(s) ? `"${s}"` : s)
    let items: Suggestion[] = []
    switch (field) {
      case 'assignee':
      case 'reporter':
        items = [{ text: 'me' }, { text: 'none' }, ...ctx.people.map((p) => ({ text: q(p.name) }))]
        break
      case 'status':
        items = [{ text: 'open' }, { text: 'done' }, { text: 'active' }, ...Array.from(new Set(ctx.statuses.map((s) => s.name))).map((s) => ({ text: q(s) }))]
        break
      case 'priority':
        items = ['urgent', 'high', 'medium', 'low', 'none'].map((t) => ({ text: t }))
        break
      case 'project':
        items = ctx.projects.map((p) => ({ text: p.identifier, hint: p.name }))
        break
      case 'sprint':
        items = [{ text: 'active' }, { text: 'none' }, ...ctx.sprints.map((s) => ({ text: q(s.name), hint: s.state }))]
        break
      case 'milestone':
      case 'affectsversion':
        items = [{ text: 'none' }, ...ctx.milestones.map((m) => ({ text: q(m.label) }))]
        break
      case 'component':
        items = [{ text: 'none' }, ...ctx.components.map((c) => ({ text: q(c.label) }))]
        break
      case 'type':
        items = ctx.types.map((t) => ({ text: q(t.name) }))
        break
      case 'resolution':
        items = [{ text: 'none' }, ...ctx.resolutions.map((r) => ({ text: q(r.name) }))]
        break
      case 'labels':
        items = ctx.labels.map((l) => ({ text: q(l) }))
        break
      case 'created':
      case 'updated':
      case 'due':
      case 'sla':
      case 'start':
        items = ['now', 'today', 'yesterday', '-1d', '-7d', '-2w', '-30d', 'startOfWeek'].map((t) => ({ text: t }))
        break
      default:
        items = []
    }
    return { replaceFrom, items: filt(items) }
  }
  // after a field → operators
  if (last !== undefined && last.t === 'word' && FIELDS.includes(last.v.toLowerCase()) && (prev === undefined || prev.t !== 'op')) {
    return { replaceFrom, items: filt(OPERATORS.map((o) => ({ text: o }))) }
  }
  // after a value → connectors, or at start → fields
  const afterValue = last !== undefined && (last.t === 'str' || last.t === 'rp' || (last.t === 'word' && prev !== undefined && prev.t === 'op'))
  if (afterValue) {
    return { replaceFrom, items: filt([{ text: 'AND' }, { text: 'OR' }, { text: 'ORDER BY' }, ...FIELDS.map((f) => ({ text: f }))]) }
  }
  return { replaceFrom, items: filt([{ text: 'NOT' }, ...FIELDS.map((f) => ({ text: f }))]) }
}
