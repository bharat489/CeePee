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

// Automation rules: WHEN trigger IF conditions THEN actions, per project.
// Evaluated after every issue transaction. Rule-made changes are ordinary
// transactions and can trigger other rules; a per-request depth counter
// stops that at two levels so a pair of rules cannot ping-pong forever.
//
// Also hosts the audit retention sweep, which needs "something that runs
// regularly" and issue traffic is the closest thing the server has.

import contact from '@hcengineering/contact'
import core, { type AttachedData, type Class, type Doc, type Ref, type Tx, type TxCreateDoc, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import task, { type TaskType } from '@hcengineering/task'
import tracker, { type AutomationAction, type AutomationCondition, type AutomationRule, type AutomationTrigger, type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'

const DAY = 86_400_000
const MAX_DEPTH = 2
const TAG_REFERENCE = 'tags:class:TagReference' as Ref<Class<Doc>>
const TAG_ELEMENT = 'tags:class:TagElement' as Ref<Class<Doc>>
const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>

function triggerOf (cud: TxCUD<Doc>): AutomationTrigger | undefined {
  if (cud.objectClass === CHAT_MESSAGE && cud._class === core.class.TxCreateDoc) {
    const attrs = (cud as TxCreateDoc<Doc>).attributes as any
    return attrs?.attachedToClass === tracker.class.Issue ? 'commented' : undefined
  }
  if (cud.objectClass !== tracker.class.Issue) return undefined
  if (cud._class === core.class.TxCreateDoc) return 'created'
  if (cud._class === core.class.TxUpdateDoc) {
    const ops = (cud as TxUpdateDoc<Issue>).operations as Record<string, unknown>
    if (ops.status !== undefined) return 'status'
    if (ops.priority !== undefined) return 'priority'
    if (ops.assignee !== undefined) return 'assignee'
    if (Object.keys(ops).some((k) => !k.startsWith('$'))) return 'updated'
  }
  return undefined
}

async function labelsOf (issue: Issue, control: TriggerControl): Promise<string[]> {
  const refs = await control.findAll(control.ctx, TAG_REFERENCE, { attachedTo: issue._id } as any)
  return refs.map((r: any) => String(r.title ?? '').toLowerCase())
}

async function holds (c: AutomationCondition, issue: Issue, control: TriggerControl, activeSprints: string[]): Promise<boolean> {
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
      return actual == null || actual === ''
    case 'not-empty':
      return !(actual == null || actual === '')
  }
  return false
}

function markup (text: string): string {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
}

async function perform (a: AutomationAction, issue: Issue, project: Project, control: TriggerControl, activeSprints: string[]): Promise<Tx[]> {
  const v = (a.value ?? '').trim()
  const update = (ops: Partial<Issue>): Tx => control.txFactory.createTxUpdateDoc(tracker.class.Issue, issue.space, issue._id, ops)
  switch (a.type) {
    case 'set-status': {
      if (v === '' || issue.status === v) return []
      // respect the type's transition guards: an automatic move the guard would refuse is skipped
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
      const text = v.replace(/\{identifier\}/g, issue.identifier).replace(/\{title\}/g, issue.title)
      const attrs = { attachedTo: issue._id, attachedToClass: tracker.class.Issue, collection: 'comments', message: markup(text), attachments: 0 }
      return [control.txFactory.createTxCreateDoc(CHAT_MESSAGE, issue.space, attrs as any)]
    }
    case 'set-sprint': {
      const target = v === 'none' ? null : v === 'active' ? (activeSprints[0] as Issue['sprint'] ?? null) : (v as Issue['sprint'])
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
    case 'webhook': {
      if (!/^https?:\/\//i.test(v)) return []
      const g = globalThis as any
      const body = JSON.stringify({ event: 'automation', at: Date.now(), workspace: control.workspace.url, project: project.identifier, issue: { _id: issue._id, identifier: issue.identifier, title: issue.title, status: issue.status, priority: issue.priority, assignee: issue.assignee } })
      void g.fetch(v, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ceepee-event': 'automation' }, body }).catch(() => {})
      return []
    }
  }
  return []
}

async function retentionSweep (control: TriggerControl): Promise<Tx[]> {
  const last = control.cache.get('audit-retention-last') as number | undefined
  if (last !== undefined && Date.now() - last < 3_600_000) return []
  control.cache.set('audit-retention-last', Date.now())
  const policy = (await control.findAll(control.ctx, tracker.class.AuditPolicy, {}, { limit: 1 }))[0]
  if (policy === undefined || policy.retentionDays <= 0) return []
  const before = Date.now() - policy.retentionDays * DAY
  const out: Tx[] = []
  const events = await control.findAll(control.ctx, tracker.class.AuditEvent, { createdOn: { $lt: before } }, { limit: 500 })
  for (const e of events) out.push(control.txFactory.createTxRemoveDoc(e._class, e.space, e._id))
  const feed = await control.findAll(control.ctx, 'activity:class:DocUpdateMessage' as Ref<Class<Doc>>, { createdOn: { $lt: before } } as any, { limit: 500 })
  for (const m of feed) out.push(control.txFactory.createTxRemoveDoc(m._class, m.space, m._id))
  return out
}

export async function OnAutomationRules (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const depth = (control.contextCache.get('rules-depth') as number | undefined) ?? 0
  if (depth >= MAX_DEPTH) return []
  const out: Tx[] = []
  for (const tx of txes) {
    const cud = tx as TxCUD<Doc>
    const trigger = triggerOf(cud)
    if (trigger === undefined) continue
    const issueId = (trigger === 'commented' ? ((cud as TxCreateDoc<Doc>).attributes as any).attachedTo : cud.objectId) as Ref<Issue>
    const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: issueId }, { limit: 1 }))[0]
    if (issue === undefined) continue
    const rules = await control.findAll(control.ctx, tracker.class.AutomationRule, { space: issue.space, enabled: true, trigger })
    if (rules.length === 0) continue
    const project = (await control.findAll(control.ctx, tracker.class.Project, { _id: issue.space }, { limit: 1 }))[0]
    if (project === undefined) continue
    const activeSprints = (await control.findAll(control.ctx, tracker.class.Sprint, { space: issue.space, state: 'active' })).map((s) => s._id as string)

    for (const rule of rules) {
      try {
        let ok = true
        for (const c of rule.conditions) {
          if (!(await holds(c, issue, control, activeSprints))) {
            ok = false
            break
          }
        }
        if (!ok) continue
        for (const a of rule.actions) out.push(...(await perform(a, issue, project, control, activeSprints)))
        out.push(control.txFactory.createTxUpdateDoc(tracker.class.AutomationRule, rule.space, rule._id, { runs: (rule.runs ?? 0) + 1, lastRun: Date.now(), lastError: null }))
      } catch (err: any) {
        out.push(control.txFactory.createTxUpdateDoc(tracker.class.AutomationRule, rule.space, rule._id, { lastError: String(err?.message ?? err).slice(0, 200) }))
      }
    }
  }
  if (out.length > 0) control.contextCache.set('rules-depth', depth + 1)
  out.push(...(await retentionSweep(control)))
  return out
}
