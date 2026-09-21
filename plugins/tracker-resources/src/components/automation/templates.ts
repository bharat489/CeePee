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

// A starter library of automation rules. A template is a rule with status
// placeholders ("{{status:done}}") that are resolved against the project's own
// workflow when it is installed, so the same template fits any project.

import core, { type Data, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import task, { type ProjectType } from '@hcengineering/task'
import { IssuePriority, type AutomationRule, type IssueStatus, type Project } from '@hcengineering/tracker'

import tracker from '../../plugin'

export type TemplateCategory = 'Triage' | 'Flow' | 'Hygiene' | 'Announce'

export interface AutomationTemplate {
  id: string
  name: string
  tagline: string
  category: TemplateCategory
  emoji: string
  /** Something the person must fill in before the rule can run; installed disabled. */
  needs?: string
  rule: Pick<AutomationRule, 'trigger' | 'conditions' | 'actions'> & Partial<Pick<AutomationRule, 'every' | 'scope' | 'at' | 'days'>>
}

const P = IssuePriority

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'triage-new',
    name: 'Triage every new issue',
    tagline: 'Unassigned new issues get a triage label and a thank-you comment.',
    category: 'Triage',
    emoji: '🩺',
    rule: {
      trigger: 'created',
      conditions: [{ field: 'assignee', op: 'empty' }],
      actions: [
        { type: 'add-label', value: 'triage' },
        { type: 'add-comment', value: 'Thanks for filing this. It is in triage and will be picked up shortly.' }
      ]
    }
  },
  {
    id: 'urgent-due',
    name: 'Urgent means due tomorrow',
    tagline: 'When priority becomes Urgent, the due date is set to one day out.',
    category: 'Triage',
    emoji: '🚨',
    rule: {
      trigger: 'priority',
      conditions: [{ field: 'priority', op: 'is', value: String(P.Urgent) }],
      actions: [{ type: 'set-due', value: '1' }]
    }
  },
  {
    id: 'start-on-assign',
    name: 'Start work when assigned',
    tagline: 'An issue in To do moves to In progress the moment someone takes it.',
    category: 'Flow',
    emoji: '▶️',
    rule: {
      trigger: 'assignee',
      conditions: [{ field: 'status', op: 'is', value: '{{status:todo}}' }, { field: 'assignee', op: 'not-empty' }],
      actions: [{ type: 'set-status', value: '{{status:active}}' }]
    }
  },
  {
    id: 'comment-after-done',
    name: 'Flag comments on closed issues',
    tagline: 'A new comment on a done issue adds a "reopen?" label so it is not missed.',
    category: 'Flow',
    emoji: '🔁',
    rule: {
      trigger: 'commented',
      conditions: [{ field: 'status', op: 'is', value: '{{status:done}}' }],
      actions: [{ type: 'add-label', value: 'reopen?' }]
    }
  },
  {
    id: 'escalate-overdue',
    name: 'Escalate overdue work',
    tagline: 'Every morning, overdue issues become Urgent and get a comment.',
    category: 'Hygiene',
    emoji: '⏰',
    rule: {
      trigger: 'scheduled',
      scope: 'overdue',
      at: '09:00',
      days: [1, 2, 3, 4, 5],
      conditions: [],
      actions: [
        { type: 'set-priority', value: String(P.Urgent) },
        { type: 'add-comment', value: 'This issue is past its due date and has been escalated.' }
      ]
    }
  },
  {
    id: 'stale-nudge',
    name: 'Nudge stale issues',
    tagline: 'Issues untouched for a week get a "stale" label and a gentle comment.',
    category: 'Hygiene',
    emoji: '🍂',
    rule: {
      trigger: 'scheduled',
      scope: 'stale7',
      every: 1440,
      conditions: [],
      actions: [
        { type: 'add-label', value: 'stale' },
        { type: 'add-comment', value: 'No activity for a week. Still relevant? Update it or close it.' }
      ]
    }
  },
  {
    id: 'due-soon-remind',
    name: 'Remind three days before due',
    tagline: 'A daily comment on issues due within three days that are still open.',
    category: 'Hygiene',
    emoji: '📅',
    rule: {
      trigger: 'scheduled',
      scope: 'due3',
      at: '08:30',
      days: [1, 2, 3, 4, 5],
      conditions: [],
      actions: [{ type: 'add-comment', value: 'Due in the next three days.' }]
    }
  },
  {
    id: 'unassigned-high',
    name: 'High priority needs an owner',
    tagline: 'Unassigned High or Urgent issues are labelled "needs-owner" every morning.',
    category: 'Hygiene',
    emoji: '🙋',
    rule: {
      trigger: 'scheduled',
      scope: 'unassigned',
      at: '09:15',
      days: [1, 2, 3, 4, 5],
      conditions: [{ field: 'priority', op: 'is', value: String(P.High) }],
      actions: [{ type: 'add-label', value: 'needs-owner' }]
    }
  },
  {
    id: 'done-to-slack',
    name: 'Announce finished work in Slack',
    tagline: 'Every issue that reaches Done is posted to a Slack channel.',
    category: 'Announce',
    emoji: '📣',
    needs: 'the Slack incoming-webhook URL',
    rule: {
      trigger: 'status',
      conditions: [{ field: 'status', op: 'is', value: '{{status:done}}' }],
      actions: [{ type: 'slack', value: 'Done: {identifier} {title}', url: '' }]
    }
  },
  {
    id: 'urgent-to-teams',
    name: 'Page the team on Urgent',
    tagline: 'A new Urgent issue is posted to Microsoft Teams right away.',
    category: 'Announce',
    emoji: '📟',
    needs: 'the Teams incoming-webhook URL',
    rule: {
      trigger: 'created',
      conditions: [{ field: 'priority', op: 'is', value: String(P.Urgent) }],
      actions: [{ type: 'teams', value: 'Urgent: {identifier} {title}', url: '' }]
    }
  },
  {
    id: 'subtasks-for-epics',
    name: 'Standard sub-tasks for new epics',
    tagline: 'A new Epic gets Design, Build and Verify sub-issues.',
    category: 'Flow',
    emoji: '🧩',
    rule: {
      trigger: 'created',
      conditions: [{ field: 'kind', op: 'contains', value: 'Epic' }],
      actions: [{ type: 'create-subtasks', value: 'Design\nBuild\nVerify' }]
    }
  }
]

