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

// Role changes and invites happen in the account service, outside the
// document store, so the activity feed never sees them. Settings screens
// record them here for the audit log. The class lives in the tracker
// plugin; it is referenced by id so this package needs no new dependency.

import { getCurrentEmployee } from '@hcengineering/contact'
import core, { type Class, type Doc, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'

const AUDIT_EVENT = 'tracker:class:AuditEvent' as Ref<Class<Doc>>

export async function recordAudit (kind: string, target: string, details: string = ''): Promise<void> {
  try {
    await getClient().createDoc(AUDIT_EVENT, core.space.Workspace, { kind, actor: getCurrentEmployee(), target, details } as any)
  } catch {
    // never let bookkeeping break the action itself
  }
}
