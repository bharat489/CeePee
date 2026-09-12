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

// Administrative actions (role changes, invites, integration changes) do
// not go through the document store, so the activity feed never sees them.
// Screens that perform them call recordAudit so the audit log is complete.

import { getCurrentEmployee } from '@hcengineering/contact'
import core from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'

import tracker from './plugin'

export async function recordAudit (kind: string, target: string, details: string = ''): Promise<void> {
  try {
    await getClient().createDoc(tracker.class.AuditEvent, core.space.Workspace, {
      kind,
      actor: getCurrentEmployee(),
      target,
      details
    })
  } catch {
    // never let bookkeeping break the action itself
  }
}
