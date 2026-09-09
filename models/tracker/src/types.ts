//
// Copyright © 2023 Hardcore Engineering Inc.
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

import chunter from '@hcengineering/chunter'
import contact, { type Employee, type Person } from '@hcengineering/contact'
import {
  DOMAIN_MODEL,
  DateRangeMode,
  IndexKind,
  type MarkupBlobRef,
  type Domain,
  type Markup,
  type Ref,
  type RelatedDocument,
  type Timestamp,
  type Type,
  type RolesAssignment,
  type Role,
  type CollectionSize,
  type AccountUuid
} from '@hcengineering/core'
import {
  ArrOf,
  Collection,
  Hidden,
  Index,
  Mixin,
  Model,
  Prop,
  ReadOnly,
  TypeCollaborativeDoc,
  TypeDate,
  TypeMarkup,
  TypeNumber,
  TypeRecord,
  TypeRef,
  TypeString,
  TypeBoolean,
  UX
} from '@hcengineering/model'
import attachment from '@hcengineering/model-attachment'
import core, { TAttachedDoc, TDoc, TStatus, TType } from '@hcengineering/model-core'
import type {
  AuditEvent,
  AuditPolicy,
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationTrigger,
  BillingRate,
  Dashboard,
  DashboardWidget,
  ProjectAutomation,
  RequestType,
  TimesheetApproval,
  Webhook,
  WebhookEvent
} from '@hcengineering/tracker'
import notification, { TCommonInboxNotification } from '@hcengineering/model-notification'
import task, { TTask, TProject as TTaskProject } from '@hcengineering/model-task'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import tags, { type TagElement } from '@hcengineering/tags'
import time, { type ToDo } from '@hcengineering/time'
import { type Department } from '@hcengineering/hr'
import hr from '@hcengineering/model-hr'
import {
  type ProjectTargetPreference,
  type Component,
  type DependencyKind,
  type DependencyShiftedNotification,
  type DependencyShiftRequest,
  type DepartmentRole,
  type DepartmentRoleKind,
  type Decision,
  type DecisionState,
  type Resolution,
  type Sprint,
  type SprintState,
  type DepartmentSegment,
  type Issue,
  type IssueChildInfo,
  type IssueParentInfo,
  type IssuePriority,
  type IssueRelation,
  type IssueStatus,
  type IssueTemplate,
  type IssueTemplateChild,
  type Milestone,
  type MilestoneStatus,
  type Project,
  type RelatedClassRule,
  type RelatedIssueTarget,
  type RelatedSpaceRule,
  type ShiftedIssuePayload,
  type TimeReportDayType,
  type TimeSpendReport,
  type WorkingDaysConfig
} from '@hcengineering/tracker'
import tracker from './plugin'
import { type TaskType } from '@hcengineering/task'

import preference, { TPreference } from '@hcengineering/model-preference'

export const DOMAIN_TRACKER = 'tracker' as Domain

@Model(tracker.class.IssueStatus, core.class.Status)
@UX(tracker.string.IssueStatus, undefined, undefined, 'rank', 'name')
export class TIssueStatus extends TStatus implements IssueStatus {}
/**
 * @public
 */

export function TypeIssuePriority (): Type<IssuePriority> {
  return { _class: tracker.class.TypeIssuePriority, label: tracker.string.TypeIssuePriority }
}
/**
 * @public
 */

@Model(tracker.class.TypeIssuePriority, core.class.Type, DOMAIN_MODEL)
export class TTypeIssuePriority extends TType {}
/**
 * @public
 */

export function TypeMilestoneStatus (): Type<MilestoneStatus> {
  return { _class: tracker.class.TypeMilestoneStatus, label: 'TypeMilestoneStatus' as IntlString }
}
/**
 * @public
 */

@Model(tracker.class.TypeMilestoneStatus, core.class.Type, DOMAIN_MODEL)
export class TTypeMilestoneStatus extends TType {}
/**
 * @public
 */

@Model(tracker.class.Project, task.class.Project)
@UX(tracker.string.Project, tracker.icon.Issues, 'Project', 'name')
export class TProject extends TTaskProject implements Project {
  @Prop(TypeString(), tracker.string.ProjectIdentifier)
  @Index(IndexKind.FullText)
    identifier!: IntlString

