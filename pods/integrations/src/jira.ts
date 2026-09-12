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

// Import from Jira Cloud through its REST API: everything the CSV cannot
// carry -- attachments (downloaded and stored), the change history (as a
// dated log on each issue), comments, work logs, labels, sprints, versions
// and parent links. Runs in the background; the settings page polls
// progress. Credentials are used for the run and never stored.

import { type PlatformClient } from '@hcengineering/api-client'
import { SortingOrder, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { MilestoneStatus, type Issue, type Milestone, type Project, type Sprint } from '@hcengineering/tracker'

import { addAttachment, addComment, createIssue, findProject, personByEmail, priorityOf, projectTypes } from './platform'

export interface JiraImportRequest {
  baseUrl: string
  email: string
  token: string
  jql: string
  project: string
  attachments?: boolean
  history?: boolean
  comments?: boolean
  worklogs?: boolean
}

export interface JiraImportStatus {
  id: string
  state: 'running' | 'done' | 'failed'
  total: number
  done: number
  created: number
  attachments: number
  errors: string[]
  startedAt: number
  finishedAt?: number
}

const jobs = new Map<string, JiraImportStatus>()
export function jobStatus (id: string): JiraImportStatus | undefined {
  return jobs.get(id)
}

function auth (req: JiraImportRequest): Record<string, string> {
  return { authorization: 'Basic ' + Buffer.from(`${req.email}:${req.token}`).toString('base64'), accept: 'application/json' }
}

async function jget (req: JiraImportRequest, path: string): Promise<any> {
  const g = globalThis as any
  const res = await g.fetch(`${req.baseUrl.replace(/\/$/, '')}${path}`, { headers: auth(req) })
  if (!res.ok) throw new Error(`Jira ${res.status} on ${path}`)
  return await res.json()
}

// Atlassian Document Format → plain text, good enough for descriptions and comments.
function adfText (node: any): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (node.type === 'text') return String(node.text ?? '')
  if (node.type === 'hardBreak') return '\n'
  const inner = Array.isArray(node.content) ? node.content.map(adfText).join('') : ''
  if (['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.type)) return inner + '\n\n'
  return inner
}

function textOf (v: any): string {
  return typeof v === 'string' ? v : v != null && typeof v === 'object' ? adfText(v).trim() : ''
}

export function startJiraImport (c: PlatformClient, req: JiraImportRequest, log: (m: string) => void): JiraImportStatus {
  const id = Date.now().toString(36)
  const status: JiraImportStatus = { id, state: 'running', total: 0, done: 0, created: 0, attachments: 0, errors: [], startedAt: Date.now() }
  jobs.set(id, status)
  void run(c, req, status, log).catch((e: any) => {
    status.state = 'failed'
    status.errors.push(String(e?.message ?? e))
    status.finishedAt = Date.now()
  })
  return status
}

async function run (c: PlatformClient, req: JiraImportRequest, st: JiraImportStatus, log: (m: string) => void): Promise<void> {
  const project = await findProject(c, req.project)
  if (project === undefined) throw new Error(`unknown project ${req.project}`)
  const types = await projectTypes(c, project)
  const statuses = await c.findAll(tracker.class.IssueStatus, { _id: { $in: types.issue.statuses as Ref<any>[] } })
  const byName = new Map(statuses.map((s) => [s.name.toLowerCase(), s._id]))
  const firstOf = (cat: Ref<any>): Ref<any> | undefined => (types.issue.statuses as Ref<any>[]).find((id) => statuses.find((s) => s._id === id)?.category === cat)
  const statusFor = (name: string, category?: string): Ref<any> => {
    const hit = byName.get(name.toLowerCase())
    if (hit !== undefined) return hit
    const cat = (category ?? '').toLowerCase()
    return (cat === 'done' ? firstOf(task.statusCategory.Won) : cat === 'indeterminate' ? firstOf(task.statusCategory.Active) : firstOf(task.statusCategory.ToDo) ?? firstOf(task.statusCategory.UnStarted)) ?? project.defaultIssueStatus ?? (types.issue.statuses[0] as Ref<any>)
  }

  // page through the search
  const all: any[] = []
  let startAt = 0
  while (true) {
    const page = await jget(req, `/rest/api/3/search?jql=${encodeURIComponent(req.jql)}&startAt=${startAt}&maxResults=50&expand=${req.history === true ? 'changelog' : ''}&fields=summary,description,issuetype,status,priority,assignee,labels,created,updated,duedate,parent,comment,worklog,attachment,fixVersions,versions,customfield_10016,customfield_10020`)
    all.push(...(page.issues ?? []))
    st.total = page.total ?? all.length
    startAt += 50
    if (all.length >= (page.total ?? 0) || (page.issues ?? []).length === 0) break
  }
  log(`jira import ${st.id}: ${all.length} issues`)

  const order = (i: any): number => (String(i.fields?.issuetype?.name ?? '').toLowerCase() === 'epic' ? 0 : i.fields?.issuetype?.subtask === true ? 2 : 1)
  all.sort((a, b) => order(a) - order(b))
  const created = new Map<string, Issue>()
  const sprintCache = new Map<string, Ref<Sprint>>()
  const versionCache = new Map<string, Ref<Milestone>>()

  const sprintFor = async (name: string): Promise<Ref<Sprint>> => {
    const hit = sprintCache.get(name)
    if (hit !== undefined) return hit
    const ex = await c.findOne(tracker.class.Sprint, { space: project._id, name })
    const id = ex?._id ?? (await c.createDoc(tracker.class.Sprint, project._id, { name, startDate: Date.now(), endDate: Date.now() + 14 * 86_400_000, state: 'planned', carriedOverTo: null }))
    sprintCache.set(name, id)
    return id
  }
  const versionFor = async (name: string, released: boolean, date?: string): Promise<Ref<Milestone>> => {
    const hit = versionCache.get(name)
    if (hit !== undefined) return hit
    const ex = await c.findOne(tracker.class.Milestone, { space: project._id, label: name })
    const id = ex?._id ?? (await c.createDoc(tracker.class.Milestone, project._id, { label: name, description: '', status: released ? MilestoneStatus.Completed : MilestoneStatus.Planned, comments: 0, attachments: 0, startDate: null, targetDate: date !== undefined && !Number.isNaN(Date.parse(date)) ? Date.parse(date) : Date.now() + 30 * 86_400_000 } as any))
    versionCache.set(name, id)
    return id
  }

  for (const j of all) {
    const f = j.fields ?? {}
    try {
      const isEpic = String(f.issuetype?.name ?? '').toLowerCase() === 'epic'
      const parentKey = f.parent?.key as string | undefined
      const parent = parentKey !== undefined ? created.get(parentKey) : undefined
      const sprintName: string | undefined = Array.isArray(f.customfield_10020) ? f.customfield_10020[f.customfield_10020.length - 1]?.name : undefined
      const points = typeof f.customfield_10016 === 'number' ? f.customfield_10016 : undefined
      const desc = [`Imported from Jira ${j.key}`, textOf(f.description)].filter((x) => x !== '').join('\n\n')
      const issue = await createIssue(c, project, {
        title: String(f.summary ?? j.key),
        description: desc,
        priority: priorityOf(f.priority?.name),
        assignee: await personByEmail(c, f.assignee?.emailAddress),
        status: statusFor(String(f.status?.name ?? ''), f.status?.statusCategory?.key),
        kind: isEpic && types.epic !== undefined ? types.epic._id : types.issue._id,
        storyPoints: points,
        dueDate: f.duedate != null && !Number.isNaN(Date.parse(f.duedate)) ? Date.parse(f.duedate) : null,
        parent,
        externalLinks: [{ url: `${req.baseUrl.replace(/\/$/, '')}/browse/${j.key}`, label: `Jira ${j.key}` }]
      })
      created.set(j.key, issue)
      st.created++

      const ops: Record<string, unknown> = {}
      if (sprintName !== undefined && !isEpic) ops.sprint = await sprintFor(sprintName)
      if (Array.isArray(f.fixVersions) && f.fixVersions.length > 0) ops.milestone = await versionFor(String(f.fixVersions[0].name), f.fixVersions[0].released === true, f.fixVersions[0].releaseDate)
      if (Array.isArray(f.versions) && f.versions.length > 0) ops.affectsMilestone = await versionFor(String(f.versions[0].name), f.versions[0].released === true, f.versions[0].releaseDate)
      if (Object.keys(ops).length > 0) await c.updateDoc(tracker.class.Issue, issue.space, issue._id, ops as any)

      for (const label of (f.labels ?? []) as string[]) {
        const el = (await c.findOne('tags:class:TagElement' as any, { targetClass: tracker.class.Issue, title: label } as any)) as any
        const tag = el?._id ?? (await c.createDoc('tags:class:TagElement' as any, 'core:space:Workspace' as any, { title: label, description: '', targetClass: tracker.class.Issue, color: 0, category: 'tags:category:NoCategory' } as any))
        await c.addCollection('tags:class:TagReference' as any, project._id, issue._id, tracker.class.Issue, 'labels', { tag, title: label, color: el?.color ?? 0 } as any)
      }

      if (req.comments !== false) {
        for (const cm of (f.comment?.comments ?? []) as any[]) {
          await addComment(c, issue, `${cm.author?.displayName ?? 'Someone'} · ${new Date(cm.created).toLocaleString()} (from Jira):\n${textOf(cm.body)}`)
        }
      }
      if (req.worklogs !== false) {
        for (const w of (f.worklog?.worklogs ?? []) as any[]) {
          const who = await personByEmail(c, w.author?.emailAddress)
          await c.addCollection(tracker.class.TimeSpendReport, project._id, issue._id, tracker.class.Issue, 'reports', { employee: who as any, date: Date.parse(w.started) || null, value: Math.round(((w.timeSpentSeconds ?? 0) / 3600) * 100) / 100, description: textOf(w.comment) })
        }
      }
      if (req.attachments !== false) {
        for (const a of (f.attachment ?? []) as any[]) {
          try {
            const g = globalThis as any
            const res = await g.fetch(a.content, { headers: auth(req) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.length > 50 * 1024 * 1024) throw new Error('over 50 MB')
            await addAttachment(c, issue, String(a.filename), buf, String(a.mimeType ?? 'application/octet-stream'))
            st.attachments++
          } catch (e: any) {
            st.errors.push(`${j.key} attachment ${a.filename}: ${String(e?.message ?? e)}`)
          }
        }
      }
      if (req.history !== false && Array.isArray(j.changelog?.histories) && j.changelog.histories.length > 0) {
        const lines = (j.changelog.histories as any[])
          .sort((x, y) => Date.parse(x.created) - Date.parse(y.created))
          .slice(-100)
          .map((h) => `${new Date(h.created).toLocaleString()} · ${h.author?.displayName ?? '?'}: ${(h.items ?? []).map((it: any) => `${it.field} ${it.fromString ?? '∅'} → ${it.toString ?? '∅'}`).join('; ')}`)
        await addComment(c, issue, `Jira history (${lines.length} changes):\n${lines.join('\n')}`)
      }
    } catch (e: any) {
      st.errors.push(`${j.key}: ${String(e?.message ?? e)}`)
    }
    st.done++
  }
  // keep ranks sane after the bulk insert
  void c.findAll(tracker.class.Issue, { space: project._id }, { limit: 1, sort: { rank: SortingOrder.Descending } })
  st.state = 'done'
  st.finishedAt = Date.now()
  log(`jira import ${st.id}: done, ${st.created} created, ${st.attachments} attachments, ${st.errors.length} errors`)
}
