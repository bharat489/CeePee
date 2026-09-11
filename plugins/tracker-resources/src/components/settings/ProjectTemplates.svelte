<!--
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
-->
<!--
  Project template gallery. Pick Scrum, Kanban, Bug tracking, Service desk
  or Simple, choose team-managed (anyone in the project configures it) or
  company-managed (owners and maintainers control workflow, permissions and
  schemes), name it, and the project comes up pre-configured: sprints, WIP
  limits, SLAs, request types, automation flags, permission and
  notification schemes.
-->
<script lang="ts">
  import core, { AccountRole, generateId, getCurrentAccount, type Data, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import task, { type ProjectType, type TaskType } from '@hcengineering/task'
  import { IssuePriority, MilestoneStatus, TimeReportDayType, type IssueStatus, type NotificationScheme, type PermissionScheme, type Project } from '@hcengineering/tracker'
  import { Button, getCurrentLocation, Label, navigate } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const client = getClient()
  const DAY = 86_400_000

  interface Template {
    id: 'scrum' | 'kanban' | 'bugs' | 'servicedesk' | 'simple'
    name: string
    tagline: string
    emoji: string
    bullets: string[]
    defaultManaged: 'team' | 'company'
  }
  const TEMPLATES: Template[] = [
    { id: 'scrum', name: 'Scrum', emoji: '🏃', tagline: 'Sprints, a groomed backlog, velocity and burndown.', bullets: ['Backlog and Sprints views, first two-week sprint ready', 'Parent issues follow their children; parents start when a child starts', 'Velocity, burndown, sprint report, control chart', 'Sprint end reminders on the dashboard'], defaultManaged: 'team' },
    { id: 'kanban', name: 'Kanban', emoji: '📊', tagline: 'Continuous flow with work-in-progress limits.', bullets: ['WIP limit of 5 on every in-progress column', 'Board with swimlanes by assignee, epic or priority', 'Cumulative flow diagram and cycle time', 'No sprints, no ceremonies'], defaultManaged: 'team' },
    { id: 'bugs', name: 'Bug tracking', emoji: '🐞', tagline: 'Triage, components, SLAs, versions.', bullets: ['SLA: Urgent 24h, High 72h, Medium 7 days', 'Component leads become default assignees', 'Fix version and affects version on every issue', 'Version report and release notes', 'A "Next release" milestone 30 days out'], defaultManaged: 'company' },
    { id: 'servicedesk', name: 'Service desk', emoji: '🎧', tagline: 'Requests from people outside the team, with SLAs and satisfaction.', bullets: ['Request types: Bug report, Feature request, Question, Access request', 'SLA per priority, breach warnings, queue view', 'Public help centre and submit form (integrations service)', 'Satisfaction rating when a request is resolved', 'Reporter and assignee notified on every change'], defaultManaged: 'company' },
    { id: 'simple', name: 'Simple', emoji: '📝', tagline: 'Issues, a board, milestones. Nothing else switched on.', bullets: ['Issues list and board', 'Milestones and components available when you need them', 'Add anything later from project settings'], defaultManaged: 'team' }
  ]
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

  let busy = false
  let error = ''
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
      const statusIds = (issueType?.statuses ?? []) as Ref<IssueStatus>[]
      const statuses: IssueStatus[] = statusIds.length > 0 ? await client.findAll(tracker.class.IssueStatus, { _id: { $in: statusIds } }) : []
      const defaultStatus = statusIds[0] ?? ('' as Ref<IssueStatus>)
      const me = getCurrentAccount().uuid

      const permissions: PermissionScheme | undefined = managed === 'company' ? { close: AccountRole.Maintainer, reopen: AccountRole.Maintainer, delete: AccountRole.Maintainer, moveSprint: AccountRole.Maintainer } : undefined
      const notificationScheme: NotificationScheme | undefined = picked.id === 'servicedesk' ? { statusChanged: { assignee: true, reporter: true, watchers: true, others: false }, commented: { assignee: true, reporter: true, watchers: true, others: false } } : undefined
      const wipLimits: Record<Ref<IssueStatus>, number> | undefined = picked.id === 'kanban' ? Object.fromEntries(statuses.filter((s) => s.category === task.statusCategory.Active).map((s) => [s._id, 5])) as Record<Ref<IssueStatus>, number> : undefined
      const sla: Record<string, number> | undefined = picked.id === 'bugs' ? { [String(IssuePriority.Urgent)]: 24, [String(IssuePriority.High)]: 72, [String(IssuePriority.Medium)]: 168 } : picked.id === 'servicedesk' ? { [String(IssuePriority.Urgent)]: 4, [String(IssuePriority.High)]: 24, [String(IssuePriority.Medium)]: 72, [String(IssuePriority.Low)]: 168 } : undefined
      const automation = picked.id === 'scrum' ? { parentFollowsChildren: true, startParentOnChildStart: true } : picked.id === 'bugs' ? { assignComponentLead: true } : undefined

      const projectId = generateId<Project>()
      const data: Data<Project> = {
        name: name.trim(),
        description: `${picked.name} project · ${managed === 'team' ? 'team-managed' : 'company-managed'}`,
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
        projectTemplate: `${picked.id}:${managed}`,
        ...(permissions !== undefined ? { permissions } : {}),
        ...(notificationScheme !== undefined ? { notificationScheme } : {}),
        ...(wipLimits !== undefined ? { wipLimits } : {}),
        ...(sla !== undefined ? { sla } : {}),
        ...(automation !== undefined ? { automation } : {})
      }
      await client.createDoc(tracker.class.Project, core.space.Space, data, projectId)
      await client.createMixin(projectId, tracker.class.Project, core.space.Space, ptype.targetClass, {})

      if (picked.id === 'scrum') {
        const start = Date.now()
        await client.createDoc(tracker.class.Sprint, projectId, { name: 'Sprint 1', startDate: start, endDate: start + 14 * DAY, state: 'planned', carriedOverTo: null })
      }
      if (picked.id === 'bugs') {
        await client.createDoc(tracker.class.Milestone, projectId, { label: 'Next release', description: '', status: MilestoneStatus.Planned, comments: 0, attachments: 0, startDate: Date.now(), targetDate: Date.now() + 30 * DAY })
      }
      if (picked.id === 'servicedesk') {
        for (const rt of [
          { name: 'Bug report', description: 'Something is broken. Tell us what you expected and what happened.', priority: IssuePriority.High, slaHours: 24 },
          { name: 'Feature request', description: 'Something you wish the product did.', priority: IssuePriority.Medium, slaHours: 168 },
          { name: 'Question', description: 'How do I…?', priority: IssuePriority.Low, slaHours: 48 },
          { name: 'Access request', description: 'Need access to a system, a workspace or a document.', priority: IssuePriority.Medium, slaHours: 8 }
        ]) await client.createDoc(tracker.class.RequestType, projectId, rt)
      }
      const loc = getCurrentLocation()
      navigate({ path: [loc.path[0], loc.path[1], 'tracker', projectId, picked.id === 'scrum' ? 'backlog' : picked.id === 'servicedesk' ? 'service-desk' : 'issues'] })
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      busy = false
    }
  }