  @Prop(TypeNumber(), tracker.string.Number)
  @Hidden()
    sequence!: number

  @Prop(TypeRef(tracker.class.IssueStatus), tracker.string.DefaultIssueStatus)
    defaultIssueStatus?: Ref<IssueStatus>

  @Prop(TypeRef(contact.mixin.Employee), tracker.string.DefaultAssignee)
    defaultAssignee!: Ref<Employee>

  declare defaultTimeReportDay: TimeReportDayType

  @Prop(Collection(tracker.class.RelatedIssueTarget), tracker.string.RelatedIssues)
    relatedIssueTargets!: number

  @Prop(TypeRecord(), tracker.string.WorkingDaysConfig)
    workingDaysConfig?: WorkingDaysConfig

  @Prop(TypeRecord(), tracker.string.WipLimit)
  @Hidden()
    wipLimits?: Record<Ref<IssueStatus>, number>

  @Prop(TypeRecord(), tracker.string.Automation)
  @Hidden()
    automation?: ProjectAutomation

  @Prop(TypeRecord(), tracker.string.ServiceLevels)
  @Hidden()
    sla?: Record<string, number>
}
/**
 * @public
 */

@Model(tracker.class.RelatedIssueTarget, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.RelatedIssues)
export class TRelatedIssueTarget extends TDoc implements RelatedIssueTarget {
  @Prop(TypeRef(tracker.class.Project), tracker.string.Project)
    target!: Ref<Project>

  rule!: RelatedClassRule | RelatedSpaceRule
}

/**
 * @public
 */
export function TypeReportedTime (): Type<number> {
  return { _class: tracker.class.TypeReportedTime, label: tracker.string.ReportedTime }
}

/**
 * @public
 */
export function TypeRemainingTime (): Type<number> {
  return { _class: tracker.class.TypeRemainingTime, label: tracker.string.RemainingTime }
}

/**
 * @public
 */
export function TypeEstimation (): Type<number> {
  return { _class: tracker.class.TypeEstimation, label: tracker.string.Estimation }
}

/**
 * @public
 */
@Model(tracker.class.Issue, task.class.Task)
@UX(tracker.string.Issue, tracker.icon.Issue, 'TSK', 'title', undefined, tracker.string.Issues)
export class TIssue extends TTask implements Issue {
  @Prop(TypeRef(tracker.class.Issue), tracker.string.Parent)
  declare attachedTo: Ref<Issue>

  @Prop(TypeString(), tracker.string.Title)
  @Index(IndexKind.FullText)
    title!: string

  @Prop(TypeCollaborativeDoc(), tracker.string.Description)
  @Index(IndexKind.FullText)
    description!: MarkupBlobRef | null

  @Prop(TypeRef(tracker.class.IssueStatus), tracker.string.Status, {
    _id: tracker.attribute.IssueStatus,
    iconComponent: tracker.activity.StatusIcon
  })
  @Index(IndexKind.Indexed)
  declare status: Ref<IssueStatus>

  @Prop(TypeIssuePriority(), tracker.string.Priority, {
    iconComponent: tracker.activity.PriorityIcon
  })
  @Index(IndexKind.Indexed)
    priority!: IssuePriority

  @Prop(TypeNumber(), tracker.string.Number)
  @Index(IndexKind.FullText)
  @ReadOnly()
  declare number: number

  @Prop(TypeRef(contact.class.Person), tracker.string.Assignee)
  @Index(IndexKind.Indexed)
  declare assignee: Ref<Person> | null

  @Prop(TypeRef(tracker.class.Component), tracker.string.Component, { icon: tracker.icon.Component })
  @Index(IndexKind.Indexed)
    component!: Ref<Component> | null

  @Prop(Collection(tracker.class.Issue), tracker.string.SubIssues)
    subIssues!: number

  // Department orchestration. Optional throughout, so issues created before
  // this feature keep working with no migration: an issue with no
  // owningDepartment behaves exactly as it did previously.
  @Prop(TypeRef(hr.class.Department), tracker.string.OwningDepartment, { icon: tracker.icon.Issues })
  @Index(IndexKind.Indexed)
    owningDepartment?: Ref<Department> | null

