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

// The chat command grammar shared by the Slack and Teams bots:
//   KEY-12                      show an issue
//   create KEY the title        create an issue in project KEY
//   assign KEY-12 me|email      assign
//   status KEY-12 In progress   move
//   comment KEY-12 text         add a comment
//   search <query>              query language, first 10
//   help

import { type PlatformClient } from '@hcengineering/api-client'
import contact, { type Person } from '@hcengineering/contact'
import { type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { buildQueryContext, runQueryWith, type Issue, type IssueStatus } from '@hcengineering/tracker'

import { addComment, createIssue, findIssue, findProject, personByEmail } from './platform'

export interface ChatUser {
  email?: string
  name?: string
}

export interface ChatContext {
  frontUrl: string
  workspace: string
}

export interface IssueCard {
  issue: Issue
  status: string
  assignee: string
  project: string
  url: string
  /** statuses the issue may move to, for buttons */
  moves: Array<{ _id: Ref<IssueStatus>, name: string }>
}

export interface ChatReply {
  text: string
  card?: IssueCard
  cards?: IssueCard[]
  ephemeral?: boolean
}

const KEY = /^([A-Z][A-Z0-9]{1,9}-\d+)$/i
const PRIO = ['none', 'urgent', 'high', 'medium', 'low']

export function issueUrl (ctx: ChatContext, identifier: string): string {
  return `${ctx.frontUrl.replace(/\/$/, '')}/workbench/${ctx.workspace}/tracker/${identifier}`
}

export async function cardOf (c: PlatformClient, ctx: ChatContext, issue: Issue): Promise<IssueCard> {
  const [st, project] = await Promise.all([
    c.findOne(tracker.class.IssueStatus, { _id: issue.status }),
    c.findOne(tracker.class.Project, { _id: issue.space })
  ])
  let assignee = 'unassigned'
  if (issue.assignee != null) {
    const p = await c.findOne(contact.class.Person, { _id: issue.assignee })
    if (p !== undefined) assignee = String(p.name).split(',').reverse().join(' ').trim()
  }
  const type = await c.findOne(task.class.TaskType, { _id: issue.kind })
  const ids = ((type?.statuses ?? []) as Ref<IssueStatus>[]).filter((s) => s !== issue.status)
  const statuses = ids.length > 0 ? Array.from(await c.findAll(tracker.class.IssueStatus, { _id: { $in: ids } })) : []
  const allowed = (type as any)?.transitions?.[issue.status] as Ref<IssueStatus>[] | undefined
  const moves = ids.map((id) => statuses.find((s) => s._id === id)).filter((s): s is IssueStatus => s !== undefined && (allowed === undefined || allowed.includes(s._id))).slice(0, 4).map((s) => ({ _id: s._id, name: s.name }))
  return { issue, status: st?.name ?? '', assignee, project: project?.identifier ?? '', url: issueUrl(ctx, issue.identifier), moves }
}

export function lineOf (card: IssueCard, bold: (s: string) => string, link: (url: string, label: string) => string): string {
  const i = card.issue
  return `${link(card.url, bold(i.identifier))} ${i.title} — ${card.status} · ${card.assignee} · ${PRIO[i.priority] ?? ''}`
}

export async function runChatCommand (c: PlatformClient, ctx: ChatContext, raw: string, user: ChatUser): Promise<ChatReply> {
  const text = raw.trim()
  const [verb, ...rest] = text.split(/\s+/)
  const v = (verb ?? '').toLowerCase()
  if (text === '' || v === 'help') {
    return { ephemeral: true, text: ['CeePee commands:', '• `KEY-12` — show the issue', '• `create KEY the title` — create an issue in project KEY', '• `assign KEY-12 me` or `assign KEY-12 name@company.com`', '• `status KEY-12 In progress`', '• `comment KEY-12 text`', '• `search assignee = me AND status != done`'].join('\n') }
  }
  if (KEY.test(text)) {
    const issue = await findIssue(c, text.toUpperCase())
    if (issue === undefined) return { ephemeral: true, text: `No issue ${text.toUpperCase()}.` }
    return { text: '', card: await cardOf(c, ctx, issue) }
  }
  if (v === 'create') {
    const key = (rest[0] ?? '').toUpperCase()
    const title = rest.slice(1).join(' ').trim()
    const project = key !== '' ? await findProject(c, key) : undefined
    if (project === undefined) return { ephemeral: true, text: `Project ${key || '?'} not found. Use: create KEY the title` }
    if (title === '') return { ephemeral: true, text: 'Give the issue a title: create KEY the title' }
    const me = await personByEmail(c, user.email)
    const issue = await createIssue(c, project, { title, description: `Created from chat${user.name !== undefined ? ` by ${user.name}` : ''}.`, assignee: null })
    void me
    return { text: `Created ${issue.identifier}`, card: await cardOf(c, ctx, issue) }
  }
  if (v === 'assign' || v === 'status' || v === 'comment') {
    const key = (rest[0] ?? '').toUpperCase()
    const issue = KEY.test(key) ? await findIssue(c, key) : undefined
    if (issue === undefined) return { ephemeral: true, text: `No issue ${key || '?'}.` }
    const arg = rest.slice(1).join(' ').trim()
    if (v === 'assign') {
      const who = arg === '' || arg.toLowerCase() === 'me' ? await personByEmail(c, user.email) : arg.includes('@') ? await personByEmail(c, arg) : await personByName(c, arg)
      if (who == null) return { ephemeral: true, text: arg === '' || arg.toLowerCase() === 'me' ? 'I cannot tell who you are in CeePee (your chat email does not match a member).' : `Nobody matches "${arg}".` }
      await c.updateDoc(tracker.class.Issue, issue.space, issue._id, { assignee: who })
      return { text: `Assigned ${issue.identifier}.`, card: await cardOf(c, ctx, { ...issue, assignee: who }) }
    }
    if (v === 'status') {
      const type = await c.findOne(task.class.TaskType, { _id: issue.kind })
      const statuses = Array.from(await c.findAll(tracker.class.IssueStatus, { _id: { $in: (type?.statuses ?? []) as Ref<IssueStatus>[] } }))
      const target = statuses.find((s) => s.name.toLowerCase() === arg.toLowerCase()) ?? statuses.find((s) => s.name.toLowerCase().startsWith(arg.toLowerCase()))
      if (target === undefined) return { ephemeral: true, text: `Unknown status "${arg}". Options: ${statuses.map((s) => s.name).join(', ')}` }
      try {
        await c.updateDoc(tracker.class.Issue, issue.space, issue._id, { status: target._id })
      } catch (e: any) {
        return { ephemeral: true, text: `The workflow refused that move: ${String(e?.message ?? e)}` }
      }
      return { text: `${issue.identifier} → ${target.name}`, card: await cardOf(c, ctx, { ...issue, status: target._id }) }
    }
    if (arg === '') return { ephemeral: true, text: 'Nothing to say? comment KEY-12 your text' }
    await addComment(c, issue, `${user.name ?? user.email ?? 'Chat'} (via chat): ${arg}`)
    return { text: `Comment added to ${issue.identifier}.`, card: await cardOf(c, ctx, issue) }
  }
  if (v === 'search' || v === 'find') {
    const q = rest.join(' ').trim()
    const me = await personByEmail(c, user.email)
    const ctxq = await buildQueryContext(c as any, { me: (me ?? undefined) as Ref<Person> | undefined, socialIds: [] })
    const r = await runQueryWith(c as any, ctxq, q, 10)
    if (r.errors.length > 0) return { ephemeral: true, text: `Query error: ${r.errors.join('; ')}` }
    if (r.issues.length === 0) return { ephemeral: true, text: `Nothing matches "${q}".` }
    const cards: IssueCard[] = []
    for (const i of r.issues) cards.push(await cardOf(c, ctx, i))
    return { text: `${r.issues.length} result${r.issues.length === 1 ? '' : 's'} for "${q}"`, cards }
  }
  return { ephemeral: true, text: `I did not understand "${text}". Try "help".` }
}

async function personByName (c: PlatformClient, name: string): Promise<Ref<Person> | null> {
  const k = name.trim().toLowerCase()
  const people = await c.findAll(contact.mixin.Employee, { active: true }, { limit: 500 })
  const hit = Array.from(people).find((p) => String(p.name).toLowerCase().split(',').reverse().join(' ').trim().includes(k))
  return hit?._id ?? null
}
