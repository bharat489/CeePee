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

// Inbound integrations: other systems post here, issues come out.
//
//   POST /inbound/generic   {project, title, description?, priority?, assignee?}
//   POST /inbound/email     inbound-parse JSON/form from Mailgun, Postmark, SendGrid, Zapier ...
//   POST /inbound/sentry    Sentry issue-alert webhook
//   POST /inbound/github    push / pull_request events
//   POST /inbound/gitlab    push / merge_request events
//   POST /inbound/bitbucket push / pullrequest events
//   POST /inbound/deploy    {environment, version, status, url, issues|text}
//
// Email is the one that matters most: any mail provider's inbound-parse
// webhook turns a mailbox into a ticket queue. A subject that carries an
// issue key becomes a comment on that issue; anything else becomes a new
// request in the configured project.

import { type PlatformClient } from '@hcengineering/api-client'
import tracker, { IssuePriority, type Issue, type Project } from '@hcengineering/tracker'

import { addComment, addLink, createIssue, findIssue, findProject, keysIn, personByEmail, priorityOf } from './platform'

export interface InboundConfig {
  defaultProject: string
}

export interface Result {
  status: number
  body: Record<string, unknown>
}

const ok = (body: Record<string, unknown>): Result => ({ status: 200, body })
const bad = (message: string): Result => ({ status: 400, body: { error: message } })

function str (v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
}
function pick (o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (v !== undefined && v !== null && str(v).trim() !== '') return str(v).trim()
  }
  return ''
}

async function projectFor (c: PlatformClient, cfg: InboundConfig, o: Record<string, unknown>, query: URLSearchParams): Promise<Project | undefined> {
  const key = pick(o, 'project') !== '' ? pick(o, 'project') : query.get('project') ?? cfg.defaultProject
  return await findProject(c, key)
}

async function commentOnKeys (c: PlatformClient, keys: string[], text: string, link?: { url: string, label: string }): Promise<string[]> {
  const touched: string[] = []
  for (const k of keys) {
    const issue = await findIssue(c, k)
    if (issue === undefined) continue
    await addComment(c, issue, text)
    if (link !== undefined) await addLink(c, issue, link.url, link.label)
    touched.push(issue.identifier)
  }
  return touched
}

export async function handleGeneric (c: PlatformClient, cfg: InboundConfig, o: Record<string, unknown>, query: URLSearchParams): Promise<Result> {
  const title = pick(o, 'title', 'summary', 'subject')
  if (title === '') return bad('title is required')
  const project = await projectFor(c, cfg, o, query)
  if (project === undefined) return bad('unknown project')
  const issue = await createIssue(c, project, {
    title,
    description: pick(o, 'description', 'body', 'text'),
    priority: priorityOf(pick(o, 'priority')),
    assignee: await personByEmail(c, pick(o, 'assignee')),
    externalLinks: pick(o, 'url') !== '' ? [{ url: pick(o, 'url'), label: pick(o, 'source') !== '' ? pick(o, 'source') : 'Source' }] : undefined,
    requestType: pick(o, 'request') === 'true'
  })
  return ok({ created: issue.identifier, id: issue._id })
}

export async function handleEmail (c: PlatformClient, cfg: InboundConfig, o: Record<string, unknown>, query: URLSearchParams): Promise<Result> {
  // Mailgun: sender, subject, stripped-text / body-plain. Postmark: From, Subject, TextBody / StrippedTextReply.
  // SendGrid (JSON mode): from, subject, text. Zapier/Make: whatever you map to from/subject/text.
  const from = pick(o, 'from', 'From', 'sender', 'FromFull')
  const subject = pick(o, 'subject', 'Subject')
  const text = pick(o, 'stripped-text', 'StrippedTextReply', 'TextBody', 'body-plain', 'text', 'plain', 'body')
  if (subject === '' && text === '') return bad('subject or text is required')
  const email = /<([^>]+)>/.exec(from)?.[1] ?? from
  const keys = keysIn(subject)
  if (keys.length > 0) {
    const touched = await commentOnKeys(c, keys, `Email from ${from}${subject !== '' ? ` — ${subject}` : ''}:\n${text}`)
    if (touched.length > 0) return ok({ commented: touched })
  }
  const project = await projectFor(c, cfg, o, query)
  if (project === undefined) return bad('unknown project')
  const issue = await createIssue(c, project, {
    title: subject !== '' ? subject : text.split('\n')[0].slice(0, 120),
    description: `From: ${from}\n\n${text}`,
    priority: IssuePriority.Medium,
    assignee: null,
    requestType: true
  })
  // the sender gets to follow it if they have an account
  const person = await personByEmail(c, email)
  if (person !== null) await addComment(c, issue, `Raised by email from ${from}.`)
  return ok({ created: issue.identifier, id: issue._id })
}

