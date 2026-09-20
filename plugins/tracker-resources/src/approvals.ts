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

// Approval workflows on the client. A workflow transition can require the
// sign-off of named people; instead of moving the issue, the client files an
// approval request (the request plugin) that wraps the status change. The
// approvers see it in their inbox and on the issue; when enough of them
// approve, the server applies the move. The server guard refuses direct moves
// into such statuses, so this is the only door.

import contact, { formatName, type Employee } from '@hcengineering/contact'
import { type AttachedDoc, type Class, type Ref, type Tx } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import task, { type TransitionRule } from '@hcengineering/task'
import { type Issue, type IssueStatus } from '@hcengineering/tracker'
import { addNotification, NotificationSeverity } from '@hcengineering/ui'

import tracker from './plugin'

/** The request plugin, addressed by id: no build dependency on it. */
export const REQUEST_CLASS = 'request:class:Request' as Ref<Class<ApprovalRequest>>

export interface ApprovalRequest extends AttachedDoc {
  requested: Ref<Employee>[]
  approved: Ref<Employee>[]
  approvedDates?: number[]
  requiredApprovesCount: number
  rejected?: Ref<Employee>
  status: 'Active' | 'Completed' | 'Rejected' | 'Cancelled'
  tx: Tx
  rejectedTx?: Tx
}

/** The transition rule that gates moving `issue` to `next`, when it asks for approval. */
export async function approvalRuleFor (issue: Pick<Issue, 'kind' | 'status'>, next: Ref<IssueStatus>): Promise<TransitionRule | undefined> {
  const client = getClient()
  const type = await client.findOne(task.class.TaskType, { _id: issue.kind })
  const rules = ((type as any)?.transitionRules as TransitionRule[] | undefined) ?? []
  const rule = rules.find((r) => r.to === next && (r.from === '*' || r.from === issue.status))
  return (rule?.approval?.approvers?.length ?? 0) > 0 ? rule : undefined
}

/** A request already waiting for this exact move, if any. */
export async function pendingApproval (issue: Pick<Issue, '_id'>, next: Ref<IssueStatus>): Promise<ApprovalRequest | undefined> {
  const client = getClient()
  const active = await client.findAll(REQUEST_CLASS, { attachedTo: issue._id, status: 'Active' } as any)
  return active.find((r) => ((r.tx as any)?.operations?.status) === next)
}

/**
 * File the approval request for moving `issue` to `next`: the wrapped transaction
 * is the status change itself, applied by the server when the required number of
 * approvers has approved. Returns the request id, or undefined when one is already open.
 */
export async function requestApproval (issue: Issue, next: Ref<IssueStatus>, rule: TransitionRule): Promise<Ref<ApprovalRequest> | undefined> {
  const client = getClient()
  const approvers = (rule.approval?.approvers ?? []) as Ref<Employee>[]
  if (approvers.length === 0) return undefined
  const open = await pendingApproval(issue, next)
  if (open !== undefined) {
    addNotification('Approval already requested', 'This move is waiting for approval; you will be notified when it is decided.', undefined as any, {}, NotificationSeverity.Info)
    return undefined
  }
  const status = await client.findOne(tracker.class.IssueStatus, { _id: next })
  const approveTx = client.txFactory.createTxUpdateDoc(tracker.class.Issue, issue.space, issue._id, { status: next })
  const id = await client.addCollection(REQUEST_CLASS, issue.space, issue._id, tracker.class.Issue, 'requests', {
    requested: approvers,
    approved: [],
    tx: approveTx,
    status: 'Active',
    requiredApprovesCount: rule.approval?.all === true ? approvers.length : 1
  } as any)
  const people = await client.findAll(contact.mixin.Employee, { _id: { $in: approvers } })
  const names = people.map((p) => formatName(p.name)).join(', ')
  addNotification('Approval requested', `Moving ${issue.identifier} to ${status?.name ?? 'the next status'} needs sign-off from ${names !== '' ? names : 'the approvers'}.`, undefined as any, {}, NotificationSeverity.Success)
  return id
}