  @Prop(ArrOf(TypeRef(hr.class.Department)), tracker.string.ContributingDepartments)
  @Index(IndexKind.Indexed)
    contributingDepartments?: Ref<Department>[]

  @Prop(Collection(tracker.class.DepartmentSegment), tracker.string.DepartmentSegments)
    segments?: number

  // Why the issue closed, separate from the status that closed it. Optional so
  // existing issues need no migration.
  @Prop(TypeRef(tracker.class.Resolution), tracker.string.Resolution)
  @Index(IndexKind.Indexed)
    resolution?: Ref<Resolution> | null

  @Prop(TypeRef(tracker.class.Sprint), tracker.string.Sprint)
  @Index(IndexKind.Indexed)
    sprint?: Ref<Sprint> | null

  @Prop(TypeRef(tracker.class.Milestone), tracker.string.AffectsVersion)
  @Index(IndexKind.Indexed)
    affectsMilestone?: Ref<Milestone> | null

  @Prop(ArrOf(TypeRef(core.class.TypeRelatedDocument)), tracker.string.BlockedBy)
    blockedBy!: RelatedDocument[]

  @Prop(ArrOf(TypeRef(core.class.TypeRelatedDocument)), tracker.string.RelatedTo)
  @Index(IndexKind.Indexed)
    relations!: RelatedDocument[]

  parents!: IssueParentInfo[]

  @Prop(Collection(tags.class.TagReference), tracker.string.Labels)
  declare labels: number

  @Prop(TypeRef(tracker.class.Project), tracker.string.Project, { icon: tracker.icon.Issues })
  @Index(IndexKind.Indexed)
  @ReadOnly()
  declare space: Ref<Project>

  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.IssueStartDate)
  @Index(IndexKind.Indexed)
  declare startDate: Timestamp | null

  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.DueDate)
  declare dueDate: Timestamp | null

  // Soft deadline, independent of dueDate. Optional.
  // When set, the Gantt renders a flag marker at this date and flags the
  // issue as overdue when dueDate > deadline. Undefined for existing issues
  // until the user opts in via the Issue editor (this change ships the
  // inline ControlPanel field; a Gantt context-menu shortcut is a
  // separate follow-up, see Out-of-scope section).
  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.Deadline)
    deadline?: Timestamp | null

  @Prop(TypeRef(tracker.class.Milestone), tracker.string.Milestone, { icon: tracker.icon.Milestone })
  @Index(IndexKind.Indexed)
    milestone!: Ref<Milestone> | null

  @Prop(TypeEstimation(), tracker.string.Estimation)
    estimation!: number

  @Prop(TypeNumber(), tracker.string.StoryPoints)
    storyPoints?: number

  @Prop(TypeDate(), tracker.string.SlaDue)
    slaDue?: Timestamp | null

  @Prop(ArrOf(TypeRef(contact.class.Person)), tracker.string.Votes)
  @Hidden()
    votes?: Ref<Person>[]

  @Prop(TypeNumber(), tracker.string.Votes)
  @Hidden()
    voteCount?: number

  @Prop(TypeRecord(), tracker.string.ExternalLinks)
  @Hidden()
    externalLinks?: Array<{ url: string, label: string }>

  @Prop(TypeRef(tracker.class.RequestType), tracker.string.RequestType)
  @Hidden()
    requestType?: Ref<RequestType> | null

  @Prop(TypeNumber(), tracker.string.Satisfaction)
  @Hidden()
    csat?: number

  @Prop(TypeString(), tracker.string.Satisfaction)
  @Hidden()
    csatComment?: string

  @Prop(TypeReportedTime(), tracker.string.ReportedTime)
    reportedTime!: number

  @Prop(TypeRemainingTime(), tracker.string.RemainingTime)
  @ReadOnly()
    remainingTime!: number

  @Prop(Collection(tracker.class.TimeSpendReport), tracker.string.TimeSpendReports)
    reports!: number

  declare childInfo: IssueChildInfo[]

  @Prop(Collection(time.class.ToDo), getEmbeddedLabel('Action Items'))
    todos?: CollectionSize<ToDo>

  /**
   * Auto-Scheduling-Toggle.
   *
   * Optional property so existing issues stay on the default cascade
   * behaviour with no migration. `@Hidden` keeps the field out of the
   * generic filter/sort UI in `getFiltredKeys`; the dedicated toggle in
   * `ControlPanel.svelte` is the supported entry point. Cascade-time
   * checks live in `gantt/lib/scheduler.ts` (Step 5b filter).
   */
  @Prop(TypeString(), tracker.string.SchedulingMode)
  @Hidden()
    schedulingMode?: 'auto' | 'manual'
}
/**
 * @public
 */

