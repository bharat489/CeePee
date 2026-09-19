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

// Sample data for a workspace: two realistic projects with epics, issues in
// every state, sprints, milestones, components, labels, comments, ideas,
// decisions, a docs space and a chat backlog, spread over the last month so
// every page, chart and gadget has something to show. Safe to re-run: a
// project whose key already exists is skipped.

import chunter, { type Channel } from '@hcengineering/chunter'
import contact, { type Employee, type SocialIdentity } from '@hcengineering/contact'
import core, { generateId, type Data, type PersonId, type Ref, type TxOperations } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task, { type TaskType } from '@hcengineering/task'
import tags from '@hcengineering/tags'
import tracker, { IssuePriority, MilestoneStatus, TimeReportDayType, type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'

const DAY = 86_400_000
const markup = (text: string): string => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

interface Seed {
  key: string
  name: string
  description: string
  components: string[]
  labels: string[]
  epics: Array<{ title: string, children: string[] }>
  loose: string[]
  ideas: Array<{ title: string, description: string, impact: number, effort: number, confidence: number, reach: number }>
  decisions: Array<{ title: string, rejected: string[] }>
  docs: string[]
}

const SEEDS: Seed[] = [
  {
    key: 'MOB',
    name: 'Mobile App',
    description: 'The customer mobile app for iOS and Android: onboarding, loans, payments and support.',
    components: ['iOS', 'Android', 'Backend API'],
    labels: ['bug', 'feature', 'design', 'tech-debt', 'customer-request'],
    epics: [
      { title: 'Onboarding revamp', children: ['Redesign the welcome screens', 'Add phone-number sign-in with OTP', 'Skip KYC for returning customers', 'Track onboarding funnel events', 'Fix keyboard overlapping the PIN field'] },
      { title: 'Payments v2', children: ['UPI autopay mandate flow', 'Retry failed EMI payments automatically', 'Show payment receipts in the app', 'Handle bank downtime gracefully'] },
      { title: 'Performance and stability', children: ['Cold start under 1.5 s on mid-range Android', 'Crash on rotating the loan calculator', 'Reduce APK size by trimming fonts', 'Cache the dashboard for offline viewing'] }
    ],
    loose: ['Update privacy policy link in settings', 'Dark mode colours for status chips', 'Push notification for EMI due in 3 days', 'Translate app to Hindi', 'App Store screenshots for 5.2', 'Crash when opening an empty statement PDF'],
    ideas: [
      { title: 'Refer a friend with cashback', description: 'Give both sides ₹100 credit after the first repayment.', impact: 4, effort: 2, confidence: 4, reach: 5000 },
      { title: 'Loan eligibility in one tap', description: 'Pre-approved limit on the home screen using bureau data.', impact: 5, effort: 4, confidence: 3, reach: 12000 },
      { title: 'WhatsApp reminders', description: 'Send EMI reminders on WhatsApp instead of SMS.', impact: 3, effort: 2, confidence: 5, reach: 20000 },
      { title: 'Widget for next EMI', description: 'Home-screen widget showing the next due date and amount.', impact: 2, effort: 3, confidence: 3, reach: 3000 }
    ],
    decisions: [
      { title: 'Ship Android before iOS for 5.2', rejected: ['Simultaneous release', 'iOS first'] },
      { title: 'Use Razorpay for UPI autopay', rejected: ['PhonePe SDK', 'Build our own NPCI integration'] }
    ],
    docs: ['Product brief · Mobile App 5.2', 'Release checklist', 'Support runbook']
  },
  {
    key: 'WEB',
    name: 'Customer Portal',
    description: 'The web portal for customers and partners: applications, documents, statements and support tickets.',
    components: ['Frontend', 'Auth', 'Billing'],
    labels: ['bug', 'feature', 'security', 'seo', 'partner'],
    epics: [
      { title: 'Self-serve loan application', children: ['Multi-step application form with autosave', 'Upload documents with progress and validation', 'Application status timeline', 'E-sign the agreement'] },
      { title: 'Partner portal', children: ['Partner login with role-based access', 'Commission statements download', 'Lead submission API'] },
      { title: 'Security hardening', children: ['Enable MFA for all staff accounts', 'Rate-limit the login endpoint', 'Rotate signing keys quarterly', 'Content security policy for the portal'] }
    ],
    loose: ['Footer links open in the same tab', 'Statement PDF shows wrong currency symbol', 'SEO titles for the loans landing page', 'Accessibility: focus ring on buttons', 'Cookie consent banner'],
    ideas: [
      { title: 'Live chat on the portal', description: 'Route portal chat straight into the service desk.', impact: 4, effort: 3, confidence: 4, reach: 8000 },
      { title: 'Saved applications', description: 'Let customers resume an application from any device.', impact: 3, effort: 2, confidence: 4, reach: 6000 },
      { title: 'Partner leaderboard', description: 'Monthly leaderboard to motivate partner submissions.', impact: 2, effort: 1, confidence: 3, reach: 300 }
    ],
    decisions: [{ title: 'Keep the portal on the same domain as the app', rejected: ['portal.example.com subdomain'] }],
    docs: ['Portal architecture', 'Partner onboarding guide']
  }
]

const COMMENTS = [
  'Picked this up, will have a first cut by tomorrow.',
  'Blocked on the API contract, pinged the backend team.',
  'Tested on a Redmi Note 9, works as expected.',
  'Can we keep the copy shorter here? Two lines max.',
  'Moving this to the next sprint, customer priority changed.',
  'Done. Screenshots attached in the design channel.',
  'Needs a decision from product before we start.',
  'Reproduced on staging, root cause is a stale cache.'
]
const CHAT = [
  'Good morning team! Sprint planning at 11:00, please update your items before then.',
  'Payments v2 demo went well, the client wants the UPI autopay flow live by month end.',
  'Heads up: staging will be down for 20 minutes at 15:00 for the database upgrade.',
  'Anyone free to review the onboarding PR? It touches the OTP screen.',
  'Reminder: fill in your hours before Friday, timesheets go out to finance on Monday.',
  'The Hindi translation is 80% done, thanks to everyone who helped with the glossary.',
  'Crash rate is down to 0.4% after the loan calculator fix 🎉',
  'Design review moved to Thursday, same room, same time.'
]

export async function seedDemo (ops: TxOperations, log: (s: string) => void): Promise<void> {
  const employees = await ops.findAll(contact.mixin.Employee, { active: true })
  if (employees.length === 0) throw new Error('no active employees in the workspace; invite people first')
  const people: Employee[] = employees.slice(0, 8)
  const identities = await ops.findAll(contact.class.SocialIdentity, { attachedTo: { $in: people.map((p) => p._id) } })
  const authorOf = (p: Employee): PersonId | undefined => (identities.find((i: SocialIdentity) => i.attachedTo === p._id)?._id as PersonId | undefined)
  const pick = <T>(arr: T[], k: number): T => arr[k % arr.length]

  const types = await ops.findAll(task.class.TaskType, { parent: tracker.ids.ClassingProjectType })
  const issueType: TaskType | undefined = types.find((t) => t._id === tracker.taskTypes.Issue) ?? types.find((t) => t.name === 'Issue')
  const epicType: TaskType | undefined = types.find((t) => t._id === tracker.taskTypes.Epic) ?? types.find((t) => t.name === 'Epic')
  if (issueType === undefined || epicType === undefined) throw new Error('issue / epic task types not found')
  const statuses = await ops.findAll(tracker.class.IssueStatus, { _id: { $in: issueType.statuses as Ref<IssueStatus>[] } })
  const st = (name: string): Ref<IssueStatus> => {
    const s = statuses.find((x) => x.name.toLowerCase().replace(/\s/g, '') === name)
    if (s === undefined) throw new Error(`status ${name} missing`)
    return s._id
  }
  const S = { backlog: st('backlog'), todo: st('todo'), doing: st('inprogress'), done: st('done'), canceled: st('canceled') }
  const now = Date.now()

  // labels are workspace-wide
  const existingTags = await ops.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue })
  const tagColors = [11, 2, 5, 8, 14, 0, 3, 7]
  const tagOf = async (title: string, k: number): Promise<{ _id: Ref<any>, color: number }> => {
    const found = existingTags.find((t) => t.title === title)
    if (found !== undefined) return { _id: found._id, color: found.color }
    const _id = await ops.createDoc(tags.class.TagElement, core.space.Workspace, { title, description: '', targetClass: tracker.class.Issue, color: tagColors[k % tagColors.length], category: tags.category.NoCategory } as any)
    return { _id, color: tagColors[k % tagColors.length] }
  }

  for (const seed of SEEDS) {
    const existing = await ops.findOne(tracker.class.Project, { identifier: seed.key })
    if (existing !== undefined) {
      log(`${seed.key}: exists, skipped`)
      continue
    }
    const projectId = generateId<Project>()
    const members = people.map((p) => p.personUuid).filter((u): u is NonNullable<typeof u> => u != null)
    await ops.createDoc(tracker.class.Project, core.space.Space, {
      name: seed.name,
      description: seed.description,
      private: false,
      members,
      owners: members.slice(0, 1),
      archived: false,
      autoJoin: true,
      identifier: seed.key,
      sequence: 0,
      defaultIssueStatus: S.backlog,
      defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
      type: tracker.ids.ClassingProjectType
    } as any, projectId)

    // components, milestones, sprints
    const componentIds: Array<Ref<any>> = []
    for (const [k, label] of seed.components.entries()) {
      componentIds.push(await ops.createDoc(tracker.class.Component, projectId, { label, description: '', lead: pick(people, k)._id, comments: 0, attachments: 0 } as any))
    }
    const milestoneIds = [
      await ops.createDoc(tracker.class.Milestone, projectId, { label: 'Beta launch', description: '', status: MilestoneStatus.InProgress, comments: 0, attachments: 0, startDate: null, targetDate: now + 21 * DAY } as any),
      await ops.createDoc(tracker.class.Milestone, projectId, { label: 'General availability', description: '', status: MilestoneStatus.Planned, comments: 0, attachments: 0, startDate: null, targetDate: now + 60 * DAY } as any)
    ]
    const sprintDone = await ops.createDoc(tracker.class.Sprint, projectId, { name: `${seed.key} Sprint 1`, goal: 'Foundations and first customer-visible flows', startDate: now - 28 * DAY, endDate: now - 14 * DAY, state: 'completed', carriedOverTo: null } as any)
    const sprintActive = await ops.createDoc(tracker.class.Sprint, projectId, { name: `${seed.key} Sprint 2`, goal: 'Ship the beta to the first 50 customers', startDate: now - 7 * DAY, endDate: now + 7 * DAY, state: 'active', carriedOverTo: null } as any)
    const sprintNext = await ops.createDoc(tracker.class.Sprint, projectId, { name: `${seed.key} Sprint 3`, goal: 'Polish, performance and partner features', startDate: now + 7 * DAY, endDate: now + 21 * DAY, state: 'planned', carriedOverTo: null } as any)
    const labelDefs: Array<{ _id: Ref<any>, color: number, title: string }> = []
    for (const [k, l] of seed.labels.entries()) labelDefs.push({ ...(await tagOf(l, k)), title: l })

    let number = 0
    let lastRank: string | undefined
    const prios = [IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.Urgent, IssuePriority.Medium, IssuePriority.NoPriority]
    const created: Array<{ id: Ref<Issue>, title: string, identifier: string }> = []
    let n = 0
    const makeIssue = async (title: string, kind: Ref<TaskType>, parent?: { id: Ref<Issue>, title: string, identifier: string }): Promise<{ id: Ref<Issue>, title: string, identifier: string }> => {
      n++
      number++
      const identifier = `${seed.key}-${number}`
      const _id = generateId<Issue>()
      const rank = makeRank(lastRank, undefined)
      lastRank = rank
      const isEpic = kind === epicType._id
      // spread creation over the last 30 days, oldest first
      const createdOn = now - (30 - (n % 30)) * DAY - (n % 7) * 3_600_000
      const bucket = isEpic ? 'doing' : (['done', 'done', 'doing', 'todo', 'backlog', 'done', 'doing', 'todo', 'canceled'] as const)[n % 9]
      const assignee = bucket === 'backlog' && n % 3 === 0 ? null : pick(people, n)._id
      const dueDate = bucket === 'done' || bucket === 'canceled' ? null : n % 4 === 0 ? createdOn + 20 * DAY : n % 4 === 1 ? now + (n % 10) * DAY : n % 4 === 2 ? now - (n % 5 + 1) * DAY : null
      const sprint = bucket === 'done' ? (n % 2 === 0 ? sprintDone : sprintActive) : bucket === 'doing' || bucket === 'todo' ? (n % 3 === 0 ? sprintNext : sprintActive) : null
      const value: Data<Issue> = {
        title,
        description: null,
        assignee,
        component: isEpic ? null : componentIds[n % componentIds.length],
        milestone: isEpic ? milestoneIds[n % 2] : n % 2 === 0 ? milestoneIds[0] : null,
        number,
        priority: prios[n % prios.length],
        rank,
        comments: 0,
        subIssues: 0,
        startDate: null,
        dueDate,
        parents: parent !== undefined ? [{ parentId: parent.id, parentTitle: parent.title, space: projectId, identifier: parent.identifier }] : [],
        reportedTime: 0,
        remainingTime: 0,
        estimation: isEpic ? 0 : [2, 4, 8, 1, 6, 3][n % 6],
        reports: 0,
        relations: [],
        blockedBy: [],
        childInfo: [],
        identifier,
        status: S.backlog,
        kind,
        ...(isEpic ? {} : { storyPoints: [1, 2, 3, 5, 8, 3][n % 6], sprint })
      } as any
      await ops.addCollection(tracker.class.Issue, projectId, parent?.id ?? tracker.ids.NoParent, tracker.class.Issue, 'subIssues', value, _id, createdOn, authorOf(pick(people, n + 1)))
      // walk the workflow so history, cycle time and charts have data
      if (bucket === 'todo' || bucket === 'doing' || bucket === 'done') await ops.updateDoc(tracker.class.Issue, projectId, _id, { status: S.todo }, false, createdOn + DAY, authorOf(pick(people, n)))
      if (bucket === 'doing' || bucket === 'done') await ops.updateDoc(tracker.class.Issue, projectId, _id, { status: S.doing }, false, createdOn + 2 * DAY + (n % 3) * DAY, authorOf(pick(people, n)))
      if (bucket === 'done') await ops.updateDoc(tracker.class.Issue, projectId, _id, { status: S.done }, false, Math.min(now - (n % 6) * DAY, createdOn + 4 * DAY + (n % 5) * DAY), authorOf(pick(people, n)))
      if (bucket === 'canceled') await ops.updateDoc(tracker.class.Issue, projectId, _id, { status: S.canceled }, false, createdOn + 3 * DAY, authorOf(pick(people, n)))
      // labels and comments
      if (!isEpic) {
        const l = labelDefs[n % labelDefs.length]
        await ops.addCollection(tags.class.TagReference, projectId, _id, tracker.class.Issue, 'labels', { tag: l._id, title: l.title, color: l.color } as any)
        if (n % 5 === 0) {
          const l2 = labelDefs[(n + 2) % labelDefs.length]
          await ops.addCollection(tags.class.TagReference, projectId, _id, tracker.class.Issue, 'labels', { tag: l2._id, title: l2.title, color: l2.color } as any)
        }
        if (n % 2 === 0) await ops.addCollection(chunter.class.ChatMessage, projectId, _id, tracker.class.Issue, 'comments', { message: markup(COMMENTS[n % COMMENTS.length]), attachments: 0 } as any, undefined, createdOn + DAY + 3_600_000, authorOf(pick(people, n + 2)))
        if (n % 4 === 0) await ops.addCollection(chunter.class.ChatMessage, projectId, _id, tracker.class.Issue, 'comments', { message: markup(COMMENTS[(n + 3) % COMMENTS.length]), attachments: 0 } as any, undefined, createdOn + 2 * DAY, authorOf(pick(people, n + 4)))
      }
      const rec = { id: _id, title, identifier }
      created.push(rec)
      return rec
    }
    for (const epic of seed.epics) {
      const e = await makeIssue(epic.title, epicType._id)
      for (const c of epic.children) await makeIssue(c, issueType._id, e)
    }
    for (const t of seed.loose) await makeIssue(t, issueType._id)
    await ops.updateDoc(tracker.class.Project, core.space.Space, projectId, { sequence: number })

    // ideas and decisions
    for (const [k, i] of seed.ideas.entries()) {
      await ops.createDoc(tracker.class.Idea, projectId, { title: i.title, description: i.description, status: (['new', 'exploring', 'validated', 'planned'] as const)[k % 4], impact: i.impact, effort: i.effort, confidence: i.confidence, reach: i.reach, voters: people.slice(0, (k % 3) + 1).map((p) => String(p._id)), tags: [], owner: pick(people, k)._id, insights: [], linkedIssues: k === 0 && created[1] !== undefined ? [created[1].id] : [], goal: null } as any, undefined, now - (10 - k) * DAY, authorOf(pick(people, k)))
    }
    for (const [k, d] of seed.decisions.entries()) {
      await ops.createDoc(tracker.class.Decision, projectId, { title: d.title, rationale: null, rejectedOptions: d.rejected, state: k === 0 ? 'ratified' : 'proposed', decidedBy: k === 0 ? pick(people, 0)._id : null, decidedOn: k === 0 ? now - 5 * DAY : null, consulted: people.slice(0, 2).map((p) => p._id), affects: [] } as any, undefined, now - (8 - k) * DAY, authorOf(pick(people, k)))
    }

    // a docs space with a few pages
    const teamspaceId = await ops.createDoc('document:class:Teamspace' as any, core.space.Space, { name: seed.name, description: `Documents for ${seed.name}`, private: false, members, owners: members.slice(0, 1), archived: false, autoJoin: true, type: 'document:spaceType:DefaultTeamspaceType' } as any)
    let docRank: string | undefined
    for (const title of seed.docs) {
      docRank = makeRank(docRank, undefined)
      await ops.createDoc('document:class:Document' as any, teamspaceId, { title, content: null, attachments: 0, embeddings: 0, labels: 0, comments: 0, references: 0, rank: docRank, parent: 'document:ids:NoParent' } as any, undefined, now - 3 * DAY, authorOf(people[0]))
    }
    log(`${seed.key}: ${number} work items, ${seed.epics.length} epics, 3 sprints, ${seed.components.length} components, 2 milestones, ${seed.ideas.length} ideas, ${seed.decisions.length} decisions, ${seed.docs.length} docs`)
  }

  // a week of chat in #general, only if it is still quiet
  const general = await ops.findOne(chunter.class.Channel, { _id: 'chunter:space:General' as Ref<Channel> })
  if (general !== undefined) {
    const count = await ops.findAll(chunter.class.ChatMessage, { attachedTo: general._id }, { limit: 1, total: true })
    if (count.total < 5) {
      for (const [k, text] of CHAT.entries()) {
        await ops.addCollection(chunter.class.ChatMessage, general._id, general._id, chunter.class.Channel, 'messages', { message: markup(text), attachments: 0 } as any, undefined, now - (CHAT.length - k) * 0.7 * DAY, authorOf(pick(people, k)))
      }
      log(`#general: ${CHAT.length} messages`)
    } else log('#general: already active, skipped')
  }
}

