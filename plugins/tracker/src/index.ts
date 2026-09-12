//
// Copyright © 2022-2023 Hardcore Engineering Inc.
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

import type { AccountRole, AccountUuid } from '@hcengineering/core'
import { Employee, Person } from '@hcengineering/contact'
import { Department } from '@hcengineering/hr'
import {
  AttachedDoc,
  Attribute,
  Class,
  MarkupBlobRef,
  CollectionSize,
  Data,
  Doc,
  Markup,
  Mixin,
  Ref,
  RelatedDocument,
  Space,
  Status,
  Timestamp,
  Type,
  type Permission,
  type AccountUuid
} from '@hcengineering/core'
import { Asset, IntlString, Plugin, Resource, plugin } from '@hcengineering/platform'
import { CommonInboxNotification } from '@hcengineering/notification'
import { Preference } from '@hcengineering/preference'
import { TagCategory, TagElement, TagReference } from '@hcengineering/tags'
import { ToDo } from '@hcengineering/time'
import {
  ProjectType,
  ProjectTypeDescriptor,
  Task,
  Project as TaskProject,
  TaskStatusFactory,
  TaskType,
  TaskTypeDescriptor
} from '@hcengineering/task'
import { AnyComponent, ComponentExtensionId, Location, ResolvedLocation } from '@hcengineering/ui'
import { Action, ActionCategory, IconProps } from '@hcengineering/view'

export * from './analytics'

/**
 * @public
 */
export interface IssueStatus extends Status {}

/**
 * @public
 *
 * Working-days calendar configuration for a Project.
 *
 * When set, the Gantt scheduler and critical-path treat lag and slack in
 * *working days* rather than calendar days; non-working days are rendered
 * with a slight background tint in the Gantt canvas.
 *
 * Absence of this field (= `undefined`) is the legacy mode and means
 * "every day is a working day" (calendar-days semantics). There is no
 * silent migration — the user must opt in by setting this property
 * explicitly.
 */
export interface WorkingDaysConfig {
  /**
   * Bitmask of active weekdays.
   *
   *   bit 0 = Mon, bit 1 = Tue, …, bit 5 = Sat, bit 6 = Sun.
   *
   *   Mon–Fri   = 0b0011111 = 31
   *   Mon–Sat   = 0b0111111 = 63
   *   All days  = 0b1111111 = 127
   *
   * Holiday DATES are intentionally NOT stored in this config: they come
   * from the HR calendar (`hr.class.PublicHoliday`) of the department
   * selected via `holidayDepartment` (plus all ancestor departments) and
   * are resolved by the Gantt adapter in tracker-resources — see review
   * #10992 (avoid duplicating the HR holiday concept per project).
   */
  weekdayMask: number

  /**
   * Optional HR department whose public-holiday calendar applies to this
   * project. Semantics mirror hr-resources' schedule view: the department's
   * own holidays PLUS those of all ancestor departments count as
   * non-working.
   *
   * `undefined` means "company-wide": only the root department's calendar
   * (`hr.ids.Head` in the hr plugin) is used. A stale ref to a deleted
   * department falls back to the root as well — never to a union across
   * departments.
   *
   * Typed as an opaque `Ref<Doc>` on purpose: the tracker declaration
   * package must not depend on the optional hr module (model-optional
   * runtime integration). The precise `Ref<Department>` typing lives in
   * tracker-resources, which already depends on the hr declaration package.
   */
  holidayDepartment?: Ref<Doc>
}

/**
 * @public
 */
export interface Project extends TaskProject, IconProps {
  identifier: string // Project identifier
  sequence: number
  defaultIssueStatus?: Ref<IssueStatus>
  defaultAssignee?: Ref<Employee>
  defaultTimeReportDay: TimeReportDayType
  /**
   * Optional Gantt working-days calendar. See {@link WorkingDaysConfig}.
   * `undefined` means "every day is a working day" (legacy behaviour).
   */
  workingDaysConfig?: WorkingDaysConfig
  /**
   * Work-in-progress limit per status for the board. Absent means no limit.
   * The board shows count/limit and flags a column that is over.
   */
  wipLimits?: Record<Ref<IssueStatus>, number>
  /** Automation rules for this project. */
  automation?: ProjectAutomation
  /** Hours to resolve, keyed by IssuePriority as a string. Absent = no SLA. */
  sla?: Record<string, number>
  /** Minimum role per action; see PermissionScheme. */
  permissions?: PermissionScheme
  /** Event kinds this project delivers; see NotificationScheme. */
  notificationScheme?: NotificationScheme
  /** Template the project was created from, e.g. "scrum:team". */
  projectTemplate?: string
  quickFilters?: QuickFilter[]
  cardColors?: CardColorRule[]
  slaCalendar?: SlaCalendar
  portal?: PortalSettings
  freezeWindows?: FreezeWindow[]
  /** Per-project field overrides keyed by attribute name. */
  fieldContext?: Record<string, FieldContext>
  statusPage?: StatusPageSettings
}

/**
 * Automation rules: each is one sentence, on or off. Enforced by a server
 * trigger so API writes and imports get the same behaviour as the UI.
 * @public
 */
export interface ProjectAutomation {
  assignComponentLead?: boolean
  parentFollowsChildren?: boolean
  startParentOnChildStart?: boolean
  /** Development flow: move the issue when a branch appears, a PR opens, a PR merges. */
  branchStatus?: Ref<IssueStatus> | null
  prOpenStatus?: Ref<IssueStatus> | null
  prMergeStatus?: Ref<IssueStatus> | null
}

/** Minimum workspace role needed for an action. Absent = any member. Owners are never restricted. @public */
export interface PermissionScheme {
  close?: AccountRole
  reopen?: AccountRole
  delete?: AccountRole
  reassign?: AccountRole
  changePriority?: AccountRole
  editEstimates?: AccountRole
  editDates?: AccountRole
  moveSprint?: AccountRole
}

/** Who receives an event kind. Absent = everyone the platform would notify. @public */
export interface NotificationRecipients {
  assignee?: boolean
  reporter?: boolean
  watchers?: boolean
  others?: boolean
}
/** false switches an event kind off for the project; an object picks recipients. @public */
export interface NotificationScheme {
  assigned?: boolean | NotificationRecipients
  statusChanged?: boolean | NotificationRecipients
  commented?: boolean | NotificationRecipients
  mentioned?: boolean | NotificationRecipients
  otherChanges?: boolean | NotificationRecipients
}

/** @public */
export type WebhookEvent = 'issue.created' | 'issue.updated' | 'issue.status' | 'issue.deleted'

/**
 * An outbound webhook. Workspace-wide: receives events for every project.
 * @public
 */
export interface Webhook extends Doc {
  name: string
  url: string
  secret?: string
  events: WebhookEvent[]
  enabled: boolean
  /** slack: post a Slack-style {text} message instead of the JSON payload. */
  format?: 'json' | 'slack'
  lastStatus?: number
  lastDeliveredOn?: Timestamp
  lastError?: string | null
}

/** @public */
export interface DashboardWidget {
  id: string
  type: string
  params?: Record<string, any>
}

/** A dashboard: a named list of widgets, private unless shared. @public */
export interface Dashboard extends Doc {
  name: string
  owner: Ref<Person>
  shared: boolean
  widgets: DashboardWidget[]
}

/** One person, one week: submitted, approved or rejected. @public */
export interface TimesheetApproval extends Doc {
  employee: Ref<Employee>
  weekStart: Timestamp
  state: 'submitted' | 'approved' | 'rejected'
  approver?: Ref<Person>
  note?: string
  decidedOn?: Timestamp
}

/** @public */
export interface BillingRate extends Doc {
  employee: Ref<Employee>
  rate: number
  currency: string
}

/** An administrative action that bypassed the document store. @public */
export interface AuditEvent extends Doc {
  kind: string
  actor?: Ref<Person>
  target: string
  details: string
}

/** @public */
export interface AuditPolicy extends Doc {
  /** 0 = keep forever */
  retentionDays: number
}

