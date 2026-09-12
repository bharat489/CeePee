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

// Automation rules: WHEN trigger IF conditions THEN actions, per project or
// across every project (global rules, optionally narrowed to a list).
//
// Triggers: issue events (created, status, priority, assignee, commented,
// updated), a schedule (every N minutes over a scope of issues -- fired by
// the integrations service's heartbeat, or by any issue traffic once due),
// and an incoming webhook (the integrations service stamps the rule with
// the payload; this trigger picks it up).
//
// Actions run on the issue itself or on related issues (parent, children,
// blockers, blocked): set fields, add labels and comments, create issues and
// sub-tasks, send email, post to Slack or Teams, call a webhook. Every run
// is recorded as an AutomationRun so people can see what fired and why.
// Rule-made changes are ordinary transactions and can trigger other rules;
// a per-request depth counter stops that at two levels.
//
// Also hosts the retention sweep (audit events, activity, run log).

import contact from '@hcengineering/contact'
import { runReminders } from './reminders'
import core, { type AttachedData, type Class, type Doc, type Ref, type Tx, type TxCreateDoc, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import task, { makeRank, type TaskType } from '@hcengineering/task'
import tracker, {
  type AutomationAction,
  type AutomationCondition,
  type AutomationRule,
  type AutomationTrigger,
  type Issue,
  type IssueStatus,
  type Project
} from '@hcengineering/tracker'

const DAY = 86_400_000
const MAX_DEPTH = 2
const RUN_RETENTION_DAYS = 30
const TAG_REFERENCE = 'tags:class:TagReference' as Ref<Class<Doc>>
const TAG_ELEMENT = 'tags:class:TagElement' as Ref<Class<Doc>>
const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>

interface Event {
  trigger: AutomationTrigger
  issue?: Issue
  ruleId?: Ref<AutomationRule>
  payload?: Record<string, unknown>
}

async function eventOf (cud: TxCUD<Doc>, control: TriggerControl): Promise<Event | undefined> {
  if (cud.objectClass === tracker.class.AutomationHeartbeat) return { trigger: 'scheduled' }
  if (cud.objectClass === tracker.class.AutomationRule && cud._class === core.class.TxUpdateDoc) {
    const ops = (cud as TxUpdateDoc<AutomationRule>).operations as Partial<AutomationRule>
    if (ops.lastWebhook !== undefined) return { trigger: 'webhook', ruleId: cud.objectId as Ref<AutomationRule>, payload: ops.lastPayload ?? {} }
    return undefined
  }
  let trigger: AutomationTrigger | undefined
  let issueId: Ref<Issue> | undefined
  if (cud.objectClass === CHAT_MESSAGE && cud._class === core.class.TxCreateDoc) {
    const attrs = (cud as TxCreateDoc<Doc>).attributes as any
    if (attrs?.attachedToClass !== tracker.class.Issue) return undefined
    trigger = 'commented'
    issueId = attrs.attachedTo
  } else if (cud.objectClass === tracker.class.Issue) {
    issueId = cud.objectId as Ref<Issue>
    if (cud._class === core.class.TxCreateDoc) trigger = 'created'
    else if (cud._class === core.class.TxUpdateDoc) {
      const ops = (cud as TxUpdateDoc<Issue>).operations as Record<string, unknown>
      if (ops.status !== undefined) trigger = 'status'
      else if (ops.priority !== undefined) trigger = 'priority'
      else if (ops.assignee !== undefined) trigger = 'assignee'
      else if (Object.keys(ops).some((k) => !k.startsWith('$'))) trigger = 'updated'
    }
  }
  if (trigger === undefined || issueId === undefined) return undefined
  const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: issueId }, { limit: 1 }))[0]
  return issue === undefined ? undefined : { trigger, issue }
}

// ---- conditions -----------------------------------------------------------

async function labelsOf (issue: Issue, control: TriggerControl): Promise<string[]> {
  const refs = await control.findAll(control.ctx, TAG_REFERENCE, { attachedTo: issue._id } as any)
  return refs.map((r: any) => String(r.title ?? '').toLowerCase())
}

