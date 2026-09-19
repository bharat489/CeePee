import type { Builder } from '@hcengineering/model'
import core, { type Class, type Doc, type Permission, type Ref, type Tx } from '@hcengineering/core'
import { type IntlString } from '@hcengineering/platform'
import tracker from '@hcengineering/tracker'

export function definePermissions (builder: Builder): void {
  builder.createDoc(
    core.class.Permission,
    core.space.Model,
    {
      label: tracker.string.ForbidCreateProjectPermission,
      txClass: core.class.TxCreateDoc,
      objectClass: tracker.class.Project,
      forbid: true,
      scope: 'workspace',
      description: tracker.string.ForbidCreateProjectPermissionDescription
    },
    tracker.permission.ForbidCreateProject
  )

  // Granular, role-based project permissions. They apply to projects that enforce roles
  // (restricted spaces): a member then needs a role that grants the matching permission.
  const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
  const granular: Array<[Ref<Permission>, IntlString, IntlString, Ref<Class<Tx>> | undefined, Ref<Class<Doc>>]> = [
    [tracker.permission.CreateIssue, tracker.string.CreateIssuePermission, tracker.string.CreateIssuePermissionDescription, core.class.TxCreateDoc, tracker.class.Issue],
    [tracker.permission.EditIssue, tracker.string.EditIssuePermission, tracker.string.EditIssuePermissionDescription, core.class.TxUpdateDoc, tracker.class.Issue],
    [tracker.permission.DeleteIssue, tracker.string.DeleteIssuePermission, tracker.string.DeleteIssuePermissionDescription, core.class.TxRemoveDoc, tracker.class.Issue],
    [tracker.permission.Comment, tracker.string.CommentPermission, tracker.string.CommentPermissionDescription, core.class.TxCreateDoc, CHAT_MESSAGE],
    [tracker.permission.ManageSprints, tracker.string.ManageSprintsPermission, tracker.string.ManageSprintsPermissionDescription, undefined, tracker.class.Sprint],
    [tracker.permission.ManageComponents, tracker.string.ManageComponentsPermission, tracker.string.ManageComponentsPermissionDescription, undefined, tracker.class.Component],
    [tracker.permission.ManageMilestones, tracker.string.ManageMilestonesPermission, tracker.string.ManageMilestonesPermissionDescription, undefined, tracker.class.Milestone],
    [tracker.permission.ManageAutomation, tracker.string.ManageAutomationPermission, tracker.string.ManageAutomationPermissionDescription, undefined, tracker.class.AutomationRule]
  ]
  for (const [_id, label, description, txClass, objectClass] of granular) {
    builder.createDoc(core.class.Permission, core.space.Model, { label, description, scope: 'space', objectClass, ...(txClass !== undefined ? { txClass } : {}) }, _id)
  }
}
