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

import { APPROVAL_WINDOW, approvedRequestFor, needsApproval } from '../approvals'

const now = 1_800_000_000_000
const done = { status: 'Completed', tx: { objectId: 'i1', operations: { status: 'done' } }, approvedDates: [now - 60_000], modifiedOn: now - 60_000 }

describe('approval gate', () => {
  it('finds a fresh completed request for the same issue and status', () => {
    expect(approvedRequestFor([done], 'i1', 'done', now)).toBe(done)
  })
  it('ignores other issues, other statuses, unfinished and stale requests', () => {
    expect(approvedRequestFor([done], 'i2', 'done', now)).toBeUndefined()
    expect(approvedRequestFor([done], 'i1', 'review', now)).toBeUndefined()
    expect(approvedRequestFor([{ ...done, status: 'Active', approved: [], requiredApprovesCount: 1 }], 'i1', 'done', now)).toBeUndefined()
    expect(approvedRequestFor([{ ...done, status: 'Active', approved: ['p1'], requiredApprovesCount: 2 }], 'i1', 'done', now)).toBeUndefined()
  })
  it('lets the move through while the last approval is being applied', () => {
    expect(approvedRequestFor([{ ...done, status: 'Active', approved: ['p1'], requiredApprovesCount: 1 }], 'i1', 'done', now)).toBeDefined()
    expect(approvedRequestFor([{ ...done, status: 'Active', approved: ['p1', 'p2'], requiredApprovesCount: 2 }], 'i1', 'done', now)).toBeDefined()
    expect(approvedRequestFor([{ ...done, status: 'Rejected' }], 'i1', 'done', now)).toBeUndefined()
    expect(approvedRequestFor([{ ...done, approvedDates: [now - APPROVAL_WINDOW - 1000], modifiedOn: now - APPROVAL_WINDOW - 1000 }], 'i1', 'done', now)).toBeUndefined()
  })
  it('uses the latest of the approval dates and the modification time', () => {
    expect(approvedRequestFor([{ ...done, approvedDates: [now - APPROVAL_WINDOW - 1000], modifiedOn: now - 1000 }], 'i1', 'done', now)).toBeDefined()
  })
  it('knows which rules need approval', () => {
    expect(needsApproval(undefined)).toBe(false)
    expect(needsApproval({})).toBe(false)
    expect(needsApproval({ approval: { approvers: [] } })).toBe(false)
    expect(needsApproval({ approval: { approvers: ['p1'] } })).toBe(true)
  })
})
