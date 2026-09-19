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

// Page templates for Documents: the structure of the pages teams write again
// and again (PRDs, meeting notes, decision records, postmortems…). Each one is
// built as the editor's own JSON document and serialised to Markup, so a new
// page opens already laid out with headings, checklists and prompts, ready to
// be edited like any other page.

import { type Markup } from '@hcengineering/core'

interface Node {
  type: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: Array<{ type: string, attrs?: Record<string, unknown> }>
}

export type DocTemplateCategory = 'Product' | 'Engineering' | 'Meetings' | 'Team'

export interface DocTemplate {
  id: string
  name: string
  emoji: string
  category: DocTemplateCategory
  tagline: string
}

const text = (t: string, ...marks: string[]): Node => ({ type: 'text', text: t, ...(marks.length > 0 ? { marks: marks.map((m) => ({ type: m })) } : {}) })
const p = (...parts: Array<string | Node>): Node => ({ type: 'paragraph', content: parts.map((x) => (typeof x === 'string' ? text(x) : x)) })
const h = (level: number, t: string): Node => ({ type: 'heading', attrs: { level }, content: [text(t)] })
const li = (t: string): Node => ({ type: 'listItem', content: [p(t)] })
const ul = (...items: string[]): Node => ({ type: 'bulletList', content: items.map(li) })
const ol = (...items: string[]): Node => ({ type: 'orderedList', content: items.map(li) })
const todo = (...items: string[]): Node => ({ type: 'todoList', content: items.map((t) => ({ type: 'todoItem', attrs: { checked: false }, content: [p(t)] })) })
const quote = (t: string): Node => ({ type: 'blockquote', content: [p(text(t, 'italic'))] })
const hr = (): Node => ({ type: 'horizontalRule' })
const kv = (...pairs: Array<[string, string]>): Node[] => pairs.map(([k, v]) => p(text(`${k}: `, 'bold'), v))

