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

// Project automation rules and service levels.
//
// These are the handful of rules that account for most of what teams build
// in Jira's automation editor, offered as switches on the project rather
// than a rule builder. Each one is a few lines and reads as a sentence:
//
//   - a new issue with a component and no assignee goes to the component lead
//   - when every child is done, the parent is done
//   - when a child starts, the parent starts
//   - an issue's SLA deadline follows its priority
//
// The status rules respect the type's transition guards: an automatic move
// the guard would refuse is skipped, never forced.

import core, { type Ref, type Tx, type TxCreateDoc, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import task, { type TaskType } from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus, type OnCallRotation, type Project, type SlaCalendar } from '@hcengineering/tracker'
import { type Person } from '@hcengineering/contact'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Advance `from` by `hours` counting only the calendar's working hours, skipping holidays. */
export function addBusinessHours (from: number, hours: number, cal: SlaCalendar): number {
  const offset = cal.timezoneOffset * 60_000
  let t = from
  let remaining = hours * HOUR
  for (let guard = 0; guard < 24 * 400 && remaining > 0; guard++) {
    const local = new Date(t + offset)
    const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
    const ymd = new Date(dayStart + offset).toISOString().slice(0, 10)
    const working = cal.workdays.includes(local.getUTCDay()) && !cal.holidays.includes(ymd)
    const open = dayStart + cal.startHour * HOUR
    const close = dayStart + cal.endHour * HOUR
    if (!working || t >= close) {
      t = dayStart + DAY + cal.startHour * HOUR
      continue
    }
    if (t < open) t = open
    const available = close - t
    if (available >= remaining) return t + remaining
    remaining -= available
    t = close
  }
  return t
}

function slaDueFor (project: Project, priority: number, from: number): number | null {
  const hours = project.sla?.[String(priority)]
  if (hours === undefined || hours <= 0) return null
  const cal = project.slaCalendar
  if (cal !== undefined && cal.workdays.length > 0 && cal.endHour > cal.startHour) return addBusinessHours(from, hours, cal)
  return from + hours * HOUR
}

/** Who is on call now for a rotation: people take turns of shiftDays from startsOn, handing off at handoffHour. */
export function currentOnCall (r: OnCallRotation, now = Date.now()): Ref<Person> | undefined {
  if (r.people.length === 0) return undefined
  const start = new Date(r.startsOn)
  start.setHours(r.handoffHour, 0, 0, 0)
  const shifts = Math.floor((now - start.getTime()) / (Math.max(1, r.shiftDays) * DAY))
  const idx = ((shifts % r.people.length) + r.people.length) % r.people.length
  return r.people[idx]
}

async function parentRules (issue: Issue, project: Project, control: TriggerControl): Promise<Tx[]> {
  const auto = project.automation ?? {}
  if (auto.parentFollowsChildren !== true && auto.startParentOnChildStart !== true) return []
  if (issue.attachedTo === tracker.ids.NoParent) return []

  const parent = (await control.findAll(control.ctx, tracker.class.Issue, { _id: issue.attachedTo as Ref<Issue> }, { limit: 1 }))[0]
  if (parent === undefined) return []
  const siblings = await control.findAll(control.ctx, tracker.class.Issue, { attachedTo: parent._id })
  const type = (await control.findAll(control.ctx, task.class.TaskType, { _id: parent.kind }, { limit: 1 }))[0] as
    | (TaskType & { transitions?: Record<string, string[]>, requiredBeforeTerminal?: string[] })
    | undefined
  if (type === undefined) return []

  const ids = new Set<Ref<IssueStatus>>([parent.status, ...siblings.map((s) => s.status), ...(type.statuses as Ref<IssueStatus>[])])
  const statuses = await control.findAll(control.ctx, tracker.class.IssueStatus, { _id: { $in: Array.from(ids) } })
  const cat = new Map(statuses.map((s) => [s._id, s.category]))
  const isDone = (st: Ref<IssueStatus>): boolean =>
    cat.get(st) === task.statusCategory.Won || cat.get(st) === task.statusCategory.Lost
  const isActive = (st: Ref<IssueStatus>): boolean => cat.get(st) === task.statusCategory.Active
  // first status of a category in the type's own order
  const firstOf = (category: Ref<any>): Ref<IssueStatus> | undefined =>
    (type.statuses as Ref<IssueStatus>[]).find((s) => cat.get(s) === category)
  const allowed = (from: Ref<IssueStatus>, to: Ref<IssueStatus>): boolean => {
    const list = type.transitions?.[from]
    return list === undefined || list.includes(to)
  }

  let target: Ref<IssueStatus> | undefined
  if (auto.parentFollowsChildren === true && siblings.length > 0 && siblings.every((s) => isDone(s.status)) && !isDone(parent.status)) {
    // A terminal move with required fields is a human decision; leave it.
    if ((type.requiredBeforeTerminal ?? []).length === 0) target = firstOf(task.statusCategory.Won)
  } else if (auto.startParentOnChildStart === true && isActive(issue.status) && !isActive(parent.status) && !isDone(parent.status)) {
    target = firstOf(task.statusCategory.Active)
  }
  if (target === undefined || target === parent.status || !allowed(parent.status, target)) return []
  return [control.txFactory.createTxUpdateDoc(tracker.class.Issue, parent.space, parent._id, { status: target })]
}