/** What a customer can ask for. @public */
export interface RequestType extends Doc {
  space: Ref<Project>
  name: string
  description: string
  priority: IssuePriority
  slaHours?: number
  /** Service request, incident, change or problem; drives the panels an issue shows. */
  kind?: 'request' | 'incident' | 'change' | 'problem'
  /** New requests of this type wait for approval before work starts. */
  requiresApproval?: boolean
  approvers?: Ref<Person>[]
  /** Default severity for incidents (1 = highest). */
  defaultSeverity?: number
}

/** Business hours an SLA clock runs in. Hours are in the calendar's own offset. @public */
export interface SlaCalendar {
  /** Minutes east of UTC, e.g. 330 for India. */
  timezoneOffset: number
  /** 0 = Sunday … 6 = Saturday. */
  workdays: number[]
  startHour: number
  endHour: number
  /** YYYY-MM-DD dates that do not count. */
  holidays: string[]
}
/** Public help centre settings for one project; served by the integrations service at /portal/<slug>. @public */
export interface PortalSettings {
  enabled: boolean
  slug: string
  name: string
  color: string
  logoUrl?: string
  welcome?: string
}
/** Per-project override of how a field behaves. @public */
export interface FieldContext {
  hidden?: boolean
  required?: boolean
  label?: string
}
/** @public */
export interface ApprovalDecision {
  person: Ref<Person>
  ok: boolean
  at: Timestamp
  note?: string
}
/** @public */
export interface ApprovalState {
  state: 'pending' | 'approved' | 'rejected'
  approvers: Ref<Person>[]
  decisions: ApprovalDecision[]
  requestedOn: Timestamp
}
/** A board chip that narrows cards to a query. @public */
export interface QuickFilter {
  name: string
  query: string
}
/** Cards matching the query get the colour. @public */
export interface CardColorRule {
  query: string
  color: string
}
/** Changes may not start inside a freeze window. @public */
export interface FreezeWindow {
  start: Timestamp
  end: Timestamp
  reason: string
}
/** @public */
export interface TimelineEntry {
  at: Timestamp
  text: string
  by?: string
  /** Shown on the public status page. */
  public?: boolean
}

/** One evaluation of an automation rule. @public */
export interface AutomationRun extends Doc {
  space: Ref<Project>
  rule: Ref<AutomationRule>
  ruleName: string
  trigger: string
  issue?: Ref<Issue>
  identifier?: string
  at: Timestamp
  ok: boolean
  matched: number
  actions: string[]
  error?: string
}
/** A named query; shared ones show for everyone. @public */
export interface SavedQuery extends Doc {
  name: string
  text: string
  owner: Ref<Employee>
  shared: boolean
}
/** A scheduled email of a saved query's results or a dashboard's headline numbers. @public */
export interface QuerySubscription extends Doc {
  name: string
  kind: 'query' | 'dashboard'
  query?: string
  savedQuery?: Ref<SavedQuery>
  dashboard?: Ref<Dashboard>
  schedule: 'daily' | 'weekly'
  hour: number
  weekday?: number
  recipients: string[]
  owner: Ref<Employee>
  enabled: boolean
  lastSent?: Timestamp
  lastError?: string
}
/** A message on a request that the customer sees in the portal. Everything else stays internal. @public */
export interface CustomerReply extends AttachedDoc {
  attachedTo: Ref<Issue>
  text: string
  fromCustomer: boolean
  author: string
  at: Timestamp
}
/** A customer company; requests from its email domains are grouped and visible to each other in the portal. @public */
export interface CustomerOrg extends Doc {
  space: Ref<Project>
  name: string
  domains: string[]
  notes?: string
}
/** Something the team supports; issues link to it. @public */
export interface SupportAsset extends Doc {
  space: Ref<Project>
  name: string
  kind: string
  serial?: string
  owner?: Ref<Person> | null
  status: 'in-use' | 'spare' | 'repair' | 'retired'
  location?: string
  notes?: string
}
/** People take turns of shiftDays starting at startsOn; handoff at handoffHour. @public */
export interface OnCallRotation extends Doc {
  space: Ref<Project>
  name: string
  people: Ref<Person>[]
  startsOn: Timestamp
  shiftDays: number
  handoffHour: number
  /** Incidents with severity at or below this are assigned to whoever is on call. */
  autoAssignSeverity?: number
}
/** Per-person notification preferences: quiet hours, muted projects, reminder thresholds. @public */
export interface NotifyPrefs extends Doc {
  user: AccountUuid
  /** Hours in the person's zone; in-app pop-ups and sounds are held between them. */
  quietFrom?: number
  quietTo?: number
  tzOffset: number
  mutedProjects: Ref<Project>[]
  /** Remind about my issues due within N days (0 = off). */
  remindDueDays: number
  /** Remind about my requests breaching SLA within N hours (0 = off). */
  remindSlaHours: number
  remindOverdue: boolean
}
/** "Remind me about this issue at …". @public */
export interface Reminder extends Doc {
  space: Ref<Project>
  issue: Ref<Issue>
  user: AccountUuid
  at: Timestamp
  note?: string
  fired?: boolean
}
/** @public */
export interface IdeaInsight {
  at: Timestamp
  text: string
  url?: string
  by?: string
  weight?: number
}
/** @public */
export type IdeaStatus = 'new' | 'exploring' | 'validated' | 'planned' | 'shipped' | 'declined'
/** An idea to score, argue about and promote to work. Impact, effort and confidence are 1-5; reach is a count. @public */
export interface Idea extends Doc {
  space: Ref<Project>
  title: string
  description: string
  status: IdeaStatus
  impact: number
  effort: number
  confidence: number
  reach: number
  voters: string[]
  tags: string[]
  owner?: Ref<Employee> | null
  insights: IdeaInsight[]
  linkedIssues: Ref<Issue>[]
  goal?: Ref<Goal> | null
  public: boolean
}
/** A named, reusable workflow: statuses by name with transitions, rules, properties and layout. @public */
export interface WorkflowScheme extends Doc {
  name: string
  description?: string
  statuses: string[]
  transitions: Record<string, string[]>
  rules: Array<Record<string, any>>
  statusProps: Record<string, Record<string, any>>
  layout?: Record<string, { x: number, y: number }>
}

/** A field on a form. @public */
export interface FormField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'date' | 'email' | 'checkbox' | 'url'
  required?: boolean
  options?: string[]
  placeholder?: string
  hint?: string
  /** Where the answer goes; anything unmapped is written into the description. */
  mapTo?: 'title' | 'description' | 'priority' | 'assignee' | 'dueDate' | 'labels' | 'severity' | 'risk' | 'estimation' | 'portalEmail' | 'component' | 'milestone'
}
/** A form that creates issues, inside the app or on the public portal. @public */
export interface IssueForm extends Doc {
  space: Ref<Project>
  name: string
  slug: string
  description?: string
  fields: FormField[]
  requestType?: Ref<RequestType> | null
  public: boolean
  submissions?: number
  successText?: string
}
/** A branch, pull request, commit or deployment linked to an issue. @public */
export interface DevLink extends AttachedDoc {
  attachedTo: Ref<Issue>
  kind: 'branch' | 'pr' | 'commit' | 'deploy'
  provider: string
  title: string
  url: string
  state?: string
  ref?: string
  repo?: string
  author?: string
  at: Timestamp
  environment?: string
}
/** @public */
export interface KeyResult {
  text: string
  current: number
  target: number
  unit?: string
}
/** A goal with key results; progress from linked epics or by hand. @public */
export interface Goal extends Doc {
  name: string
  description?: string
  owner: Ref<Employee>
  targetDate?: Timestamp | null
  status: 'on-track' | 'at-risk' | 'off-track' | 'done'
  progress?: number
  keyResults: KeyResult[]
  projects: Ref<Project>[]
  epics: Ref<Issue>[]
}
/** Public incident status page for a project; served at /status/<portal slug>. @public */
export interface StatusPageSettings {
  enabled: boolean
  name?: string
  note?: string
}

/** Attribute type: a parent value with dependent child values, stored as "Parent / Child". @public */
export interface TypeCascadingSelect extends Type<string> {
  options: Array<{ parent: string, children: string[] }>
}

