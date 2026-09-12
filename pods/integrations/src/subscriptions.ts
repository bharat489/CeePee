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

// Scheduled emails: a saved query's results as a table, or a dashboard's
// headline numbers. Checked every five minutes; a subscription is due when
// the hour (and weekday, for weekly ones) matches and nothing was sent yet
// today.

import { type PlatformClient } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import task from '@hcengineering/task'
import tracker, { buildQueryContext, runQueryWith, type Dashboard, type Issue, type QueryContext, type QuerySubscription } from '@hcengineering/tracker'

export interface SubscriptionsConfig {
  mailUrl: string | undefined
  mailApiKey: string | undefined
  frontUrl: string
  workspace: string
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)

async function sendMail (cfg: SubscriptionsConfig, to: string, subject: string, text: string, html: string): Promise<void> {
  if (cfg.mailUrl === undefined || cfg.mailUrl === '') throw new Error('MAIL_URL not set')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.mailApiKey !== undefined && cfg.mailApiKey !== '') headers.authorization = `Bearer ${cfg.mailApiKey}`
  const r = await (globalThis as any).fetch(`${cfg.mailUrl.replace(/\/$/, '')}/send`, { method: 'POST', headers, body: JSON.stringify({ to, subject, text, html }) })
  if (r !== undefined && r.ok === false) throw new Error(`mail service answered ${r.status}`)
}

function link (cfg: SubscriptionsConfig, i: Issue): string {
  return `${cfg.frontUrl.replace(/\/$/, '')}/workbench/${cfg.workspace}/tracker/${i.identifier}`
}

async function queryEmail (c: PlatformClient, cfg: SubscriptionsConfig, ctx: QueryContext, sub: QuerySubscription): Promise<{ subject: string, text: string, html: string }> {
  let text = sub.query ?? ''
  if (sub.savedQuery !== undefined) {
    const sq = await c.findOne(tracker.class.SavedQuery, { _id: sub.savedQuery })
    if (sq !== undefined) text = sq.text
  }
  const r = await runQueryWith(c as any, ctx, text, 200)
  if (r.errors.length > 0) throw new Error(r.errors.join('; '))
  const statusName = new Map(ctx.statuses.map((s) => [s._id, s.name]))
  const personName = new Map(ctx.people.map((p) => [p._id, p.name]))
  const projectKey = new Map(ctx.projects.map((p) => [p._id, p.identifier]))
  const rows = r.issues
  const subject = `${sub.name}: ${rows.length} issue${rows.length === 1 ? '' : 's'}`
  const plain = [`${sub.name} — ${rows.length} issue${rows.length === 1 ? '' : 's'} match "${text}"`, '', ...rows.map((i) => `- ${i.identifier} ${i.title} · ${statusName.get(i.status) ?? ''} · ${i.assignee != null ? personName.get(i.assignee) ?? '' : 'unassigned'}${i.dueDate != null ? ` · due ${new Date(i.dueDate).toLocaleDateString()}` : ''}`), '', `Open in CeePee: ${cfg.frontUrl}`].join('\n')
  const table = rows.map((i) => `<tr><td><a href="${link(cfg, i)}">${esc(i.identifier)}</a></td><td>${esc(i.title)}</td><td>${esc(projectKey.get(i.space) ?? '')}</td><td>${esc(statusName.get(i.status) ?? '')}</td><td>${esc(i.assignee != null ? personName.get(i.assignee) ?? '' : '—')}</td><td>${i.dueDate != null ? new Date(i.dueDate).toLocaleDateString() : ''}</td></tr>`).join('')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#222"><h2 style="margin:0 0 .3rem">${esc(sub.name)}</h2><p style="color:#666;margin:0 0 1rem"><code>${esc(text)}</code> · ${rows.length} issue${rows.length === 1 ? '' : 's'}</p><table cellpadding="6" style="border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:#666"><th>Key</th><th>Title</th><th>Project</th><th>Status</th><th>Assignee</th><th>Due</th></tr></thead><tbody>${table}</tbody></table><p style="margin-top:1rem"><a href="${cfg.frontUrl}">Open CeePee</a></p></div>`
  return { subject, text: plain, html }
}

