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

// Daily email digest: what is mine, what is due, what has gone quiet --
// one message per person, sent through the mail service. Silent when the
// mail service is not configured, and never sent to someone with nothing
// to say to.

import { type PlatformClient } from '@hcengineering/api-client'
import contact, { type Person } from '@hcengineering/contact'
import { SocialIdType, SortingOrder, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type Issue } from '@hcengineering/tracker'

export interface DigestConfig {
  mailUrl: string | undefined
  mailApiKey: string | undefined
  hour: number
  frontUrl: string
  workspace: string
}

const DAY = 86_400_000
function startOfWeek (t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime() - ((d.getDay() + 6) % 7) * DAY
}
const rank = (p: IssuePriority): number => (p === IssuePriority.NoPriority ? 99 : p)

async function sendMail (cfg: DigestConfig, to: string, subject: string, text: string, html: string): Promise<void> {
  if (cfg.mailUrl === undefined || cfg.mailUrl === '') return
  const g = globalThis as any
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.mailApiKey !== undefined && cfg.mailApiKey !== '') headers.authorization = `Bearer ${cfg.mailApiKey}`
  await g.fetch(`${cfg.mailUrl.replace(/\/$/, '')}/send`, { method: 'POST', headers, body: JSON.stringify({ to, subject, text, html }) })
}

export async function runDigest (c: PlatformClient, cfg: DigestConfig): Promise<{ sent: number }> {
  const statuses = await c.findAll(tracker.class.IssueStatus, {})
  const open = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  const statusName = new Map(statuses.map((s) => [s._id, s.name]))
  const employees = await c.findAll(contact.mixin.Employee, { active: true })
  const emails = await c.findAll(contact.class.SocialIdentity, { type: SocialIdType.EMAIL })
  const emailOf = new Map<Ref<Person>, string>()
  for (const s of emails) if (!emailOf.has(s.attachedTo)) emailOf.set(s.attachedTo, s.value)
  const stale = await c.findAll(tracker.class.Issue, { status: { $in: open }, modifiedOn: { $lt: Date.now() - 7 * DAY } }, { limit: 500, sort: { modifiedOn: SortingOrder.Ascending } })
  const projects = await c.findAll(tracker.class.Project, {})
  const projectOf = new Map(projects.map((p) => [p._id, p.identifier]))
  const link = (i: Issue): string => `${cfg.frontUrl.replace(/\/$/, '')}/workbench/${cfg.workspace}/tracker/${i.identifier}`
  let sent = 0
  for (const e of employees) {
    const to = emailOf.get(e._id)
    if (to === undefined) continue
    const mine = await c.findAll(tracker.class.Issue, { assignee: e._id, status: { $in: open } }, { limit: 200 })
    // timesheet reminder: hours logged last week, nothing submitted
    const prevWeek = startOfWeek(Date.now()) - 7 * DAY
    const lastWeekHours = (await c.findAll(tracker.class.TimeSpendReport, { employee: e._id as any, date: { $gte: prevWeek, $lt: prevWeek + 7 * DAY } }, { limit: 1000 })).reduce((a, r) => a + r.value, 0)
    const approval = lastWeekHours > 0 ? await c.findOne(tracker.class.TimesheetApproval, { employee: e._id as any, weekStart: prevWeek }) : undefined
    const needsTimesheet = lastWeekHours > 0 && (approval === undefined || approval.state === 'rejected')
    const timesheetUrl = `${cfg.frontUrl.replace(/\/$/, '')}/workbench/${cfg.workspace}/tracker/timesheets`
    if (mine.length === 0 && !needsTimesheet) continue
    const next = [...mine].sort((a, b) => rank(a.priority) - rank(b.priority) || (a.dueDate ?? 9e15) - (b.dueDate ?? 9e15)).slice(0, 8)
    const due = mine.filter((i) => i.dueDate != null && i.dueDate < Date.now() + 3 * DAY).sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
    const myStale = stale.filter((i) => i.assignee === e._id).slice(0, 5)
    const line = (i: Issue): string => `- ${i.identifier} ${i.title} (${statusName.get(i.status) ?? ''}${i.dueDate != null ? `, due ${new Date(i.dueDate).toLocaleDateString()}` : ''})`
    const hline = (i: Issue): string => `<li><a href="${link(i)}">${i.identifier}</a> ${escapeHtml(i.title)} <span style="color:#888">${statusName.get(i.status) ?? ''}${i.dueDate != null ? ` · due ${new Date(i.dueDate).toLocaleDateString()}` : ''}</span></li>`
    const text = [
      `Good morning. ${mine.length} open issue${mine.length === 1 ? '' : 's'} assigned to you.`,
      '',
      'Next up:',
      ...next.map(line),
      ...(due.length > 0 ? ['', 'Due within 3 days:', ...due.map(line)] : []),
      ...(myStale.length > 0 ? ['', 'Gone quiet (7+ days):', ...myStale.map(line)] : []),
      ...(needsTimesheet ? ['', `Timesheet: ${Math.round(lastWeekHours * 10) / 10}h logged last week, not yet submitted. Submit it: ${timesheetUrl}`] : []),
      '',
      `Open CeePee: ${cfg.frontUrl}`
    ].join('\n')
    const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#222"><p>Good morning. <b>${mine.length}</b> open issue${mine.length === 1 ? '' : 's'} assigned to you.</p><p><b>Next up</b></p><ul>${next.map(hline).join('')}</ul>${due.length > 0 ? `<p><b>Due within 3 days</b></p><ul>${due.map(hline).join('')}</ul>` : ''}${myStale.length > 0 ? `<p><b>Gone quiet (7+ days)</b></p><ul>${myStale.map(hline).join('')}</ul>` : ''}${needsTimesheet ? `<p><b>Timesheet</b> · ${Math.round(lastWeekHours * 10) / 10}h logged last week, not yet submitted. <a href="${timesheetUrl}">Submit it</a>.</p>` : ''}<p><a href="${cfg.frontUrl}">Open CeePee</a></p></div>`
    try {
      await sendMail(cfg, to, `Your day in ${projectOf.size > 1 ? 'CeePee' : projectOf.values().next().value ?? 'CeePee'}: ${mine.length} open, ${due.length} due soon`, text, html)
      sent++
    } catch {
      // one bad address must not stop the rest
    }
  }
  return { sent }
}

function escapeHtml (s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)
}

/** Schedule the digest once a day at cfg.hour (server local time). */
export function scheduleDigest (getClient: () => Promise<PlatformClient>, cfg: DigestConfig, log: (m: string) => void): void {
  if (cfg.mailUrl === undefined || cfg.mailUrl === '') {
    log('digest: MAIL_URL not set, daily digest disabled')
    return
  }
  const tick = async (): Promise<void> => {
    const now = new Date()
    if (now.getHours() !== cfg.hour) return
    const key = now.toISOString().slice(0, 10)
    if ((globalThis as any).__digestSentOn === key) return
    ;(globalThis as any).__digestSentOn = key
    try {
      const r = await runDigest(await getClient(), cfg)
      log(`digest: sent ${r.sent}`)
    } catch (e: any) {
      log(`digest: failed ${String(e?.message ?? e)}`)
    }
  }
  setInterval(() => {
    void tick()
  }, 5 * 60_000)
}