/** @public */
export type AutomationTrigger = 'created' | 'status' | 'priority' | 'assignee' | 'commented' | 'updated' | 'scheduled' | 'webhook'
/** @public */
export interface AutomationCondition {
  field: 'status' | 'priority' | 'assignee' | 'kind' | 'component' | 'labels' | 'title' | 'sprint' | 'milestone'
  op: 'is' | 'is-not' | 'contains' | 'empty' | 'not-empty'
  value?: string
}
/** @public */
export interface AutomationAction {
  type: 'set-status' | 'set-priority' | 'set-assignee' | 'add-label' | 'add-comment' | 'set-sprint' | 'set-milestone' | 'set-due' | 'webhook' | 'slack' | 'teams' | 'create-issue' | 'create-subtasks' | 'send-email'
  value?: string
  /** Which issues the action touches: the triggering one (default) or related ones. */
  target?: 'self' | 'parent' | 'children' | 'blocked-by' | 'blocking'
  /** Slack / Teams incoming-webhook URL, or a plain webhook URL. */
  url?: string
}
/** Which issues a scheduled rule looks at. @public */
export type AutomationScope = 'open' | 'all' | 'stale7' | 'due3' | 'overdue' | 'unassigned'
/** WHEN trigger IF conditions THEN actions, evaluated on the server. @public */
export interface AutomationRule extends Doc {
  space: Ref<Project>
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  runs?: number
  lastRun?: Timestamp
  lastError?: string | null
  /** scheduled: minutes between runs. */
  every?: number
  /** scheduled: which issues to evaluate. */
  scope?: AutomationScope
  /** webhook: secret in the inbound URL. */
  token?: string
  /** webhook: last delivery, set by the integrations service; the trigger fires on it. */
  lastWebhook?: Timestamp
  lastPayload?: Record<string, any>
  /** issues matched on the last run. */
  lastMatched?: number
  /** Applies to every project (space is the workspace); projects narrows it. */
  global?: boolean
  projects?: Ref<Project>[]
}

/**
 * A single doc the integrations service touches every few minutes so the
 * server trigger gets a transaction to run scheduled rules on.
 * @public
 */
export interface AutomationHeartbeat extends Doc {
  at: Timestamp
}

/**
 * @public
 */
export interface ProjectTargetPreference extends Preference {
  attachedTo: Ref<Project> // tracker.ids.ProjectPreferences

  usedOn: Timestamp

  props?: { key: string, value: any }[]
}

export type RelatedIssueKind = 'classRule' | 'spaceRule'

export interface RelatedClassRule {
  kind: 'classRule'
  ofClass: Ref<Class<Doc>>
}

export interface RelatedSpaceRule {
  kind: 'spaceRule'
  space: Ref<Space>
}

/**
 * @public
 *
 * If defined, will be used to set a default project for this kind of document's related issues.
 */
export interface RelatedIssueTarget extends Doc {
  // Attached to project.
  target?: Ref<Project> | null
  rule: RelatedClassRule | RelatedSpaceRule
}

/**
 * @public
 */
export enum TimeReportDayType {
  CurrentWorkDay = 'CurrentWorkDay',
  PreviousWorkDay = 'PreviousWorkDay'
}

/**
 * @public
 */
export enum IssuePriority {
  NoPriority,
  Urgent,
  High,
  Medium,
  Low
}

/**
 * Dependency kind between two Issues for Gantt scheduling.
 *
 * - `finish-to-start` (FS): A must finish before B can start. Most common.
 * - `start-to-start` (SS): A must start before B can start.
 * - `finish-to-finish` (FF): A must finish before B can finish.
 * - `start-to-finish` (SF): A must start before B can finish. Rare.
 *
 * @public
 */
export type DependencyKind = 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish'

/**
 * @public
 */
export enum IssuesGrouping {
  Status = 'status',
  Assignee = 'assignee',
  Priority = 'priority',
  Component = 'component',
  Milestone = 'milestone',
  NoGrouping = '#no_category'
}

/**
 * @public
 */
export enum IssuesOrdering {
  Status = 'status',
  Priority = 'priority',
  LastUpdated = 'modifiedOn',
  DueDate = 'dueDate',
  Manual = 'rank'
}

/**
 * @public
 */
export enum IssuesDateModificationPeriod {
  All = 'all',
  PastWeek = 'pastWeek',
  PastMonth = 'pastMonth'
}

/**
 * @public
 */
export enum MilestoneStatus {
  Planned,
  InProgress,
  Completed,
  Canceled
}

/**
 * @public
 */
export interface Milestone extends Doc {
  label: string
  description?: Markup

  status: MilestoneStatus

  space: Ref<Project>

  comments: number
  attachments?: number

  startDate: Timestamp | null // null = open-ended begin marker
  targetDate: Timestamp
  color?: number
  /** Released versions can be archived out of the way. */
  archived?: boolean
  releasedOn?: Timestamp | null
}

/**
 * @public
 */
export interface Issue extends Task {
  attachedTo: Ref<Issue>
  title: string
  description: MarkupBlobRef | null
  status: Ref<IssueStatus>
  priority: IssuePriority

  component: Ref<Component> | null

  // For subtasks
  subIssues: CollectionSize<Issue>
  blockedBy?: RelatedDocument[]
  relations?: RelatedDocument[]
  parents: IssueParentInfo[]

  startDate: Timestamp | null // for Gantt scheduling; null = unscheduled

  // Soft deadline, independent of dueDate. The Gantt renders
  // a flag marker at this date and flags the issue as overdue when
  // dueDate > deadline. Undefined for issues that haven't opted in.
  deadline?: Timestamp | null

  space: Ref<Project>

  milestone?: Ref<Milestone> | null

  // Estimation in man hours
  estimation: number

  /** Relative size for sprint planning. Independent of hour estimates. */
  storyPoints?: number

  /** Service-level deadline, set from the project SLA table by priority. */
  slaDue?: Timestamp | null

  /** People who voted for this issue. */
  votes?: Ref<Person>[]
  voteCount?: number

  /** Work that lives elsewhere: another workspace, a pull request, a design. */
  externalLinks?: Array<{ url: string, label: string }>

  /** Set when raised through the service desk. */
  requestType?: Ref<RequestType> | null
  /** Satisfaction rating (1-5) from the person who raised the request. */
  csat?: number
  csatComment?: string
  /** Email of the person who raised this through the public portal (no account). */
  portalEmail?: string
  /** Hidden from lists, boards and queries; restorable. */
  archived?: boolean
  /** SLA clock paused while in a status with slaPause. */
  slaPausedAt?: Timestamp | null
  remindedDue?: Timestamp
  remindedSla?: Timestamp
  /** Customer-visible messages (CustomerReply). */
  customerReplies?: number
  /** Branches, pull requests, commits, deployments (DevLink). */
  devLinks?: number
  /** Approval before work may start (service requests, changes). */
  approval?: ApprovalState
  customerOrg?: Ref<CustomerOrg> | null
  assets?: Ref<SupportAsset>[]
  /** Incidents: 1 = highest. */
  severity?: number
  /** Changes. */
  risk?: 'low' | 'medium' | 'high'
  changeStart?: Timestamp | null
  changeEnd?: Timestamp | null
  postmortem?: string
  timeline?: TimelineEntry[]

  // Remaining time in man hours
  remainingTime: number

  // ReportedTime time, auto updated using trigger.
  reportedTime: number
  // Collection of reportedTime entries, for proper time estimations per person.
  reports: CollectionSize<TimeSpendReport>

  childInfo: IssueChildInfo[]

  template?: {
    // A template issue is based on
    template: Ref<IssueTemplate>
    // Child id in template
    childId?: string
  }

  todos?: CollectionSize<ToDo>

  /**
   * Auto-Scheduling-Toggle.
   *
   * Controls whether the cascade scheduler in `gantt/lib/scheduler.ts`
   * may shift this issue when a predecessor or successor is moved by
   * the user. `'auto'` (or absent === default) means the issue is part
   * of the cascade; `'manual'` means the user has pinned the dates and
   * the cascade must never silently overwrite them. The user pin is
   * reset only by an explicit toggle back to `'auto'`.
   *
   * Field is optional so existing issues (which were created before the
   * toggle existed) keep their previous cascade behaviour 1:1 without
   * any migration. The scheduler check is `=== 'manual'`, so `undefined`
   * cleanly defaults to auto.
   */
  schedulingMode?: 'auto' | 'manual'