export async function OnIssueAutomation (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const out: Tx[] = []
  for (const tx of txes) {
    const cud = tx as TxCUD<Issue>
    if (cud.objectClass !== tracker.class.Issue) continue
    const project = (await control.findAll(control.ctx, tracker.class.Project, { _id: cud.objectSpace as Ref<Project> }, { limit: 1 }))[0]
    if (project === undefined) continue
    const auto = project.automation ?? {}

    if (cud._class === core.class.TxCreateDoc) {
      const attrs = (cud as TxCreateDoc<Issue>).attributes
      const ops: Partial<Issue> = {}
      if (attrs.assignee == null && attrs.component != null) {
        const comp = (await control.findAll(control.ctx, tracker.class.Component, { _id: attrs.component }, { limit: 1 }))[0]
        if (comp?.defaultAssignee != null) ops.assignee = comp.defaultAssignee
        else if (auto.assignComponentLead === true && comp?.lead != null) ops.assignee = comp.lead
      }
      if (project.sla !== undefined) {
        const due = slaDueFor(project, attrs.priority, cud.modifiedOn)
        if (due !== null) ops.slaDue = due
      }
      // service desk: approvals, incident defaults, on-call assignment
      if (attrs.requestType != null) {
        const rt = (await control.findAll(control.ctx, tracker.class.RequestType, { _id: attrs.requestType }, { limit: 1 }))[0]
        if (rt !== undefined) {
          if (rt.requiresApproval === true && attrs.approval === undefined) {
            ops.approval = { state: 'pending', approvers: rt.approvers ?? [], decisions: [], requestedOn: cud.modifiedOn }
          }
          if (rt.kind === 'incident' && attrs.severity === undefined) ops.severity = rt.defaultSeverity ?? 3
        }
      }
      const severity = attrs.severity ?? ops.severity
      if (severity !== undefined && attrs.assignee == null && ops.assignee === undefined) {
        const rotations = await control.findAll(control.ctx, tracker.class.OnCallRotation, { space: project._id })
        const r = rotations.find((x) => x.autoAssignSeverity !== undefined && severity <= x.autoAssignSeverity && x.people.length > 0)
        const who = r !== undefined ? currentOnCall(r, cud.modifiedOn) : undefined
        if (who !== undefined) ops.assignee = who
      }
      if (Object.keys(ops).length > 0) {
        out.push(control.txFactory.createTxUpdateDoc(tracker.class.Issue, cud.objectSpace, cud.objectId, ops))
      }
      continue
    }

    if (cud._class === core.class.TxUpdateDoc) {
      const ops = (cud as TxUpdateDoc<Issue>).operations as Partial<Issue>
      if (ops.priority === undefined && ops.status === undefined) continue
      const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: cud.objectId }, { limit: 1 }))[0]
      if (issue === undefined) continue

      if (ops.priority !== undefined && project.sla !== undefined) {
        const due = slaDueFor(project, ops.priority, issue.createdOn ?? issue.modifiedOn)
        if ((issue.slaDue ?? null) !== due) {
          out.push(control.txFactory.createTxUpdateDoc(tracker.class.Issue, issue.space, issue._id, { slaDue: due }))
        }
      }
      if (ops.status !== undefined) {
        out.push(...(await parentRules(issue, project, control)))
      }
    }
  }
  return out
}
