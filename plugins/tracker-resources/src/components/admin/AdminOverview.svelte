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
  Admin overview: usage analytics and health for the workspace. Counts come
  from the same queries the apps use (nothing is sampled or estimated), so
  the numbers here match what people see. Quick links lead to every other
  administration page.
-->
<script lang="ts">
  import contact from '@hcengineering/contact'
  import { getAccountClient } from '@hcengineering/contact-resources'
  import core, { AccountRole, type Class, type Doc, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { onMount } from 'svelte'

  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import { DAY, goCategory, goSection, LINKS } from './sections'

  const client = getClient()
  const DOCUMENT = 'document:class:Document' as Ref<Class<Doc>>
  const TEAMSPACE = 'document:class:Teamspace' as Ref<Class<Doc>>
  const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>

  interface Stats {
    members: number
    byRole: Record<string, number>
    online: number
    deactivated: number
    groups: number
    projects: number
    archivedProjects: number
    restrictedProjects: number
    issues: number
    openIssues: number
    created7: number
    done7: number
    teamspaces: number
    documents: number
    messages7: number
    rules: number
    rulesOn: number
    runs7: number
    failed7: number
    queue: number
    retrying: number
    failedJobs: number
    audit7: number
    retentionDays: number
    siem: boolean
    customRoles: number
  }
  let stats: Stats | undefined
  let error = ''
  const count = async (cls: Ref<Class<Doc>>, q: Record<string, unknown> = {}): Promise<number> => (await client.findAll(cls, q as any, { limit: 1, total: true })).total

  onMount(async () => {
    try {
      const now = Date.now()
      const week = now - 7 * DAY
      const members = await getAccountClient().getWorkspaceMembers().catch(() => [])
      const byRole: Record<string, number> = {}
      for (const m of members) byRole[m.role] = (byRole[m.role] ?? 0) + 1
      const statuses = await client.findAll(tracker.class.IssueStatus, {})
      const closed = statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id)
      const policy = (await client.findAll(tracker.class.AuditPolicy, {}, { limit: 1 }))[0]
      const projects = await client.findAll(tracker.class.Project, {})
      const roles = await client.findAll(core.class.Role, {})
      stats = {
        members: members.length,
        byRole,
        online: await count(core.class.UserStatus, { online: true }).catch(() => 0),
        deactivated: await count(contact.mixin.Employee, { active: false }),
        groups: await count(contact.class.UserGroup),
        projects: projects.filter((p) => !p.archived).length,
        archivedProjects: projects.filter((p) => p.archived).length,
        restrictedProjects: projects.filter((p) => (p as any).restricted === true).length,
        issues: await count(tracker.class.Issue),
        openIssues: await count(tracker.class.Issue, { status: { $nin: closed } }),
        created7: await count(tracker.class.Issue, { createdOn: { $gte: week } }),
        done7: await count(tracker.class.Issue, { status: { $in: closed }, modifiedOn: { $gte: week } }),
        teamspaces: await count(TEAMSPACE, { archived: false }),
        documents: await count(DOCUMENT),
        messages7: await count(CHAT_MESSAGE, { createdOn: { $gte: week } }),
        rules: await count(tracker.class.AutomationRule),
        rulesOn: await count(tracker.class.AutomationRule, { enabled: true }),
        runs7: await count(tracker.class.AutomationRun, { at: { $gte: week } }),
        failed7: await count(tracker.class.AutomationRun, { at: { $gte: week }, ok: false }),
        queue: await count(tracker.class.AutomationJob, { state: 'waiting' }),
        retrying: await count(tracker.class.AutomationJob, { state: 'retry' }),
        failedJobs: await count(tracker.class.AutomationJob, { state: 'failed' }),
        audit7: await count(tracker.class.AuditEvent, { createdOn: { $gte: week } }),
        retentionDays: policy?.retentionDays ?? 0,
        siem: (policy?.siemUrl ?? '') !== '',
        customRoles: roles.filter((r) => r._id !== core.role.Admin).length
      }
    } catch (e: any) {
      error = String(e?.message ?? e)
    }
  })

  const ROLE_LABEL: Record<string, string> = { [AccountRole.Owner]: 'Owners', [AccountRole.Maintainer]: 'Maintainers', [AccountRole.User]: 'Members', [AccountRole.Guest]: 'Guests', [AccountRole.DocGuest]: 'Doc guests', [AccountRole.ReadOnlyGuest]: 'Read-only guests', [AccountRole.Admin]: 'Admins' }
  const ROLE_ORDER = [AccountRole.Owner, AccountRole.Maintainer, AccountRole.User, AccountRole.Guest, AccountRole.DocGuest, AccountRole.ReadOnlyGuest, AccountRole.Admin]
  const ROLE_COLOR: Record<string, string> = { [AccountRole.Owner]: '#6366f1', [AccountRole.Maintainer]: '#0ea5e9', [AccountRole.User]: '#22c55e', [AccountRole.Guest]: '#f59e0b', [AccountRole.DocGuest]: '#f97316', [AccountRole.ReadOnlyGuest]: '#94a3b8', [AccountRole.Admin]: '#a855f7' }
  $: roleRows = stats === undefined ? [] : ROLE_ORDER.filter((r) => (stats?.byRole[r] ?? 0) > 0).map((r) => ({ role: r, label: ROLE_LABEL[r] ?? r, n: stats?.byRole[r] ?? 0, color: ROLE_COLOR[r] ?? '#94a3b8' }))