@Model(tracker.class.IssueTemplate, core.class.Doc, DOMAIN_TRACKER)
@UX(
  tracker.string.IssueTemplate,
  tracker.icon.IssueTemplates,
  'PROCESS',
  undefined,
  undefined,
  tracker.string.IssueTemplates
)
export class TIssueTemplate extends TDoc implements IssueTemplate {
  @Prop(TypeString(), tracker.string.Title)
  @Index(IndexKind.FullText)
    title!: string

  @Prop(TypeMarkup(), tracker.string.Description)
  @Index(IndexKind.FullText)
    description!: Markup

  @Prop(TypeIssuePriority(), tracker.string.Priority)
    priority!: IssuePriority

  @Prop(TypeRef(contact.class.Person), tracker.string.Assignee)
    assignee!: Ref<Person> | null

  @Prop(TypeRef(tracker.class.Component), tracker.string.Component)
    component!: Ref<Component> | null

  @Prop(ArrOf(TypeRef(tags.class.TagElement)), tracker.string.Labels)
    labels?: Ref<TagElement>[]

  @Prop(TypeRef(task.class.TaskType), task.string.TaskType)
    kind?: Ref<TaskType>

  declare space: Ref<Project>

  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.DueDate)
    dueDate!: Timestamp | null

  @Prop(TypeRef(tracker.class.Milestone), tracker.string.Milestone)
    milestone!: Ref<Milestone> | null

  @Prop(TypeEstimation(), tracker.string.Estimation)
    estimation!: number

  @Prop(ArrOf(TypeRef(tracker.class.IssueTemplate)), tracker.string.IssueTemplate)
    children!: IssueTemplateChild[]

  @Prop(Collection(chunter.class.ChatMessage), tracker.string.Comments)
    comments!: number

  @Prop(Collection(attachment.class.Attachment), tracker.string.Attachments)
    attachments!: number

  @Prop(ArrOf(TypeRef(core.class.TypeRelatedDocument)), tracker.string.RelatedTo)
    relations!: RelatedDocument[]
}
/**
 * @public
 */

/**
 * A role a department can play on an issue.
 *
 * Stored in DOMAIN_MODEL-adjacent tracker domain rather than the model domain
 * so teams can create roles at runtime from Settings, not only at build time.
 * @public
 */
@Model(tracker.class.DepartmentRole, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.DepartmentRole, tracker.icon.Issues)
export class TDepartmentRole extends TDoc implements DepartmentRole {
  @Prop(TypeString(), tracker.string.RoleName)
  @Index(IndexKind.FullText)
    name!: string

  @Prop(TypeString(), tracker.string.Description)
    description?: string

  @Prop(TypeString(), tracker.string.RoleKind)
  @Index(IndexKind.Indexed)
    kind!: DepartmentRoleKind

  @Prop(TypeNumber(), tracker.string.Color)
    color!: number

  @Prop(TypeBoolean(), tracker.string.BlocksCompletion)
    blocksCompletion!: boolean

  @Prop(TypeBoolean(), tracker.string.RoleKind)
  @Hidden()
    readonly?: boolean
}

/**
 * One department's share of a single issue — its own status, assignee and clock.
 * @public
 */
@Model(tracker.class.DepartmentSegment, core.class.AttachedDoc, DOMAIN_TRACKER)
@UX(tracker.string.DepartmentSegment, tracker.icon.Issues)
export class TDepartmentSegment extends TAttachedDoc implements DepartmentSegment {
  @Prop(TypeRef(tracker.class.Issue), tracker.string.Issue)
  declare attachedTo: Ref<Issue>

