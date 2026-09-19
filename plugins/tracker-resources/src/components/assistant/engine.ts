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

// The assistant's brain. Every answer comes from the workspace itself: intents
// are matched on the question, then answered with real queries, so nothing is
// invented and it runs with no key and no network. "/" runs actions, "@" scopes
// a question to a person, "#" to a channel, and a bare key (ENG-12) opens that
// issue's story. When an OpenAI-compatible endpoint is configured on the front
// (AI_CHAT_URL, e.g. a local Ollama), questions no intent understands are sent
// there with a context pack of the person's work.

import chunter, { type ChatMessage, type Channel } from '@hcengineering/chunter'
import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
import core, { getCurrentAccount, SortingOrder, type AccountUuid, type Ref, type TxOperations } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type Issue, type IssueStatus, type Project, type Sprint } from '@hcengineering/tracker'

import { runQuery } from '../query/run'
import { buildMapping, Importer } from '../import/common'

export interface AnswerGroup {
  label: string
  issues: Issue[]
}
export interface AnswerAction {
  label: string
  run: () => Promise<string>
}
export interface Answer {
  title: string
  text?: string
  issues?: Issue[]
  groups?: AnswerGroup[]
  copyText?: string
  actions?: AnswerAction[]
  note?: string
  source: 'local' | 'ai'
}
export interface Suggestion {
  label: string
  prompt: string
}

export const SUGGESTIONS: Suggestion[] = [
  { label: 'Are any of my work items overdue?', prompt: 'Are any of my work items overdue?' },
  { label: 'Write an update about my week.', prompt: 'Write an update about my week' },
  { label: 'What should I work on next?', prompt: 'What should I work on next?' },
  { label: "What's gone quiet?", prompt: 'What work has gone quiet?' },
  { label: 'Who is working on what?', prompt: 'Who is working on what?' },
  { label: 'How is the sprint going?', prompt: 'How is the current sprint going?' }
]

export const COMMANDS: Array<{ cmd: string, usage: string, hint: string }> = [
  { cmd: '/create', usage: '/create Fix the export button in ENG', hint: 'new issue, optionally "in <project key>"' },
  { cmd: '/assign', usage: '/assign ENG-12 @Priya', hint: 'assign an issue (me, or a person)' },
  { cmd: '/status', usage: '/status ENG-12 In progress', hint: 'move an issue to a status' },
  { cmd: '/priority', usage: '/priority ENG-12 high', hint: 'urgent, high, medium, low' },
  { cmd: '/due', usage: '/due ENG-12 friday', hint: 'tomorrow, friday, next week, +3d, 2026-10-01' },
  { cmd: '/comment', usage: '/comment ENG-12 Blocked on the API change', hint: 'add a comment' },
  { cmd: '/remind', usage: '/remind ENG-12 tomorrow 9am check with QA', hint: 'a reminder in your inbox' },
  { cmd: '/summarize', usage: '/summarize #general', hint: 'a channel or an issue key' },
  { cmd: '/help', usage: '/help', hint: 'this list' }
]

export interface Ctx {
  client: TxOperations
  me: Ref<Employee>
  meName: string
  statuses: IssueStatus[]
  employees: Employee[]
  projects: Project[]
}

const DAY = 86_400_000
const KEY = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/
const STOP = new Set('the a an and or of to in on for is are was were be been with at by from this that it its as we you i our your they them he she his her not no yes ok will can just do does did have has had but if so than then there here what when where which who how all any some more most very also into over out up down about after before'.split(' '))

