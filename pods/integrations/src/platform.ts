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

// One connection to one workspace, as a service account, with the handful
// of issue operations every inbound integration needs: find a project,
// create an issue, add a comment, attach a link or a file. Reconnects on
// failure. Also the heartbeat that lets scheduled automation rules fire
// on quiet workspaces.

import { connect, connectStorage, type PlatformClient, type StorageClient } from '@hcengineering/api-client'
import contact, { type Person } from '@hcengineering/contact'
import core, { generateId, SocialIdType, SortingOrder, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type Issue, type IssueStatus, type Project, type RequestType, type CustomerOrg } from '@hcengineering/tracker'

export interface PlatformConfig {
  url: string
  email: string
  password: string
  workspace: string
}

let client: PlatformClient | undefined
let storage: StorageClient | undefined
let connecting: Promise<PlatformClient> | undefined
let currentCfg: PlatformConfig | undefined

export async function getPlatform (cfg: PlatformConfig): Promise<PlatformClient> {
  currentCfg = cfg
  if (client !== undefined) return client
  if (connecting === undefined) {
    connecting = connect(cfg.url, { email: cfg.email, password: cfg.password, workspace: cfg.workspace })
      .then((c) => {
        client = c
        return c
      })
      .finally(() => {
        connecting = undefined
      })
  }
  return await connecting
}

export async function getStorage (): Promise<StorageClient> {
  if (storage !== undefined) return storage
  if (currentCfg === undefined) throw new Error('platform not configured')
  storage = await connectStorage(currentCfg.url, { email: currentCfg.email, password: currentCfg.password, workspace: currentCfg.workspace })
  return storage
}

export function resetPlatform (): void {
  const c = client
  client = undefined
  storage = undefined
  void c?.close().catch(() => {})
}

export const ISSUE_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g

export async function findProject (c: PlatformClient, keyOrName: string): Promise<Project | undefined> {
  const projects = await c.findAll(tracker.class.Project, { archived: false })
  const k = keyOrName.trim().toLowerCase()
  return projects.find((p) => p.identifier.toLowerCase() === k) ?? projects.find((p) => p.name.toLowerCase() === k)
}

export async function findIssue (c: PlatformClient, identifier: string): Promise<Issue | undefined> {
  return await c.findOne(tracker.class.Issue, { identifier: identifier.toUpperCase() })
}

export async function personByEmail (c: PlatformClient, email: string | undefined): Promise<Ref<Person> | null> {
  if (email === undefined || email.trim() === '') return null
  const sid = await c.findOne(contact.class.SocialIdentity, { type: SocialIdType.EMAIL, value: email.trim().toLowerCase() })
  return sid?.attachedTo ?? null
}

const PRIORITY: Record<string, IssuePriority> = { urgent: IssuePriority.Urgent, highest: IssuePriority.Urgent, critical: IssuePriority.Urgent, blocker: IssuePriority.Urgent, fatal: IssuePriority.Urgent, error: IssuePriority.High, high: IssuePriority.High, major: IssuePriority.High, warning: IssuePriority.Medium, medium: IssuePriority.Medium, normal: IssuePriority.Medium, info: IssuePriority.Low, low: IssuePriority.Low, minor: IssuePriority.Low, lowest: IssuePriority.Low, trivial: IssuePriority.Low, debug: IssuePriority.Low }
export function priorityOf (v: string | undefined, fallback = IssuePriority.NoPriority): IssuePriority {
  return v !== undefined ? PRIORITY[v.toLowerCase()] ?? fallback : fallback
}

export interface NewIssueInput {
  title: string
  description?: string
  priority?: IssuePriority
  assignee?: Ref<Person> | null
  externalLinks?: Array<{ url: string, label: string }>
  requestType?: boolean
  requestTypeId?: Ref<RequestType>
  portalEmail?: string
  customerOrg?: Ref<CustomerOrg>
  status?: Ref<IssueStatus>
  kind?: Issue['kind']
  storyPoints?: number
  dueDate?: number | null
  parent?: Issue
}

export async function projectTypes (c: PlatformClient, project: Project): Promise<{ issue: any, epic?: any }> {
  const ptype = await c.findOne(task.class.ProjectType, { _id: project.type })
  const types = ptype !== undefined ? await c.findAll(task.class.TaskType, { _id: { $in: ptype.tasks } }) : []
  return { issue: types.find((t) => t.name === 'Issue') ?? types[0], epic: types.find((t) => t.name === 'Epic') }
}