  declare collection: 'segments'

  @Prop(TypeRef(hr.class.Department), tracker.string.Department)
  @Index(IndexKind.Indexed)
    department!: Ref<Department>

  @Prop(TypeRef(tracker.class.DepartmentRole), tracker.string.DepartmentRole)
  @Index(IndexKind.Indexed)
    role!: Ref<DepartmentRole>

  @Prop(TypeRef(tracker.class.IssueStatus), tracker.string.Status)
  @Index(IndexKind.Indexed)
    status!: Ref<IssueStatus>

  @Prop(TypeRef(contact.class.Person), tracker.string.Assignee)
  @Index(IndexKind.Indexed)
    assignee!: Ref<Person> | null

  @Prop(TypeIssuePriority(), tracker.string.LocalPriority)
    localPriority!: IssuePriority

  @Prop(TypeEstimation(), tracker.string.Estimation)
    estimation!: number

  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.DueDate)
    dueDate!: Timestamp | null

  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.CreatedDate)
  @ReadOnly()
    enteredStatusAt!: Timestamp
}

/**
 * A decision, recorded so nobody reconstructs it from chat six months later.
 * @public
 */
/**
 * Why an issue stopped being open. See the Resolution interface for why this
 * is separate from status.
 * @public
 */
/** @public */
@Model(tracker.class.Sprint, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Sprint, tracker.icon.Milestone, undefined, 'startDate', undefined, tracker.string.Sprints)
export class TSprint extends TDoc implements Sprint {
  @Prop(TypeRef(tracker.class.Project), tracker.string.Project)
  @Index(IndexKind.Indexed)
  declare space: Ref<Project>

  @Prop(TypeString(), tracker.string.Title)
  @Index(IndexKind.FullText)
    name!: string

  @Prop(TypeString(), tracker.string.SprintGoal)
    goal?: string

  @Prop(TypeDate(), tracker.string.SprintStart)
    startDate!: Timestamp

  @Prop(TypeDate(), tracker.string.SprintEnd)
    endDate!: Timestamp

  @Prop(TypeString(), tracker.string.Sprint)
  @Index(IndexKind.Indexed)
    state!: SprintState

  @Prop(TypeRef(tracker.class.Sprint), tracker.string.CarriedOver)
    carriedOverTo?: Ref<Sprint> | null
}

@Model(tracker.class.Resolution, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Resolution, tracker.icon.Issue)
export class TResolution extends TDoc implements Resolution {
  @Prop(TypeString(), tracker.string.Resolution)
  @Index(IndexKind.FullText)
    name!: string

  @Prop(TypeString(), tracker.string.Description)
    description?: string

  @Prop(TypeBoolean(), tracker.string.SuccessfulResolution)
    successful!: boolean

  @Prop(TypeNumber(), tracker.string.Color)
    color!: number

  @Prop(TypeBoolean(), tracker.string.Resolution)
  @Hidden()
    readonly?: boolean
}

@Model(tracker.class.Decision, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Decision, tracker.icon.Issue, undefined, 'decidedOn', undefined, tracker.string.Decisions)
export class TDecision extends TDoc implements Decision {
  @Prop(TypeRef(tracker.class.Project), tracker.string.Project)
  @Index(IndexKind.Indexed)
  declare space: Ref<Project>

  @Prop(TypeString(), tracker.string.DecisionTitle)
  @Index(IndexKind.FullText)
    title!: string

  @Prop(TypeCollaborativeDoc(), tracker.string.Rationale)
  @Index(IndexKind.FullText)
    rationale!: MarkupBlobRef | null

  @Prop(ArrOf(TypeString()), tracker.string.RejectedOptions)
  @Index(IndexKind.FullText)
    rejectedOptions!: string[]

  @Prop(TypeString(), tracker.string.Decision)
  @Index(IndexKind.Indexed)
    state!: DecisionState

  @Prop(TypeRef(contact.class.Person), tracker.string.DecidedBy)
  @Index(IndexKind.Indexed)
    decidedBy!: Ref<Person> | null