function prio (p: IssuePriority): number {
  return p === IssuePriority.NoPriority ? 99 : p
}
// chat and comment bodies are stored as JSON markup; pull out the text
function plainText (body: string | undefined | null): string {
  if (body === undefined || body === null) return ''
  const t = String(body).trim()
  if (t.startsWith('{')) {
    try {
      const out: string[] = []
      const walk = (n: any): void => {
        if (n === null || typeof n !== 'object') return
        if (typeof n.text === 'string') out.push(n.text)
        if (Array.isArray(n.content)) { n.content.forEach(walk); if (n.type === 'paragraph') out.push(' ') }
        if (n.type === 'reference' && typeof n.attrs?.label === 'string') out.push('@' + n.attrs.label)
      }
      walk(JSON.parse(t))
      return out.join('').replace(/s+/g, ' ').trim()
    } catch {}
  }
  return stripHtml(t)
}
function stripHtml (s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}
function startOfWeek (t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime() - ((d.getDay() + 6) % 7) * DAY
}
function fmtDate (t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
/** "tomorrow", "friday", "next week", "+3d", "in 2 days", "2026-10-01", "9am" → timestamp */
export function parseWhen (text: string, from = Date.now()): number | undefined {
  const s = text.trim().toLowerCase()
  const at = (d: Date, hour = 9): number => { d.setHours(hour, 0, 0, 0); return d.getTime() }
  const hourMatch = /(\d{1,2})\s*(am|pm)/.exec(s)
  const hour = hourMatch !== null ? (Number(hourMatch[1]) % 12) + (hourMatch[2] === 'pm' ? 12 : 0) : 9
  const base = new Date(from)
  if (/^(now|today)/.test(s)) return at(base, Math.max(hour, base.getHours() + 1))
  if (/tomorrow/.test(s)) { base.setDate(base.getDate() + 1); return at(base, hour) }
  const rel = /\+?(\d+)\s*(d|day|days|w|week|weeks|h|hour|hours)\b/.exec(s)
  if (rel !== null) {
    const n = Number(rel[1])
    if (rel[2].startsWith('h')) return from + n * 3_600_000
    if (rel[2].startsWith('w')) { base.setDate(base.getDate() + 7 * n); return at(base, hour) }
    base.setDate(base.getDate() + n)
    return at(base, hour)
  }
  if (/next week/.test(s)) { base.setDate(base.getDate() + ((8 - base.getDay()) % 7 || 7)); return at(base, hour) }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dm = days.findIndex((d) => s.includes(d) || s.includes(d.slice(0, 3) + ' ') || s.endsWith(d.slice(0, 3)))
  if (dm >= 0) { let diff = (dm - base.getDay() + 7) % 7; if (diff === 0) diff = 7; base.setDate(base.getDate() + diff); return at(base, hour) }
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso !== null) return at(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), hour)
  const dmy = /(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/.exec(s)
  if (dmy !== null) { const y = dmy[3] !== undefined ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : base.getFullYear(); return at(new Date(y, Number(dmy[2]) - 1, Number(dmy[1])), hour) }
  return undefined
}