  /**
   * Department orchestration.
   *
   * `assignee` keeps its existing meaning: the individual carrying the
   * accountable department's share. These fields sit *above* it and answer
   * "which team is answerable", which a single `Ref<Person>` cannot.
   *
   * All three are optional so issues created before this feature keep
   * working unchanged — an issue with no `owningDepartment` behaves exactly
   * as it did before, and no migration is required.
   */
  owningDepartment?: Ref<Department> | null
  contributingDepartments?: Ref<Department>[]
  segments?: CollectionSize<DepartmentSegment>

  /**
   * Why the issue closed. Meaningful only for terminal statuses; cleared when
   * an issue is reopened so a stale reason never outlives the closure it
   * described.
   */
  resolution?: Ref<Resolution> | null

  /** The iteration this issue is committed to. */
  sprint?: Ref<Sprint> | null

  /**
   * The release in which the problem was observed. The existing milestone
   * is the fix version -- where it will be resolved. Keeping both answers
   * "when did this break?" and "when will it ship?" without a Jira-style
   * version scheme.
   */
  affectsMilestone?: Ref<Milestone> | null
}

/**
 * How a department participates in an issue.
 *
 * `accountable` is the answerable team — at most one per issue.
 * `contributing` teams do work and report progress but cannot close the
 * issue or change its global priority.
 * @public
 */
export type DepartmentRoleKind = 'accountable' | 'contributing'

/**
 * A role a department can play on an issue.
 *
 * Seeded with Accountable and Contributing, but teams may add their own
 * (Consulted, Informed, Reviewer…) from Settings → Department roles, so the
 * vocabulary is not hard-coded to one org's process.
 * @public
 */
export interface DepartmentRole extends Doc {
  name: string
  description?: string

  /** Only one role of kind `accountable` may be assigned per issue. */
  kind: DepartmentRoleKind

  /** Palette index, shared with the platform colour scheme. */
  color: number

  /**
   * Whether an unfinished segment in this role prevents the issue from
   * reaching a terminal status. Advisory roles (Informed) set this false.
   */
  blocksCompletion: boolean

  /** Seeded roles cannot be deleted, only renamed. */
  readonly?: boolean
}

/**
 * One department's share of a single issue.
 *
 * This is the record that makes "Design is done but Legal hasn't started"
 * representable without forking the issue. Global issue status becomes a
 * roll-up over these, rather than a field that loses local truth.
 * @public
 */
export interface DepartmentSegment extends AttachedDoc {
  attachedTo: Ref<Issue>
  collection: 'segments'

  department: Ref<Department>
  role: Ref<DepartmentRole>

  /** This department's own state, independent of the issue's roll-up. */
  status: Ref<IssueStatus>

  /** The member of this department doing the work. */
  assignee: Ref<Person> | null

  /**
   * Orders this department's own queue only. Never overrides the issue's
   * global priority, which belongs solely to the accountable department.
   */
  localPriority: IssuePriority

  estimation: number
  dueDate: Timestamp | null

  /**
   * Set whenever `status` changes. Powers dwell-time and stall detection —
   * a task can sit untouched in one team's column for weeks while its due
   * date is still comfortably in the future.
   */
  enteredStatusAt: Timestamp
}

/**
 * Where a decision is in its life.
 *
 * `proposed` exists so AI can draft one without asserting it. Only a human
 * moves a decision to `ratified`; an AI that could ratify would eventually
 * ratify something wrong, and the first time it did the feature would lose
 * the credibility it depends on.
 * @public
 */
export type DecisionState = 'proposed' | 'ratified' | 'superseded'

/**
 * A decision, as a first-class object.
 *
 * Every other tool stores decisions as prose inside a message or a document,
 * which is why "why did we choose this?" is unanswerable in all of them six
 * months later. Making it typed costs little and is the difference between a
 * searchable organisation and an archive of chat.
 *
 * Deliberately records what was rejected. The rejected options are the part
 * people actually need later -- a decision without its alternatives reads as
 * arbitrary, and teams re-litigate it.
 * @public
 */
export interface Decision extends Doc {
  space: Ref<Project>

  title: string

  /** Why. Free prose: this is the field people come back for. */
  rationale: MarkupBlobRef | null

  /** What was considered and not chosen, so the choice reads as reasoned. */
  rejectedOptions: string[]

  state: DecisionState

  /** The human accountable for it. Never an AI, by construction. */
  decidedBy: Ref<Person> | null

  /** When it was ratified, which is not when the record was created. */
  decidedOn: Timestamp | null

  /** People whose input was sought, for auditability rather than approval. */
  consulted: Ref<Person>[]

  /** Issues, documents or conversations this decision governs. */
  affects: RelatedDocument[]

  /**
   * Decisions are never edited into a new meaning and never deleted -- that
   * would rewrite history. A reversal is a new decision that supersedes.
   */
  supersededBy?: Ref<Decision> | null

  /**
   * Set when AI drafted the proposal, so a reader can weigh it accordingly.
   * Cleared on ratification: once a human ratifies, the human owns it.
   */
  aiDrafted?: boolean
}

/**
 * A time-boxed iteration. Deliberately optional: Milestones carry the dates
 * that matter for delivery, and a team that does not run a cadence never sees
 * this. Teams that do get start/complete with carry-over of unfinished work.
 * @public
 */
export type SprintState = 'planned' | 'active' | 'completed'

export interface Sprint extends Doc {
  space: Ref<Project>
  name: string
  goal?: string
  startDate: Timestamp
  endDate: Timestamp
  state: SprintState
  /** Set when completed; unfinished issues were moved here. */
  carriedOverTo?: Ref<Sprint> | null
}

/**
 * Why an issue stopped being open.
 *
 * Status and resolution answer different questions and conflating them loses
 * information that only matters later: "Done" and "Won't do" are both terminal
 * statuses, but a report that cannot separate them cannot tell you how much
 * work was actually delivered versus abandoned.
 *
 * A document rather than an enum so teams can add their own (Cannot
 * reproduce, Superseded, Out of scope) without a release, in the same way
 * DepartmentRole works.
 * @public
 */
export interface Resolution extends Doc {
  name: string
  description?: string

  /**
   * Whether this resolution means the work was actually delivered. Reporting
   * needs this: "Fixed" and "Duplicate" are both closures, but only one
   * represents output, and velocity computed over both is a lie.
   */
  successful: boolean

  /** Palette index, shared with the platform colour scheme. */
  color: number

  /** Seeded resolutions can be renamed but not deleted. */
  readonly?: boolean
}

/**
 * Notification on Dependency-Shift.
 * One entry per shifted issue in a cascade bundle.
 * @public
 */
export interface ShiftedIssuePayload {
  issueId: Ref<Issue>
  identifier: string
  title: string
  // No date/delta fields on purpose. The pre-shift dates are gone server-side
  // by the time the cascade commit is observed, so any client-reported delta or
  // "old" date would be unverifiable — it must never be shown as fact. The
  // notification therefore states only *which* issues moved; the authentic new
  // dates live on the issues themselves (server-derived) and are shown there.
}

/**
 * Notification on Dependency-Shift.
 * One bundle per recipient per cascade-commit.
 * @public
 */
export interface DependencyShiftedNotification extends CommonInboxNotification {
  triggerIssueId: Ref<Issue>
  triggerIssueIdentifier: string
  triggerIssueTitle: string
  triggerUserId: AccountUuid
  shiftedIssues: ShiftedIssuePayload[]
  cascadeToken: string
}

/**
 * Notification on Dependency-Shift.
 *
 * Short-lived signal doc a Gantt client writes into the *project* space it is
 * already allowed to edit after a cascade commit. A server-side trigger
 * (`OnDependencyShiftRequest`) reacts to its creation, resolves collaborators
 * server-side (privileged, ACL-safe) and fans out one
 * `DependencyShiftedNotification` per recipient — then removes this request.
 *
 * The doc intentionally carries NO `triggerUserId`: the trigger derives the
 * originating account from `tx.modifiedBy` (anti-spoofing) so a client cannot
 * forge the notification author.
 * @public
 */
