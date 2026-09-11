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

// Per-project permission and notification schemes.
//
// Permissions: the project names the minimum workspace role for closing,
// reopening, deleting, reassigning and editing certain fields. Enforced
// here, on every write path. Owners and the system account are exempt.
//
// Notifications: the project can switch off event kinds; the matching
// inbox notifications are removed before anyone sees them. People's own
// preferences still apply on top.

import core, { AccountRole, hasAccountRole, type Class, type Doc, type Ref, type SessionData, type Tx, type TxCreateDoc, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { type TriggerControl } from '@hcengineering/server-core'
import task from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus, type NotificationScheme, type PermissionScheme, type Project } from '@hcengineering/tracker'

const DOC_UPDATE_MESSAGE = 'activity:class:DocUpdateMessage' as Ref<Class<Doc>>
const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const MENTION_NOTIFICATION = 'notification:class:MentionInboxNotification' as Ref<Class<Doc>>

function forbidden (): never {
  throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
}

export async function OnIssuePermissions (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const account = (control.ctx.contextData as SessionData | undefined)?.account
  if (account === undefined) return []
  if (hasAccountRole(account, AccountRole.Owner) || (account.uuid as string) === (core.account.System as string)) return []
  for (const tx of txes) {
    const cud = tx as TxCUD<Issue>
    if (cud.objectClass !== tracker.class.Issue) continue
    if (cud._class !== core.class.TxUpdateDoc && cud._class !== core.class.TxRemoveDoc) continue
    const project = (await control.findAll(control.ctx, tracker.class.Project, { _id: cud.objectSpace as Ref<Project> }, { limit: 1 }))[0]
    const scheme: PermissionScheme | undefined = project?.permissions
    if (scheme === undefined || Object.keys(scheme).length === 0) continue
    const need = (key: keyof PermissionScheme): void => {
      const min = scheme[key]
      if (min !== undefined && !hasAccountRole(account, min)) forbidden()
    }
    if (cud._class === core.class.TxRemoveDoc) {
      need('delete')
      continue
    }
    const ops = (cud as TxUpdateDoc<Issue>).operations as Partial<Issue>
    if (ops.status !== undefined) {
      const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: cud.objectId }, { limit: 1 }))[0]
      const ids = [ops.status, ...(issue !== undefined ? [issue.status] : [])] as Ref<IssueStatus>[]
      const statuses = await control.findAll(control.ctx, tracker.class.IssueStatus, { _id: { $in: ids } })
      const cat = new Map(statuses.map((s) => [s._id, s.category]))
      const done = (st: Ref<IssueStatus> | undefined): boolean => st !== undefined && (cat.get(st) === task.statusCategory.Won || cat.get(st) === task.statusCategory.Lost)
      // the trigger runs after apply, so `issue.status` is already the new value; the previous one is not
      // available here. Treat any move into a terminal status as "close" and any move out of one as "reopen".
      if (done(ops.status)) need('close')
      else if (issue !== undefined && !done(ops.status) && scheme.reopen !== undefined) {
        // moving to an open status: only a reopen if the issue is otherwise resolved (resolution set)
        if (issue.resolution != null) need('reopen')
      }
    }
    if (ops.assignee !== undefined) need('reassign')
    if (ops.priority !== undefined) need('changePriority')
    if (ops.estimation !== undefined || ops.storyPoints !== undefined) need('editEstimates')
    if (ops.dueDate !== undefined || ops.startDate !== undefined || ops.slaDue !== undefined) need('editDates')
    if (ops.sprint !== undefined || ops.milestone !== undefined) need('moveSprint')
  }
  return []
}

export async function OnNotificationScheme (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const out: Tx[] = []
  for (const tx of txes) {
    const cud = tx as TxCreateDoc<Doc>
    if (cud._class !== core.class.TxCreateDoc) continue
    const attrs = cud.attributes as Record<string, unknown>
    if (attrs.objectClass !== tracker.class.Issue) continue
    const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: attrs.objectId as Ref<Issue> }, { limit: 1 }))[0]
    if (issue === undefined) continue
    const project = (await control.findAll(control.ctx, tracker.class.Project, { _id: issue.space }, { limit: 1 }))[0]
    const scheme: NotificationScheme | undefined = project?.notificationScheme
    if (scheme === undefined || Object.keys(scheme).length === 0) continue

    let event: keyof NotificationScheme = 'otherChanges'
    if (cud.objectClass === MENTION_NOTIFICATION) event = 'mentioned'
    else if (typeof attrs.attachedTo === 'string') {
      const msgClass = attrs.attachedToClass as Ref<Class<Doc>> | undefined
      if (msgClass === CHAT_MESSAGE) event = 'commented'
      else if (msgClass === DOC_UPDATE_MESSAGE) {
        const msg = (await control.findAll(control.ctx, DOC_UPDATE_MESSAGE, { _id: attrs.attachedTo as Ref<Doc> } as any, { limit: 1 }))[0] as any
        const key = msg?.attributeUpdates?.attrKey as string | undefined
        event = key === 'assignee' ? 'assigned' : key === 'status' ? 'statusChanged' : 'otherChanges'
      }
    }
    if (scheme[event] === false) {
      out.push(control.txFactory.createTxRemoveDoc(cud.objectClass, cud.objectSpace, cud.objectId))
    }
  }
  return out
}