</script>

<div class="tpl">
  <header class="tpl__head">
    <span class="tpl__title"><Label label={tracker.string.ProjectTemplates} /></span>
    <span class="tpl__sub"><Label label={tracker.string.ProjectTemplatesHint} /></span>
  </header>

  <div class="gallery">
    {#each TEMPLATES as t, idx (t.id)}
      <button class="tcard motion-rise" style="--i: {idx}" class:tcard--on={picked.id === t.id} on:click={() => { pick(t) }}>
        <span class="tcard__emoji">{t.emoji}</span>
        <span class="tcard__name">{t.name}</span>
        <span class="tcard__tag">{t.tagline}</span>
      </button>
    {/each}
  </div>

  <section class="card motion-pop">
    <div class="card__cols">
      <div class="card__col">
        <span class="card__title">{picked.emoji} {picked.name}</span>
        <ul class="bullets">{#each picked.bullets as b}<li>{b}</li>{/each}</ul>
      </div>
      <div class="card__col">
        <span class="card__title">How it is managed</span>
        <label class="radio" class:radio--on={managed === 'team'}><input type="radio" bind:group={managed} value="team" /><span><b>Team-managed</b><small>Anyone in the project can change its workflow, fields and rules. Members auto-join. Good for one team that owns its process.</small></span></label>
        <label class="radio" class:radio--on={managed === 'company'}><input type="radio" bind:group={managed} value="company" /><span><b>Company-managed</b><small>Owners and maintainers control workflow, permissions and schemes; closing, reopening, deleting and sprint moves need a maintainer. Good for shared standards across teams.</small></span></label>
      </div>
    </div>
    <div class="form">
      <label class="field"><span>Project name</span><input class="input" placeholder="Payments platform" bind:value={name} /></label>
      <label class="field field--key"><span>Key</span><input class="input" placeholder="PAY" maxlength="5" bind:value={identifier} on:input={() => { touchedId = true }} /></label>
      <Button kind={'primary'} label={tracker.string.NewProject} disabled={busy || name.trim() === ''} on:click={() => { void create() }} />
    </div>
    {#if error !== ''}<p class="err">{error}</p>{/if}
    <p class="muted">Everything a template switches on lives in the project's settings afterwards: Automation, Fields, Permissions, Service desk, Releases.</p>
  </section>
</div>

<style lang="scss">
  .tpl { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem 1.5rem; max-width: 64rem; overflow: auto; }
  .tpl__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .tpl__title { font-size: 1.25rem; font-weight: 600; color: var(--theme-caption-color); }
  .tpl__sub, .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem; }
  .tcard { display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); text-align: left; font: inherit; color: var(--theme-content-color); cursor: pointer; transition: border-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
    &:hover { transform: translateY(-2px); box-shadow: var(--accent-glow); }
    &--on { border-color: var(--accent-brand); box-shadow: 0 0 0 3px var(--accent-brand-soft); }
  }
  .tcard__emoji { font-size: 1.5rem; }
  .tcard__name { font-weight: 600; color: var(--theme-caption-color); }
  .tcard__tag { font-size: 0.75rem; color: var(--theme-dark-color); line-height: 1.4; }
  .card { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.1rem 1.25rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); }
  .card__cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1.25rem; }
  .card__col { display: flex; flex-direction: column; gap: 0.5rem; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .bullets { margin: 0; padding-left: 1.2rem; font-size: 0.875rem; color: var(--theme-content-color); line-height: 1.6; }
  .radio { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.6rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; cursor: pointer; font-size: 0.875rem; color: var(--theme-content-color); &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); } input { margin-top: 0.2rem; } span { display: flex; flex-direction: column; gap: 0.1rem; } b { color: var(--theme-caption-color); } small { font-size: 0.75rem; color: var(--theme-dark-color); line-height: 1.4; } }
  .form { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 12rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--theme-dark-color); &--key { flex: 0; min-width: 6rem; } }
  .input { padding: 0.5rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.9375rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .err { margin: 0; font-size: 0.8125rem; color: var(--negative-button-default); }
</style>