export function findPerson (ctx: Ctx, text: string): Employee | undefined {
  const q = text.replace(/^@/, '').trim().toLowerCase()
  if (q === '' || q === 'me' || q === 'myself') return ctx.employees.find((e) => e._id === ctx.me)
  const scored = ctx.employees.map((e) => {
    const n = formatName(e.name).toLowerCase()
    const parts = n.split(/\s+/)
    let s = 0
    if (n === q) s = 100
    else if (parts.some((p) => p === q)) s = 80
    else if (n.startsWith(q) || parts.some((p) => p.startsWith(q))) s = 60
    else if (n.includes(q)) s = 40
    return { e, s }
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  return scored[0]?.e
}
export function peopleMatching (ctx: Ctx, prefix: string): Employee[] {
  const q = prefix.toLowerCase()
  return ctx.employees.filter((e) => q === '' || formatName(e.name).toLowerCase().includes(q)).slice(0, 6)
}
const nameOf = (ctx: Ctx, id: Ref<Person> | null | undefined): string => (id == null ? 'Unassigned' : formatName(ctx.employees.find((e) => e._id === id)?.name ?? '') || 'Someone')

function cats (ctx: Ctx): { open: Ref<IssueStatus>[], done: Ref<IssueStatus>[], active: Ref<IssueStatus>[], name: Map<Ref<IssueStatus>, string> } {
  const open = ctx.statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  const done = ctx.statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id)
  const active = ctx.statuses.filter((s) => s.category === task.statusCategory.Active).map((s) => s._id)
  return { open, done, active, name: new Map(ctx.statuses.map((s) => [s._id, s.name])) }
}
function rank (ctx: Ctx, list: Issue[], blockedIds: Set<Ref<Issue>>): Issue[] {
  const now = Date.now()
  return [...list].sort((a, b) => {
    const ab = blockedIds.has(a._id) ? 1 : 0
    const bb = blockedIds.has(b._id) ? 1 : 0
    if (ab !== bb) return ab - bb
    const as = a.slaDue != null && a.slaDue < now + DAY ? 0 : 1
    const bs = b.slaDue != null && b.slaDue < now + DAY ? 0 : 1
    if (as !== bs) return as - bs
    const ad = a.dueDate ?? Number.MAX_SAFE_INTEGER
    const bd = b.dueDate ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return prio(a.priority) - prio(b.priority)
  })
}
async function openBlockedIds (ctx: Ctx, list: Issue[]): Promise<Set<Ref<Issue>>> {
  const { open } = cats(ctx)
  const ids = Array.from(new Set(list.flatMap((i) => (i.blockedBy ?? []).map((b) => b._id as Ref<Issue>))))
  if (ids.length === 0) return new Set()
  const blockers = await ctx.client.findAll(tracker.class.Issue, { _id: { $in: ids }, status: { $in: open } })
  const openBlockers = new Set(blockers.map((b) => b._id))
  return new Set(list.filter((i) => (i.blockedBy ?? []).some((b) => openBlockers.has(b._id as Ref<Issue>))).map((i) => i._id))
}

// ---- intents ------------------------------------------------------------------------------
type Handler = (ctx: Ctx, q: string, m: RegExpMatchArray) => Promise<Answer>
const INTENTS: Array<{ id: string, re: RegExp, run: Handler }> = [
  {
    id: 'help',
    re: /^\/help|^(help|what can you do|commands)\b/i,
    run: async () => ({ title: 'What I can do', text: ['Ask in plain words and I answer from the workspace, no AI key needed:', ...SUGGESTIONS.map((s) => `• ${s.label}`), '', 'Scope a question with @person or #channel, mention an issue key (ENG-12) for its story, or type a query (status = open AND priority >= high).', '', 'Actions:', ...COMMANDS.map((c) => `${c.usage}   — ${c.hint}`)].join('\n'), source: 'local' })
  },
  {
    id: 'overdue',
    re: /\b(overdue|past due|late|behind|missed( the)? deadline|slipp)/i,
    run: async (ctx, q) => {
      const { open, name } = cats(ctx)
      const who = scopePerson(ctx, q)
      const everyone = /\b(team|everyone|anyone|all|we)\b/i.test(q)
      // the database adapter has no $or: overdue by due date and by SLA are two queries, merged
      const base: Record<string, any> = { status: { $in: open } }
      if (!everyone) base.assignee = who?._id ?? ctx.me
      const now = Date.now()
      const byDue = await ctx.client.findAll(tracker.class.Issue, { ...base, dueDate: { $lt: now } }, { limit: 100 })
      const bySla = await ctx.client.findAll(tracker.class.Issue, { ...base, slaDue: { $lt: now } }, { limit: 100 })
      const seen = new Set<string>()
      const list = [...byDue, ...bySla].filter((i) => { if (seen.has(i._id)) return false; seen.add(i._id); return true })
      const sorted = list.sort((a, b) => (a.dueDate ?? a.slaDue ?? 0) - (b.dueDate ?? b.slaDue ?? 0))
      const label = everyone ? 'the team' : who !== undefined && who._id !== ctx.me ? formatName(who.name) : 'you'
      return {
        title: sorted.length === 0 ? `Nothing overdue for ${label}` : `${sorted.length} overdue for ${label}`,
        text: sorted.length === 0 ? 'Every due date and SLA is still ahead. Nice.' : `Oldest first. ${sorted.filter((i) => i.slaDue != null && i.slaDue < Date.now()).length} of these have breached an SLA.`,
        issues: sorted,
        note: sorted.length > 0 ? `Statuses: ${Array.from(new Set(sorted.map((i) => name.get(i.status) ?? ''))).join(', ')}` : undefined,
        source: 'local'
      }
    }
  },
  {
    id: 'week',
    re: /\b(update|report|summary|recap|standup|stand-up)\b.*\b(week|my work|today|yesterday)\b|\bweekly\b|\bwhat (did|have) i (do|done|finish|complete|ship)/i,
    run: async (ctx) => {
      const { open, done, active, name } = cats(ctx)
      const since = startOfWeek(Date.now())
      const finished = await ctx.client.findAll(tracker.class.Issue, { assignee: ctx.me, status: { $in: done }, modifiedOn: { $gte: since } }, { limit: 100, sort: { modifiedOn: SortingOrder.Descending } })
      const mine = await ctx.client.findAll(tracker.class.Issue, { assignee: ctx.me, status: { $in: open } }, { limit: 200 })
      const blocked = await openBlockedIds(ctx, mine)
      const doing = mine.filter((i) => active.includes(i.status) && !blocked.has(i._id))
      const next = rank(ctx, mine.filter((i) => !active.includes(i.status) && !blocked.has(i._id)), blocked).slice(0, 3)
      const stuck = mine.filter((i) => blocked.has(i._id))
      const line = (i: Issue): string => `- ${i.identifier} ${i.title}${i.dueDate != null ? ` (due ${fmtDate(i.dueDate)})` : ''}`
      const text = [
        `Update for the week of ${fmtDate(since)} — ${ctx.meName}`,
        '',
        `✅ Done (${finished.length})`,
        ...(finished.length > 0 ? finished.map(line) : ['- nothing closed yet this week']),
        '',
        `🔧 In progress (${doing.length})`,
        ...(doing.length > 0 ? doing.map(line) : ['- nothing in progress']),
        '',
        `⏭ Next up`,
        ...(next.length > 0 ? next.map(line) : ['- queue is empty']),
        ...(stuck.length > 0 ? ['', `⛔ Blocked (${stuck.length})`, ...stuck.map((i) => `${line(i)} — waiting on ${(i.blockedBy ?? []).length} item(s)`)] : [])
      ].join('\n')
      return { title: 'Your week, written up', text, copyText: text, groups: [{ label: `Done · ${finished.length}`, issues: finished }, { label: `In progress · ${doing.length}`, issues: doing }, { label: 'Next up', issues: next }, ...(stuck.length > 0 ? [{ label: `Blocked · ${stuck.length}`, issues: stuck }] : [])], note: `Statuses counted as done: ${done.map((d) => name.get(d)).join(', ')}. Copy the text into a standup or a channel.`, source: 'local' }
    }
  },
  {
    id: 'next',
    re: /\b(what should i (work on|do|pick)|work on next|next up|prioriti[sz]e|start with|focus on|my (tasks|issues|work|queue)|today)\b/i,
    run: async (ctx) => {
      const { open } = cats(ctx)
      const mine = await ctx.client.findAll(tracker.class.Issue, { assignee: ctx.me, status: { $in: open } }, { limit: 300 })
      const blocked = await openBlockedIds(ctx, mine)
      const ranked = rank(ctx, mine, blocked)
      const top = ranked.slice(0, 10)
      const why = (i: Issue): string => (blocked.has(i._id) ? 'blocked' : i.slaDue != null && i.slaDue < Date.now() + DAY ? 'SLA due' : i.dueDate != null && i.dueDate < Date.now() ? 'overdue' : i.dueDate != null && i.dueDate < Date.now() + 3 * DAY ? 'due soon' : i.priority === IssuePriority.Urgent ? 'urgent' : i.priority === IssuePriority.High ? 'high priority' : 'in order')
      return {
        title: mine.length === 0 ? 'Your queue is empty' : `Start with ${top[0]?.identifier ?? ''}`,
        text: mine.length === 0 ? 'Nothing is assigned to you and open. Pick something from the backlog or ask "what is unassigned".' : `${mine.length} open items. Ranked by SLA, then due date, then priority; blocked items sink to the bottom.\n${top.slice(0, 5).map((i, k) => `${k + 1}. ${i.identifier} — ${why(i)}`).join('\n')}`,
        issues: top,
        source: 'local'
      }
    }
  },
  {
    id: 'stale',
    re: /\b(stale|stuck|quiet|idle|untouched|forgotten|no (update|progress|movement)|in a while|gone cold|rotting)\b/i,
    run: async (ctx, q) => {
      const { open } = cats(ctx)
      const days = Number(/(\d+)\s*days?/.exec(q)?.[1] ?? 7)
      const who = scopePerson(ctx, q)
      const base: Record<string, any> = { status: { $in: open }, modifiedOn: { $lt: Date.now() - days * DAY } }
      if (who !== undefined) base.assignee = who._id
      const list = await ctx.client.findAll(tracker.class.Issue, base, { limit: 30, sort: { modifiedOn: SortingOrder.Ascending } })
      return { title: list.length === 0 ? `Nothing untouched for ${days}+ days` : `${list.length} items untouched for ${days}+ days`, text: list.length === 0 ? 'Everything open has moved recently.' : 'Oldest first. Nudge, reassign or close them.', issues: list, source: 'local' }
    }
  },
  {
    id: 'whois',
    re: /\b(who is (working|doing)|working on what|by assignee|workload|who has|who owns)\b/i,
    run: async (ctx) => {
      const { active } = cats(ctx)
      const list = await ctx.client.findAll(tracker.class.Issue, { status: { $in: active } }, { limit: 400 })
      const by = new Map<string, Issue[]>()
      for (const i of list) { const k = nameOf(ctx, i.assignee); by.set(k, [...(by.get(k) ?? []), i]) }
      const groups = Array.from(by.entries()).map(([label, issues]) => ({ label: `${label} · ${issues.length}`, issues: issues.slice(0, 8) })).sort((a, b) => b.issues.length - a.issues.length)
      return { title: `${by.size} people have work in progress`, text: list.length === 0 ? 'Nothing is in progress right now.' : `${list.length} items in progress across ${by.size} people.`, groups, source: 'local' }
    }
  },
  {
    id: 'person',
    re: /@([\p{L}][\p{L}.'-]*(?:\s[\p{L}][\p{L}.'-]*)?)|\bwhat is (\w+) (working on|doing)\b/iu,
    run: async (ctx, q, m) => {
      const who = findPerson(ctx, m[1] ?? m[2] ?? '')
      if (who === undefined) return { title: "I don't know that person", text: `No member matches "${m[1] ?? m[2]}". Try a first name, or @ and start typing.`, source: 'local' }
      const { open, name } = cats(ctx)
      const list = await ctx.client.findAll(tracker.class.Issue, { assignee: who._id, status: { $in: open } }, { limit: 200 })
      const by = new Map<string, Issue[]>()
      for (const i of list) { const k = name.get(i.status) ?? '—'; by.set(k, [...(by.get(k) ?? []), i]) }
      return { title: `${formatName(who.name)} has ${list.length} open items`, text: list.length === 0 ? 'Nothing open assigned to them.' : `${list.filter((i) => i.dueDate != null && i.dueDate < Date.now()).length} overdue.`, groups: Array.from(by.entries()).map(([label, issues]) => ({ label: `${label} · ${issues.length}`, issues })), source: 'local' }
    }
  },
  {
    id: 'channel',
    re: /#([\w-]+)|\b(catch me up|what happened|what did i miss)\b/i,
    run: async (ctx, q, m) => {
      const wanted = (m[1] ?? '').toLowerCase()
      const channels = await ctx.client.findAll(chunter.class.Channel, { archived: false }, { limit: 200 })
      const ch: Channel | undefined = wanted !== '' ? channels.find((c) => c.name.toLowerCase() === wanted) ?? channels.find((c) => c.name.toLowerCase().includes(wanted)) : channels.find((c) => c.name.toLowerCase() === 'general') ?? channels[0]
      if (ch === undefined) return { title: 'No such channel', text: `I could not find #${wanted}.`, source: 'local' }
      const msgs: ChatMessage[] = await ctx.client.findAll(chunter.class.ChatMessage, { attachedTo: ch._id }, { limit: 120, sort: { createdOn: SortingOrder.Descending } })
      const since = Date.now() - 7 * DAY
      const recent = msgs.filter((x) => (x.createdOn ?? 0) >= since)
      const authors = new Map<string, number>()
      const words = new Map<string, number>()
      for (const x of recent) {
        const a = String(x.createdBy ?? '?')
        authors.set(a, (authors.get(a) ?? 0) + 1)
        for (const w of stripHtml(x.message).toLowerCase().split(/[^\p{L}\p{N}-]+/u)) if (w.length > 3 && !STOP.has(w)) words.set(w, (words.get(w) ?? 0) + 1)
      }
      const top = Array.from(words.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w)
      const keys = Array.from(new Set(recent.flatMap((x) => Array.from(stripHtml(x.message).matchAll(/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g)).map((k) => k[0]))))
      const last = recent.slice(0, 5).reverse().map((x) => `• ${stripHtml(x.message).slice(0, 140)}`)
      const text = [`#${ch.name}, last 7 days: ${recent.length} messages from ${authors.size} people.`, top.length > 0 ? `Topics: ${top.join(', ')}.` : '', keys.length > 0 ? `Issues mentioned: ${keys.join(', ')}.` : '', '', 'Latest:', ...last].filter((l) => l !== undefined).join('\n')
      const issues = keys.length > 0 ? await ctx.client.findAll(tracker.class.Issue, { identifier: { $in: keys } }, { limit: 20 }) : []
      return { title: `Catch-up on #${ch.name}`, text, copyText: text, issues, source: 'local' }
    }
  },
  {
    id: 'issue',
    re: KEY,
    run: async (ctx, q, m) => {
      const key = `${m[1]}-${m[2]}`
      const issue = await ctx.client.findOne(tracker.class.Issue, { identifier: key })
      if (issue === undefined) return { title: `No issue ${key}`, source: 'local' }
      const { name, done } = cats(ctx)
      const kids = await ctx.client.findAll(tracker.class.Issue, { attachedTo: issue._id }, { limit: 200 })
      const comments: ChatMessage[] = await ctx.client.findAll(chunter.class.ChatMessage, { attachedTo: issue._id }, { limit: 3, sort: { createdOn: SortingOrder.Descending } })
      const blockers = (issue.blockedBy ?? []).length
      const sprint = issue.sprint != null ? await ctx.client.findOne(tracker.class.Sprint, { _id: issue.sprint as Ref<Sprint> }) : undefined
      const text = [
        `${issue.identifier} — ${issue.title}`,
        `Status ${name.get(issue.status) ?? '?'} · priority ${['none', 'urgent', 'high', 'medium', 'low'][issue.priority] ?? '?'} · assignee ${nameOf(ctx, issue.assignee)}`,
        issue.dueDate != null ? `Due ${fmtDate(issue.dueDate)}${issue.dueDate < Date.now() ? ' (overdue)' : ''}` : 'No due date',
        sprint !== undefined ? `Sprint ${sprint.name}` : '',
        kids.length > 0 ? `Sub-issues: ${kids.filter((k) => done.includes(k.status)).length}/${kids.length} done` : '',
        blockers > 0 ? `Blocked by ${blockers} item(s)` : '',
        issue.estimation > 0 ? `Estimate ${issue.estimation}h, logged ${issue.reportedTime ?? 0}h` : '',
        comments.length > 0 ? `\nLatest comments:\n${comments.reverse().map((c) => `• ${plainText(c.message).slice(0, 160)}`).join('\n')}` : '\nNo comments yet.'
      ].filter((l) => l !== '').join('\n')
      return { title: `${issue.identifier} at a glance`, text, copyText: text, issues: [issue, ...kids.slice(0, 10)], source: 'local' }
    }
  },
  {
    id: 'due',
    re: /\b(due (this|next) week|due soon|upcoming|deadlines?|coming up)\b/i,
    run: async (ctx, q) => {
      const { open } = cats(ctx)
      const days = /next week/i.test(q) ? 14 : 7
      const who = scopePerson(ctx, q)
      const base: Record<string, any> = { status: { $in: open }, dueDate: { $gte: Date.now(), $lt: Date.now() + days * DAY } }
      if (!/\b(team|everyone|all)\b/i.test(q)) base.assignee = who?._id ?? ctx.me
      const list = (await ctx.client.findAll(tracker.class.Issue, base, { limit: 100 })).sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      return { title: `${list.length} due in the next ${days} days`, issues: list, text: list.length === 0 ? 'Clear runway.' : undefined, source: 'local' }
    }
  },
  {
    id: 'blocked',
    re: /\b(blocked|blockers?|waiting on|dependencies)\b/i,
    run: async (ctx) => {
      const { open } = cats(ctx)
      const list = await ctx.client.findAll(tracker.class.Issue, { status: { $in: open }, blockedBy: { $exists: true } }, { limit: 300 })
      const blocked = await openBlockedIds(ctx, list)
      const rows = list.filter((i) => blocked.has(i._id))
      return { title: `${rows.length} items are blocked`, text: rows.length === 0 ? 'No open item is waiting on another open item.' : 'Each of these waits on at least one open blocker.', issues: rows, source: 'local' }
    }
  },
  {
    id: 'unassigned',
    re: /\b(unassigned|nobody|no owner|orphan)/i,
    run: async (ctx) => {
      const { open } = cats(ctx)
      const list = await ctx.client.findAll(tracker.class.Issue, { status: { $in: open }, assignee: null }, { limit: 50, sort: { modifiedOn: SortingOrder.Descending } })
      return { title: `${list.length} open items have no owner`, issues: list, source: 'local' }
    }
  },
  {
    id: 'new',
    re: /\b(new (issues|work|items|bugs)|recently (created|added)|what('s| is) new|created (this|last) week)\b/i,
    run: async (ctx) => {
      const list = await ctx.client.findAll(tracker.class.Issue, { createdOn: { $gte: Date.now() - 7 * DAY } }, { limit: 50, sort: { createdOn: SortingOrder.Descending } })
      return { title: `${list.length} created in the last 7 days`, issues: list, source: 'local' }
    }
  },
  {
    id: 'sprint',
    re: /\b(sprint|iteration)\b/i,
    run: async (ctx) => {
      const { done } = cats(ctx)
      const now = Date.now()
      const sprints = await ctx.client.findAll(tracker.class.Sprint, { startDate: { $lte: now }, endDate: { $gte: now - DAY } }, { limit: 20 })
      if (sprints.length === 0) return { title: 'No sprint is running', text: 'Start one from the backlog.', source: 'local' }
      const groups: AnswerGroup[] = []
      const lines: string[] = []
      for (const s of sprints) {
        const items = await ctx.client.findAll(tracker.class.Issue, { sprint: s._id }, { limit: 500 })
        const fin = items.filter((i) => done.includes(i.status)).length
        const daysLeft = Math.max(0, Math.ceil((s.endDate - now) / DAY))
        const pct = items.length === 0 ? 0 : Math.round((fin / items.length) * 100)
        lines.push(`${s.name}: ${fin}/${items.length} done (${pct}%), ${daysLeft} day(s) left${pct < Math.round(((now - s.startDate) / Math.max(1, s.endDate - s.startDate)) * 100) - 15 ? ' — behind pace' : ''}`)
        groups.push({ label: `${s.name} · open`, issues: items.filter((i) => !done.includes(i.status)).slice(0, 10) })
      }
      return { title: sprints.length === 1 ? sprints[0].name : `${sprints.length} sprints running`, text: lines.join('\n'), groups, source: 'local' }
    }
  },
  {
    id: 'count',
    re: /\bhow many\b/i,
    run: async (ctx, q) => {
      const { open, done, active } = cats(ctx)
      const who = scopePerson(ctx, q)
      const base: Record<string, any> = who !== undefined ? { assignee: who._id } : /\b(my|mine|me)\b/i.test(q) ? { assignee: ctx.me } : {}
      const n = async (extra: Record<string, any>): Promise<number> => (await ctx.client.findAll(tracker.class.Issue, { ...base, ...extra }, { limit: 1, total: true })).total
      const [o, d, a, u] = await Promise.all([n({ status: { $in: open } }), n({ status: { $in: done } }), n({ status: { $in: active } }), n({ status: { $in: open }, assignee: null })])
      return { title: `${o} open · ${a} in progress · ${d} done`, text: `${u} of the open items have no assignee.`, source: 'local' }
    }
  }
]

function scopePerson (ctx: Ctx, q: string): Employee | undefined {
  const m = /@([\p{L}][\p{L}.'-]*(?:\s[\p{L}][\p{L}.'-]*)?)/u.exec(q)
  if (m !== null) return findPerson(ctx, m[1])
  const m2 = /\b(?:for|of|by)\s+([A-Z][\p{L}.'-]+)\b/u.exec(q)
  return m2 !== null ? findPerson(ctx, m2[1]) : undefined
}

const looksLikeQuery = (q: string): boolean => /\b(status|priority|assignee|labels?|project|sprint|component|created|updated|due)\s*(=|!=|>=|<=|>|<|in\b|contains\b|is\b|was\b|changed\b)/i.test(q) || /\b(and|or|order by)\b/i.test(q) && /[=<>]/.test(q)

// ---- slash actions --------------------------------------------------------------------------
async function issueByKey (ctx: Ctx, key: string): Promise<Issue | undefined> {
  return await ctx.client.findOne(tracker.class.Issue, { identifier: key.toUpperCase() })
}
async function action (ctx: Ctx, q: string): Promise<Answer> {
  const [cmd, ...restParts] = q.trim().split(/\s+/)
  const rest = restParts.join(' ')
  const c = cmd.toLowerCase()
  if (c === '/help') return await INTENTS[0].run(ctx, q, [] as unknown as RegExpMatchArray)
  if (c === '/create') {
    const m = /^(.*?)(?:\s+in\s+([A-Za-z][A-Za-z0-9]{1,9}))?$/i.exec(rest)
    const title = (m?.[1] ?? rest).trim()
    if (title === '') return { title: 'Give the issue a title', text: 'Example: /create Fix the export button in ENG', source: 'local' }
    const key = m?.[2]?.toUpperCase()
    const project = key !== undefined ? ctx.projects.find((p) => p.identifier.toUpperCase() === key || p.name.toUpperCase() === key) : ctx.projects[0]
    if (project === undefined) return { title: 'Which project?', text: `No project "${key ?? ''}". Add "in <project key>", e.g. in ${ctx.projects.map((p) => p.identifier).slice(0, 3).join(' / ')}.`, source: 'local' }
    const imp = new Importer(await buildMapping(project))
    const created = await imp.create({ title, description: [], assignee: /\bfor me\b/i.test(rest) ? ctx.me : null }, 'the assistant')
    const issue = await ctx.client.findOne(tracker.class.Issue, { _id: created._id })
    return { title: `Created ${created.identifier}`, text: `"${title}" in ${project.name}.`, issues: issue !== undefined ? [issue] : [], source: 'local' }
  }
  const km = KEY.exec(rest)
  if (km === null && c !== '/summarize') return { title: 'Which issue?', text: `Start with the key, e.g. ${c} ENG-12 …`, source: 'local' }
  const key = km !== null ? `${km[1]}-${km[2]}` : ''
  const after = rest.replace(KEY, '').trim()
  if (c === '/summarize') {
    if (km !== null) return await INTENTS.find((i) => i.id === 'issue')!.run(ctx, key, km)
    return await INTENTS.find((i) => i.id === 'channel')!.run(ctx, rest, /#([\w-]+)/i.exec(rest) ?? ([] as unknown as RegExpMatchArray))
  }
  const issue = await issueByKey(ctx, key)
  if (issue === undefined) return { title: `No issue ${key}`, source: 'local' }
  if (c === '/assign') {
    const who = findPerson(ctx, after === '' ? 'me' : after)
    if (who === undefined) return { title: 'Who?', text: `No member matches "${after}".`, source: 'local' }
    await ctx.client.update(issue, { assignee: who._id })
    return { title: `${key} → ${formatName(who.name)}`, issues: [issue], source: 'local' }
  }
  if (c === '/status') {
    const type = await ctx.client.findOne(task.class.TaskType, { _id: issue.kind })
    const allowed = (type?.statuses ?? []) as Ref<IssueStatus>[]
    const st = ctx.statuses.filter((s) => allowed.includes(s._id)).find((s) => s.name.toLowerCase() === after.toLowerCase()) ?? ctx.statuses.filter((s) => allowed.includes(s._id)).find((s) => s.name.toLowerCase().startsWith(after.toLowerCase()))
    if (st === undefined) return { title: 'Which status?', text: `Options for ${key}: ${ctx.statuses.filter((s) => allowed.includes(s._id)).map((s) => s.name).join(', ')}`, source: 'local' }
    await ctx.client.update(issue, { status: st._id })
    return { title: `${key} → ${st.name}`, issues: [issue], source: 'local' }
  }
  if (c === '/priority') {
    const map: Record<string, IssuePriority> = { urgent: IssuePriority.Urgent, highest: IssuePriority.Urgent, high: IssuePriority.High, medium: IssuePriority.Medium, normal: IssuePriority.Medium, low: IssuePriority.Low, none: IssuePriority.NoPriority }
    const p = map[after.toLowerCase()]
    if (p === undefined) return { title: 'Which priority?', text: 'urgent, high, medium, low or none', source: 'local' }
    await ctx.client.update(issue, { priority: p })
    return { title: `${key} priority set to ${after.toLowerCase()}`, issues: [issue], source: 'local' }
  }
  if (c === '/due') {
    const t = parseWhen(after)
    if (t === undefined) return { title: 'When?', text: 'tomorrow, friday, next week, +3d, 2026-10-01', source: 'local' }
    await ctx.client.update(issue, { dueDate: t })
    return { title: `${key} due ${fmtDate(t)}`, issues: [issue], source: 'local' }
  }
  if (c === '/comment') {
    if (after === '') return { title: 'Say something', text: '/comment ENG-12 your text', source: 'local' }
    await ctx.client.addCollection(chunter.class.ChatMessage, issue.space, issue._id, tracker.class.Issue, 'comments', { message: `<p>${after.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch] ?? ch)}</p>`, attachments: 0 })
    return { title: `Commented on ${key}`, issues: [issue], source: 'local' }
  }
  if (c === '/remind') {
    const t = parseWhen(after)
    if (t === undefined) return { title: 'When?', text: '/remind ENG-12 tomorrow 9am optional note', source: 'local' }
    const note = after.replace(/(tomorrow|today|next week|\+?\d+\s*(d|days?|w|weeks?|h|hours?)|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '').trim()
    await ctx.client.createDoc(tracker.class.Reminder, issue.space, { issue: issue._id, user: getCurrentAccount().uuid as AccountUuid, at: t, note: note !== '' ? note : undefined, fired: false })
    return { title: `Reminder set for ${new Date(t).toLocaleString()}`, text: `You'll get it in your inbox for ${key}.`, issues: [issue], source: 'local' }
  }
  return { title: 'Unknown command', text: COMMANDS.map((x) => x.usage).join('\n'), source: 'local' }
}

// ---- optional model -------------------------------------------------------------------------
function aiConfig (): { url: string, model: string } | undefined {
  const c = typeof window !== 'undefined' ? (window as any).CEEPEE_AI : undefined
  return c?.url !== undefined && c.url !== '' ? { url: String(c.url).replace(/\/$/, ''), model: String(c.model ?? 'llama3') } : undefined
}
async function contextPack (ctx: Ctx): Promise<string> {
  const { open, name } = cats(ctx)
  const mine = await ctx.client.findAll(tracker.class.Issue, { assignee: ctx.me, status: { $in: open } }, { limit: 40 })
  return [`User: ${ctx.meName}. Today: ${new Date().toDateString()}.`, 'Open issues assigned to the user:', ...mine.map((i) => `- ${i.identifier} "${i.title}" status=${name.get(i.status)} priority=${i.priority} due=${i.dueDate != null ? new Date(i.dueDate).toDateString() : 'none'}`)].join('\n')
}
async function askModel (ctx: Ctx, q: string): Promise<Answer | undefined> {
  const cfg = aiConfig()
  if (cfg === undefined) return undefined
  const r = await fetch(`${cfg.url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model, stream: false, messages: [{ role: 'system', content: `You are CeePee's work assistant. Answer briefly and only from the context. If the context lacks the answer, say so.\n\n${await contextPack(ctx)}` }, { role: 'user', content: q }] }) })
  if (!r.ok) throw new Error(`model answered ${r.status}`)
  const j = await r.json()
  const text = String(j?.choices?.[0]?.message?.content ?? '').trim()
  return text === '' ? undefined : { title: 'From the model', text, copyText: text, note: `${cfg.model} at ${cfg.url}. Verify before acting.`, source: 'ai' }
}

// ---- entry ------------------------------------------------------------------------------------
export async function answer (ctx: Ctx, q: string): Promise<Answer> {
  const text = q.trim()
  if (text === '') return { title: 'Ask me something', source: 'local' }
  if (text.startsWith('/')) return await action(ctx, text)
  for (const it of INTENTS) {
    const m = text.match(it.re)
    if (m !== null) return await it.run(ctx, text, m)
  }
  if (looksLikeQuery(text)) {
    const r = await runQuery(text, 50)
    return { title: r.errors.length > 0 ? 'Query did not parse' : `${r.issues.length} results`, text: r.errors.length > 0 ? r.errors.join('\n') : undefined, issues: r.issues, source: 'local' }
  }
  try {
    const ai = await askModel(ctx, text)
    if (ai !== undefined) return ai
  } catch (e: any) {
    return { title: 'The model is not reachable', text: String(e?.message ?? e), source: 'local' }
  }
  const words = text.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()))
  const found = words.length > 0 ? await ctx.client.findAll(tracker.class.Issue, { title: { $like: `%${words[0]}%` } }, { limit: 20 }) : []
  return {
    title: found.length > 0 ? `${found.length} issues mention "${words[0]}"` : "I didn't follow that",
    text: found.length > 0 ? 'Searched titles for the first meaningful word. Ask a question from the list, scope with @person or #channel, or type a query.' : 'I answer from your workspace: overdue work, your week, what to do next, who is doing what, sprint health, a channel catch-up, any issue key, or a query. Type / for actions. To let me answer anything, connect a local model (AI_CHAT_URL) in the server settings.',
    issues: found,
    source: 'local'
  }
}

export async function loadCtx (client: TxOperations, me: Ref<Employee>): Promise<Ctx> {
  const [statuses, employees, projects] = await Promise.all([
    client.findAll(tracker.class.IssueStatus, {}),
    client.findAll(contact.mixin.Employee, { active: true }),
    client.findAll(tracker.class.Project, { archived: false })
  ])
  const meDoc = employees.find((e) => e._id === me)
  return { client, me, meName: meDoc !== undefined ? formatName(meDoc.name) : 'you', statuses, employees, projects }
}
export const firstName = (full: string): string => full.split(/\s+/)[0] ?? full
export { core }
