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
  Permission and notification schemes for one project.

  Permissions: the minimum workspace role needed to close, delete or
  reassign issues, and per-field edit locks. Enforced by a server trigger,
  so the API and imports obey them too. Issue-level secrecy is the space
  model's job: a private project only its members can see.

  Notifications: which events in this project reach people's inboxes.
  Enforced server-side by dropping the notification before delivery.
-->
<script lang="ts">
  import { AccountRole, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type NotificationScheme, type PermissionScheme, type Project } from '@hcengineering/tracker'
  import { Label, Toggle } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const query = createQuery()
  let project: Project | undefined
  $: query.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: perms = project?.permissions ?? {}
  $: notify = project?.notificationScheme ?? {}

  const ROLES: Array<{ id: AccountRole, label: string }> = [
    { id: AccountRole.User, label: 'Any member' },
    { id: AccountRole.Maintainer, label: 'Maintainers and owners' },
    { id: AccountRole.Owner, label: 'Owners only' }
  ]
  const ACTIONS: Array<{ key: keyof PermissionScheme, label: string, hint: string }> = [
    { key: 'close', label: 'Close or cancel issues', hint: 'Moving an issue to a done or cancelled status.' },
    { key: 'reopen', label: 'Reopen issues', hint: 'Moving a done issue back to an open status.' },
    { key: 'delete', label: 'Delete issues', hint: 'Permanent removal.' },
    { key: 'reassign', label: 'Change assignee', hint: 'Assigning to anyone, including yourself.' },
    { key: 'changePriority', label: 'Change priority', hint: '' },
    { key: 'editEstimates', label: 'Edit estimates and story points', hint: '' },
    { key: 'editDates', label: 'Edit due, start and SLA dates', hint: '' },
    { key: 'moveSprint', label: 'Move between sprints and milestones', hint: '' }
  ]
  const EVENTS: Array<{ key: keyof NotificationScheme, label: string, hint: string }> = [
    { key: 'assigned', label: 'Assigned to me', hint: 'When someone assigns you an issue.' },
    { key: 'statusChanged', label: 'Status changed', hint: 'On issues you follow.' },
    { key: 'commented', label: 'New comment', hint: 'On issues you follow.' },
    { key: 'mentioned', label: 'Mentioned', hint: 'Someone @-mentions you.' },
    { key: 'otherChanges', label: 'Other field changes', hint: 'Priority, dates, labels and the rest.' }
  ]

  async function setRole (key: keyof PermissionScheme, role: AccountRole): Promise<void> {
    if (project === undefined) return
    const next: PermissionScheme = { ...perms }
    if (role === AccountRole.User) delete next[key]
    else next[key] = role
    await client.update(project, { permissions: next })
  }
  function onRole (key: keyof PermissionScheme, e: Event): void {
    void setRole(key, (e.currentTarget as HTMLSelectElement).value as AccountRole)
  }
  async function setEvent (key: keyof NotificationScheme, on: boolean): Promise<void> {
    if (project === undefined) return
    const next: NotificationScheme = { ...notify }
    if (on) delete next[key]
    else next[key] = false
    await client.update(project, { notificationScheme: next })
  }
</script>

<div class="perm">
  <header class="perm__head">
    <span class="perm__title"><Label label={tracker.string.Permissions} /></span>
    <span class="perm__sub"><Label label={tracker.string.PermissionsHint} /></span>
  </header>

  <section class="card motion-rise" style="--i: 0">
    <span class="card__title">Who may…</span>
    {#each ACTIONS as a, idx (a.key)}
      <div class="row motion-rise" style="--i: {idx}">
        <div class="row__main"><span class="row__name">{a.label}</span>{#if a.hint}<span class="row__hint">{a.hint}</span>{/if}</div>
        <select class="select" value={perms[a.key] ?? AccountRole.User} on:change={(e) => { onRole(a.key, e) }}>
          {#each ROLES as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
        </select>
      </div>
    {/each}
    <p class="muted">Owners are never restricted. For issues only some people may <i>see</i>, make the project private — visibility is decided by the space, and this is deliberate: a field-level filter that pretends to hide data is worse than none.</p>
  </section>

  <section class="card motion-rise" style="--i: 1">
    <span class="card__title">Notifications from this project</span>
    {#each EVENTS as ev, idx (ev.key)}
      <div class="row motion-rise" style="--i: {idx}">
        <div class="row__main"><span class="row__name">{ev.label}</span><span class="row__hint">{ev.hint}</span></div>
        <Toggle on={notify[ev.key] !== false} on:change={(e) => { void setEvent(ev.key, e.detail) }} />
      </div>
    {/each}
    <p class="muted">People's own notification preferences still apply on top; this only removes events the project has switched off. Email delivery uses the mail service when it is configured; the daily digest comes from the integrations service.</p>
  </section>
</div>

<style lang="scss">
  .perm { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; max-width: 56rem; overflow: auto; }
  .perm__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .perm__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .perm__sub, .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); line-height: 1.5; }
  .card { display: flex; flex-direction: column; gap: 0.4rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .row { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0; border-top: 1px solid var(--theme-divider-color); }
  .row__main { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
  .row__name { color: var(--theme-caption-color); font-weight: 500; }
  .row__hint { font-size: 0.75rem; color: var(--theme-dark-color); }
  .select { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
</style>
