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
import tracker, { type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'

const HOUR = 3_600_000

function slaDueFor (project: Project, priority: number, from: number): number | null {
  const hours = project.sla?.[String(priority)]
  return hours !== undefined && hours > 0 ? from + hours * HOUR : null
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
      if (auto.assignComponentLead === true && attrs.assignee == null && attrs.component != null) {
        const comp = (await control.findAll(control.ctx, tracker.class.Component, { _id: attrs.component }, { limit: 1 }))[0]
        if (comp?.lead != null) ops.assignee = comp.lead
      }
      if (project.sla !== undefined) {
        const due = slaDueFor(project, attrs.priority, cud.modifiedOn)
        if (due !== null) ops.slaDue = due
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