function today (): string {
  return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export const DOC_TEMPLATES: DocTemplate[] = [
  { id: 'blank', name: 'Blank page', emoji: '📄', category: 'Product', tagline: 'Start from nothing.' },
  { id: 'prd', name: 'Product requirements', emoji: '🎯', category: 'Product', tagline: 'Problem, goals, users, requirements, launch plan.' },
  { id: 'spec', name: 'Technical spec', emoji: '🛠️', category: 'Engineering', tagline: 'Context, design, alternatives, rollout, risks.' },
  { id: 'decision', name: 'Decision record', emoji: '⚖️', category: 'Engineering', tagline: 'One decision, its options and consequences.' },
  { id: 'postmortem', name: 'Incident postmortem', emoji: '🚨', category: 'Engineering', tagline: 'Timeline, impact, root cause, action items.' },
  { id: 'meeting', name: 'Meeting notes', emoji: '📝', category: 'Meetings', tagline: 'Agenda, notes, decisions, action items.' },
  { id: 'retro', name: 'Retrospective', emoji: '🔁', category: 'Meetings', tagline: 'Went well, could improve, actions.' },
  { id: 'oneonone', name: '1:1 notes', emoji: '☕', category: 'Meetings', tagline: 'Running notes for a recurring one-to-one.' },
  { id: 'weekly', name: 'Weekly update', emoji: '📣', category: 'Team', tagline: 'Highlights, metrics, risks, next week.' },
  { id: 'onboarding', name: 'Onboarding guide', emoji: '🚀', category: 'Team', tagline: 'First day, first week, first month.' },
  { id: 'runbook', name: 'Runbook', emoji: '📗', category: 'Engineering', tagline: 'How to operate a system when it pages you.' },
  { id: 'brief', name: 'Project brief', emoji: '🧭', category: 'Product', tagline: 'Why, what, who, when, how we will know.' }
]

function body (id: string): Node[] | null {
  switch (id) {
    case 'prd':
      return [
        ...kv(['Status', 'Draft'], ['Owner', ''], ['Last updated', today()]),
        h(2, 'Problem'), p('What is broken or missing today, for whom, and how do we know? Quote real users where you can.'),
        h(2, 'Goals'), ul('Goal 1 — measurable outcome', 'Goal 2', 'Goal 3'),
        h(2, 'Non-goals'), ul('What this deliberately does not do'),
        h(2, 'Users and use cases'), ul('Persona → job to be done → today\'s workaround'),
        h(2, 'Requirements'), ol('Must: …', 'Must: …', 'Should: …', 'Could: …'),
        h(2, 'Success metrics'), ul('Leading indicator', 'Lagging indicator', 'Guardrail'),
        h(2, 'Launch plan'), todo('Design review', 'Engineering estimate', 'Beta to 10 customers', 'General availability'),
        h(2, 'Open questions'), ul('…')
      ]
    case 'spec':
      return [
        ...kv(['Status', 'Proposal'], ['Author', ''], ['Reviewers', ''], ['Date', today()]),
        h(2, 'Context'), p('The problem, the constraints and what already exists.'),
        h(2, 'Goals'), ul('…'),
        h(2, 'Proposed design'), p('Data model, APIs, components, sequence of operations. Diagrams welcome.'),
        h(2, 'Alternatives considered'), ul('Option A — why not', 'Option B — why not'),
        h(2, 'Rollout'), todo('Behind a feature flag', 'Migration plan', 'Monitoring and alerts', 'Rollback path'),
        h(2, 'Risks and mitigations'), ul('Risk → mitigation'),
        h(2, 'Testing'), ul('Unit', 'Integration', 'Load'),
        h(2, 'Open questions'), ul('…')
      ]
    case 'decision':
      return [
        ...kv(['Status', 'Proposed'], ['Deciders', ''], ['Date', today()]),
        h(2, 'Context'), p('What forces are at play: technical, product, team, cost.'),
        h(2, 'Decision'), quote('We will …'),
        h(2, 'Options considered'), ol('Option 1 — pros / cons', 'Option 2 — pros / cons', 'Option 3 — pros / cons'),
        h(2, 'Consequences'), ul('Easier: …', 'Harder: …', 'Follow-ups: …')
      ]
    case 'postmortem':
      return [
        ...kv(['Severity', 'SEV-2'], ['Incident start', ''], ['Resolved', ''], ['Owner', ''], ['Status', 'Draft']),
        h(2, 'Summary'), p('Two or three sentences a customer could read.'),
        h(2, 'Impact'), ul('Who was affected, for how long, how many requests or customers'),
        h(2, 'Timeline'), ol('hh:mm — first alert', 'hh:mm — incident declared', 'hh:mm — mitigation', 'hh:mm — resolved'),
        h(2, 'Root cause'), p('The chain of causes, not the person.'),
        h(2, 'What went well'), ul('…'),
        h(2, 'What went badly'), ul('…'),
        h(2, 'Action items'), todo('Prevent recurrence — owner, due', 'Detect faster — owner, due', 'Recover faster — owner, due'),
        h(2, 'Lessons'), ul('…')
      ]
    case 'meeting':
      return [
        ...kv(['Date', today()], ['Attendees', ''], ['Facilitator', '']),
        h(2, 'Agenda'), ol('Topic 1 — 10 min', 'Topic 2 — 15 min', 'Any other business'),
        h(2, 'Notes'), ul('…'),
        h(2, 'Decisions'), ul('…'),
        h(2, 'Action items'), todo('Action — owner — due date', 'Action — owner — due date')
      ]
    case 'retro':
      return [
        ...kv(['Sprint / period', ''], ['Date', today()], ['Team', '']),
        h(2, 'What went well'), ul('…'),
        h(2, 'What could be better'), ul('…'),
        h(2, 'Ideas to try'), ul('…'),
        h(2, 'Actions we commit to'), todo('Action — owner', 'Action — owner'),
        hr(),
        p(text('Last retro\'s actions: ', 'bold'), 'done / carried over')
      ]
    case 'oneonone':
      return [
        p(text('Recurring notes. Newest at the top; keep the parking lot at the bottom.', 'italic')),
        h(2, today()),
        h(3, 'How are things'), ul('…'),
        h(3, 'Wins'), ul('…'),
        h(3, 'Blockers and support needed'), ul('…'),
        h(3, 'Growth'), ul('…'),
        h(3, 'Actions'), todo('…'),
        hr(),
        h(2, 'Parking lot'), ul('Topics for a later session')
      ]
    case 'weekly':
      return [
        ...kv(['Week of', today()], ['Team', ''], ['Mood', '🟢 on track']),
        h(2, 'Highlights'), ul('Shipped: …', 'Learned: …'),
        h(2, 'Metrics'), ul('Metric — this week vs last week'),
        h(2, 'Risks and asks'), ul('Risk → what we need'),
        h(2, 'Next week'), todo('…', '…')
      ]
    case 'onboarding':
      return [
        p('Welcome! This page is your map for the first weeks. Tick things off as you go; ask your buddy anything.'),
        h(2, 'Day 1'), todo('Accounts and hardware set up', 'Meet your buddy and manager', 'Read the team charter', 'Join the team channels'),
        h(2, 'Week 1'), todo('Dev environment running', 'Ship a small change', 'Shadow a customer call', 'Read the architecture overview'),
        h(2, 'Month 1'), todo('Own a small project', '30-day check-in with your manager', 'Present something you learned'),
        h(2, 'Who to ask'), ul('Product questions → …', 'Infra and access → …', 'Payroll and benefits → …'),
        h(2, 'Useful links'), ul('…')
      ]
    case 'runbook':
      return [
        ...kv(['System', ''], ['Owner', ''], ['On-call channel', ''], ['Dashboards', '']),
        h(2, 'What it does'), p('One paragraph a new on-call engineer can read at 3 a.m.'),
        h(2, 'Health checks'), ul('Endpoint / query → expected value'),
        h(2, 'Common alerts'), h(3, 'Alert name'), ul('Meaning', 'First checks', 'Fix'),
        h(2, 'Procedures'), h(3, 'Restart'), ol('…'), h(3, 'Roll back'), ol('…'), h(3, 'Scale'), ol('…'),
        h(2, 'Escalation'), ul('Who, when, how')
      ]
    case 'brief':
      return [
        ...kv(['Owner', ''], ['Status', 'Draft'], ['Target date', ''], ['Date', today()]),
        h(2, 'Why now'), p('The opportunity or pain, in one paragraph.'),
        h(2, 'What we will build'), ul('Scope in', 'Scope out'),
        h(2, 'Who is involved'), ul('Sponsor', 'Lead', 'Team', 'Stakeholders'),
        h(2, 'How we will know it worked'), ul('Metric and target'),
        h(2, 'Milestones'), todo('Kickoff', 'First demo', 'Launch'),
        h(2, 'Risks'), ul('…')
      ]
    default:
      return null
  }
}

/** The template's content as Markup, or null for a blank page. */
export function docTemplateMarkup (id: string): Markup | null {
  const content = body(id)
  if (content === null) return null
  return JSON.stringify({ type: 'doc', content })
}