export interface DependencyShiftRequest extends Doc {
  triggerIssueId: Ref<Issue>
  triggerIssueIdentifier: string
  triggerIssueTitle: string
  triggerIssueSpace: Ref<Project>
  shiftedIssues: ShiftedIssuePayload[]
  cascadeToken: string
}

/**
 * Notification on Dependency-Shift.
 *
 * Pure aggregation: group `ShiftedIssuePayload`s by recipient given a per-issue
 * collaborator lookup. The `triggerUserId` is filtered out of every bundle so
 * the account that initiated the cascade is never pinged about its own action
 * (self-suppress). Side-effect free and client-free, so both the Gantt client
 * (payload building) and the server trigger (dispatch) share one source of
 * truth with no divergence.
 * @public
 */
export function groupShiftsByRecipient (
  triggerUserId: AccountUuid | undefined,
  entries: ShiftedIssuePayload[],
  collaboratorsByIssue: Map<Ref<Issue>, AccountUuid[]>
): Map<AccountUuid, ShiftedIssuePayload[]> {
  const result = new Map<AccountUuid, ShiftedIssuePayload[]>()

  for (const entry of entries) {
    const collaborators = collaboratorsByIssue.get(entry.issueId) ?? []
    const seenForThisEntry = new Set<AccountUuid>()
    for (const acc of collaborators) {
      if (triggerUserId !== undefined && acc === triggerUserId) continue
      if (seenForThisEntry.has(acc)) continue
      seenForThisEntry.add(acc)
      const bucket = result.get(acc)
      if (bucket === undefined) {
        result.set(acc, [entry])
      } else {
        bucket.push(entry)
      }
    }
  }

  return result
}

/**
 * @public
 */
export interface IssueDraft {
  kind: Ref<TaskType>
  _id: Ref<Issue>
  title: string
  description: Markup
  status?: Ref<IssueStatus>
  priority: IssuePriority
  assignee: Ref<Person> | null
  component: Ref<Component> | null
  space: Ref<Project>
  startDate: Timestamp | null
  dueDate: Timestamp | null
  milestone?: Ref<Milestone> | null

  // Estimation in man days
  estimation: number
  parentIssue?: Ref<Issue>
  attachments?: number
  labels: TagReference[]
  subIssues: IssueDraft[]
  template?: {
    // A template issue is based on
    template: Ref<IssueTemplate>
    // Child id in template
    childId?: string
  }
}

/**
 * @public
 */
export interface IssueTemplateData {
  title: string
  description: Markup
  priority: IssuePriority

  assignee: Ref<Person> | null
  component: Ref<Component> | null

  milestone?: Ref<Milestone> | null

  // Estimation in man days
  estimation: number

  labels?: Ref<TagElement>[]

  kind?: Ref<TaskType>
}

/**
 * @public
 */
export interface IssueTemplateChild extends IssueTemplateData {
  id: Ref<Issue>
}

/**
 * @public
 */
export interface IssueTemplate extends Doc, IssueTemplateData {
  space: Ref<Project>

  children: IssueTemplateChild[]

  // Discussion stuff
  comments: number
  attachments?: number

  relations?: RelatedDocument[]
}

/**
 * @public
 *
 * Declares time spend entry
 */
export interface TimeSpendReport extends AttachedDoc {
  attachedTo: Ref<Issue>

  employee: Ref<Employee> | null

  date: Timestamp | null
  // Value in man hours
  value: number

  description: string
}

/**
 * @public
 */
export interface IssueParentInfo {
  parentId: Ref<Issue>
  identifier: string
  parentTitle: string
  space: Ref<Space>
}

/**
 * Typed dependency between two Issues, used by the Gantt view to compute
 * cascade scheduling and critical path.
 *
 * Persisted as an AttachedDoc collection 'relations' on the source Issue.
 *
 * @public
 */
export interface IssueRelation extends AttachedDoc<Issue, 'relations'> {
  target: Ref<Issue> // successor
  kind: DependencyKind
  /** Lag in schedule days; can be negative (overlap). */
  lag: number
}

/**
 * @public
 */
export interface IssueChildInfo {
  childId: Ref<Issue>
  estimation: number
  reportedTime: number
}

/**
 * @public
 */
export interface Document extends Doc {
  title: string
  icon: string | null
  color: number
  content?: Markup

  space: Ref<Project>
}

/**
 * @public
 */
export interface Component extends Doc {
  label: string
  description?: Markup
  lead: Ref<Employee> | null
  /** New issues with this component and no assignee go here, before the lead. */
  defaultAssignee?: Ref<Employee> | null
  space: Ref<Project>
  comments: number
  attachments?: number
  color?: number
}

/**
 * @public
 */
export const trackerId = 'tracker' as Plugin
export * from './analytics'

