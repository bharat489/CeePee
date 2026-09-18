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

// Audit streaming: when the audit policy names a SIEM endpoint, every change
// to the watched classes is posted there as one JSON event, with the shared
// secret as a bearer token. Fire-and-forget; a slow collector never slows the
// workspace.

import core, { type Doc, type Tx, type TxCreateDoc, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import tracker, { type AuditPolicy } from '@hcengineering/tracker'

async function policyOf (control: TriggerControl): Promise<AuditPolicy | undefined> {
  const cached = control.cache.get('siem-policy') as { at: number, policy: AuditPolicy | undefined } | undefined
  if (cached !== undefined && Date.now() - cached.at < 60_000) return cached.policy
  const policy = (await control.findAll(control.ctx, tracker.class.AuditPolicy, {}, { limit: 1 }))[0]
  control.cache.set('siem-policy', { at: Date.now(), policy })
  return policy
}

const SKIP = new Set(['modifiedOn', 'modifiedBy', 'createdOn', 'createdBy'])

export async function OnSiem (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const policy = await policyOf(control)
  const url = policy?.siemUrl?.trim() ?? ''
  if (url === '') return []
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (policy?.siemSecret !== undefined && policy.siemSecret !== '') headers.authorization = `Bearer ${policy.siemSecret}`
  const g = globalThis as any
  const actor = control.ctx.contextData?.account?.uuid
  for (const tx of txes) {
    const cud = tx as TxCUD<Doc>
    if (cud.objectClass === undefined) continue
    const action = cud._class === core.class.TxCreateDoc ? 'create' : cud._class === core.class.TxUpdateDoc ? 'update' : cud._class === core.class.TxRemoveDoc ? 'delete' : 'other'
    let changes: Record<string, unknown> | undefined
    if (action === 'create') {
      const attrs = (cud as TxCreateDoc<Doc>).attributes as Record<string, unknown>
      changes = Object.fromEntries(Object.entries(attrs).filter(([k]) => !SKIP.has(k)).slice(0, 40).map(([k, v]) => [k, typeof v === 'string' && v.length > 500 ? v.slice(0, 500) + '…' : v]))
    } else if (action === 'update') {
      const ops = (cud as TxUpdateDoc<Doc>).operations as Record<string, unknown>
      changes = Object.fromEntries(Object.entries(ops).filter(([k]) => !k.startsWith('$') && !SKIP.has(k)).map(([k, v]) => [k, typeof v === 'string' && v.length > 500 ? v.slice(0, 500) + '…' : v]))
      if (Object.keys(changes).length === 0) continue
    }
    const event = {
      at: tx.modifiedOn,
      workspace: control.workspace.url,
      actor,
      action,
      objectClass: cud.objectClass,
      objectId: cud.objectId,
      space: cud.objectSpace,
      changes
    }
    void g.fetch(url, { method: 'POST', headers, body: JSON.stringify(event) }).catch(() => {})
  }
  return []
}
