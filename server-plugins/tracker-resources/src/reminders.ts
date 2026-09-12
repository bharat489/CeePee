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

// Reminders as inbox notifications, produced on the heartbeat once an hour:
//   - "remind me" reminders that have come due
//   - my issues due within N days (per-person threshold, default 1)
//   - my requests breaching SLA within N hours (default 4)
// Each issue reminds once per threshold; the person's quiet hours and muted
// projects are honoured by the notification-scheme trigger downstream.

import contact, { type Person } from '@hcengineering/contact'
import { generateId, type AccountUuid, type Ref, type Tx } from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { type IntlString } from '@hcengineering/platform'
import { getPersonSpaces } from '@hcengineering/server-contact'
import { type TriggerControl } from '@hcengineering/server-core'
import task from '@hcengineering/task'
import tracker, { type Issue, type NotifyPrefs } from '@hcengineering/tracker'

const HOUR = 3_600_000
const DAY = 24 * HOUR

interface People {
  accountOf: (person: Ref<Person>) => AccountUuid | undefined
  personOf: (account: AccountUuid) => Ref<Person> | undefined
  spaceOf: (person: Ref<Person>) => Ref<any> | undefined
}

async function people (control: TriggerControl): Promise<People> {
  const employees = await control.findAll(control.ctx, contact.mixin.Employee, { active: true }, { limit: 2000 })
  const spaces = await getPersonSpaces(control)
  const byPerson = new Map<Ref<Person>, AccountUuid>()
  const byAccount = new Map<AccountUuid, Ref<Person>>()
  for (const e of employees) {
    const uuid = (e as any).personUuid as AccountUuid | undefined
    if (uuid === undefined) continue
    byPerson.set(e._id, uuid)
    byAccount.set(uuid, e._id)
  }
  const spaceByPerson = new Map<Ref<Person>, Ref<any>>(spaces.map((s) => [s.person as Ref<Person>, s._id]))
  return { accountOf: (p) => byPerson.get(p), personOf: (a) => byAccount.get(a), spaceOf: (p) => spaceByPerson.get(p) }
}

async function notify (control: TriggerControl, ppl: People, user: AccountUuid, person: Ref<Person>, issue: Issue, title: IntlString, body: IntlString, params: Record<string, string | number>): Promise<Tx[]> {
  const space = ppl.spaceOf(person)
  if (space === undefined) return []
  const out: Tx[] = []
  const existing = (await control.findAll(control.ctx, notification.class.DocNotifyContext, { user, objectId: issue._id }, { limit: 1 }))[0]
  let ctxId = existing?._id
  if (ctxId === undefined) {
    ctxId = generateId()
    out.push(control.txFactory.createTxCreateDoc(notification.class.DocNotifyContext, space, { user, objectId: issue._id, objectClass: tracker.class.Issue, objectSpace: issue.space, isPinned: false, hidden: false, lastUpdateTimestamp: Date.now() }, ctxId))
  } else {
    out.push(control.txFactory.createTxUpdateDoc(notification.class.DocNotifyContext, space, ctxId, { lastUpdateTimestamp: Date.now(), hidden: false }))
  }
  out.push(control.txFactory.createTxCreateDoc(notification.class.CommonInboxNotification, space, {
    user,
    isViewed: false,
    archived: false,
    docNotifyContext: ctxId,
    objectId: issue._id,
    objectClass: tracker.class.Issue,
    header: title,
    message: body,
    props: params,
    title,
    body,
    intlParams: params
  } as any))
  return out
}

const when = (t: number): string => {
  const h = Math.round((t - Date.now()) / HOUR)
  if (h <= 0) return 'now'
  if (h < 24) return `in ${h}h`
  return `in ${Math.round(h / 24)}d`
}

export async function runReminders (control: TriggerControl): Promise<Tx[]> {
  const last = control.cache.get('reminders-last') as number | undefined
  if (last !== undefined && Date.now() - last < HOUR) return []
  control.cache.set('reminders-last', Date.now())
  const now = Date.now()
  const out: Tx[] = []
  const ppl = await people(control)
  const prefsList = await control.findAll(control.ctx, tracker.class.NotifyPrefs, {}, { limit: 2000 })
  const prefs = new Map<AccountUuid, NotifyPrefs>(prefsList.map((p) => [p.user, p]))
  const statuses = await control.findAll(control.ctx, tracker.class.IssueStatus, {})
  const open = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)

  // explicit reminders
  const due = await control.findAll(control.ctx, tracker.class.Reminder, { at: { $lte: now }, fired: { $ne: true } }, { limit: 200 })
  for (const r of due) {
    const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: r.issue }, { limit: 1 }))[0]
    const person = ppl.personOf(r.user)
    if (issue !== undefined && person !== undefined) out.push(...(await notify(control, ppl, r.user, person, issue, tracker.string.ReminderTitle, tracker.string.ReminderBody, { identifier: issue.identifier, title: issue.title, note: r.note ?? issue.title })))
    out.push(control.txFactory.createTxUpdateDoc(tracker.class.Reminder, r.space, r._id, { fired: true }))
  }

  // due soon: widest threshold anyone asked for, then per person
  const maxDays = Math.max(1, ...prefsList.map((p) => p.remindDueDays))
  const soon = await control.findAll(control.ctx, tracker.class.Issue, { status: { $in: open }, assignee: { $ne: null }, dueDate: { $lt: now + maxDays * DAY, $ne: null }, remindedDue: { $exists: false }, archived: { $ne: true } } as any, { limit: 200 })
  for (const i of soon) {
    if (i.assignee == null || i.dueDate == null) continue
    const account = ppl.accountOf(i.assignee)
    if (account === undefined) continue
    const days = prefs.get(account)?.remindDueDays ?? 1
    if (days <= 0 || i.dueDate - now > days * DAY) continue
    out.push(...(await notify(control, ppl, account, i.assignee, i, tracker.string.DueSoonTitle, tracker.string.DueSoonBody, { identifier: i.identifier, title: i.title, when: when(i.dueDate) })))
    out.push(control.txFactory.createTxUpdateDoc(tracker.class.Issue, i.space, i._id, { remindedDue: now }))
  }

  // SLA at risk
  const maxHours = Math.max(4, ...prefsList.map((p) => p.remindSlaHours))
  const risky = await control.findAll(control.ctx, tracker.class.Issue, { status: { $in: open }, assignee: { $ne: null }, slaDue: { $lt: now + maxHours * HOUR, $ne: null }, remindedSla: { $exists: false }, archived: { $ne: true } } as any, { limit: 200 })
  for (const i of risky) {
    if (i.assignee == null || i.slaDue == null) continue
    const account = ppl.accountOf(i.assignee)
    if (account === undefined) continue
    const hours = prefs.get(account)?.remindSlaHours ?? 4
    if (hours <= 0 || i.slaDue - now > hours * HOUR) continue
    out.push(...(await notify(control, ppl, account, i.assignee, i, tracker.string.SlaRiskTitle, tracker.string.SlaRiskBody, { identifier: i.identifier, title: i.title, hours: Math.max(0, Math.round((i.slaDue - now) / HOUR)) })))
    out.push(control.txFactory.createTxUpdateDoc(tracker.class.Issue, i.space, i._id, { remindedSla: now }))
  }
  return out
}
