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
  Project home. The header and tab strip follow Jira's space page: a "Spaces"
  crumb, the project icon and name, a members button and a "…" menu on the
  left; share, ask and full-screen on the right; then Summary, List, Board,
  Backlog, Calendar, Timeline, Docs, Forms, Reports, Dashboard, Workflow and
  a More menu. Each tab hosts the real view for that job.
-->
<script lang="ts">
  import contact, { type Employee } from '@hcengineering/contact'
  import { CombineAvatars } from '@hcengineering/contact-resources'
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Project } from '@hcengineering/tracker'
  import { Component, showPopup, type AnyComponent } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import workbench from '@hcengineering/workbench'
  import { openWidget } from '@hcengineering/workbench-resources'

  import tracker from '../../plugin'
  import CreateProject from './CreateProject.svelte'
  import ProjectSummary from './ProjectSummary.svelte'
  import IssueCalendar from './IssueCalendar.svelte'
  import ProjectDocs from './ProjectDocs.svelte'
  import ReportsOverview from '../reports/ReportsOverview.svelte'
  import { icon } from './icons'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const pq = createQuery()
  const eq = createQuery()
  let project: Project | undefined
  let employees: Employee[] = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: members = employees.filter((e) => e.personUuid != null && (project?.members ?? []).includes(e.personUuid)).map((e) => e._id)

  type TabId = 'summary' | 'list' | 'board' | 'backlog' | 'calendar' | 'timeline' | 'docs' | 'forms' | 'reports' | 'dashboard' | 'workflow' | 'sprints' | 'swimlanes' | 'roadmap' | 'components' | 'milestones' | 'epics' | 'initiatives' | 'decisions' | 'ideas' | 'servicedesk' | 'automation' | 'releases' | 'assets' | 'oncall' | 'fields' | 'permissions' | 'templates'
  interface Tab { id: TabId, label: string, icon: string, component?: AnyComponent, props?: Record<string, any>, more?: boolean }
  const issuesProps = (title: any, kind?: any): Record<string, any> => ({ icon: tracker.icon.Issues, title, config: kind === undefined ? [['all', tracker.string.All, {}], ['active', tracker.string.Active, {}], ['backlog', tracker.string.Backlog, {}], ['archived', tracker.string.Archived, {}]] : [['all', tracker.string.All, { kind }]] })
  const TABS: Tab[] = [
    { id: 'summary', label: 'Summary', icon: 'globe' },
    { id: 'list', label: 'List', icon: 'list', component: tracker.component.Issues, props: { ...issuesProps(tracker.string.Issues), viewletDescriptor: view.viewlet.Table } },
    { id: 'board', label: 'Board', icon: 'board', component: tracker.component.Issues, props: { ...issuesProps(tracker.string.Issues), viewletDescriptor: tracker.viewlet.Kanban } },
    { id: 'backlog', label: 'Backlog', icon: 'backlog', component: tracker.component.ProjectBacklog },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'timeline', label: 'Timeline', icon: 'timeline', component: tracker.component.Issues, props: { ...issuesProps(tracker.string.Issues), viewletDescriptor: tracker.viewlet.Gantt } },
    { id: 'docs', label: 'Docs', icon: 'docs' },
    { id: 'forms', label: 'Forms', icon: 'forms', component: tracker.component.Forms },
    { id: 'reports', label: 'Reports', icon: 'reports' },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', component: tracker.component.Dashboard },
    { id: 'workflow', label: 'Workflow', icon: 'workflow', component: tracker.component.WorkflowDesigner },
    { id: 'sprints', label: 'Sprints', icon: 'timeline', component: tracker.component.ProjectSprints, more: true },
    { id: 'swimlanes', label: 'Board · swimlanes', icon: 'board', component: tracker.component.SwimlaneBoard, more: true },
    { id: 'roadmap', label: 'Roadmap · all projects', icon: 'timeline', component: tracker.component.Roadmap, more: true },
    { id: 'epics', label: 'Epics', icon: 'epic', component: tracker.component.Issues, props: issuesProps(tracker.string.Epics, tracker.taskTypes.Epic), more: true },
    { id: 'initiatives', label: 'Initiatives', icon: 'initiative', component: tracker.component.Issues, props: issuesProps(tracker.string.Initiatives, tracker.taskTypes.Initiative), more: true },
    { id: 'components', label: 'Components', icon: 'components', component: tracker.component.ProjectComponents, more: true },
    { id: 'milestones', label: 'Milestones', icon: 'milestone', component: tracker.component.Milestones, more: true },
    { id: 'releases', label: 'Releases', icon: 'milestone', component: tracker.component.Releases, more: true },
    { id: 'decisions', label: 'Decisions', icon: 'docs', component: tracker.component.Decisions, more: true },
    { id: 'ideas', label: 'Ideas', icon: 'ideas', component: tracker.component.Ideas, more: true },
    { id: 'servicedesk', label: 'Service desk', icon: 'servicedesk', component: tracker.component.ServiceDesk, more: true },
    { id: 'automation', label: 'Automation', icon: 'automation', component: tracker.component.ProjectAutomation, more: true },
    { id: 'assets', label: 'Assets', icon: 'components', component: tracker.component.Assets, more: true },
    { id: 'oncall', label: 'On-call', icon: 'servicedesk', component: tracker.component.OnCall, more: true },
    { id: 'fields', label: 'Fields', icon: 'fields', component: tracker.component.FieldsSetup, more: true },
    { id: 'permissions', label: 'Permissions', icon: 'permissions', component: tracker.component.ProjectPermissions, more: true },
    { id: 'templates', label: 'Templates', icon: 'docs', component: tracker.component.ProjectTemplates, more: true }
  ]
  const KEY = (id: string): string => `ceepee.projectTab.${id}`
  let tab: TabId = 'summary'
  let moreOpen = false
  let menuOpen = false
  $: {
    try {
      const saved = localStorage.getItem(KEY(currentSpace))
      if (saved !== null && TABS.some((t) => t.id === saved)) tab = saved as TabId
    } catch {}
  }
  function pick (t: TabId): void {
    tab = t
    moreOpen = false
    menuOpen = false
    try { localStorage.setItem(KEY(currentSpace), t) } catch {}
  }
  $: active = TABS.find((t) => t.id === tab) ?? TABS[0]
  $: primary = TABS.filter((t) => t.more !== true)
  $: extra = TABS.filter((t) => t.more === true)
  function settings (): void {
    menuOpen = false
    if (project !== undefined) showPopup(CreateProject, { project })
  }
  let copied = false
  async function share (): Promise<void> {
    menuOpen = false
    try {
      await navigator.clipboard.writeText(window.location.href)
      copied = true
      setTimeout(() => { copied = false }, 1500)
    } catch {}
  }
  function ask (): void {
    const widget = client.getModel().findAllSync(workbench.class.Widget, { _id: 'tracker:ids:AssistantWidget' as any })[0]
    if (widget !== undefined) openWidget(widget, undefined, { active: true, openedByUser: true })
  }
  let full = false
  function fullscreen (): void {
    if (document.fullscreenElement != null) {
      void document.exitFullscreen()
      full = false
    } else {
      void document.documentElement.requestFullscreen?.()
      full = true
    }
  }
  const initials = (p: Project): string => p.identifier.slice(0, 2).toUpperCase()
  const hue = (p: Project | undefined): number => (p === undefined ? 215 : (p.identifier.charCodeAt(0) * 37 + p.identifier.length * 11) % 360)
  function closeMenus (e: MouseEvent): void {
    const t = e.target as HTMLElement | null
    if (t?.closest('.ph__menu-wrap') === null) {
      moreOpen = false
      menuOpen = false
    }
  }