async function dashboardEmail (c: PlatformClient, cfg: SubscriptionsConfig, ctx: QueryContext, sub: QuerySubscription): Promise<{ subject: string, text: string, html: string }> {
  const d: Dashboard | undefined = sub.dashboard !== undefined ? await c.findOne(tracker.class.Dashboard, { _id: sub.dashboard }) : undefined
  if (d === undefined) throw new Error('dashboard not found')
  const statuses = await c.findAll(tracker.class.IssueStatus, {})
  const open = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  const lines: Array<{ title: string, value: string }> = []
  for (const w of d.widgets) {
    const p = (w.params ?? {}) as Record<string, any>
    const title: string = p.title ?? w.type
    try {
      let issues: Issue[]
      if (typeof p.filter === 'string' && p.filter.trim() !== '') {
        const r = await runQueryWith(c as any, ctx, p.filter, 5000)
        issues = r.issues.filter((i) => p.project === undefined || p.project === '' || i.space === p.project)
      } else if (typeof p.text === 'string' && w.type === 'query') {
        issues = (await runQueryWith(c as any, ctx, p.text, 5000)).issues
      } else {
        const q: Record<string, unknown> = { archived: { $ne: true } }
        if (p.project !== undefined && p.project !== '') q.space = p.project
        if (!['recent', 'cvr', 'csat', 'heatmap', 'activity', 'hours', 'decisions', 'text', 'links', 'sprints', 'burndown', 'countdown'].includes(w.type)) q.status = { $in: open }
        issues = Array.from(await c.findAll(tracker.class.Issue, q as any, { limit: 5000 }))
      }
      const now = Date.now()
      let value = String(issues.length)
      if (w.type === 'due') value = String(issues.filter((i) => i.dueDate != null && i.dueDate < now + (p.days ?? 7) * 86_400_000).length) + ' due soon'
      else if (w.type === 'stale') value = String(issues.filter((i) => i.modifiedOn < now - (p.days ?? 7) * 86_400_000).length) + ' quiet'
      else if (w.type === 'sla') value = String(issues.filter((i) => i.slaDue != null && i.slaDue < now).length) + ' breaching'
      else if (w.type === 'recent') value = String(issues.filter((i) => (i.createdOn ?? 0) > now - (p.days ?? 7) * 86_400_000).length) + ' created'
      else if (w.type === 'workload') value = `${issues.length} open across ${new Set(issues.map((i) => i.assignee).filter((a) => a != null)).size} people`
      else if (w.type === 'text' || w.type === 'links') continue
      else value = `${issues.length} issue${issues.length === 1 ? '' : 's'}`
      lines.push({ title, value })
    } catch (e: any) {
      lines.push({ title, value: `error: ${String(e?.message ?? e)}` })
    }
  }
  const url = `${cfg.frontUrl.replace(/\/$/, '')}/workbench/${cfg.workspace}/tracker/dashboard`
  const subject = `${d.name}: ${lines.map((l) => `${l.title} ${l.value.split(' ')[0]}`).slice(0, 3).join(', ')}`
  const text = [`${d.name}`, '', ...lines.map((l) => `- ${l.title}: ${l.value}`), '', `Open the dashboard: ${url}`].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#222"><h2 style="margin:0 0 .6rem">${esc(d.name)}</h2><table cellpadding="6" style="border-collapse:collapse;font-size:14px">${lines.map((l) => `<tr><td style="color:#666">${esc(l.title)}</td><td><b>${esc(l.value)}</b></td></tr>`).join('')}</table><p style="margin-top:1rem"><a href="${url}">Open the dashboard</a></p></div>`
  return { subject, text, html }
}

function isDue (s: QuerySubscription, now: Date): boolean {
  if (!s.enabled) return false
  if (now.getHours() !== s.hour) return false
  if (s.schedule === 'weekly' && now.getDay() !== (s.weekday ?? 1)) return false
  const last = s.lastSent !== undefined ? new Date(s.lastSent) : undefined
  return last === undefined || last.toDateString() !== now.toDateString()
}

export async function runSubscriptions (c: PlatformClient, cfg: SubscriptionsConfig, log: (m: string) => void): Promise<number> {
  const now = new Date()
  const subs = Array.from(await c.findAll(tracker.class.QuerySubscription, { enabled: true }))
  const due = subs.filter((s) => isDue(s, now))
  if (due.length === 0) return 0
  const ctx = await buildQueryContext(c as any, { me: undefined, socialIds: [] })
  let sent = 0
  for (const s of due) {
    try {
      const mail = s.kind === 'dashboard' ? await dashboardEmail(c, cfg, ctx, s) : await queryEmail(c, cfg, ctx, s)
      for (const to of s.recipients) await sendMail(cfg, to, mail.subject, mail.text, mail.html)
      await c.updateDoc(tracker.class.QuerySubscription, s.space, s._id, { lastSent: Date.now(), lastError: undefined })
      sent++
    } catch (e: any) {
      await c.updateDoc(tracker.class.QuerySubscription, s.space, s._id, { lastError: String(e?.message ?? e).slice(0, 200) }).catch(() => {})
      log(`subscription ${s.name} failed: ${String(e?.message ?? e)}`)
    }
  }
  void contact
  return sent
}

export function scheduleSubscriptions (getClient: () => Promise<PlatformClient>, cfg: SubscriptionsConfig, log: (m: string) => void): void {
  if (cfg.mailUrl === undefined || cfg.mailUrl === '') {
    log('subscriptions: MAIL_URL not set, scheduled emails disabled')
    return
  }
  setInterval(() => {
    void (async () => {
      try {
        const n = await runSubscriptions(await getClient(), cfg, log)
        if (n > 0) log(`subscriptions: sent ${n}`)
      } catch (e: any) {
        log(`subscriptions: ${String(e?.message ?? e)}`)
      }
    })()
  }, 5 * 60_000)
}
