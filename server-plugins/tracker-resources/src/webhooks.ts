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

// Outbound webhooks for issues.
//
// Delivery is fire-and-forget: the transaction that caused it never waits on
// somebody else's server. Each delivery records its outcome on the webhook
// (last status, time, error) so a broken endpoint is visible in settings
// instead of silently dropping events. Payloads are signed with HMAC-SHA256
// when the hook has a secret, in the same shape GitHub uses, so existing
// receivers work unchanged.

import core, { type Tx, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import tracker, { type Issue, type Webhook, type WebhookEvent } from '@hcengineering/tracker'

const TIMEOUT_MS = 10_000

// Web Crypto (built into Node 22) so this file needs no node typings.
async function hmacSha256Hex (secret: string, body: string): Promise<string> {
  const subtle = (globalThis as any).crypto.subtle
  const enc = new TextEncoder()
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig: ArrayBuffer = await subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function eventOf (tx: TxCUD<Issue>): WebhookEvent | undefined {
  switch (tx._class) {
    case core.class.TxCreateDoc:
      return 'issue.created'
    case core.class.TxRemoveDoc:
      return 'issue.deleted'
    case core.class.TxUpdateDoc: {
      const ops = (tx as TxUpdateDoc<Issue>).operations as Record<string, unknown>
      if (ops.status !== undefined) return 'issue.status'
      // Collection bookkeeping ($inc comments, $push ...) is not a change anyone subscribes to.
      const keys = Object.keys(ops).filter((k) => !k.startsWith('$'))
      return keys.length > 0 ? 'issue.updated' : undefined
    }
  }
  return undefined
}

function pick (i: Issue): Record<string, unknown> {
  return {
    _id: i._id,
    identifier: i.identifier,
    title: i.title,
    status: i.status,
    priority: i.priority,
    assignee: i.assignee,
    project: i.space,
    kind: i.kind,
    parent: i.attachedTo,
    milestone: i.milestone,
    sprint: i.sprint,
    component: i.component,
    dueDate: i.dueDate,
    estimation: i.estimation,
    storyPoints: i.storyPoints,
    createdOn: i.createdOn,
    modifiedOn: i.modifiedOn
  }
}

async function deliver (hook: Webhook, event: WebhookEvent, body: string, control: TriggerControl): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'CeePee-Webhooks/1.0',
    'x-ceepee-event': event
  }
  if (hook.secret !== undefined && hook.secret !== '') {
    headers['x-ceepee-signature'] = 'sha256=' + (await hmacSha256Hex(hook.secret, body))
  }
  let status = 0
  let error: string | null = null
  try {
    const g = globalThis as any
    const ctrl = new g.AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await g.fetch(hook.url, { method: 'POST', headers, body, signal: ctrl.signal })
    clearTimeout(timer)
    status = res.status
    if (res.ok !== true) error = `HTTP ${res.status}`
  } catch (err: any) {
    error = String(err?.message ?? err)
  }
  try {
    await control.apply(control.ctx, [
      control.txFactory.createTxUpdateDoc(tracker.class.Webhook, hook.space, hook._id, {
        lastStatus: status,
        lastDeliveredOn: Date.now(),
        lastError: error
      })
    ])
  } catch {
    // recording the outcome is best effort
  }
}

export async function OnIssueWebhook (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const hooks = await control.findAll(control.ctx, tracker.class.Webhook, { enabled: true })
  if (hooks.length === 0) return []
  for (const tx of txes) {
    const cud = tx as TxCUD<Issue>
    if (cud.objectClass !== tracker.class.Issue) continue
    const event = eventOf(cud)
    if (event === undefined) continue
    // "issue.updated" subscribers also get status changes; they are updates.
    const targets = hooks.filter((h) => h.events.includes(event) || (event === 'issue.status' && h.events.includes('issue.updated')))
    if (targets.length === 0) continue

    const issue =
      event === 'issue.deleted'
        ? (control.removedMap.get(cud.objectId) as Issue | undefined)
        : (await control.findAll(control.ctx, tracker.class.Issue, { _id: cud.objectId }, { limit: 1 }))[0]
    const body = JSON.stringify({
      event,
      at: Date.now(),
      workspace: control.workspace.url,
      issue: issue !== undefined ? pick(issue) : { _id: cud.objectId },
      changes: cud._class === core.class.TxUpdateDoc ? (cud as TxUpdateDoc<Issue>).operations : undefined
    })
    for (const h of targets) void deliver(h, event, body, control)
  }
  return []
}
