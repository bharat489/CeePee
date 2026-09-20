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

// Approval workflows, the pure part. A transition rule may require approval:
// the move into the target status is refused unless an approval request
// attached to the issue, wrapping exactly that status change, was completed
// recently. Requests come from the request plugin; when the last approver
// approves, the server applies the wrapped transaction, and this check lets
// it through.

export interface ApprovalRequestLike {
  status: string
  tx?: { objectId?: string, operations?: Record<string, unknown> }
  approved?: unknown[]
  requiredApprovesCount?: number
  approvedDates?: number[]
  modifiedOn?: number
}

/** How long after the last approval the wrapped move may still go through. */
export const APPROVAL_WINDOW = 15 * 60_000

/** The completed request that authorises moving `issueId` to `next` at `now`, if any. */
export function approvedRequestFor<T extends ApprovalRequestLike> (requests: T[], issueId: string, next: string, now: number): T | undefined {
  return requests.find((r) => {
    if (r.tx?.objectId !== issueId) return false
    if (r.tx?.operations?.status !== next) return false
    // the last approval has just landed and the completion is being applied in this very batch
    if (r.status === 'Active') return (r.approved?.length ?? 0) >= (r.requiredApprovesCount ?? 1)
    if (r.status !== 'Completed') return false
    const at = Math.max(r.modifiedOn ?? 0, ...(r.approvedDates ?? []))
    return now - at <= APPROVAL_WINDOW
  })
}

/** Does a rule ask for approval at all? */
export function needsApproval (rule: { approval?: { approvers?: string[] } } | undefined): boolean {
  return (rule?.approval?.approvers?.length ?? 0) > 0
}