</script>

{#if error !== ''}
  <p class="err">{error}</p>
{:else if stats === undefined}
  <div class="grid grid--kpi">{#each Array(8) as _}<div class="card card--skeleton" />{/each}</div>
{:else}
  <div class="grid grid--kpi">
    <button class="card kpi motion-rise" style="--i: 0" on:click={() => { goSection('users') }}><span class="kpi__ic" style="--c: #6366f1">{@html icon('people')}</span><span class="kpi__n">{stats.members}</span><span class="kpi__l">people in the workspace</span><span class="kpi__sub">{stats.online} online now · {stats.deactivated} deactivated</span></button>
    <button class="card kpi motion-rise" style="--i: 1" on:click={() => { goCategory('allSpaces') }}><span class="kpi__ic" style="--c: #0ea5e9">{@html icon('board')}</span><span class="kpi__n">{stats.projects}</span><span class="kpi__l">active projects</span><span class="kpi__sub">{stats.archivedProjects} archived · {stats.restrictedProjects} enforcing roles</span></button>
    <button class="card kpi motion-rise" style="--i: 2" on:click={() => { goCategory('allSpaces') }}><span class="kpi__ic" style="--c: #22c55e">{@html icon('issue')}</span><span class="kpi__n">{stats.openIssues}</span><span class="kpi__l">open issues of {stats.issues}</span><span class="kpi__sub">{stats.created7} created · {stats.done7} closed in 7 days</span></button>
    <button class="card kpi motion-rise" style="--i: 3" on:click={() => { goSection('automation') }}><span class="kpi__ic" style="--c: #f59e0b">{@html icon('workflow')}</span><span class="kpi__n">{stats.runs7}</span><span class="kpi__l">automation runs in 7 days</span><span class="kpi__sub" class:kpi__sub--bad={stats.failed7 > 0}>{stats.failed7} failed · {stats.queue + stats.retrying} queued</span></button>
    <div class="card kpi motion-rise" style="--i: 4"><span class="kpi__ic" style="--c: #a855f7">{@html icon('docs')}</span><span class="kpi__n">{stats.documents}</span><span class="kpi__l">pages in {stats.teamspaces} teamspaces</span><span class="kpi__sub">{stats.messages7} chat messages in 7 days</span></div>
    <button class="card kpi motion-rise" style="--i: 5" on:click={() => { goSection('groups') }}><span class="kpi__ic" style="--c: #14b8a6">{@html icon('people')}</span><span class="kpi__n">{stats.groups}</span><span class="kpi__l">user groups</span><span class="kpi__sub">{stats.customRoles} custom roles</span></button>
    <button class="card kpi motion-rise" style="--i: 6" on:click={() => { goCategory('audit') }}><span class="kpi__ic" style="--c: #f43f5e">{@html icon('check')}</span><span class="kpi__n">{stats.audit7}</span><span class="kpi__l">audit events in 7 days</span><span class="kpi__sub">{stats.retentionDays > 0 ? `kept ${stats.retentionDays} days` : 'kept forever'} · SIEM {stats.siem ? 'on' : 'off'}</span></button>
    <button class="card kpi motion-rise" style="--i: 7" on:click={() => { goSection('security') }}><span class="kpi__ic" style="--c: #64748b">{@html icon('settings')}</span><span class="kpi__n">{stats.rulesOn}<span class="kpi__of">/{stats.rules}</span></span><span class="kpi__l">automation rules enabled</span><span class="kpi__sub" class:kpi__sub--bad={stats.failedJobs > 0}>{stats.failedJobs} deliveries gave up</span></button>
  </div>

  <div class="grid grid--two">
    <section class="card motion-pop">
      <span class="card__t">People by role</span>
      <div class="bar">{#each roleRows as r (r.role)}<span class="bar__seg" style="flex: {r.n}; background: {r.color}" title="{r.label}: {r.n}" />{/each}</div>
      <ul class="legend">{#each roleRows as r (r.role)}<li><i style="background: {r.color}" /><span>{r.label}</span><b>{r.n}</b></li>{/each}</ul>
      <p class="muted">Owners administer everything; maintainers manage projects and settings; members work; guests see only what they are invited to. Custom roles add finer permissions inside a project or teamspace.</p>
    </section>
    <section class="card motion-pop">
      <span class="card__t">Administration pages</span>
      <div class="links">
        {#each LINKS as l (l.category)}
          <button class="link" on:click={() => { goCategory(l.category) }}><span class="link__l">{l.label}</span><span class="link__h">{l.hint}</span></button>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style lang="scss">
  .grid { display: grid; gap: 0.75rem; margin-bottom: 0.9rem; }
  .grid--kpi { grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); }
  .grid--two { grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); text-align: left; color: var(--theme-content-color); font: inherit; &--skeleton { min-height: 7rem; background: linear-gradient(90deg, var(--theme-panel-color), var(--theme-button-hovered), var(--theme-panel-color)); background-size: 200% 100%; animation: sk 1.2s linear infinite; } }
  @keyframes sk { to { background-position: -200% 0; } }
  .card__t { font-weight: 700; color: var(--theme-caption-color); }
  button.card { cursor: pointer; transition: transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard); &:hover { transform: translateY(-2px); box-shadow: var(--accent-glow); } }
  .kpi { gap: 0.15rem; }
  .kpi__ic { display: inline-flex; width: 1.9rem; height: 1.9rem; align-items: center; justify-content: center; border-radius: 0.55rem; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); margin-bottom: 0.3rem; :global(svg) { width: 1rem; height: 1rem; } }
  .kpi__n { font-size: 1.7rem; font-weight: 700; color: var(--theme-caption-color); line-height: 1.1; letter-spacing: -0.02em; }
  .kpi__of { font-size: 1rem; color: var(--theme-dark-color); font-weight: 500; }
  .kpi__l { font-size: 0.8375rem; color: var(--theme-content-color); }
  .kpi__sub { font-size: 0.72rem; color: var(--theme-trans-color); &--bad { color: var(--negative-button-default); font-weight: 600; } }
  .bar { display: flex; height: 0.7rem; border-radius: 999px; overflow: hidden; background: var(--theme-button-default); }
  .bar__seg { min-width: 3px; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; li { display: inline-flex; align-items: center; gap: 0.35rem; } i { width: 0.6rem; height: 0.6rem; border-radius: 50%; } b { color: var(--theme-caption-color); } }
  .muted { margin: 0; font-size: 0.78rem; color: var(--theme-dark-color); line-height: 1.45; }
  .links { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.4rem; }
  .link { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.55rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-bg-color); font: inherit; text-align: left; cursor: pointer; &:hover { border-color: var(--accent-brand); } }
  .link__l { font-size: 0.8375rem; font-weight: 600; color: var(--theme-caption-color); }
  .link__h { font-size: 0.7rem; color: var(--theme-dark-color); }
  .err { color: var(--negative-button-default); }
</style>