/** Does condition `c` hold for `issue`? Shared with workflow transition validators. */
export async function holds (c: AutomationCondition, issue: Issue, control: TriggerControl, activeSprints: string[]): Promise<boolean> {
  const v = (c.value ?? '').trim()
  let actual: unknown
  switch (c.field) {
    case 'status':
      actual = issue.status
      break
    case 'priority':
      actual = String(issue.priority)
      break
    case 'assignee':
      actual = issue.assignee ?? null
      break
    case 'kind':
      actual = issue.kind
      break
    case 'component':
      actual = issue.component ?? null
      break
    case 'sprint':
      actual = issue.sprint ?? null
      break
    case 'milestone':
      actual = issue.milestone ?? null
      break
    case 'title':
      actual = issue.title
      break
    case 'labels': {
      const labels = await labelsOf(issue, control)
      switch (c.op) {
        case 'is':
        case 'contains':
          return labels.includes(v.toLowerCase())
        case 'is-not':
          return !labels.includes(v.toLowerCase())
        case 'empty':
          return labels.length === 0
        case 'not-empty':
          return labels.length > 0
      }
      return false
    }
    default:
      // any other attribute by name (custom fields, estimation, dueDate, severity, risk ...)
      actual = (issue as any)[c.field as string] ?? null
  }
  const want = c.field === 'sprint' && v === 'active' ? activeSprints : [v]
  switch (c.op) {
    case 'is':
      return actual != null && want.includes(String(actual))
    case 'is-not':
      return !(actual != null && want.includes(String(actual)))
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(v.toLowerCase())
    case 'empty':
      return actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0)
    case 'not-empty':
      return !(actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0))
  }
  return false
}

// ---- targets: which issues an action touches ------------------------------

async function targetsOf (issue: Issue, target: AutomationAction['target'], control: TriggerControl): Promise<Issue[]> {
  switch (target ?? 'self') {
    case 'parent': {
      if (issue.attachedTo === tracker.ids.NoParent) return []
      return await control.findAll(control.ctx, tracker.class.Issue, { _id: issue.attachedTo as Ref<Issue> }, { limit: 1 })
    }
    case 'children':
      return await control.findAll(control.ctx, tracker.class.Issue, { attachedTo: issue._id }, { limit: 200 })
    case 'blocked-by': {
      const ids = (issue.blockedBy ?? []).map((b) => b._id as Ref<Issue>)
      return ids.length === 0 ? [] : await control.findAll(control.ctx, tracker.class.Issue, { _id: { $in: ids } })
    }
    case 'blocking': {
      const candidates = await control.findAll(control.ctx, tracker.class.Issue, { space: issue.space, blockedBy: { $exists: true } }, { limit: 1000 })
      return candidates.filter((c) => (c.blockedBy ?? []).some((b) => b._id === issue._id))
    }
    default:
      return [issue]
  }
}

// ---- actions --------------------------------------------------------------

function markup (text: string): string {
  return JSON.stringify({ type: 'doc', content: text.split(/\n+/).filter((l) => l.trim() !== '').map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })) })
}

const env = (k: string): string => String((globalThis as any).process?.env?.[k] ?? '')

