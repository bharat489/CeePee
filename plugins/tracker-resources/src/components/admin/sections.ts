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

// The Admin Center's sections and the settings pages it links to.

import { getCurrentResolvedLocation, navigate } from '@hcengineering/ui'

export interface AdminSection {
  id: string
  label: string
  hint: string
  icon: string
}

export const SECTIONS: AdminSection[] = [
  { id: 'overview', label: 'Overview', hint: 'Usage, people, work, automation and governance at a glance', icon: 'dashboard' },
  { id: 'users', label: 'Users', hint: 'Roles, groups, status, invites, bulk changes', icon: 'people' },
  { id: 'groups', label: 'Groups', hint: 'Named sets of people applied to projects, teamspaces and channels', icon: 'people' },
  { id: 'roles', label: 'Roles & permissions', hint: 'Custom roles per project type, granular permissions, assignments', icon: 'settings' },
  { id: 'security', label: 'Security', hint: 'Guests, sign-up, retention, audit streaming, identity', icon: 'check' },
  { id: 'automation', label: 'Automation', hint: 'Every rule in the workspace, failures and the queue', icon: 'workflow' }
]

/** Other settings pages that belong to administration; `category` is the settings category name. */
export const LINKS: Array<{ category: string, label: string, hint: string }> = [
  { category: 'owners', label: 'Members', hint: 'Job titles and workspace roles' },
  { category: 'audit', label: 'Audit log', hint: 'Who changed what, when' },
  { category: 'org-console', label: 'Organisation console', hint: 'Public surfaces, integrations, data export' },
  { category: 'guestPermissions', label: 'Guest permissions', hint: 'What external users may see and do' },
  { category: 'invites', label: 'Invite settings', hint: 'Invite links, expiry, default role' },
  { category: 'api-access', label: 'API access', hint: 'Tokens and SCIM provisioning' },
  { category: 'webhooks', label: 'Webhooks', hint: 'Outgoing events' },
  { category: 'jira-import', label: 'Import', hint: 'Jira, CSV and other sources' },
  { category: 'export', label: 'Export', hint: 'Take the data out' },
  { category: 'email-templates', label: 'Email templates', hint: 'Customer and notification emails' },
  { category: 'reminders', label: 'Notifications', hint: 'Digest and reminder defaults' },
  { category: 'spaceTypes', label: 'Space types', hint: 'Project and teamspace types, statuses, task types' },
  { category: 'capacity', label: 'Capacity', hint: 'Hours per week per person, overload threshold' },
  { category: 'notificationDefaults', label: 'Notification defaults', hint: 'What everyone receives unless they change it' },
  { category: 'classes', label: 'Custom fields', hint: 'Attributes on every class' },
  { category: 'backup', label: 'Backup', hint: 'Workspace backups' }
]

export function goSection (id: string): void {
  const loc = getCurrentResolvedLocation()
  loc.path[4] = 'administration'
  loc.path[5] = id
  loc.path.length = 6
  navigate(loc)
}

export function goCategory (category: string): void {
  const loc = getCurrentResolvedLocation()
  loc.path[4] = category
  loc.path.length = 5
  navigate(loc)
}

export const DAY = 86_400_000

export function ago (t: number | undefined): string {
  if (t === undefined || t === 0) return 'never'
  const d = Date.now() - t
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`
  if (d < DAY) return `${Math.floor(d / 3_600_000)} h ago`
  const days = Math.floor(d / DAY)
  return days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(t).toLocaleDateString()
}