export async function createIssue (c: PlatformClient, project: Project, input: NewIssueInput): Promise<Issue> {
  const types = await projectTypes(c, project)
  const issueType = types.issue
  const status = input.status ?? project.defaultIssueStatus ?? (issueType.statuses[0] as Ref<IssueStatus>)
  const inc = await c.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true)
  const number = (inc as any).object.sequence as number
  const identifier = `${project.identifier}-${number}`
  const last = await c.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
  const _id = generateId<Issue>()
  const requestType = input.requestTypeId ?? (input.requestType === true ? (await c.findOne(tracker.class.RequestType, { space: project._id }))?._id ?? null : null)
  const description =
    input.description !== undefined && input.description.trim() !== ''
      ? await c.uploadMarkup(tracker.class.Issue, _id, 'description', input.description, 'markdown')
      : null
  const parent = input.parent
  await c.addCollection(
    tracker.class.Issue,
    project._id,
    parent?._id ?? tracker.ids.NoParent,
    tracker.class.Issue,
    'subIssues',
    {
      title: input.title.slice(0, 500),
      description,
      assignee: input.assignee ?? project.defaultAssignee ?? null,
      component: null,
      milestone: null,
      number,
      status,
      priority: input.priority ?? IssuePriority.NoPriority,
      rank: nextRank(last?.rank),
      comments: 0,
      subIssues: 0,
      startDate: null,
      dueDate: input.dueDate ?? null,
      parents: parent !== undefined ? [{ parentId: parent._id, parentTitle: parent.title, space: project._id, identifier: parent.identifier }, ...parent.parents] : [],
      reportedTime: 0,
      remainingTime: 0,
      estimation: 0,
      reports: 0,
      relations: [],
      blockedBy: [],
      childInfo: [],
      kind: input.kind ?? issueType._id,
      identifier,
      externalLinks: input.externalLinks,
      requestType,
      portalEmail: input.portalEmail,
      customerOrg: input.customerOrg ?? null,
      storyPoints: input.storyPoints
    } as any,
    _id
  )
  const issue = await c.findOne(tracker.class.Issue, { _id })
  if (issue === undefined) throw new Error('issue not created')
  return issue
}

// Rank strings sort lexically; appending a suffix keeps a new item after the last one.
function nextRank (last: string | undefined): string {
  return (last ?? '0|hzzzzz') + ':' + Date.now().toString(36)
}

export async function addComment (c: PlatformClient, issue: Issue, text: string): Promise<void> {
  const message = JSON.stringify({ type: 'doc', content: text.split(/\n+/).filter((l) => l.trim() !== '').map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })) })
  await c.addCollection('chunter:class:ChatMessage' as any, issue.space, issue._id, tracker.class.Issue, 'comments', { message, attachments: 0 } as any)
}

export async function addLink (c: PlatformClient, issue: Issue, url: string, label: string): Promise<void> {
  const links = issue.externalLinks ?? []
  if (links.some((l) => l.url === url)) return
  await c.updateDoc(tracker.class.Issue, issue.space, issue._id, { externalLinks: [...links, { url, label }] })
}

/** Store a file in the workspace and attach it to the issue. */
export async function addAttachment (c: PlatformClient, issue: Issue, name: string, data: Buffer, contentType: string): Promise<void> {
  const s = await getStorage()
  const objectName = generateId() as string
  const blob = await s.put(objectName, data, contentType, data.length)
  await c.addCollection('attachment:class:Attachment' as any, issue.space, issue._id, tracker.class.Issue, 'attachments', {
    name,
    file: blob._id,
    size: data.length,
    type: contentType,
    lastModified: Date.now()
  } as any)
}

/** Issue keys mentioned anywhere in a text, de-duplicated. */
export function keysIn (...texts: Array<string | undefined>): string[] {
  const out = new Set<string>()
  for (const t of texts) for (const m of (t ?? '').matchAll(ISSUE_KEY)) out.add(m[1].toUpperCase())
  return Array.from(out)
}

/** Touch the heartbeat document so scheduled automation rules get a chance to run. */
export async function heartbeat (c: PlatformClient): Promise<void> {
  const existing = await c.findOne(tracker.class.AutomationHeartbeat, {})
  if (existing === undefined) await c.createDoc(tracker.class.AutomationHeartbeat, core.space.Workspace, { at: Date.now() })
  else await c.updateDoc(tracker.class.AutomationHeartbeat, existing.space, existing._id, { at: Date.now() })
}