export async function render (tpl: string, issue: Issue, project: Project, control: TriggerControl, payload?: Record<string, unknown>): Promise<string> {
  const status = (await control.findAll(control.ctx, tracker.class.IssueStatus, { _id: issue.status }, { limit: 1 }))[0]
  let assignee = ''
  if (issue.assignee != null) {
    const p = (await control.findAll(control.ctx, contact.class.Person, { _id: issue.assignee }, { limit: 1 }))[0]
    assignee = p !== undefined ? String(p.name).split(',').reverse().join(' ').trim() : ''
  }
  const front = env('PUBLIC_FRONT_URL').replace(/\/$/, '')
  const url = front !== '' ? `${front}/workbench/${control.workspace.url}/tracker/${issue.identifier}` : issue.identifier
  const prio = ['none', 'urgent', 'high', 'medium', 'low'][issue.priority] ?? ''
  return tpl
    .replace(/\{identifier\}/g, issue.identifier)
    .replace(/\{title\}/g, issue.title)
    .replace(/\{status\}/g, status?.name ?? '')
    .replace(/\{assignee\}/g, assignee)
    .replace(/\{priority\}/g, prio)
    .replace(/\{project\}/g, project.identifier)
    .replace(/\{url\}/g, url)
    .replace(/\{severity\}/g, issue.severity !== undefined ? String(issue.severity) : '')
    .replace(/\{payload\.([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => String(key.split('.').reduce<unknown>((o, k) => (o != null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), payload) ?? ''))
}

function post (url: string, body: unknown): void {
  if (!/^https?:\/\//i.test(url)) return
  const g = globalThis as any
  void g.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
}

/** Email addresses for a recipients spec: "assignee", "reporter", "watchers" or literal addresses, comma-separated. */
async function resolveRecipients (spec: string, issue: Issue, control: TriggerControl): Promise<string[]> {
  const out = new Set<string>()
  const emailOfPerson = async (person: Ref<any> | null | undefined): Promise<void> => {
    if (person == null) return
    const ids = await control.findAll(control.ctx, contact.class.SocialIdentity, { attachedTo: person, type: 'email' as any }, { limit: 3 })
    for (const s of ids) if (String(s.value).includes('@')) out.add(String(s.value))
  }
  for (const part of spec.split(',').map((s) => s.trim()).filter((s) => s !== '')) {
    if (part.includes('@')) out.add(part)
    else if (part === 'assignee') await emailOfPerson(issue.assignee)
    else if (part === 'reporter') {
      const sid = issue.createdBy !== undefined ? (await control.findAll(control.ctx, contact.class.SocialIdentity, { _id: issue.createdBy as any }, { limit: 1 }))[0] : undefined
      await emailOfPerson(sid?.attachedTo)
    } else if (part === 'watchers') {
      const collabs = await control.findAll(control.ctx, core.class.Collaborator, { attachedTo: issue._id }, { limit: 100 })
      const uuids = collabs.map((c) => c.collaborator)
      if (uuids.length > 0) {
        const employees = await control.findAll(control.ctx, contact.mixin.Employee, { personUuid: { $in: uuids } } as any, { limit: 100 })
        for (const e of employees) await emailOfPerson(e._id)
      }
    } else if (part === 'portal' && issue.portalEmail !== undefined && issue.portalEmail.includes('@')) out.add(issue.portalEmail)
  }
  return Array.from(out)
}

function sendMail (to: string[], subject: string, text: string): void {
  const mail = env('MAIL_URL').replace(/\/$/, '')
  if (mail === '' || to.length === 0) return
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const key = env('MAIL_API_KEY')
  if (key !== '') headers.authorization = `Bearer ${key}`
  const g = globalThis as any
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px">${text.split('\n').map((l) => `<p>${l.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch] ?? ch)}</p>`).join('')}</div>`
  for (const addr of to) void g.fetch(`${mail}/send`, { method: 'POST', headers, body: JSON.stringify({ to: addr, subject, text, html }) }).catch(() => {})
}

/** Transactions that create one issue in `project`, numbered after its sequence, modelled on `like`. */
async function createIssueTxes (control: TriggerControl, project: Project, title: string, parent: Issue | undefined, like: Issue, offset: number): Promise<Tx[]> {
  const number = project.sequence + 1 + offset
  const kind = parent !== undefined ? like.kind : like.kind
  const type = (await control.findAll(control.ctx, task.class.TaskType, { _id: kind }, { limit: 1 }))[0]
  const status = project.defaultIssueStatus !== undefined && String(project.defaultIssueStatus) !== '' ? project.defaultIssueStatus : ((type?.statuses[0] as Ref<IssueStatus>) ?? like.status)
  const last = (await control.findAll(control.ctx, tracker.class.Issue, { space: project._id }, { limit: 1, sort: { rank: -1 as any } }))[0]
  const attrs: any = {
    attachedTo: parent?._id ?? tracker.ids.NoParent,
    attachedToClass: tracker.class.Issue,
    collection: 'subIssues',
    title,
    description: null,
    assignee: parent !== undefined ? parent.assignee : null,
    component: parent?.component ?? null,
    milestone: parent?.milestone ?? null,
    sprint: parent?.sprint ?? null,
    number,
    status,
    priority: like.priority,
    rank: makeRank(last?.rank, undefined),
    comments: 0,
    subIssues: 0,
    startDate: null,
    dueDate: null,
    parents: parent !== undefined ? [{ parentId: parent._id, parentTitle: parent.title, space: parent.space, identifier: parent.identifier }, ...(parent.parents ?? [])] : [],
    reportedTime: 0,
    remainingTime: 0,
    estimation: 0,
    reports: 0,
    relations: [],
    blockedBy: [],
    childInfo: [],
    kind,
    identifier: `${project.identifier}-${number}`
  }
  return [
    control.txFactory.createTxUpdateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }),
    control.txFactory.createTxCreateDoc(tracker.class.Issue, project._id, attrs)
  ]
}

export async function perform (a: AutomationAction, issue: Issue, project: Project, control: TriggerControl, activeSprints: string[], payload?: Record<string, unknown>): Promise<Tx[]> {
  const v = (a.value ?? '').trim()
  const update = (ops: Partial<Issue>): Tx => control.txFactory.createTxUpdateDoc(tracker.class.Issue, issue.space, issue._id, ops)
  switch (a.type) {
    case 'set-status': {
      if (v === '' || issue.status === v) return []
      const type = (await control.findAll(control.ctx, task.class.TaskType, { _id: issue.kind }, { limit: 1 }))[0] as (TaskType & { transitions?: Record<string, string[]> }) | undefined
      const allowed = type?.transitions?.[issue.status]
      if (allowed !== undefined && !(allowed as string[]).includes(v)) return []
      return [update({ status: v as Ref<IssueStatus> })]
    }
    case 'set-priority': {
      const p = Number(v)
      return Number.isNaN(p) || issue.priority === p ? [] : [update({ priority: p })]
    }
    case 'set-assignee': {
      let who: Issue['assignee'] = null
      if (v === 'none') who = null
      else if (v === 'component-lead') {
        const comp = issue.component != null ? (await control.findAll(control.ctx, tracker.class.Component, { _id: issue.component }, { limit: 1 }))[0] : undefined
        who = comp?.defaultAssignee ?? comp?.lead ?? null
      } else if (v === 'reporter') {
        const sid = issue.createdBy !== undefined ? (await control.findAll(control.ctx, contact.class.SocialIdentity, { _id: issue.createdBy as any }, { limit: 1 }))[0] : undefined
        who = (sid?.attachedTo as Issue['assignee']) ?? null
      } else who = v as Issue['assignee']
      return (issue.assignee ?? null) === who ? [] : [update({ assignee: who })]
    }
    case 'add-label': {
      if (v === '') return []
      const el = (await control.findAll(control.ctx, TAG_ELEMENT, { _id: v as Ref<Doc> } as any, { limit: 1 }))[0] as any
      if (el === undefined) return []
      const existing = await control.findAll(control.ctx, TAG_REFERENCE, { attachedTo: issue._id, tag: v } as any, { limit: 1 })
      if (existing.length > 0) return []
      const attrs: AttachedData<any> = { attachedTo: issue._id, attachedToClass: tracker.class.Issue, collection: 'labels', tag: v, title: el.title, color: el.color }
      return [control.txFactory.createTxCreateDoc(TAG_REFERENCE, issue.space, attrs as any)]
    }
    case 'add-comment': {
      if (v === '') return []
      const text = await render(v, issue, project, control, payload)
      const attrs = { attachedTo: issue._id, attachedToClass: tracker.class.Issue, collection: 'comments', message: markup(text), attachments: 0 }
      return [control.txFactory.createTxCreateDoc(CHAT_MESSAGE, issue.space, attrs as any)]
    }
    case 'set-sprint': {
      const target = v === 'none' ? null : v === 'active' ? ((activeSprints[0] as Issue['sprint']) ?? null) : (v as Issue['sprint'])
      return (issue.sprint ?? null) === target ? [] : [update({ sprint: target })]
    }
    case 'set-milestone': {
      const target = v === 'none' ? null : (v as Issue['milestone'])
      return (issue.milestone ?? null) === target ? [] : [update({ milestone: target })]
    }
    case 'set-due': {
      const days = Number(v)
      if (Number.isNaN(days)) return []
      return [update({ dueDate: Date.now() + days * DAY })]
    }
    case 'create-issue': {
      const title = await render(v !== '' ? v : 'Follow-up: {title}', issue, project, control, payload)
      let target = project
      if (a.url !== undefined && a.url.trim() !== '') {
        const p = (await control.findAll(control.ctx, tracker.class.Project, { identifier: a.url.trim().toUpperCase() }, { limit: 1 }))[0]
        if (p !== undefined) target = p
      }
      return await createIssueTxes(control, target, title, undefined, issue, 0)
    }
    case 'create-subtasks': {
      const out: Tx[] = []
      const lines = v.split('\n').map((l) => l.trim()).filter((l) => l !== '')
      for (let k = 0; k < lines.length; k++) out.push(...(await createIssueTxes(control, project, await render(lines[k], issue, project, control, payload), issue, issue, k)))
      return out
    }
    case 'send-email': {
      const to = await resolveRecipients(a.url !== undefined && a.url.trim() !== '' ? a.url : 'assignee', issue, control)
      const body = await render(v !== '' ? v : '{identifier} {title}\n{status} · {priority}\n{url}', issue, project, control, payload)
      const [subject, ...rest] = body.split('\n')
      sendMail(to, subject, rest.length > 0 ? rest.join('\n') : subject)
      return []
    }
    case 'webhook': {
      post(v, { event: 'automation', at: Date.now(), workspace: control.workspace.url, project: project.identifier, issue: { _id: issue._id, identifier: issue.identifier, title: issue.title, status: issue.status, priority: issue.priority, assignee: issue.assignee }, payload })
      return []
    }
    case 'slack': {
      if (a.url === undefined) return []
      post(a.url, { text: await render(v !== '' ? v : '*{identifier}* {title} — {status}\n{url}', issue, project, control, payload) })
      return []
    }
    case 'teams': {
      if (a.url === undefined) return []
      const text = await render(v !== '' ? v : '**{identifier}** {title} — {status}\n\n{url}', issue, project, control, payload)
      post(a.url, { '@type': 'MessageCard', '@context': 'http://schema.org/extensions', summary: text.split('\n')[0], text })
      return []
    }
  }
  return []
}

// ---- scopes for scheduled / webhook rules -----------------------------------

async function scopeIssues (rule: AutomationRule, control: TriggerControl, payload?: Record<string, unknown>): Promise<Issue[]> {
  const key = typeof payload?.issue === 'string' ? payload.issue : typeof payload?.identifier === 'string' ? payload.identifier : undefined
  if (key !== undefined) {
    const one = await control.findAll(control.ctx, tracker.class.Issue, { identifier: key.toUpperCase() }, { limit: 1 })
    return one
  }
  const statuses = await control.findAll(control.ctx, tracker.class.IssueStatus, {})
  const open = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  const now = Date.now()
  const base: Record<string, unknown> = rule.global === true ? ((rule.projects ?? []).length > 0 ? { space: { $in: rule.projects } } : {}) : { space: rule.space }
  base.archived = { $ne: true }
  switch (rule.scope ?? 'open') {
    case 'all':
      break
    case 'stale7':
      Object.assign(base, { status: { $in: open }, modifiedOn: { $lt: now - 7 * DAY } })
      break
    case 'due3':
      Object.assign(base, { status: { $in: open }, dueDate: { $lt: now + 3 * DAY, $ne: null } })
      break
    case 'overdue':
      Object.assign(base, { status: { $in: open }, dueDate: { $lt: now, $ne: null } })
      break
    case 'unassigned':
      Object.assign(base, { status: { $in: open }, assignee: null })
      break
    default:
      Object.assign(base, { status: { $in: open } })
  }
  return await control.findAll(control.ctx, tracker.class.Issue, base as any, { limit: 500 })
}

// ---- running --------------------------------------------------------------

interface Lookups {
  projectOf: (space: Ref<Project>) => Promise<Project | undefined>
  sprintsOf: (space: Ref<Project>) => Promise<string[]>
}

function runLog (control: TriggerControl, rule: AutomationRule, issues: Issue[], ok: boolean, matched: number, error?: string): Tx {
  const one = issues.length === 1 ? issues[0] : undefined
  return control.txFactory.createTxCreateDoc(tracker.class.AutomationRun, rule.space, {
    rule: rule._id,
    ruleName: rule.name,
    trigger: rule.trigger,
    issue: one?._id,
    identifier: one?.identifier,
    at: Date.now(),
    ok,
    matched,
    actions: rule.actions.map((a) => a.type),
    ...(error !== undefined ? { error: error.slice(0, 300) } : {})
  } as any)
}

async function runRule (rule: AutomationRule, issues: Issue[], control: TriggerControl, look: Lookups, payload?: Record<string, unknown>): Promise<Tx[]> {
  const out: Tx[] = []
  let matched = 0
  for (const issue of issues) {
    const project = await look.projectOf(issue.space)
    if (project === undefined) continue
    const active = await look.sprintsOf(issue.space)
    let ok = true
    for (const c of rule.conditions) {
      if (!(await holds(c, issue, control, active))) {
        ok = false
        break
      }
    }
    if (!ok) continue
    matched++
    for (const a of rule.actions) {
      for (const t of await targetsOf(issue, a.target, control)) out.push(...(await perform(a, t, project, control, active, payload)))
    }
  }
  out.push(control.txFactory.createTxUpdateDoc(tracker.class.AutomationRule, rule.space, rule._id, { runs: (rule.runs ?? 0) + 1, lastRun: Date.now(), lastError: null, lastMatched: matched }))
  if (matched > 0 || rule.trigger === 'scheduled' || rule.trigger === 'webhook') out.push(runLog(control, rule, issues, true, matched))
  return out
}

async function retentionSweep (control: TriggerControl): Promise<Tx[]> {
  const last = control.cache.get('audit-retention-last') as number | undefined
  if (last !== undefined && Date.now() - last < 3_600_000) return []
  control.cache.set('audit-retention-last', Date.now())
  const out: Tx[] = []
  const runs = await control.findAll(control.ctx, tracker.class.AutomationRun, { at: { $lt: Date.now() - RUN_RETENTION_DAYS * DAY } }, { limit: 500 })
  for (const r of runs) out.push(control.txFactory.createTxRemoveDoc(r._class, r.space, r._id))
  const policy = (await control.findAll(control.ctx, tracker.class.AuditPolicy, {}, { limit: 1 }))[0]
  if (policy === undefined || policy.retentionDays <= 0) return out
  const before = Date.now() - policy.retentionDays * DAY
  const events = await control.findAll(control.ctx, tracker.class.AuditEvent, { createdOn: { $lt: before } }, { limit: 500 })
  for (const e of events) out.push(control.txFactory.createTxRemoveDoc(e._class, e.space, e._id))
  const feed = await control.findAll(control.ctx, 'activity:class:DocUpdateMessage' as Ref<Class<Doc>>, { createdOn: { $lt: before } } as any, { limit: 500 })
  for (const m of feed) out.push(control.txFactory.createTxRemoveDoc(m._class, m.space, m._id))
  return out
}

async function dueScheduledRules (control: TriggerControl): Promise<AutomationRule[]> {
  const rules = await control.findAll(control.ctx, tracker.class.AutomationRule, { enabled: true, trigger: 'scheduled' })
  const now = Date.now()
  return rules.filter((r) => now - (r.lastRun ?? 0) >= Math.max(5, r.every ?? 60) * 60_000)
}

/** Rules that apply to an issue in `space`: the project's own plus global ones not narrowed away. */
async function rulesFor (space: Ref<Project>, trigger: AutomationTrigger, control: TriggerControl): Promise<AutomationRule[]> {
  const own = await control.findAll(control.ctx, tracker.class.AutomationRule, { space, enabled: true, trigger })
  const global = await control.findAll(control.ctx, tracker.class.AutomationRule, { global: true, enabled: true, trigger })
  return [...own.filter((r) => r.global !== true), ...global.filter((r) => (r.projects ?? []).length === 0 || (r.projects ?? []).includes(space))]
}

export async function OnAutomationRules (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const depth = (control.contextCache.get('rules-depth') as number | undefined) ?? 0
  if (depth >= MAX_DEPTH) return []
  const out: Tx[] = []
  const projectCache = new Map<Ref<Project>, Project | undefined>()
  const sprintCache = new Map<Ref<Project>, string[]>()
  const look: Lookups = {
    projectOf: async (space) => {
      if (!projectCache.has(space)) projectCache.set(space, (await control.findAll(control.ctx, tracker.class.Project, { _id: space }, { limit: 1 }))[0])
      return projectCache.get(space)
    },
    sprintsOf: async (space) => {
      if (!sprintCache.has(space)) sprintCache.set(space, (await control.findAll(control.ctx, tracker.class.Sprint, { space, state: 'active' })).map((s) => s._id as string))
      return sprintCache.get(space) ?? []
    }
  }
  const failed = (rule: AutomationRule, err: unknown, issues: Issue[]): void => {
    const msg = String((err as any)?.message ?? err)
    out.push(control.txFactory.createTxUpdateDoc(tracker.class.AutomationRule, rule.space, rule._id, { lastError: msg.slice(0, 200), lastRun: Date.now() }))
    out.push(runLog(control, rule, issues, false, 0, msg))
  }

  let sawHeartbeat = false
  for (const tx of txes) {
    const ev = await eventOf(tx as TxCUD<Doc>, control)
    if (ev === undefined) continue
    try {
      if (ev.trigger === 'scheduled') {
        sawHeartbeat = true
        continue
      }
      if (ev.trigger === 'webhook' && ev.ruleId !== undefined) {
        const rule = (await control.findAll(control.ctx, tracker.class.AutomationRule, { _id: ev.ruleId }, { limit: 1 }))[0]
        if (rule === undefined || !rule.enabled) continue
        const issues = await scopeIssues(rule, control, ev.payload)
        try {
          out.push(...(await runRule(rule, issues, control, look, ev.payload)))
        } catch (err) {
          failed(rule, err, issues)
        }
        continue
      }
      const issue = ev.issue
      if (issue === undefined || issue.archived === true) continue
      const rules = await rulesFor(issue.space, ev.trigger, control)
      for (const rule of rules) {
        try {
          out.push(...(await runRule(rule, [issue], control, look)))
        } catch (err) {
          failed(rule, err, [issue])
        }
      }
    } catch {
      // one bad event must not block the rest
    }
  }

  // Scheduled rules: run those that are due, on the heartbeat or on any issue traffic.
  if (sawHeartbeat || txes.some((t) => (t as TxCUD<Doc>).objectClass === tracker.class.Issue)) {
    for (const rule of await dueScheduledRules(control)) {
      const issues = await scopeIssues(rule, control).catch(() => [] as Issue[])
      try {
        out.push(...(await runRule(rule, issues, control, look)))
      } catch (err) {
        failed(rule, err, issues)
      }
    }
  }

  if (sawHeartbeat) {
    try {
      out.push(...(await runReminders(control)))
    } catch {
      // reminders must never block rules
    }
  }
  if (out.length > 0) control.contextCache.set('rules-depth', depth + 1)
  out.push(...(await retentionSweep(control)))
  return out
}