  @Prop(TypeDate(DateRangeMode.DATETIME), tracker.string.DecidedOn)
    decidedOn!: Timestamp | null

  @Prop(ArrOf(TypeRef(contact.class.Person)), tracker.string.Consulted)
    consulted!: Ref<Person>[]

  @Prop(ArrOf(TypeRef(core.class.TypeRelatedDocument)), tracker.string.Affects)
    affects!: RelatedDocument[]

  @Prop(TypeRef(tracker.class.Decision), tracker.string.SupersededBy)
    supersededBy?: Ref<Decision> | null

  @Prop(TypeBoolean(), tracker.string.DraftedByAI)
  @Hidden()
    aiDrafted?: boolean
}

@Model(tracker.class.TimeSpendReport, core.class.AttachedDoc, DOMAIN_TRACKER)
@UX(tracker.string.TimeSpendReport, tracker.icon.TimeReport)
export class TTimeSpendReport extends TAttachedDoc implements TimeSpendReport {
  @Prop(TypeRef(tracker.class.Issue), tracker.string.Issue)
  declare attachedTo: Ref<Issue>

  @Prop(TypeRef(contact.mixin.Employee), contact.string.Employee)
    employee!: Ref<Employee>

  @Prop(TypeDate(), tracker.string.TimeSpendReportDate)
    date!: Timestamp | null

  @Prop(TypeNumber(), tracker.string.TimeSpendReportValue)
    value!: number

  @Prop(TypeString(), tracker.string.TimeSpendReportDescription)
    description!: string
}

/**
 * @public
 */
@Model(tracker.class.IssueRelation, core.class.AttachedDoc, DOMAIN_TRACKER)
@UX(tracker.string.GanttDependency, tracker.icon.Issue)
export class TIssueRelation extends TAttachedDoc implements IssueRelation {
  @Prop(TypeRef(tracker.class.Issue), tracker.string.Issue)
  declare attachedTo: Ref<Issue>

  declare collection: 'relations'

  @Prop(TypeRef(tracker.class.Issue), tracker.string.Issue)
  @Index(IndexKind.Indexed)
    target!: Ref<Issue>

  @Prop(TypeString(), tracker.string.GanttDependency)
    kind!: DependencyKind

  @Prop(TypeNumber(), tracker.string.GanttLag)
    lag!: number
}
/**
 * @public
 */

@Model(tracker.class.Component, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Component, tracker.icon.Component, 'COMPONENT', 'label', undefined, tracker.string.Components)
export class TComponent extends TDoc implements Component {
  @Prop(TypeString(), tracker.string.Title)
  @Index(IndexKind.FullText)
    label!: string

  @Prop(TypeMarkup(), tracker.string.Description)
    description?: Markup

  @Prop(TypeRef(contact.mixin.Employee), tracker.string.ComponentLead)
    lead!: Ref<Employee> | null

  @Prop(TypeRef(contact.mixin.Employee), tracker.string.DefaultAssignee)
    defaultAssignee?: Ref<Employee> | null

  @Prop(Collection(chunter.class.ChatMessage), chunter.string.Comments)
    comments!: number

  @Prop(Collection(attachment.class.Attachment), attachment.string.Attachments, { shortLabel: attachment.string.Files })
    attachments?: number

  @Prop(TypeNumber(), tracker.string.Color)
    color?: number

  declare space: Ref<Project>
}

/**
 * @public
 */
@Model(tracker.class.Milestone, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Milestone, tracker.icon.Milestone, '', 'label', undefined, tracker.string.Milestones)
export class TMilestone extends TDoc implements Milestone {
  @Prop(TypeString(), tracker.string.Title)
  // @Index(IndexKind.FullText)
    label!: string

  @Prop(TypeMarkup(), tracker.string.Description)
    description?: Markup

  @Prop(TypeMilestoneStatus(), tracker.string.Status)
  @Index(IndexKind.Indexed)
    status!: MilestoneStatus

  @Prop(Collection(chunter.class.ChatMessage), chunter.string.Comments)
    comments!: number

  @Prop(Collection(attachment.class.Attachment), attachment.string.Attachments, { shortLabel: attachment.string.Files })
    attachments?: number