</script>

<svelte:window on:click={closeMenus} />

<div class="ph">
  <header class="ph__head">
    <div class="ph__left">
      <span class="ph__crumb">Spaces</span>
      <div class="ph__title">
        <span class="ph__tile" style="--h: {hue(project)}">{project !== undefined ? initials(project) : ''}</span>
        <h1 class="ph__name">{project?.name ?? ''}</h1>
        {#if members.length > 0}<span class="ph__members"><CombineAvatars _class={contact.mixin.Employee} items={members} size={'x-small'} limit={4} /></span>{/if}
        <button class="ph__ic" title="Members and settings" on:click={settings}>{@html icon('people')}</button>
        <span class="ph__menu-wrap">
          <button class="ph__ic" title="More actions" on:click|stopPropagation={() => { menuOpen = !menuOpen; moreOpen = false }}>{@html icon('more')}</button>
          {#if menuOpen}
            <div class="ph__menu">
              <button class="ph__menu-item" on:click={settings}>Project settings</button>
              <button class="ph__menu-item" on:click={() => { pick('fields') }}>Manage fields</button>
              <button class="ph__menu-item" on:click={() => { pick('permissions') }}>Permissions & notifications</button>
              <button class="ph__menu-item" on:click={() => { pick('templates') }}>Issue templates</button>
              <button class="ph__menu-item" on:click={() => { pick('automation') }}>Automation rules</button>
              <button class="ph__menu-item" on:click={() => { void share() }}>Copy link</button>
            </div>
          {/if}
        </span>
      </div>
    </div>
    <div class="ph__actions">
      <button class="ph__act" title={copied ? 'Link copied' : 'Share'} on:click={() => { void share() }}>{@html icon(copied ? 'check' : 'share')}</button>
      <button class="ph__act" title="Ask CeePee about this project" on:click={ask}>{@html icon('feedback')}</button>
      <button class="ph__act" title={full ? 'Exit full screen' : 'Full screen'} on:click={fullscreen}>{@html icon('fullscreen')}</button>
    </div>
  </header>
  <nav class="ph__tabs">
    {#each primary as t (t.id)}
      <button class="ph__tab" class:ph__tab--on={tab === t.id} on:click={() => { pick(t.id) }}><span class="ph__tab-ic">{@html icon(t.icon)}</span>{t.label}</button>
    {/each}
    <span class="ph__menu-wrap ph__more">
      <button class="ph__tab" class:ph__tab--on={active.more === true} on:click|stopPropagation={() => { moreOpen = !moreOpen; menuOpen = false }}>{#if active.more === true}<span class="ph__tab-ic">{@html icon(active.icon)}</span>{active.label}{:else}More{/if}<span class="ph__tab-ic ph__tab-ic--chev">{@html icon('chevron')}</span></button>
      {#if moreOpen}
        <div class="ph__menu ph__menu--tabs">{#each extra as t (t.id)}<button class="ph__menu-item" class:ph__menu-item--on={tab === t.id} on:click={() => { pick(t.id) }}><span class="ph__tab-ic">{@html icon(t.icon)}</span>{t.label}</button>{/each}</div>
      {/if}
    </span>
  </nav>
  <div class="ph__body">
    {#key tab + currentSpace}
      {#if tab === 'summary'}
        <ProjectSummary {currentSpace} on:go={(e) => { pick(e.detail) }} />
      {:else if tab === 'calendar'}
        <IssueCalendar {currentSpace} />
      {:else if tab === 'docs'}
        <ProjectDocs {currentSpace} />
      {:else if tab === 'reports'}
        <ReportsOverview {currentSpace} />
      {:else if active.component !== undefined}
        <Component is={active.component} props={{ ...(active.props ?? {}), currentSpace, space: currentSpace }} />
      {/if}
    {/key}
  </div>
</div>

<style lang="scss">
  .ph {
    // Jira's space-page palette; the dark theme swaps to Atlassian's dark tokens
    --j-text: #172b4d; --j-sub: #626f86; --j-link: #0c66e4; --j-border: rgba(9, 30, 66, 0.14); --j-surface: #ffffff; --j-hover: rgba(9, 30, 66, 0.06); --j-active-bg: #e9f2ff;
    display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--j-surface); color: var(--j-text);
  }
  :global(.theme-dark) .ph { --j-text: #b6c2cf; --j-sub: #8c9bab; --j-link: #579dff; --j-border: #38414a; --j-surface: #1d2125; --j-hover: rgba(255, 255, 255, 0.08); --j-active-bg: #1c2b41; }
  .ph__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 0.75rem 1.5rem 0; }
  .ph__left { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  .ph__crumb { font-size: 0.875rem; color: var(--j-sub); }
  .ph__title { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
  .ph__tile { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 0.3rem; background: hsl(var(--h) 75% 48%); color: #fff; font-weight: 800; font-size: 0.6rem; letter-spacing: 0.02em; flex-shrink: 0; }
  .ph__name { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; color: var(--j-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ph__members { margin-left: 0.25rem; }
  .ph__ic { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: transparent; color: var(--j-sub); cursor: pointer; &:hover { background: var(--j-hover); color: var(--j-text); } }
  .ph__actions { display: flex; gap: 0.35rem; padding-top: 1.35rem; }
  .ph__act { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border: 1px solid var(--j-border); border-radius: 0.25rem; background: var(--j-surface); color: var(--j-sub); cursor: pointer; &:hover { background: var(--j-hover); color: var(--j-text); } }
  .ph__tabs { position: relative; display: flex; align-items: center; gap: 0; padding: 0.35rem 1.5rem 0; border-bottom: 1px solid var(--j-border); overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
  .ph__tab { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.35rem; margin-right: 1rem; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: var(--j-sub); font: inherit; font-size: 0.875rem; font-weight: 500; white-space: nowrap; cursor: pointer; transition: color 0.12s ease, border-color 0.12s ease; &:hover { color: var(--j-link); } &--on { color: var(--j-link); border-color: var(--j-link); } }
  .ph__tab-ic { display: inline-flex; width: 1rem; height: 1rem; :global(svg) { width: 1rem; height: 1rem; } &--chev { margin-left: -0.15rem; } }
  .ph__more { margin-left: auto; }
  .ph__menu-wrap { position: relative; }
  .ph__menu { position: absolute; right: 0; top: calc(100% + 0.25rem); z-index: 20; display: flex; flex-direction: column; min-width: 13rem; padding: 0.35rem; border: 1px solid var(--j-border); border-radius: 0.35rem; background: var(--j-surface); box-shadow: 0 8px 12px rgba(9, 30, 66, 0.15), 0 0 1px rgba(9, 30, 66, 0.31); &--tabs { min-width: 15rem; max-height: 70vh; overflow: auto; } }
  .ph__title .ph__menu { left: 0; right: auto; }
  .ph__menu-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.7rem; border: none; border-radius: 0.25rem; background: transparent; color: var(--j-text); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; &:hover { background: var(--j-hover); } &--on { color: var(--j-link); background: var(--j-active-bg); } }
  .ph__body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; > :global(*) { flex: 1; min-height: 0; } }
  // phones: name on its own line, tools underneath, members hidden, tabs scroll
  @media (max-width: 48rem) {
    .ph__head { flex-direction: column; align-items: stretch; gap: 0.5rem; padding: 0.6rem 1rem 0; }
    .ph__crumb { display: none; }
    .ph__title { flex-wrap: wrap; }
    .ph__name { flex: 1 1 100%; order: -1; font-size: 1.25rem; white-space: normal; }
    .ph__members { display: none; }
    .ph__actions { padding-top: 0; justify-content: flex-end; }
    .ph__tabs { padding: 0 0.5rem; }
    .ph__tab { margin-right: 0.5rem; }
  }
</style>
