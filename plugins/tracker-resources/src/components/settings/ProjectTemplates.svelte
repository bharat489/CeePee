<!--
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
-->
<!--
  Template gallery for new projects. Software, product, marketing, operations,
  people and sales templates; search, categories and favourites; a preview of
  exactly what a template sets up (workflow, components, milestones, labels,
  starter issues, schemes). Creating a project performs all of it: the project
  and its type mixin, components, milestones, labels, starter issues (epics
  with children where the template has them), a first sprint, request types,
  SLAs, WIP limits, permission and notification schemes.
-->
<script lang="ts">
  import core, { hasAccountRole, AccountRole, generateId, getCurrentAccount, type Data, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task, { type ProjectType, type TaskType } from '@hcengineering/task'
  import { type ProjectTemplate, IssuePriority, MilestoneStatus, TimeReportDayType, type Component, type Issue, type IssueStatus, type NotificationScheme, type PermissionScheme, type Project } from '@hcengineering/tracker'
  import { Button, getCurrentLocation, Label, navigate, SelectPopup, showPopup } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import { createIssueDoc } from '../../createIssueDoc'
  import tracker from '../../plugin'
  import { icon } from '../projects/icons'

  const client = getClient()
  const DAY = 86_400_000

  type Category = 'Software' | 'Product' | 'Marketing' | 'Operations' | 'People' | 'Sales'
  interface Starter {
    title: string
    priority?: IssuePriority
    component?: string
    labels?: string[]
    epic?: boolean
    children?: string[]
    description?: string
  }
  interface Template {
    id: string
    name: string
    emoji: string
    category: Category
    tagline: string
    bullets: string[]
    defaultManaged: 'team' | 'company'
    views: string[]
    landing: string
    components?: string[]
    milestones?: Array<[string, number]>
    labels?: string[]
    starters?: Starter[]
    /** set when the template was published by the team */
    published?: Ref<ProjectTemplate>
    usage?: number
  }
  const P = IssuePriority
  const TEMPLATES: Template[] = [
    {
      id: 'scrum', name: 'Scrum', emoji: '🏃', category: 'Software', tagline: 'Sprints, a groomed backlog, velocity and burndown.',
      bullets: ['Backlog and Sprints views; the first two-week sprint is ready', 'Parent issues follow their children; parents start when a child starts', 'Velocity, burndown, sprint report and control chart', 'Sprint-end reminders on the dashboard'],
      defaultManaged: 'team', views: ['Backlog', 'Board', 'Sprints', 'Reports', 'Timeline'], landing: 'backlog',
      labels: ['bug', 'feature', 'tech-debt', 'spike'],
      starters: [
        { title: 'Agree the definition of done', priority: P.High, labels: ['spike'], description: 'Write the team\'s definition of done and pin it in the project docs.' },
        { title: 'Groom the backlog for Sprint 1', priority: P.High },
        { title: 'Pick the story-point scale and reference stories', priority: P.Medium, labels: ['spike'] }
      ]
    },
    {
      id: 'kanban', name: 'Kanban', emoji: '📊', category: 'Software', tagline: 'Continuous flow with work-in-progress limits.',
      bullets: ['WIP limit of 5 on every in-progress column', 'Board swimlanes by assignee, epic or priority', 'Cumulative flow diagram and cycle time', 'No sprints, no ceremonies'],
      defaultManaged: 'team', views: ['Board', 'List', 'Reports'], landing: 'board',
      labels: ['expedite', 'standard', 'fixed-date', 'intangible'],
      starters: [
        { title: 'Map the current workflow onto the board columns', priority: P.High },
        { title: 'Agree WIP limits per column', priority: P.Medium, description: 'Start at 5. Lower it when the board shows work piling up.' },
        { title: 'Set the class-of-service policy (expedite lane)', priority: P.Low, labels: ['expedite'] }
      ]
    },
    {
      id: 'bugs', name: 'Bug tracking', emoji: '🐞', category: 'Software', tagline: 'Triage, components, SLAs, versions.',
      bullets: ['SLA: Urgent 24h, High 72h, Medium 7 days', 'Component leads become default assignees', 'Fix version and affects version on every issue', 'Version report and release notes', 'A "Next release" milestone 30 days out'],
      defaultManaged: 'company', views: ['List', 'Board', 'Components', 'Releases', 'Reports'], landing: 'issues',
      components: ['Web', 'Mobile', 'API', 'Infrastructure'], milestones: [['Next release', 30]],
      labels: ['regression', 'crash', 'security', 'ux', 'needs-repro'],
      starters: [
        { title: 'Set the weekly triage rota', priority: P.High, component: 'Infrastructure' },
        { title: 'Write the bug report template', priority: P.Medium, component: 'Web', labels: ['needs-repro'], description: 'Steps to reproduce, expected, actual, environment, screenshots.' },
        { title: 'Connect crash reporting to this project', priority: P.Medium, component: 'Mobile', labels: ['crash'] }
      ]
    },
    {
      id: 'servicedesk', name: 'Service desk', emoji: '🎧', category: 'Operations', tagline: 'Requests from people outside the team, with SLAs and satisfaction.',
      bullets: ['Request types: Bug report, Feature request, Question, Access request', 'SLA per priority, breach warnings, queue view', 'Public help centre and submit form (integrations service)', 'Satisfaction rating when a request is resolved', 'Reporter and assignee notified on every change'],
      defaultManaged: 'company', views: ['Service desk', 'List', 'Reports'], landing: 'service-desk',
      labels: ['access', 'question', 'incident', 'how-to'],
      starters: [
        { title: 'Publish the help centre link to the company', priority: P.High },
        { title: 'Agree support hours and the SLA calendar', priority: P.Medium },
        { title: 'Write the top 10 how-to answers', priority: P.Low, labels: ['how-to'] }
      ]
    },
    {
      id: 'simple', name: 'Simple', emoji: '📝', category: 'Software', tagline: 'Issues, a board, milestones. Nothing else switched on.',
      bullets: ['Issues list and board', 'Milestones and components available when you need them', 'Add anything later from project settings'],
      defaultManaged: 'team', views: ['List', 'Board'], landing: 'issues'
    },
    {
      id: 'product', name: 'Product roadmap', emoji: '🗺️', category: 'Product', tagline: 'Now / Next / Later, epics with outcomes, customer evidence.',
      bullets: ['Now, Next and Later milestones', 'Epics for outcomes, issues for the work underneath', 'Discovery, Growth, Platform and Quality components', 'Roadmap and Timeline views for stakeholders'],
      defaultManaged: 'company', views: ['Roadmap', 'Epics', 'Timeline', 'Board'], landing: 'roadmap',
      components: ['Discovery', 'Growth', 'Platform', 'Quality'], milestones: [['Now', 30], ['Next', 90], ['Later', 180]],
      labels: ['customer-request', 'hypothesis', 'launch', 'metric'],
      starters: [
        { title: 'Onboarding that converts', epic: true, description: 'Outcome: 40% of sign-ups reach the first success moment within a day.', children: ['Interview five recently churned users', 'Prototype the new first-run flow', 'Define the activation metric and dashboard'] },
        { title: 'Self-serve billing', epic: true, description: 'Outcome: customers upgrade without talking to sales.', children: ['Pricing page and plan comparison', 'Card payments and invoices', 'Upgrade and downgrade flows'] },
        { title: 'Quarterly customer feedback review', priority: P.Medium, component: 'Discovery', labels: ['customer-request'] }
      ]
    },
    {
      id: 'marketing', name: 'Marketing campaign', emoji: '📣', category: 'Marketing', tagline: 'Brief, creative, channels, launch day, results.',
      bullets: ['Content, Paid, Social, Email and Events components', 'Kickoff, Launch and Wrap-up milestones', 'Copy, design and approval labels for the review loop', 'Calendar view for the publishing schedule'],
      defaultManaged: 'team', views: ['Board', 'Calendar', 'Timeline', 'List'], landing: 'board',
      components: ['Content', 'Paid', 'Social', 'Email', 'Events'], milestones: [['Campaign kickoff', 7], ['Launch', 30], ['Wrap-up report', 45]],
      labels: ['copy', 'design', 'approval', 'blocked-on-legal'],
      starters: [
        { title: 'Campaign brief: goals, audience, budget', priority: P.Urgent, component: 'Content', labels: ['approval'] },
        { title: 'Messaging and positioning', priority: P.High, component: 'Content', labels: ['copy'] },
        { title: 'Landing page copy and design', priority: P.High, component: 'Content', labels: ['copy', 'design'] },
        { title: 'Creative set: banners, social cards, video cut', priority: P.High, component: 'Social', labels: ['design'] },
        { title: 'Email sequence (announce, remind, last call)', priority: P.Medium, component: 'Email', labels: ['copy'] },
        { title: 'Paid ads set-up and budget pacing', priority: P.Medium, component: 'Paid' },
        { title: 'Launch-day checklist', priority: P.High, component: 'Events' },
        { title: 'Results report and learnings', priority: P.Low, component: 'Content' }
      ]
    },
    {
      id: 'content', name: 'Content calendar', emoji: '🗓️', category: 'Marketing', tagline: 'Blog, video, newsletter and social on one calendar.',
      bullets: ['Blog, Video, Newsletter and Social components', 'Draft → review → scheduled → published labels', 'Monthly milestones for themes', 'Calendar view is the home page'],
      defaultManaged: 'team', views: ['Calendar', 'Board', 'List'], landing: 'calendar',
      components: ['Blog', 'Video', 'Newsletter', 'Social'], milestones: [['This month', 30], ['Next month', 60]],
      labels: ['draft', 'review', 'scheduled', 'published', 'evergreen'],
      starters: [
        { title: 'Editorial themes for the quarter', priority: P.High, component: 'Blog', labels: ['draft'] },
        { title: 'Blog: customer story', priority: P.Medium, component: 'Blog', labels: ['draft'] },
        { title: 'Newsletter: monthly product update', priority: P.Medium, component: 'Newsletter', labels: ['draft'] },
        { title: 'Video: two-minute product tour', priority: P.Medium, component: 'Video', labels: ['draft'] },
        { title: 'Social: weekly tips series', priority: P.Low, component: 'Social', labels: ['evergreen'] }
      ]
    },
    {
      id: 'okr', name: 'OKRs', emoji: '🎯', category: 'Product', tagline: 'Objectives as epics, key results as their issues.',
      bullets: ['Each objective is an epic; key results are issues under it', 'Quarter-end milestone for the review', 'Initiatives view to see progress roll up', 'Weekly check-in issue for confidence scores'],
      defaultManaged: 'company', views: ['Epics', 'Initiatives', 'Roadmap', 'Board'], landing: 'epics',
      milestones: [['Quarter end', 90]], labels: ['objective', 'key-result', 'initiative', 'at-risk'],
      starters: [
        { title: 'Delight our customers', epic: true, labels: ['objective'], children: ['NPS from 32 to 45', 'First response in support under 2 hours', 'Monthly churn below 2%'] },
        { title: 'Grow revenue predictably', epic: true, labels: ['objective'], children: ['Pipeline coverage 3× the quarterly target', 'Self-serve revenue 20% of new bookings', 'Win rate from 18% to 25%'] },
        { title: 'Ship faster with confidence', epic: true, labels: ['objective'], children: ['Lead time for changes under 2 days', 'Change failure rate under 10%', 'Weekly release cadence'] },
        { title: 'Weekly OKR check-in', priority: P.Medium, labels: ['initiative'], description: 'Every Monday: update confidence per key result, flag at-risk ones.' }
      ]
    },
    {
      id: 'hiring', name: 'Hiring plan', emoji: '🧑‍💼', category: 'People', tagline: 'Roles to open, interview loops, offers. Candidates live in Recruiting.',
      bullets: ['One epic per role with the loop underneath', 'Engineering, Design, Sales and Operations components', 'Sourcing, interview, offer and onboarding labels', 'Use the Recruiting app for vacancies and candidates; this project tracks the plan'],
      defaultManaged: 'company', views: ['Epics', 'Board', 'Timeline'], landing: 'epics',
      components: ['Engineering', 'Design', 'Sales', 'Operations'], milestones: [['Hiring plan approved', 14], ['First offers out', 60]],
      labels: ['sourcing', 'interview', 'offer', 'onboarding', 'headcount'],
      starters: [
        { title: 'Headcount plan and budget sign-off', priority: P.Urgent, labels: ['headcount'] },
        { title: 'Senior engineer', epic: true, component: 'Engineering', children: ['Job description and comp band', 'Interview loop and scorecards', 'Sourcing plan and outreach', 'Offer template'] },
        { title: 'Product designer', epic: true, component: 'Design', children: ['Job description and portfolio rubric', 'Design exercise', 'Interview loop'] },
        { title: 'Interviewer training session', priority: P.Medium, labels: ['interview'] }
      ]
    },
    {
      id: 'onboarding', name: 'Employee onboarding', emoji: '🚀', category: 'People', tagline: 'Day 1, week 1, 30 and 90 days for every new joiner.',
      bullets: ['Day 1, Week 1, 30 days and 90 days milestones', 'IT & Access, HR & Payroll, Team and Learning components', 'Checklist issues you copy per new joiner', 'Calendar view to see who starts when'],
      defaultManaged: 'team', views: ['Board', 'Calendar', 'List'], landing: 'board',
      components: ['IT & Access', 'HR & Payroll', 'Team', 'Learning'], milestones: [['Day 1', 1], ['Week 1', 7], ['30 days', 30], ['90 days', 90]],
      labels: ['day-1', 'week-1', 'month-1', 'buddy'],
      starters: [
        { title: 'Create accounts, hardware and access', priority: P.Urgent, component: 'IT & Access', labels: ['day-1'] },
        { title: 'Payroll, benefits and contract paperwork', priority: P.High, component: 'HR & Payroll', labels: ['day-1'] },
        { title: 'Assign a buddy and book the first coffee', priority: P.High, component: 'Team', labels: ['day-1', 'buddy'] },
        { title: 'Team intro sessions and product walkthrough', priority: P.Medium, component: 'Team', labels: ['week-1'] },
        { title: 'First small change shipped', priority: P.Medium, component: 'Learning', labels: ['week-1'] },
        { title: '30-day check-in', priority: P.Medium, component: 'Team', labels: ['month-1'] },
        { title: '90-day review', priority: P.Low, component: 'Team' }
      ]
    },
    {
      id: 'sales', name: 'Sales pipeline', emoji: '💼', category: 'Sales', tagline: 'Playbooks, targets and the deals cadence.',
      bullets: ['Inbound, Outbound, Partners and Renewals components', 'Qualified → proposal → negotiation → closed labels', 'Quarter-target milestone', 'Board as the pipeline review screen'],
      defaultManaged: 'company', views: ['Board', 'List', 'Reports'], landing: 'board',
      components: ['Inbound', 'Outbound', 'Partners', 'Renewals'], milestones: [['Quarter target', 90]],
      labels: ['qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost'],
      starters: [
        { title: 'Ideal customer profile and qualification criteria', priority: P.High, component: 'Inbound' },
        { title: 'Proposal and pricing template', priority: P.High, component: 'Outbound', labels: ['proposal'] },
        { title: 'Weekly pipeline review cadence', priority: P.Medium },
        { title: 'Renewal playbook (90 / 60 / 30 days out)', priority: P.Medium, component: 'Renewals' },
        { title: 'Partner referral programme', priority: P.Low, component: 'Partners' }
      ]
    },
    {
      id: 'incident', name: 'Incident management', emoji: '🚨', category: 'Operations', tagline: 'Sev levels, on-call, comms, postmortems.',
      bullets: ['SLA: Urgent 1h, High 4h, Medium 24h', 'Detection, Response, Communication and Postmortem components', 'sev1 / sev2 / sev3 and postmortem labels', 'Everyone involved is notified on every change'],
      defaultManaged: 'company', views: ['List', 'Board', 'On-call', 'Reports'], landing: 'issues',
      components: ['Detection', 'Response', 'Communication', 'Postmortem'], milestones: [['Runbooks complete', 30]],
      labels: ['sev1', 'sev2', 'sev3', 'postmortem', 'action-item'],
      starters: [
        { title: 'On-call rota and escalation policy', priority: P.Urgent, component: 'Response' },
        { title: 'Status page and customer comms templates', priority: P.High, component: 'Communication' },
        { title: 'Runbook index for every paging alert', priority: P.High, component: 'Detection' },
        { title: 'Blameless postmortem template and review meeting', priority: P.Medium, component: 'Postmortem', labels: ['postmortem'] }
      ]
    },
    {
      id: 'event', name: 'Event planning', emoji: '🎪', category: 'Marketing', tagline: 'Venue, speakers, promotion, logistics, budget.',
      bullets: ['Save the date, registrations, event day and follow-up milestones', 'Venue, Speakers, Marketing, Logistics and Budget components', 'Vendor, contract and approval labels', 'Timeline view for the run-up'],
      defaultManaged: 'team', views: ['Timeline', 'Board', 'Calendar'], landing: 'timeline',
      components: ['Venue', 'Speakers', 'Marketing', 'Logistics', 'Budget'], milestones: [['Save the date', 14], ['Registrations open', 30], ['Event day', 60], ['Follow-ups sent', 67]],
      labels: ['vendor', 'contract', 'approval', 'day-of'],
      starters: [
        { title: 'Budget and success criteria', priority: P.Urgent, component: 'Budget', labels: ['approval'] },
        { title: 'Shortlist and book the venue', priority: P.High, component: 'Venue', labels: ['vendor', 'contract'] },
        { title: 'Invite speakers and confirm the agenda', priority: P.High, component: 'Speakers' },
        { title: 'Registration page and promotion plan', priority: P.High, component: 'Marketing' },
        { title: 'Catering, AV and signage', priority: P.Medium, component: 'Logistics', labels: ['vendor'] },
        { title: 'Run-of-show and day-of roles', priority: P.Medium, component: 'Logistics', labels: ['day-of'] },
        { title: 'Thank-you emails and recording', priority: P.Low, component: 'Marketing' }
      ]
    },
    {
      id: 'design', name: 'Design system', emoji: '🎨', category: 'Product', tagline: 'Tokens, components, patterns and their docs.',
      bullets: ['Foundations, Components, Patterns and Docs components', 'Token, accessibility and breaking-change labels', 'Version milestones', 'Components view as the inventory'],
      defaultManaged: 'team', views: ['Components', 'Board', 'List'], landing: 'components',
      components: ['Foundations', 'Components', 'Patterns', 'Docs'], milestones: [['v1.0', 45], ['v1.1', 90]],
      labels: ['token', 'a11y', 'breaking-change', 'needs-design'],
      starters: [
        { title: 'Colour, type and spacing tokens', priority: P.High, component: 'Foundations', labels: ['token'] },
        { title: 'Button: variants, sizes, states', priority: P.High, component: 'Components' },
        { title: 'Form controls: input, select, checkbox, radio', priority: P.Medium, component: 'Components' },
        { title: 'Accessibility audit of existing screens', priority: P.Medium, component: 'Patterns', labels: ['a11y'] },
        { title: 'Usage guidelines site', priority: P.Low, component: 'Docs' }
      ]
    },
    {
      id: 'research', name: 'User research', emoji: '🔬', category: 'Product', tagline: 'Interviews, surveys, usability tests, synthesis.',
      bullets: ['Interviews, Surveys, Usability tests and Synthesis components', 'Insight, quote and hypothesis labels', 'Research round milestones', 'Docs tab for interview notes with templates'],
      defaultManaged: 'team', views: ['Board', 'Docs', 'List'], landing: 'board',
      components: ['Interviews', 'Surveys', 'Usability tests', 'Synthesis'], milestones: [['Round 1 synthesis', 21]],
      labels: ['insight', 'quote', 'hypothesis', 'recruit'],
      starters: [
        { title: 'Research questions and hypotheses', priority: P.High, component: 'Synthesis', labels: ['hypothesis'] },
        { title: 'Recruit eight participants', priority: P.High, component: 'Interviews', labels: ['recruit'] },
        { title: 'Interview guide', priority: P.Medium, component: 'Interviews' },
        { title: 'Usability test script for the new flow', priority: P.Medium, component: 'Usability tests' },
        { title: 'Synthesis workshop and insight report', priority: P.Medium, component: 'Synthesis', labels: ['insight'] }
      ]
    }
  ]
  const CATEGORIES: Array<'All' | 'Favourites' | 'Published' | Category> = ['All', 'Favourites', 'Published', 'Software', 'Product', 'Marketing', 'Operations', 'People', 'Sales']
  const GRADIENT: Record<Category, string> = {
    Software: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    Product: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
    Marketing: 'linear-gradient(135deg, #f43f5e, #f97316)',
    Operations: 'linear-gradient(135deg, #10b981, #14b8a6)',
    People: 'linear-gradient(135deg, #f59e0b, #f43f5e)',
    Sales: 'linear-gradient(135deg, #22c55e, #0ea5e9)'
  }

  // favourites, per browser
  const FAV_KEY = 'ceepee.templateFavs'
  let favs: string[] = []
  try { favs = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { favs = [] }
  function toggleFav (id: string, e: Event): void {
    e.stopPropagation()
    favs = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id]
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)) } catch {}
  }

  let category: (typeof CATEGORIES)[number] = 'All'
  let search = ''
  // templates the team published from its own projects
  // the projects a person can publish from (their own, unarchived)
  const projQ = createQuery()
  let myProjects: Project[] = []
  projQ.query(tracker.class.Project, { archived: false }, (r) => { myProjects = r.sort((a, b) => a.identifier.localeCompare(b.identifier)) })
  const pubQ = createQuery()
  let publishedDocs: ProjectTemplate[] = []
  pubQ.query(tracker.class.ProjectTemplate, {}, (r) => { publishedDocs = r })
  const fromDoc = (d: ProjectTemplate): Template => ({ id: d._id, name: d.name, emoji: d.emoji, category: d.category as Category, tagline: d.tagline, bullets: d.bullets, defaultManaged: d.defaultManaged, views: d.views, landing: d.landing, components: d.components, milestones: d.milestones, labels: d.labels, starters: d.starters, published: d._id, usage: d.usage })
  $: allTemplates = [...TEMPLATES, ...publishedDocs.map(fromDoc)]
  const canPublish = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  let publishing = false
  function publishFromProject (): void {
    showPopup(
      SelectPopup,
      { value: myProjects.map((p) => ({ id: p._id, text: `${p.identifier} · ${p.name}` })), searchable: myProjects.length > 6, width: 'large' },
      'top',
      (id: string | null | undefined) => {
        const p = myProjects.find((x) => x._id === id)
        if (p !== undefined) void publishProject(p)
      }
    )
  }
  async function publishProject (p: Project): Promise<void> {
    publishing = true
    try {
      const components: Component[] = await client.findAll(tracker.class.Component, { space: p._id })
      const milestones = await client.findAll(tracker.class.Milestone, { space: p._id })
      const now = Date.now()
      const open = statuses.filter((st) => st.category !== task.statusCategory.Won && st.category !== task.statusCategory.Lost).map((st) => st._id)
      const issues: Issue[] = await client.findAll(tracker.class.Issue, { space: p._id, ...(open.length > 0 ? { status: { $in: open } } : {}), attachedTo: tracker.ids.NoParent }, { limit: 15 })
      const compName = new Map(components.map((c) => [c._id, c.label]))
      await client.createDoc(tracker.class.ProjectTemplate, core.space.Workspace, {
        name: p.name,
        tagline: `Published from ${p.identifier} · ${p.name}`,
        category: 'Software',
        emoji: '📦',
        bullets: [`${components.length} components`, `${milestones.length} milestones`, `${issues.length} starter issues from the project's open work`],
        views: ['Board', 'List', 'Timeline'],
        landing: 'issues',
        defaultManaged: 'team',
        components: components.map((c) => c.label),
        milestones: milestones.map((m) => [m.label, Math.max(0, Math.round((m.targetDate - now) / 86400000))] as [string, number]),
        labels: [],
        starters: issues.map((i) => ({ title: i.title, priority: i.priority, component: i.component != null ? compName.get(i.component) : undefined })),
        source: p._id,
        usage: 0
      })
      category = 'Published'
    } finally {
      publishing = false
    }
  }
  async function duplicateTemplate (t: Template): Promise<void> {
    const d = publishedDocs.find((x) => x._id === t.published)
    if (d === undefined) return
    const { _id, _class, space, modifiedBy, modifiedOn, createdBy, createdOn, ...rest } = d as any
    await client.createDoc(tracker.class.ProjectTemplate, core.space.Workspace, { ...rest, name: `${d.name} (copy)`, usage: 0 })
  }
  async function unpublishTemplate (t: Template): Promise<void> {
    const d = publishedDocs.find((x) => x._id === t.published)
    if (d === undefined || !confirm(`Remove "${d.name}" from the gallery?`)) return
    await client.remove(d)
    if (picked.id === t.id) picked = TEMPLATES[0]
  }
  $: shown = allTemplates.filter((t) => (category === 'All' || (category === 'Favourites' ? favs.includes(t.id) : category === 'Published' ? t.published !== undefined : t.category === category)) && (search.trim() === '' || `${t.name} ${t.tagline} ${t.category} ${t.bullets.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())))

  let picked: Template = TEMPLATES[0]
  let managed: 'team' | 'company' = picked.defaultManaged
  let name = ''
  let identifier = ''
  let touchedId = false
  $: if (!touchedId) identifier = suggestId(name)
  function suggestId (n: string): string {
    const words = n.trim().split(/\s+/).filter((w) => w !== '')
    if (words.length === 0) return ''
    const s = words.length === 1 ? words[0].slice(0, 4) : words.map((w) => w[0]).join('').slice(0, 5)
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }
  function pick (t: Template): void {
    picked = t
    managed = t.defaultManaged
  }
  const starterCount = (t: Template): number => (t.starters ?? []).reduce((n, s) => n + 1 + (s.children?.length ?? 0), 0)

  // the workflow every template gets: the Issue type's statuses, shown by category
  let statuses: IssueStatus[] = []
  const CAT_CLASS: Record<string, string> = { [task.statusCategory.UnStarted]: 'st--backlog', [task.statusCategory.ToDo]: 'st--todo', [task.statusCategory.Active]: 'st--active', [task.statusCategory.Won]: 'st--done', [task.statusCategory.Lost]: 'st--lost' }
  onMount(async () => {
    const types = await client.findAll(task.class.ProjectType, { descriptor: tracker.descriptors.ProjectType })
    const ptype = types.find((t) => t._id === tracker.ids.ClassingProjectType) ?? types[0]
    if (ptype === undefined) return
    const taskTypes = await client.findAll(task.class.TaskType, { _id: { $in: ptype.tasks } })
    const issueType = taskTypes.find((t) => t.name === 'Issue') ?? taskTypes[0]
    const ids = (issueType?.statuses ?? []) as Ref<IssueStatus>[]
    statuses = ids.length > 0 ? await client.findAll(tracker.class.IssueStatus, { _id: { $in: ids } }) : []
    statuses.sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id))
  })

  let busy = false
  let progress = ''
  let error = ''
  let rootWidth = 0
  async function create (): Promise<void> {
    error = ''
    if (name.trim() === '' || identifier.trim() === '') {
      error = 'Name and key are required.'
      return
    }
    busy = true
    try {
      const key = identifier.toUpperCase()
      if ((await client.findOne(tracker.class.Project, { identifier: key })) !== undefined) throw new Error(`Key ${key} is already used.`)
      const types: ProjectType[] = await client.findAll(task.class.ProjectType, { descriptor: tracker.descriptors.ProjectType })
      const ptype = types.find((t) => t._id === tracker.ids.ClassingProjectType) ?? types[0]
      if (ptype === undefined) throw new Error('No project type found.')
      const taskTypes: TaskType[] = await client.findAll(task.class.TaskType, { _id: { $in: ptype.tasks } })
      const issueType = taskTypes.find((t) => t.name === 'Issue') ?? taskTypes[0]
      const epicType = taskTypes.find((t) => t.name === 'Epic') ?? issueType
      if (issueType === undefined) throw new Error('No issue type found.')
      const statusIds = (issueType.statuses ?? []) as Ref<IssueStatus>[]
      const allStatuses: IssueStatus[] = statusIds.length > 0 ? await client.findAll(tracker.class.IssueStatus, { _id: { $in: statusIds } }) : []
      const defaultStatus = statusIds[0] ?? ('' as Ref<IssueStatus>)
      const me = getCurrentAccount().uuid
      const t = picked

      progress = 'Creating the project…'
      const permissions: PermissionScheme | undefined = managed === 'company' ? { close: AccountRole.Maintainer, reopen: AccountRole.Maintainer, delete: AccountRole.Maintainer, moveSprint: AccountRole.Maintainer } : undefined
      const notify = t.id === 'servicedesk' || t.id === 'incident'
      const notificationScheme: NotificationScheme | undefined = notify ? { statusChanged: { assignee: true, reporter: true, watchers: true, others: false }, commented: { assignee: true, reporter: true, watchers: true, others: false } } : undefined
      const wipLimits: Record<Ref<IssueStatus>, number> | undefined = t.id === 'kanban' ? Object.fromEntries(allStatuses.filter((s) => s.category === task.statusCategory.Active).map((s) => [s._id, 5])) as Record<Ref<IssueStatus>, number> : undefined
      const sla: Record<string, number> | undefined =
        t.id === 'bugs' ? { [String(IssuePriority.Urgent)]: 24, [String(IssuePriority.High)]: 72, [String(IssuePriority.Medium)]: 168 }
          : t.id === 'servicedesk' ? { [String(IssuePriority.Urgent)]: 4, [String(IssuePriority.High)]: 24, [String(IssuePriority.Medium)]: 72, [String(IssuePriority.Low)]: 168 }
            : t.id === 'incident' ? { [String(IssuePriority.Urgent)]: 1, [String(IssuePriority.High)]: 4, [String(IssuePriority.Medium)]: 24 }
              : undefined
      const automation = t.id === 'scrum' || t.id === 'okr' || t.id === 'product' ? { parentFollowsChildren: true, startParentOnChildStart: true } : t.id === 'bugs' ? { assignComponentLead: true } : undefined

      const projectId = generateId<Project>()
      const data: Data<Project> = {
        name: name.trim(),
        description: `${t.name} project · ${managed === 'team' ? 'team-managed' : 'company-managed'}`,
        private: false,
        members: [me],
        owners: [me],
        archived: false,
        autoJoin: managed === 'team',
        identifier: key,
        sequence: 0,
        defaultIssueStatus: defaultStatus,
        defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
        type: ptype._id,
        projectTemplate: `${t.id}:${managed}`,
        ...(permissions !== undefined ? { permissions } : {}),
        ...(notificationScheme !== undefined ? { notificationScheme } : {}),
        ...(wipLimits !== undefined ? { wipLimits } : {}),
        ...(sla !== undefined ? { sla } : {}),
        ...(automation !== undefined ? { automation } : {})
      }
      await client.createDoc(tracker.class.Project, core.space.Space, data, projectId)
      await client.createMixin(projectId, tracker.class.Project, core.space.Space, ptype.targetClass, {})
      const project = await client.findOne(tracker.class.Project, { _id: projectId })
      if (project === undefined) throw new Error('The project was not created.')

      // structure: components, milestones, labels
      const componentIds = new Map<string, Ref<Component>>()
      for (const label of t.components ?? []) {
        progress = `Component ${label}…`
        componentIds.set(label, await client.createDoc(tracker.class.Component, projectId, { label, description: '', lead: null, comments: 0, attachments: 0 }))
      }
      const now = Date.now()
      for (const [label, days] of t.milestones ?? []) {
        progress = `Milestone ${label}…`
        await client.createDoc(tracker.class.Milestone, projectId, { label, description: '', status: MilestoneStatus.Planned, comments: 0, attachments: 0, startDate: now, targetDate: now + days * DAY })
      }
      const labelIds = new Map<string, { _id: Ref<any>, color: number }>()
      const colors = [11, 2, 5, 8, 14, 0, 3, 7]
      if ((t.labels ?? []).length > 0) {
        const existing = await client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue })
        for (const [k, title] of (t.labels ?? []).entries()) {
          progress = `Label ${title}…`
          const found = existing.find((e) => e.title.toLowerCase() === title.toLowerCase())
          if (found !== undefined) labelIds.set(title, { _id: found._id, color: found.color })
          else {
            const color = colors[k % colors.length]
            const _id = await client.createDoc(tags.class.TagElement, core.space.Workspace, { title, description: '', targetClass: tracker.class.Issue, color, category: tags.category.NoCategory } as any)
            labelIds.set(title, { _id, color })
          }
        }
      }

      if (t.id === 'scrum') await client.createDoc(tracker.class.Sprint, projectId, { name: 'Sprint 1', startDate: now, endDate: now + 14 * DAY, state: 'planned', carriedOverTo: null })
      if (t.id === 'servicedesk') {
        for (const rt of [
          { name: 'Bug report', description: 'Something is broken. Tell us what you expected and what happened.', priority: IssuePriority.High, slaHours: 24 },
          { name: 'Feature request', description: 'Something you wish the product did.', priority: IssuePriority.Medium, slaHours: 168 },
          { name: 'Question', description: 'How do I…?', priority: IssuePriority.Low, slaHours: 48 },
          { name: 'Access request', description: 'Need access to a system, a workspace or a document.', priority: IssuePriority.Medium, slaHours: 8 }
        ]) await client.createDoc(tracker.class.RequestType, projectId, rt)
      }

      // starter issues: epics with children where the template has them
      const total = starterCount(t)
      let n = 0
      const addLabels = async (issueId: Ref<Issue>, names: string[] | undefined): Promise<void> => {
        for (const l of names ?? []) {
          const tag = labelIds.get(l)
          if (tag === undefined) continue
          await client.addCollection(tags.class.TagReference, projectId, issueId, tracker.class.Issue, 'labels', { tag: tag._id, title: l, color: tag.color } as any)
        }
      }
      for (const s of t.starters ?? []) {
        n++
        progress = `Starter issue ${n} of ${total}…`
        const kind = s.epic === true ? epicType._id : issueType._id
        const component = s.component !== undefined ? componentIds.get(s.component) ?? null : null
        const id = await createIssueDoc(project, { title: s.title, status: defaultStatus, kind, priority: s.priority ?? IssuePriority.NoPriority, component }, s.description)
        await addLabels(id, s.labels)
        if ((s.children ?? []).length > 0) {
          const parent = await client.findOne(tracker.class.Issue, { _id: id })
          for (const c of s.children ?? []) {
            n++
            progress = `Starter issue ${n} of ${total}…`
            const cid = await createIssueDoc(project, { title: c, status: defaultStatus, kind: issueType._id, priority: IssuePriority.Medium, component }, undefined, parent)
            await addLabels(cid, s.labels?.filter((l) => l !== 'objective'))
          }
        }
      }

      if (t.published !== undefined) {
        const doc = publishedDocs.find((d) => d._id === t.published)
        if (doc !== undefined) await client.update(doc, { $inc: { usage: 1 } })
      }
      progress = 'Opening the project…'
      const loc = getCurrentLocation()
      navigate({ path: [loc.path[0], loc.path[1], 'tracker', projectId, t.landing] })
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      busy = false
      progress = ''
    }
  }
</script>

<div class="tg" class:tg--narrow={rootWidth > 0 && rootWidth < 900} bind:clientWidth={rootWidth}>
  <header class="tg__head">
    <div class="tg__titles">
      <span class="tg__title"><Label label={tracker.string.ProjectTemplates} /></span>
      <span class="tg__sub"><Label label={tracker.string.ProjectTemplatesHint} /></span>
    </div>
    <label class="search">{@html icon('filter')}<input placeholder="Search templates" bind:value={search} /></label>
    {#if canPublish}
      <button class="pub" disabled={publishing} title="Turn one of your projects into a template the whole team can start from" on:click={publishFromProject}>{@html icon('share')}<span>{publishing ? 'Publishing…' : 'Publish a project'}</span></button>
    {/if}
  </header>
  <div class="cats">
    {#each CATEGORIES as c}
      <button class="cat" class:cat--on={category === c} on:click={() => { category = c }}>{c}{#if c === 'Favourites' && favs.length > 0}<span class="cat__n">{favs.length}</span>{/if}</button>
    {/each}
  </div>

  <div class="tg__body">
    <div class="gallery">
      {#each shown as t, idx (t.id)}
        <button class="tcard motion-rise" style="--i: {Math.min(idx, 12)}" class:tcard--on={picked.id === t.id} on:click={() => { pick(t) }}>
          <span class="tcard__tile" style="background: {GRADIENT[t.category]}">{t.emoji}</span>
          <span class="tcard__fav" class:tcard__fav--on={favs.includes(t.id)} role="button" tabindex="-1" title={favs.includes(t.id) ? 'Remove from favourites' : 'Add to favourites'} on:click={(e) => { toggleFav(t.id, e) }} on:keydown|stopPropagation>{@html icon(favs.includes(t.id) ? 'starFilled' : 'star')}</span>
          <span class="tcard__name">{t.name}</span>
          <span class="tcard__tag">{t.tagline}</span>
          <span class="tcard__meta">{#if t.published !== undefined}<span class="chip chip--pub">Team · used {t.usage ?? 0}×</span>{/if}<span class="chip">{t.category}</span>{#if (t.components ?? []).length > 0}<span class="chip chip--soft">{t.components?.length} components</span>{/if}{#if starterCount(t) > 0}<span class="chip chip--soft">{starterCount(t)} starter issues</span>{/if}</span>
        </button>
      {/each}
      {#if shown.length === 0}
        <div class="none motion-pop">
          <span class="none__big">{category === 'Favourites' ? '⭐' : '🔍'}</span>
          <b>{category === 'Favourites' ? 'No favourites yet' : 'No template matches'}</b>
          <span class="muted">{category === 'Favourites' ? 'Star a template and it shows up here.' : `Nothing matches “${search}”. Try another word or another category.`}</span>
        </div>
      {/if}
    </div>

    <aside class="side motion-pop">
      <div class="side__hero">
        <span class="side__tile" style="background: {GRADIENT[picked.category]}">{picked.emoji}</span>
        <div class="side__titles">
          <span class="side__name">{picked.name}</span>
          <span class="muted">{picked.tagline}</span>
        </div>
      </div>

      {#if picked.published !== undefined}
        <div class="pubtools">
          <span class="muted">Published by your team{picked.usage !== undefined ? ` · used ${picked.usage}×` : ''}</span>
          {#if canPublish}
            <button class="lnk" on:click={() => { void duplicateTemplate(picked) }}>Duplicate</button>
            <button class="lnk lnk--bad" on:click={() => { void unpublishTemplate(picked) }}>Unpublish</button>
          {/if}
        </div>
      {/if}
      <section class="blk">
        <span class="blk__t">What you get</span>
        <ul class="bullets">{#each picked.bullets as b}<li>{b}</li>{/each}</ul>
      </section>

      <section class="blk">
        <span class="blk__t">Views</span>
        <div class="chips">{#each picked.views as v}<span class="chip">{v}</span>{/each}<span class="chip chip--soft">Summary</span><span class="chip chip--soft">Docs</span><span class="chip chip--soft">Dashboard</span><span class="chip chip--soft">Automation</span></div>
      </section>

      <section class="blk">
        <span class="blk__t">Workflow</span>
        {#if statuses.length > 0}
          <div class="flow">{#each statuses as s, k (s._id)}{#if k > 0}<span class="flow__arrow">›</span>{/if}<span class="st {CAT_CLASS[s.category ?? ''] ?? ''}">{s.name}</span>{/each}</div>
          <span class="muted">Edit statuses and transitions later in the project's Workflow tab.</span>
        {:else}
          <span class="muted">Loading the workflow…</span>
        {/if}
      </section>

      {#if (picked.components ?? []).length > 0}
        <section class="blk"><span class="blk__t">Components</span><div class="chips">{#each picked.components ?? [] as c}<span class="chip chip--soft">{c}</span>{/each}</div></section>
      {/if}
      {#if (picked.milestones ?? []).length > 0}
        <section class="blk"><span class="blk__t">Milestones</span><ul class="plain">{#each picked.milestones ?? [] as [label, days]}<li><span>{label}</span><span class="muted">in {days} day{days === 1 ? '' : 's'}</span></li>{/each}</ul></section>
      {/if}
      {#if (picked.labels ?? []).length > 0}
        <section class="blk"><span class="blk__t">Labels</span><div class="chips">{#each picked.labels ?? [] as l}<span class="chip chip--label">{l}</span>{/each}</div></section>
      {/if}
      {#if (picked.starters ?? []).length > 0}
        <section class="blk">
          <span class="blk__t">Starter issues · {starterCount(picked)}</span>
          <ul class="plain plain--tree">
            {#each picked.starters ?? [] as s}
              <li><span class="ico">{@html icon(s.epic === true ? 'epic' : 'issue')}</span><span>{s.title}</span></li>
              {#each s.children ?? [] as c}<li class="child"><span class="ico">{@html icon('subtask')}</span><span>{c}</span></li>{/each}
            {/each}
          </ul>
        </section>
      {/if}

      <section class="blk">
        <span class="blk__t">How it is managed</span>
        <label class="radio" class:radio--on={managed === 'team'}><input type="radio" bind:group={managed} value="team" /><span><b>Team-managed</b><small>Anyone in the project changes its workflow, fields and rules. Members auto-join.</small></span></label>
        <label class="radio" class:radio--on={managed === 'company'}><input type="radio" bind:group={managed} value="company" /><span><b>Company-managed</b><small>Owners and maintainers control workflow, permissions and schemes; closing, reopening, deleting and sprint moves need a maintainer.</small></span></label>
      </section>

      <section class="blk form">
        <label class="field"><span>Project name</span><input class="input" placeholder={picked.id === 'marketing' ? 'Spring launch' : picked.id === 'hiring' ? 'Q4 hiring' : 'Payments platform'} bind:value={name} on:keydown={(e) => { if (e.key === 'Enter') void create() }} /></label>
        <label class="field field--key"><span>Key</span><input class="input" placeholder="PAY" maxlength="5" bind:value={identifier} on:input={() => { touchedId = true }} /></label>
        <Button kind={'primary'} label={tracker.string.NewProject} loading={busy} disabled={busy || name.trim() === ''} on:click={() => { void create() }} />
        {#if progress !== ''}<span class="progress">{progress}</span>{/if}
        {#if error !== ''}<p class="err">{error}</p>{/if}
      </section>
    </aside>
  </div>
</div>

<style lang="scss">
  .tg { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.25rem 1.5rem 2rem; overflow: auto; height: 100%; }
  .tg__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .tg__titles { display: flex; flex-direction: column; gap: 0.15rem; }
  .tg__title { font-size: 1.35rem; font-weight: 700; color: var(--theme-caption-color); letter-spacing: -0.01em; }
  .tg__sub, .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); line-height: 1.4; }
  .search { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); color: var(--theme-dark-color); min-width: 16rem; :global(svg) { width: 0.95rem; height: 0.95rem; } input { flex: 1; border: none; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; } &:focus-within { border-color: var(--accent-brand); } }
  .cats { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .cat { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.8rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); } &--on { background: var(--accent-brand-soft); color: var(--accent-brand); font-weight: 600; } }
  .cat__n { padding: 0 0.4rem; border-radius: 999px; background: var(--accent-brand); color: #fff; font-size: 0.68rem; font-weight: 700; }

  .tg__body { display: grid; grid-template-columns: minmax(0, 1fr) 23rem; gap: 1.25rem; align-items: start; }
  .tg--narrow .tg__body { grid-template-columns: minmax(0, 1fr); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr)); gap: 0.75rem; }
  .tcard { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem; padding: 1rem; border: 1px solid var(--theme-divider-color); border-radius: 1rem; background: var(--theme-panel-color); text-align: left; font: inherit; color: var(--theme-content-color); cursor: pointer; transition: border-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
    &:hover { transform: translateY(-2px); box-shadow: var(--accent-glow); }
    &--on { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); } }
  .tcard__tile, .side__tile { display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 0.8rem; font-size: 1.35rem; color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 4px 10px rgba(0, 0, 0, 0.12); }
  .tcard__fav { position: absolute; top: 0.7rem; right: 0.7rem; display: inline-flex; padding: 0.25rem; border-radius: 0.4rem; color: var(--theme-trans-color); :global(svg) { width: 1rem; height: 1rem; } &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); } &--on { color: #f59e0b; } }
  .tcard__name { margin-top: 0.35rem; font-weight: 700; color: var(--theme-caption-color); font-size: 0.95rem; }
  .tcard__tag { font-size: 0.78rem; color: var(--theme-dark-color); line-height: 1.4; min-height: 2.2em; }
  .tcard__meta, .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.35rem; }
  .chip { display: inline-flex; align-items: center; padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--accent-brand-soft); color: var(--accent-brand); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.01em; &--soft { background: var(--theme-button-default); color: var(--theme-content-color); font-weight: 500; } &--label { background: var(--theme-bg-color); border: 1px solid var(--theme-divider-color); color: var(--theme-content-color); font-weight: 500; } }
  .none { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 2.5rem 1rem; border: 1px dashed var(--theme-divider-color); border-radius: 1rem; text-align: center; b { color: var(--theme-caption-color); } }
  .none__big { font-size: 2rem; }

  .side { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.1rem 1.2rem; border: 1px solid var(--theme-divider-color); border-radius: 1rem; background: var(--theme-panel-color); position: sticky; top: 0; }
  .tg--narrow .side { position: static; }
  .side__hero { display: flex; align-items: center; gap: 0.75rem; }
  .side__titles { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .side__name { font-size: 1.05rem; font-weight: 700; color: var(--theme-caption-color); }
  .blk { display: flex; flex-direction: column; gap: 0.4rem; padding-top: 0.75rem; border-top: 1px solid var(--theme-divider-color); }
  .blk__t { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--theme-dark-color); }
  .bullets { margin: 0; padding-left: 1.1rem; font-size: 0.8375rem; color: var(--theme-content-color); line-height: 1.55; }
  .plain { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8375rem; color: var(--theme-content-color); li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; } &--tree li { justify-content: flex-start; } .child { padding-left: 1.2rem; color: var(--theme-dark-color); } }
  .ico { display: inline-flex; flex: none; :global(svg) { width: 0.9rem; height: 0.9rem; } }
  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
  .flow__arrow { color: var(--theme-trans-color); font-size: 0.9rem; }
  .st { padding: 0.15rem 0.55rem; border-radius: 0.35rem; font-size: 0.72rem; font-weight: 600; background: var(--theme-button-default); color: var(--theme-content-color);
    &--backlog { background: rgba(120, 128, 140, 0.16); }
    &--todo { background: rgba(59, 130, 246, 0.16); color: #2563eb; }
    &--active { background: rgba(245, 158, 11, 0.18); color: #b45309; }
    &--done { background: rgba(34, 197, 94, 0.18); color: #15803d; }
    &--lost { background: rgba(244, 63, 94, 0.16); color: #be123c; } }
  .radio { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.55rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; cursor: pointer; font-size: 0.8375rem; color: var(--theme-content-color); &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); } input { margin-top: 0.2rem; } span { display: flex; flex-direction: column; gap: 0.1rem; } b { color: var(--theme-caption-color); } small { font-size: 0.72rem; color: var(--theme-dark-color); line-height: 1.4; } }
  .form { flex-direction: row; align-items: flex-end; flex-wrap: wrap; gap: 0.6rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 10rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); &--key { flex: 0; min-width: 5.5rem; } }
  .input { padding: 0.5rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.9375rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .progress { width: 100%; font-size: 0.78rem; color: var(--accent-brand); font-weight: 600; }
  .err { margin: 0; width: 100%; font-size: 0.8125rem; color: var(--negative-button-default); }
  .pub { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.8rem; border: none; border-radius: 0.5rem; background: var(--primary-button-default); color: #fff; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; :global(svg) { width: 0.9rem; height: 0.9rem; } &:disabled { opacity: 0.6; cursor: default; } }
  .chip--pub { background: #dcfce7 !important; color: #166534 !important; }
  .pubtools { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; font-size: 0.78rem; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.78rem; cursor: pointer; &--bad { color: var(--negative-button-default); } }
</style>