  @Prop(TypeDate(), tracker.string.StartDate)
    startDate!: Timestamp | null

  @Prop(TypeDate(), tracker.string.TargetDate)
    targetDate!: Timestamp

  @Prop(TypeBoolean(), tracker.string.Archive)
  @Hidden()
    archived?: boolean

  @Prop(TypeDate(), tracker.string.Release)
  @Hidden()
    releasedOn?: Timestamp | null

  @Prop(TypeNumber(), tracker.string.Color)
    color?: number

  declare space: Ref<Project>
}

@UX(core.string.Number)
@Model(tracker.class.TypeReportedTime, core.class.Type)
export class TTypeReportedTime extends TType {}

@UX(core.string.Number)
@Model(tracker.class.TypeEstimation, core.class.Type)
export class TTypeEstimation extends TType {}

@UX(core.string.Number)
@Model(tracker.class.TypeRemainingTime, core.class.Type)
export class TTypeRemainingTime extends TType {}

@Model(tracker.class.ProjectTargetPreference, preference.class.Preference)
export class TProjectTargetPreference extends TPreference implements ProjectTargetPreference {
  @Prop(TypeRef(core.class.Space), core.string.Space)
  declare attachedTo: Ref<Project>

  @Prop(TypeDate(), tracker.string.LastUpdated)
    usedOn!: Timestamp

  @Prop(TypeRecord(), getEmbeddedLabel('Properties'))
    props?: { key: string, value: any }[]
}

@Mixin(tracker.mixin.ClassicProjectTypeData, tracker.class.Project)
@UX(getEmbeddedLabel('Classic project'), tracker.icon.Issues)
export class TClassicProjectTypeData extends TProject implements RolesAssignment {
  [key: Ref<Role>]: AccountUuid[]
}

@Mixin(tracker.mixin.IssueTypeData, tracker.class.Issue)
@UX(getEmbeddedLabel('Issue'), tracker.icon.Issue)
export class TIssueTypeData extends TIssue {}

/**
 * Notification on Dependency-Shift.
 *
 * Persisted model class for the cascade-shift bundle notification. Extends
 * `CommonInboxNotification` so it inherits inbox/email/push routing for
 * free; the cascade-specific payload lives in the (un-`@Prop`'d) fields
 * which are still serialised as part of the Doc body — same pattern that
 * `TReactionInboxNotification` uses for its `ref`/`emoji` fields.
 *
 * @public
 */
@Model(tracker.class.DependencyShiftedNotification, notification.class.CommonInboxNotification)
export class TDependencyShiftedNotification extends TCommonInboxNotification implements DependencyShiftedNotification {
  @Prop(TypeRef(tracker.class.Issue), tracker.string.Issue)
    triggerIssueId!: Ref<Issue>

  @Prop(TypeString(), tracker.string.Issue)
    triggerIssueIdentifier!: string

  @Prop(TypeString(), tracker.string.Issue)
    triggerIssueTitle!: string

  triggerUserId!: AccountUuid

  shiftedIssues!: ShiftedIssuePayload[]

  @Prop(TypeString(), tracker.string.DependencyShifted)
    cascadeToken!: string
}

/**
 * Notification on Dependency-Shift.
 *
 * Short-lived signal doc (DOMAIN_TRACKER) a Gantt client writes into the
 * project space after a cascade commit. The `OnDependencyShiftRequest` server
 * trigger consumes it, dispatches notifications privileged, and removes it. It
 * deliberately carries no `triggerUserId` — the trigger derives the author
 * from `tx.modifiedBy` (anti-spoofing).
 *
 * @public
 */
@Model(tracker.class.DependencyShiftRequest, core.class.Doc, DOMAIN_TRACKER)
export class TDependencyShiftRequest extends TDoc implements DependencyShiftRequest {
  @Prop(TypeRef(tracker.class.Issue), tracker.string.Issue)
    triggerIssueId!: Ref<Issue>

  @Prop(TypeString(), tracker.string.Issue)
    triggerIssueIdentifier!: string

  @Prop(TypeString(), tracker.string.Issue)
    triggerIssueTitle!: string

  @Prop(TypeRef(tracker.class.Project), tracker.string.Project)
    triggerIssueSpace!: Ref<Project>