// Remove everything seedDemo created: the two demo projects with all their
// work, their docs spaces, and the demo chat in #general.
export async function unseedDemo (ops: TxOperations, log: (s: string) => void): Promise<void> {
  for (const seed of SEEDS) {
    const project = await ops.findOne(tracker.class.Project, { identifier: seed.key })
    if (project === undefined) {
      log(`${seed.key}: not present`)
      continue
    }
    const space = project._id
    const issues = await ops.findAll(tracker.class.Issue, { space })
    for (const i of issues) {
      for (const c of await ops.findAll(chunter.class.ChatMessage, { attachedTo: i._id })) await ops.remove(c)
      for (const t of await ops.findAll(tags.class.TagReference, { attachedTo: i._id })) await ops.remove(t)
    }
    for (const i of issues) await ops.remove(i)
    for (const cls of [tracker.class.Sprint, tracker.class.Milestone, tracker.class.Component, tracker.class.Idea, tracker.class.Decision] as Array<Ref<any>>) {
      for (const d of await ops.findAll(cls, { space } as any)) await ops.remove(d)
    }
    await ops.remove(project)
    for (const ts of await ops.findAll('document:class:Teamspace' as any, { name: seed.name } as any)) {
      for (const d of await ops.findAll('document:class:Document' as any, { space: ts._id } as any)) await ops.remove(d)
      await ops.remove(ts)
    }
    log(`${seed.key}: removed ${issues.length} work items and the project`)
  }
  const general = await ops.findOne(chunter.class.Channel, { _id: 'chunter:space:General' as Ref<Channel> })
  if (general !== undefined) {
    const msgs = await ops.findAll(chunter.class.ChatMessage, { attachedTo: general._id })
    let n = 0
    for (const m of msgs) {
      if (CHAT.some((t) => String(m.message).includes(t))) {
        await ops.remove(m)
        n++
      }
    }
    log(`#general: removed ${n} demo messages`)
  }
}