/** The project's statuses by category, for resolving placeholders. */
async function statusMap (project: Project): Promise<Record<string, Ref<IssueStatus> | undefined>> {
  const client = getClient()
  const ptype: ProjectType | undefined = await client.findOne(task.class.ProjectType, { _id: project.type })
  const ids = (ptype?.statuses ?? []).map((s) => s._id as Ref<IssueStatus>)
  const statuses: IssueStatus[] = ids.length > 0 ? await client.findAll(tracker.class.IssueStatus, { _id: { $in: ids } }) : []
  statuses.sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id))
  const first = (cat: string): Ref<IssueStatus> | undefined => statuses.find((s) => s.category === cat)?._id
  return {
    backlog: first(task.statusCategory.UnStarted),
    todo: first(task.statusCategory.ToDo) ?? first(task.statusCategory.UnStarted),
    active: first(task.statusCategory.Active),
    done: first(task.statusCategory.Won),
    cancelled: first(task.statusCategory.Lost)
  }
}

function fill (value: string | undefined, statuses: Record<string, Ref<IssueStatus> | undefined>): string | undefined {
  if (value === undefined) return undefined
  return value.replace(/\{\{status:(\w+)\}\}/g, (_, k: string) => statuses[k] ?? '')
}

/** The rule a template becomes in one project, placeholders resolved. */
export async function ruleFromTemplate (t: AutomationTemplate, project: Project): Promise<Data<AutomationRule>> {
  const statuses = await statusMap(project)
  return {
    name: t.name,
    enabled: t.needs === undefined,
    trigger: t.rule.trigger,
    conditions: t.rule.conditions.map((c) => ({ ...c, value: fill(c.value, statuses) })).filter((c) => c.op === 'empty' || c.op === 'not-empty' || (c.value ?? '') !== ''),
    actions: t.rule.actions.map((a) => ({ ...a, value: fill(a.value, statuses) })),
    runs: 0,
    ...(t.rule.every !== undefined ? { every: t.rule.every } : {}),
    ...(t.rule.scope !== undefined ? { scope: t.rule.scope } : {}),
    ...(t.rule.at !== undefined ? { at: t.rule.at, tz: -new Date().getTimezoneOffset() } : {}),
    ...(t.rule.days !== undefined ? { days: t.rule.days } : {})
  }
}

export async function installTemplate (t: AutomationTemplate, project: Project): Promise<Ref<AutomationRule>> {
  const client = getClient()
  const data = await ruleFromTemplate(t, project)
  return await client.createDoc(tracker.class.AutomationRule, project._id, data)
}

/** Copy this project's rules into other projects; rules with the same name there are left alone. */
export async function copyRules (rules: AutomationRule[], targets: Project[]): Promise<number> {
  const client = getClient()
  let copied = 0
  for (const target of targets) {
    const existing = new Set((await client.findAll(tracker.class.AutomationRule, { space: target._id })).map((r) => r.name))
    for (const r of rules) {
      if (existing.has(r.name)) continue
      const { _id, _class, space, modifiedBy, modifiedOn, createdBy, createdOn, runs, lastRun, lastError, lastWebhook, lastPayload, lastMatched, token, ...rest } = r as any
      await client.createDoc(tracker.class.AutomationRule, target._id, { ...rest, runs: 0, lastError: null })
      copied++
    }
  }
  return copied
}

export const workspaceSpace = core.space.Workspace