  shiftedIssues!: ShiftedIssuePayload[]

  @Prop(TypeString(), tracker.string.DependencyShifted)
    cascadeToken!: string
}

/**
 * @public
 */
@Model(tracker.class.Webhook, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Webhooks)
export class TWebhook extends TDoc implements Webhook {
  @Prop(TypeString(), tracker.string.Name)
    name!: string

  @Prop(TypeString(), tracker.string.WebhookUrl)
    url!: string

  @Prop(TypeString(), tracker.string.WebhookSecret)
  @Hidden()
    secret?: string

  @Prop(ArrOf(TypeString()), tracker.string.Webhooks)
    events!: WebhookEvent[]

  @Prop(TypeBoolean(), tracker.string.Enabled)
    enabled!: boolean

  @Prop(TypeString(), tracker.string.Webhooks)
  @Hidden()
    format?: 'json' | 'slack'

  lastStatus?: number
  lastDeliveredOn?: Timestamp
  lastError?: string | null
}

@Model(tracker.class.Dashboard, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Dashboard)
export class TDashboard extends TDoc implements Dashboard {
  @Prop(TypeString(), tracker.string.Name)
    name!: string

  @Prop(TypeRef(contact.class.Person), tracker.string.Assignee)
  @Index(IndexKind.Indexed)
    owner!: Ref<Person>

  @Prop(TypeBoolean(), tracker.string.Share)
    shared!: boolean

  widgets!: DashboardWidget[]
}

@Model(tracker.class.TimesheetApproval, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Timesheets)
export class TTimesheetApproval extends TDoc implements TimesheetApproval {
  @Prop(TypeRef(contact.mixin.Employee), tracker.string.Person)
  @Index(IndexKind.Indexed)
    employee!: Ref<Employee>

  @Prop(TypeDate(), tracker.string.ThisWeek)
  @Index(IndexKind.Indexed)
    weekStart!: Timestamp

  state!: 'submitted' | 'approved' | 'rejected'
  approver?: Ref<Person>
  note?: string
  decidedOn?: Timestamp
}

@Model(tracker.class.BillingRate, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Timesheets)
export class TBillingRate extends TDoc implements BillingRate {
  @Prop(TypeRef(contact.mixin.Employee), tracker.string.Person)
  @Index(IndexKind.Indexed)
    employee!: Ref<Employee>

  rate!: number
  currency!: string
}

@Model(tracker.class.AuditEvent, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.AuditLog)
export class TAuditEvent extends TDoc implements AuditEvent {
  @Prop(TypeString(), tracker.string.AuditLog)
    kind!: string

  @Prop(TypeRef(contact.class.Person), tracker.string.Person)
    actor?: Ref<Person>

  target!: string
  details!: string
}

@Model(tracker.class.AuditPolicy, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.AuditLog)
export class TAuditPolicy extends TDoc implements AuditPolicy {
  retentionDays!: number
}

@Model(tracker.class.RequestType, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.RequestType)
export class TRequestType extends TDoc implements RequestType {
  @Prop(TypeRef(tracker.class.Project), tracker.string.Project)
  @Index(IndexKind.Indexed)
  declare space: Ref<Project>

  @Prop(TypeString(), tracker.string.Name)
    name!: string

  @Prop(TypeString(), tracker.string.Description)
    description!: string

  priority!: IssuePriority
  slaHours?: number
}

@Model(tracker.class.AutomationRule, core.class.Doc, DOMAIN_TRACKER)
@UX(tracker.string.Automation)
export class TAutomationRule extends TDoc implements AutomationRule {
  @Prop(TypeRef(tracker.class.Project), tracker.string.Project)
  @Index(IndexKind.Indexed)
  declare space: Ref<Project>

  @Prop(TypeString(), tracker.string.Name)
    name!: string

  @Prop(TypeBoolean(), tracker.string.Enabled)
    enabled!: boolean

  @Prop(TypeString(), tracker.string.Automation)
    trigger!: AutomationTrigger

  conditions!: AutomationCondition[]
  actions!: AutomationAction[]
  runs?: number
  lastRun?: Timestamp
  lastError?: string | null
}