export async function handleSentry (c: PlatformClient, cfg: InboundConfig, o: Record<string, unknown>, query: URLSearchParams): Promise<Result> {
  const data = (o.data as Record<string, unknown> | undefined) ?? {}
  const si = (data.issue as Record<string, unknown> | undefined) ?? (data.event as Record<string, unknown> | undefined) ?? {}
  const title = pick(si, 'title', 'message') !== '' ? pick(si, 'title', 'message') : pick(o, 'message', 'title')
  if (title === '') return bad('no Sentry title in payload')
  const url = pick(si, 'web_url', 'permalink', 'url') !== '' ? pick(si, 'web_url', 'permalink', 'url') : pick(o, 'url')
  const sentryId = pick(si, 'id', 'issue_id') !== '' ? pick(si, 'id', 'issue_id') : pick(o, 'id')
  const level = pick(si, 'level') !== '' ? pick(si, 'level') : pick(o, 'level')
  const project = await projectFor(c, cfg, o, query)
  if (project === undefined) return bad('unknown project')
  const marker = sentryId !== '' ? `sentry:${sentryId}` : ''
  // Re-fired alerts for a known Sentry issue become comments, not duplicates.
  if (marker !== '') {
    const open = await c.findAll(tracker.class.Issue, { space: project._id, title: { $like: `%[Sentry] ${title.slice(0, 40)}%` } }, { limit: 5 })
    const hit = open.find((i) => (i.externalLinks ?? []).some((l) => l.label === marker))
    if (hit !== undefined) {
      await addComment(c, hit, `Sentry fired again${level !== '' ? ` (${level})` : ''}: ${pick(si, 'culprit')}`)
      return ok({ commented: [hit.identifier] })
    }
  }
  const issue = await createIssue(c, project, {
    title: `[Sentry] ${title}`.slice(0, 200),
    description: `${pick(si, 'culprit')}\n\n${url !== '' ? url : ''}\n\n${pick(o, 'action') !== '' ? `Action: ${pick(o, 'action')}` : ''}`,
    priority: priorityOf(level, IssuePriority.High),
    assignee: null,
    externalLinks: [...(url !== '' ? [{ url, label: 'Sentry' }] : []), ...(marker !== '' ? [{ url: url !== '' ? url : 'sentry://' + sentryId, label: marker }] : [])]
  })
  return ok({ created: issue.identifier })
}

interface Commit {
  id: string
  message: string
  url: string
  author: string
}
function commitsOf (o: Record<string, unknown>): Commit[] {
  const list = (o.commits as Array<Record<string, unknown>> | undefined) ?? (((o.push as Record<string, unknown> | undefined)?.changes as Array<Record<string, unknown>> | undefined) ?? []).flatMap((ch) => ((ch.commits as Array<Record<string, unknown>> | undefined) ?? []))
  return list.map((cm) => ({
    id: str(cm.id ?? cm.hash).slice(0, 8),
    message: str(cm.message ?? (cm.summary as Record<string, unknown> | undefined)?.raw),
    url: str(cm.url ?? (cm.links as Record<string, Record<string, unknown>> | undefined)?.html?.href),
    author: str((cm.author as Record<string, unknown> | undefined)?.name ?? (cm.author as Record<string, unknown> | undefined)?.raw ?? '')
  }))
}

export async function handleGit (kind: 'github' | 'gitlab' | 'bitbucket', c: PlatformClient, o: Record<string, unknown>, headers: Record<string, string | string[] | undefined>): Promise<Result> {
  const touched = new Set<string>()
  // pull / merge requests
  const pr = (o.pull_request ?? o.object_attributes ?? o.pullrequest) as Record<string, unknown> | undefined
  if (pr !== undefined && (o.pull_request !== undefined || (o.object_kind === 'merge_request') || o.pullrequest !== undefined)) {
    const title = str(pr.title)
    const url = str(pr.html_url ?? pr.url ?? (pr.links as Record<string, Record<string, unknown>> | undefined)?.html?.href)
    const branch = str((pr.head as Record<string, unknown> | undefined)?.ref ?? pr.source_branch ?? ((pr.source as Record<string, Record<string, unknown>> | undefined)?.branch?.name))
    const action = str(o.action ?? pr.action ?? pr.state)
    const number = str(pr.number ?? pr.iid ?? pr.id)
    const merged = pr.merged === true || action === 'merge' || action === 'merged' || str(pr.state) === 'merged' || str(pr.state) === 'MERGED'
    const keys = keysIn(title, branch, str(pr.body ?? pr.description))
    const text = `${kind === 'gitlab' ? 'Merge request' : 'Pull request'} #${number} ${merged ? 'merged' : action !== '' ? action : 'updated'}: ${title}${url !== '' ? `\n${url}` : ''}`
    for (const k of await commentOnKeys(c, keys, text, url !== '' ? { url, label: `${kind === 'gitlab' ? 'MR' : 'PR'} #${number}` } : undefined)) touched.add(k)
  }
  // pushes
  const commits = commitsOf(o)
  if (commits.length > 0) {
    const byKey = new Map<string, Commit[]>()
    for (const cm of commits) for (const k of keysIn(cm.message)) byKey.set(k, [...(byKey.get(k) ?? []), cm])
    for (const [k, list] of byKey) {
      const text = list.map((cm) => `Commit ${cm.id}${cm.author !== '' ? ` by ${cm.author}` : ''}: ${cm.message.split('\n')[0]}${cm.url !== '' ? `\n${cm.url}` : ''}`).join('\n\n')
      for (const t of await commentOnKeys(c, [k], text)) touched.add(t)
    }
  }
  void headers
  return ok({ commented: Array.from(touched) })
}

export async function handleDeploy (c: PlatformClient, o: Record<string, unknown>): Promise<Result> {
  const env = pick(o, 'environment', 'env')
  const version = pick(o, 'version', 'tag', 'sha')
  const status = pick(o, 'status') !== '' ? pick(o, 'status') : 'deployed'
  const url = pick(o, 'url')
  const keys = Array.isArray(o.issues) ? (o.issues as unknown[]).map(str) : keysIn(pick(o, 'issues', 'text', 'description'))
  if (keys.length === 0) return bad('no issue keys in payload')
  const text = `Deployment ${status}${env !== '' ? ` to ${env}` : ''}${version !== '' ? ` (${version})` : ''}${url !== '' ? `\n${url}` : ''}`
  const touched = await commentOnKeys(c, keys, text, url !== '' ? { url, label: `${env !== '' ? env : 'deploy'} ${version}`.trim() } : undefined)
  return ok({ commented: touched })
}