const pluginState = plugin(trackerId, {
  class: {
    Project: '' as Ref<Class<Project>>,
    Issue: '' as Ref<Class<Issue>>,
    IssueRelation: '' as Ref<Class<IssueRelation>>,
    IssueTemplate: '' as Ref<Class<IssueTemplate>>,
    Component: '' as Ref<Class<Component>>,
    IssueStatus: '' as Ref<Class<IssueStatus>>,
    TypeIssuePriority: '' as Ref<Class<Type<IssuePriority>>>,
    Milestone: '' as Ref<Class<Milestone>>,
    TypeMilestoneStatus: '' as Ref<Class<Type<MilestoneStatus>>>,
    TimeSpendReport: '' as Ref<Class<TimeSpendReport>>,
    TypeReportedTime: '' as Ref<Class<Type<number>>>,
    TypeEstimation: '' as Ref<Class<Type<number>>>,
    TypeRemainingTime: '' as Ref<Class<Type<number>>>,
    RelatedIssueTarget: '' as Ref<Class<RelatedIssueTarget>>,
    ProjectTargetPreference: '' as Ref<Class<ProjectTargetPreference>>,
    DependencyShiftedNotification: '' as Ref<Class<DependencyShiftedNotification>>,
    DependencyShiftRequest: '' as Ref<Class<DependencyShiftRequest>>,
    DepartmentRole: '' as Ref<Class<DepartmentRole>>,
    DepartmentSegment: '' as Ref<Class<DepartmentSegment>>,
    Decision: '' as Ref<Class<Decision>>,
    Resolution: '' as Ref<Class<Resolution>>,
    Sprint: '' as Ref<Class<Sprint>>,
    Webhook: '' as Ref<Class<Webhook>>,
    Dashboard: '' as Ref<Class<Dashboard>>,
    TimesheetApproval: '' as Ref<Class<TimesheetApproval>>,
    BillingRate: '' as Ref<Class<BillingRate>>,
    AuditEvent: '' as Ref<Class<AuditEvent>>,
    AuditPolicy: '' as Ref<Class<AuditPolicy>>,
    RequestType: '' as Ref<Class<RequestType>>,
    AutomationRule: '' as Ref<Class<AutomationRule>>,
    AutomationHeartbeat: '' as Ref<Class<AutomationHeartbeat>>,
    AutomationRun: '' as Ref<Class<AutomationRun>>,
    SavedQuery: '' as Ref<Class<SavedQuery>>,
    QuerySubscription: '' as Ref<Class<QuerySubscription>>,
    CustomerReply: '' as Ref<Class<CustomerReply>>,
    CustomerOrg: '' as Ref<Class<CustomerOrg>>,
    Asset: '' as Ref<Class<SupportAsset>>,
    OnCallRotation: '' as Ref<Class<OnCallRotation>>,
    TypeCascadingSelect: '' as Ref<Class<TypeCascadingSelect>>,
    IssueForm: '' as Ref<Class<IssueForm>>,
    DevLink: '' as Ref<Class<DevLink>>,
    Goal: '' as Ref<Class<Goal>>,
    NotifyPrefs: '' as Ref<Class<NotifyPrefs>>,
    Reminder: '' as Ref<Class<Reminder>>,
    Idea: '' as Ref<Class<Idea>>,
    WorkflowScheme: '' as Ref<Class<WorkflowScheme>>
  },
  mixin: {
    ClassicProjectTypeData: '' as Ref<Mixin<Project>>,
    IssueTypeData: '' as Ref<Mixin<Issue>>
  },
  ids: {
    NoParent: '' as Ref<Issue>,
    IssueDraft: '',
    IssueDraftChild: '',
    ClassingProjectType: '' as Ref<ProjectType>,
    // Seeded department roles. Teams add their own alongside these.
    RoleAccountable: '' as Ref<DepartmentRole>,
    RoleContributing: '' as Ref<DepartmentRole>,
    ResolutionFixed: '' as Ref<Resolution>,
    ResolutionWontDo: '' as Ref<Resolution>,
    ResolutionDuplicate: '' as Ref<Resolution>,
    ResolutionCannotReproduce: '' as Ref<Resolution>
  },
  status: {
    Backlog: '' as Ref<Status>,
    Todo: '' as Ref<Status>,
    InProgress: '' as Ref<Status>,
    Coding: '' as Ref<Status>,
    UnderReview: '' as Ref<Status>,
    Done: '' as Ref<Status>,
    Canceled: '' as Ref<Status>
  },
  component: {
    Tracker: '' as AnyComponent,
    TrackerApp: '' as AnyComponent,
    RelatedIssues: '' as AnyComponent,
    RelatedIssuesSection: '' as AnyComponent,
    RelatedIssueSelector: '' as AnyComponent,
    RelatedIssueTemplates: '' as AnyComponent,
    IssueRelationPresenter: '' as AnyComponent,
    EditIssue: '' as AnyComponent,
    CreateIssue: '' as AnyComponent,
    ProjectPresenter: '' as AnyComponent,
    CreateIssueTemplate: '' as AnyComponent,
    CreateProject: '' as AnyComponent,
    IssueStatusPresenter: '' as AnyComponent,
    LabelsView: '' as AnyComponent,
    DepartmentSegments: '' as AnyComponent,
    Decisions: '' as AnyComponent,
    ResolutionEditor: '' as AnyComponent,
    ProjectDecisions: '' as AnyComponent,
    ProjectSprints: '' as AnyComponent,
    Assistant: '' as AnyComponent,
    SprintPresenter: '' as AnyComponent,
    ProjectBacklog: '' as AnyComponent,
    ProjectReports: '' as AnyComponent,
    Dashboard: '' as AnyComponent,
    Timesheets: '' as AnyComponent,
    IssueQuery: '' as AnyComponent,
    ProjectAutomation: '' as AnyComponent,
    Webhooks: '' as AnyComponent,
    Quickstart: '' as AnyComponent,
    JiraImport: '' as AnyComponent,
    ProjectTemplates: '' as AnyComponent,
    WorkflowDesigner: '' as AnyComponent,
    QueryBoard: '' as AnyComponent,
    BulkChange: '' as AnyComponent,
    Assets: '' as AnyComponent,
    OnCall: '' as AnyComponent,
    ApiAccess: '' as AnyComponent,
    ImportHub: '' as AnyComponent,
    CascadingTypeEditor: '' as AnyComponent,
    CascadingSelectEditor: '' as AnyComponent,
    Subscriptions: '' as AnyComponent,
    Forms: '' as AnyComponent,
    Portfolio: '' as AnyComponent,
    NotificationPrefs: '' as AnyComponent,
    Ideas: '' as AnyComponent,
    RemindPopup: '' as AnyComponent,
    AuditLog: '' as AnyComponent,
    SwimlaneBoard: '' as AnyComponent,
    Releases: '' as AnyComponent,
    FieldsSetup: '' as AnyComponent,
    Roadmap: '' as AnyComponent,
    ServiceDesk: '' as AnyComponent,
    SubmitRequest: '' as AnyComponent,
    ProjectPermissions: '' as AnyComponent,
    DecisionPresenter: '' as AnyComponent,
    CreateDecisionPopup: '' as AnyComponent,
    DepartmentSegmentsSection: '' as AnyComponent,
    AddDepartmentPopup: '' as AnyComponent,
    DepartmentRolesSetting: '' as AnyComponent,
    DepartmentRolePresenter: '' as AnyComponent
  },
  attribute: {
    IssueStatus: '' as Ref<Attribute<Status>>
  },
  icon: {
    TrackerApplication: '' as Asset,
    Component: '' as Asset,
    Issue: '' as Asset,
    Subissue: '' as Asset,
    Project: '' as Asset,
    Relations: '' as Asset,
    Inbox: '' as Asset,
    MyIssues: '' as Asset,
    Views: '' as Asset,
    Issues: '' as Asset,
    Components: '' as Asset,
    NewIssue: '' as Asset,
    Magnifier: '' as Asset,
    Labels: '' as Asset,
    DueDate: '' as Asset,
    Parent: '' as Asset,
    UnsetParent: '' as Asset,
    Milestone: '' as Asset,
    IssueTemplates: '' as Asset,
    Start: '' as Asset,
    Stop: '' as Asset,

    CategoryBacklog: '' as Asset,
    CategoryUnstarted: '' as Asset,
    CategoryStarted: '' as Asset,
    CategoryCompleted: '' as Asset,
    CategoryCanceled: '' as Asset,

    PriorityNoPriority: '' as Asset,
    PriorityUrgent: '' as Asset,
    PriorityHigh: '' as Asset,
    PriorityMedium: '' as Asset,
    PriorityLow: '' as Asset,

    ComponentsList: '' as Asset,

    MilestoneStatusPlanned: '' as Asset,
    MilestoneStatusInProgress: '' as Asset,
    MilestoneStatusPaused: '' as Asset,
    MilestoneStatusCompleted: '' as Asset,
    MilestoneStatusCanceled: '' as Asset,

    CopyBranch: '' as Asset,
    Duplicate: '' as Asset,

    TimeReport: '' as Asset,
    Estimation: '' as Asset,
    Gantt: '' as Asset,

    // Project icons
    Home: '' as Asset,
    RedCircle: '' as Asset
  },
  category: {
    Other: '' as Ref<TagCategory>,
    Tracker: '' as Ref<ActionCategory>
  },
  descriptors: {
    ProjectType: '' as Ref<ProjectTypeDescriptor>,
    Issue: '' as Ref<TaskTypeDescriptor>
  },
  action: {
    CopyAsMarkdownTable: '' as Ref<Action<Doc, any>>,
    SetDueDate: '' as Ref<Action<Doc, any>>,
    SetParent: '' as Ref<Action<Doc, any>>,
    SetStatus: '' as Ref<Action>,
    SetPriority: '' as Ref<Action<Doc, any>>,
    SetAssignee: '' as Ref<Action<Doc, any>>,
    SetComponent: '' as Ref<Action<Doc, any>>,
    CopyIssueId: '' as Ref<Action<Doc, any>>,
    CopyIssueTitle: '' as Ref<Action<Doc, any>>,
    CopyIssueLink: '' as Ref<Action<Doc, any>>,
    MoveToProject: '' as Ref<Action>,
    Duplicate: '' as Ref<Action<Doc, any>>,
    Relations: '' as Ref<Action<Doc, any>>,
    NewIssue: '' as Ref<Action<Doc, any>>,
    NewIssueGlobal: '' as Ref<Action<Doc, any>>,
    NewSubIssue: '' as Ref<Action<Doc, any>>,
    EditWorkflowStatuses: '' as Ref<Action>,
    EditProject: '' as Ref<Action>,
    SetMilestone: '' as Ref<Action<Doc, any>>,
    SetLabels: '' as Ref<Action<Doc, any>>,
    EditRelatedTargets: '' as Ref<Action<Doc, any>>,
    UnsetParent: '' as Ref<Action<Doc, any>>
  },
  project: {
    DefaultProject: '' as Ref<Project>
  },
  resolver: {
    Location: '' as Resource<(loc: Location) => Promise<ResolvedLocation | undefined>>
  },
  string: {
    TrackerApplication: '' as IntlString,
    ConfigLabel: '' as IntlString,
    Sprint: '' as IntlString,
    Sprints: '' as IntlString,
    NewSprint: '' as IntlString,
    SprintGoal: '' as IntlString,
    SprintStart: '' as IntlString,
    SprintEnd: '' as IntlString,
    StartSprint: '' as IntlString,
    CompleteSprint: '' as IntlString,
    ActiveSprint: '' as IntlString,
    PlannedSprint: '' as IntlString,
    CompletedSprint: '' as IntlString,
    AffectsVersion: '' as IntlString,
    FixVersion: '' as IntlString,
    NoSprint: '' as IntlString,
    CarriedOver: '' as IntlString,
    Epics: '' as IntlString,
    Assistant: '' as IntlString,
    AskAssistant: '' as IntlString,
    StoryPoints: '' as IntlString,
    Points: '' as IntlString,
    Backlog: '' as IntlString,
    BacklogEmpty: '' as IntlString,
    NoSprintsYet: '' as IntlString,
    MoveToSprint: '' as IntlString,
    MoveToBacklog: '' as IntlString,
    DaysLeft: '' as IntlString,
    WipLimit: '' as IntlString,
    SetWipLimit: '' as IntlString,
    WipLimitHint: '' as IntlString,
    ClearWipLimit: '' as IntlString,
    Initiative: '' as IntlString,
    Initiatives: '' as IntlString,
    Reports: '' as IntlString,
    Burndown: '' as IntlString,
    Velocity: '' as IntlString,
    CumulativeFlow: '' as IntlString,
    Remaining: '' as IntlString,
    Ideal: '' as IntlString,
    AvgVelocity: '' as IntlString,
    NoCompletedSprints: '' as IntlString,
    ToDo: '' as IntlString,
    InProgress: '' as IntlString,
    Done: '' as IntlString,
    Dashboard: '' as IntlString,
    DueSoon: '' as IntlString,
    GoneQuiet: '' as IntlString,
    NothingAssigned: '' as IntlString,
    NothingDue: '' as IntlString,
    NothingStale: '' as IntlString,
    NoActiveSprint: '' as IntlString,
    Workload: '' as IntlString,
    Timesheets: '' as IntlString,
    ThisWeek: '' as IntlString,
    Person: '' as IntlString,
    Total: '' as IntlString,
    NoTimeReported: '' as IntlString,
    Query: '' as IntlString,
    QueryHint: '' as IntlString,
    ReleaseNotes: '' as IntlString,
    CopyMarkdown: '' as IntlString,
    Copied: '' as IntlString,
    Close: '' as IntlString,
    Automation: '' as IntlString,
    AutomationHint: '' as IntlString,
    Rules: '' as IntlString,
    ServiceLevels: '' as IntlString,
    ServiceLevelsHint: '' as IntlString,
    Hours: '' as IntlString,
    SlaDue: '' as IntlString,
    Webhooks: '' as IntlString,
    WebhooksHint: '' as IntlString,
    AddWebhook: '' as IntlString,
    Name: '' as IntlString,
    WebhookUrl: '' as IntlString,
    WebhookSecret: '' as IntlString,
    WebhookSignatureHint: '' as IntlString,
    NoWebhooks: '' as IntlString,
    NoDeliveriesYet: '' as IntlString,
    Enabled: '' as IntlString,
    JiraImport: '' as IntlString,
    JiraImportHint: '' as IntlString,
    ImportIssues: '' as IntlString,
    AuditLog: '' as IntlString,
    AuditLogHint: '' as IntlString,
    NothingToShow: '' as IntlString,
    LoadMore: '' as IntlString,
    Swimlanes: '' as IntlString,
    Releases: '' as IntlString,
    NoReleases: '' as IntlString,
    Release: '' as IntlString,
    Archive: '' as IntlString,
    Unarchive: '' as IntlString,
    Fields: '' as IntlString,
    FieldsHint: '' as IntlString,
    Roadmap: '' as IntlString,
    Capacity: '' as IntlString,
    CrossProjectDependencies: '' as IntlString,
    ServiceDesk: '' as IntlString,
    AddRequestType: '' as IntlString,
    SubmitRequest: '' as IntlString,
    SubmitRequestHint: '' as IntlString,
    OpenIssue: '' as IntlString,
    SubmitAnother: '' as IntlString,
    RequestType: '' as IntlString,
    Satisfaction: '' as IntlString,
    NewRule: '' as IntlString,
    NewDashboard: '' as IntlString,
    Edit: '' as IntlString,
    Rename: '' as IntlString,
    Share: '' as IntlString,
    Unshare: '' as IntlString,
    Delete: '' as IntlString,
    Wallboard: '' as IntlString,
    ExitWallboard: '' as IntlString,
    AddWidget: '' as IntlString,
    Add: '' as IntlString,
    Cancel: '' as IntlString,
    Save: '' as IntlString,
    DefaultDashboardHint: '' as IntlString,
    SavedQueries: '' as IntlString,
    SaveQuery: '' as IntlString,
    QueryTruncated: '' as IntlString,
    ExportCsv: '' as IntlString,
    Description: '' as IntlString,
    Votes: '' as IntlString,
    Watchers: '' as IntlString,
    ExternalLinks: '' as IntlString,
    MentionedIn: '' as IntlString,
    CloneWithSubIssues: '' as IntlString,
    Permissions: '' as IntlString,
    PermissionsHint: '' as IntlString,
    MergeInto: '' as IntlString,
    CopyLink: '' as IntlString,
    ExportJson: '' as IntlString,
    ImportJson: '' as IntlString,
    ProjectTemplates: '' as IntlString,
    ProjectTemplatesHint: '' as IntlString,
    Scenario: '' as IntlString,
    Apply: '' as IntlString,
    Discard: '' as IntlString,
    SubmitTimesheet: '' as IntlString,
    InvoiceWeek: '' as IntlString,
    InvoiceMonth: '' as IntlString,
    Workflow: '' as IntlString,
    Ideas: '' as IntlString,
    Idea: '' as IntlString,
    NewIdea: '' as IntlString,
    RemindMe: '' as IntlString,
    Reminders: '' as IntlString,
    QuietHours: '' as IntlString,
    MutedProjects: '' as IntlString,
    NotificationPrefs: '' as IntlString,
    DueSoonTitle: '' as IntlString,
    DueSoonBody: '' as IntlString,
    SlaRiskTitle: '' as IntlString,
    SlaRiskBody: '' as IntlString,
    ReminderTitle: '' as IntlString,
    ReminderBody: '' as IntlString,
    OverdueTitle: '' as IntlString,
    WorkflowSchemes: '' as IntlString,
    SaveScheme: '' as IntlString,
    ApplyScheme: '' as IntlString,
    StatusProperties: '' as IntlString,
    Impact: '' as IntlString,
    Effort: '' as IntlString,
    Confidence: '' as IntlString,
    Reach: '' as IntlString,
    PromoteToEpic: '' as IntlString,
    Insights: '' as IntlString,
    Vote: '' as IntlString,
    Forms: '' as IntlString,
    NewForm: '' as IntlString,
    OpenForm: '' as IntlString,
    Portfolio: '' as IntlString,
    Goals: '' as IntlString,
    NewGoal: '' as IntlString,
    Development: '' as IntlString,
    TimeInStatus: '' as IntlString,
    StatusPage: '' as IntlString,
    Submit: '' as IntlString,
    Continue: '' as IntlString,
    Send: '' as IntlString,
    Run: '' as IntlString,
    Boards: '' as IntlString,
    BulkChange: '' as IntlString,
    ArchiveIssue: '' as IntlString,
    UnarchiveIssue: '' as IntlString,
    Archived: '' as IntlString,
    Assets: '' as IntlString,
    OnCall: '' as IntlString,
    ApiAccess: '' as IntlString,
    Import: '' as IntlString,
    Subscriptions: '' as IntlString,
    EmailSchedule: '' as IntlString,
    CustomerConversation: '' as IntlString,
    Approval: '' as IntlString,
    Approve: '' as IntlString,
    Reject: '' as IntlString,
    Incident: '' as IntlString,
    Change: '' as IntlString,
    Severity: '' as IntlString,
    Risk: '' as IntlString,
    SlaCalendar: '' as IntlString,
    Organisations: '' as IntlString,
    Portal: '' as IntlString,
    CascadingSelect: '' as IntlString,
    QuickFilters: '' as IntlString,
    CardColors: '' as IntlString,
    GlobalRule: '' as IntlString,
    RunLog: '' as IntlString,
    ThisProjectOnly: '' as IntlString,
    Resolution: '' as IntlString,
    Resolutions: '' as IntlString,
    NoResolution: '' as IntlString,
    ResolutionFixed: '' as IntlString,
    ResolutionWontDo: '' as IntlString,
    ResolutionDuplicate: '' as IntlString,
    ResolutionCannotReproduce: '' as IntlString,
    SetResolution: '' as IntlString,
    SuccessfulResolution: '' as IntlString,
    CreateIssueFromMessage: '' as IntlString,
    Decision: '' as IntlString,
    Decisions: '' as IntlString,
    NewDecision: '' as IntlString,
    DecisionTitle: '' as IntlString,
    Rationale: '' as IntlString,
    RejectedOptions: '' as IntlString,
    AddRejectedOption: '' as IntlString,
    Ratify: '' as IntlString,
    Ratified: '' as IntlString,
    Proposed: '' as IntlString,
    Superseded: '' as IntlString,
    DecidedBy: '' as IntlString,
    DecidedOn: '' as IntlString,
    Consulted: '' as IntlString,
    Affects: '' as IntlString,
    NoDecisions: '' as IntlString,
    NoDecisionsHint: '' as IntlString,
    DraftedByAI: '' as IntlString,
    SupersededBy: '' as IntlString,
    RatifyHint: '' as IntlString,
    WhyThisWasDecided: '' as IntlString,
    Departments: '' as IntlString,
    Department: '' as IntlString,
    DepartmentSegment: '' as IntlString,
    DepartmentSegments: '' as IntlString,
    DepartmentRole: '' as IntlString,
    DepartmentRoles: '' as IntlString,
    AddDepartment: '' as IntlString,
    AddRole: '' as IntlString,
    NewRole: '' as IntlString,
    RoleName: '' as IntlString,
    RoleKind: '' as IntlString,
    Accountable: '' as IntlString,
    Contributing: '' as IntlString,
    OwningDepartment: '' as IntlString,
    ContributingDepartments: '' as IntlString,
    LocalPriority: '' as IntlString,
    BlocksCompletion: '' as IntlString,
    BlocksCompletionHint: '' as IntlString,
    NoDepartments: '' as IntlString,
    NoDepartmentsHint: '' as IntlString,
    RemoveDepartment: '' as IntlString,
    MakeAccountable: '' as IntlString,
    AccountableAlreadySet: '' as IntlString,
    DepartmentAlreadyAdded: '' as IntlString,
    SegmentsBlockingCompletion: '' as IntlString,
    WaitingOn: '' as IntlString,
    CancelRole: '' as IntlString,
    RemoveRole: '' as IntlString,
    NewRelatedIssue: '' as IntlString,
    IssueNotificationTitle: '' as IntlString,
    IssueNotificationBody: '' as IntlString,
    IssueNotificationChanged: '' as IntlString,
    IssueNotificationChangedProperty: '' as IntlString,
    IssueNotificationMessage: '' as IntlString,
    IssueAssignedToYou: '' as IntlString,
    Project: '' as IntlString,
    RelatedIssues: '' as IntlString,
    Issue: '' as IntlString,
    IssueStartDate: '' as IntlString,
    SetStartDate: '' as IntlString,
    GanttDragFailed: '' as IntlString,
    GanttDragNoPermission: '' as IntlString,
    GanttDragValidation: '' as IntlString,
    GanttDragConflict: '' as IntlString,
    GanttResizingTooltip: '' as IntlString,
    Hierarchy: '' as IntlString,
    LinkExistingSubIssue: '' as IntlString,
    LinkExistingParentIssue: '' as IntlString,
    CreateNewSubIssue: '' as IntlString,
    CreateNewParentIssue: '' as IntlString,
    AddParentIssue: '' as IntlString,
    AddSubIssue: '' as IntlString,
    AddDependency: '' as IntlString,
    AddPredecessor: '' as IntlString,
    AddSuccessor: '' as IntlString,
    AddPredecessorHint: '' as IntlString,
    AddSuccessorHint: '' as IntlString,
    SetParentIssueLabel: '' as IntlString,
    GanttDragToSchedule: '' as IntlString,
    GanttDurationTooltip: '' as IntlString,
    GanttConfirmMove: '' as IntlString,
    GanttConfirmResize: '' as IntlString,
    GanttConfirmMoveTitle: '' as IntlString,
    GanttConfirmResizeTitle: '' as IntlString,
    GanttConfirmMoveBody: '' as IntlString,
    GanttConfirmResizeBody: '' as IntlString,
    GanttConfirmApply: '' as IntlString,
    GanttAriaResizeStart: '' as IntlString,
    GanttAriaResizeEnd: '' as IntlString,
    GanttDependency: '' as IntlString,
    GanttLag: '' as IntlString,
    WorkingDaysConfig: '' as IntlString,
    WorkingDaysTitle: '' as IntlString,
    WorkingDaysDescription: '' as IntlString,
    WorkingDaysWeekday: '' as IntlString,
    WorkingDaysHolidays: '' as IntlString,
    WorkingDaysNotConfigured: '' as IntlString,
    WorkingDaysEnable: '' as IntlString,
    WorkingDaysDepartment: '' as IntlString,
    WorkingDaysCompanyWide: '' as IntlString,
    WorkingDaysAtLeastOneDay: '' as IntlString,
    WorkingDayMon: '' as IntlString,
    WorkingDayTue: '' as IntlString,
    WorkingDayWed: '' as IntlString,
    WorkingDayThu: '' as IntlString,
    WorkingDayFri: '' as IntlString,
    WorkingDaySat: '' as IntlString,
    WorkingDaySun: '' as IntlString,
    NewProject: '' as IntlString,
    UnsetParentIssue: '' as IntlString,
    ForbidCreateProjectPermission: '' as IntlString,
    ForbidCreateProjectPermissionDescription: '' as IntlString,
    SchedulingMode: '' as IntlString,
    SchedulingModeAuto: '' as IntlString,
    SchedulingModeManual: '' as IntlString,
    SchedulingModeHint: '' as IntlString,
    SchedulingModeTooltipAuto: '' as IntlString,
    SchedulingModeTooltipManual: '' as IntlString,
    GanttBarManualPinTooltip: '' as IntlString,
    // Visual polish
    Deadline: '' as IntlString,
    BarLabelNone: '' as IntlString,
    BarLabelTitle: '' as IntlString,
    BarLabelIdentifier: '' as IntlString,
    BarLabelAssignee: '' as IntlString,
    BarLabelPriority: '' as IntlString,
    BarLabelStatus: '' as IntlString,
    BarLabelEstimation: '' as IntlString,
    BarLabelProgress: '' as IntlString,
    GanttBarLabelLeft: '' as IntlString,
    GanttBarLabelInside: '' as IntlString,
    GanttBarLabelRight: '' as IntlString,
    GanttQuickInfoOnClick: '' as IntlString,
    QuickInfoOpenFullEditor: '' as IntlString,
    // Notification on Dependency-Shift.
    DependencyShifted: '' as IntlString,
    DependencyShiftedHeader: '' as IntlString,
    DependencyShiftedMessage: '' as IntlString,
    DependencyShiftedSubject: '' as IntlString,
    Color: '' as IntlString
  },
  extensions: {
    IssueListHeader: '' as ComponentExtensionId,
    EditIssueHeader: '' as ComponentExtensionId,
    EditIssueTitle: '' as ComponentExtensionId
  },
  taskTypes: {
    Issue: '' as Ref<TaskType>,
    SubIssue: '' as Ref<TaskType>,
    Epic: '' as Ref<TaskType>,
    Initiative: '' as Ref<TaskType>
  },
  permission: {
    ForbidCreateProject: '' as Ref<Permission>
  }
})
export default pluginState

/**
 * @public
 */
export function createStatesData (data: TaskStatusFactory[]): Omit<Data<Status>, 'rank'>[] {
  const states: Omit<Data<Status>, 'rank'>[] = []

  for (const category of data) {
    for (const sName of category.statuses) {
      states.push({
        ofAttribute: pluginState.attribute.IssueStatus,
        name: Array.isArray(sName) ? sName[0] : sName,
        color: Array.isArray(sName) ? sName[1] : undefined,
        category: category.category
      })
    }
  }
  return states
}

export * from './query/parse'
export * from './query/run'
