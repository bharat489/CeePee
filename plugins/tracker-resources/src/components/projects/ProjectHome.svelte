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
  Project home: one page per project with a header (icon, name, people,
  settings) and a tab strip -- Summary, List, Board, Backlog, Sprints,
  Calendar, Timeline, Docs, Forms, Reports, Dashboard, Workflow and more --
  each tab hosting the existing view for that job. The navigator entries
  still work; this is the front door.
-->
<script lang="ts">
  import contact, { type Employee } from '@hcengineering/contact'
  import { CombineAvatars } from '@hcengineering/contact-resources'
  import { createQuery } from '@hcengineering/presentation'
  import { type Project } from '@hcengineering/tracker'
  import { type Ref } from '@hcengineering/core'
  import { Component, showPopup, type AnyComponent } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import CreateProject from './CreateProject.svelte'
  import ProjectSummary from './ProjectSummary.svelte'
  import IssueCalendar from './IssueCalendar.svelte'
  import ProjectDocs from './ProjectDocs.svelte'

  export let currentSpace: Ref<Project>

  const pq = createQuery()
  const eq = createQuery()
  let project: Project | undefined
  let employees: Employee[] = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  eq.query(contact.mixin.Employee, { active: true }, (r) => { employees = r })
  $: members = employees.filter((e) => e.personUuid != null && (project?.members ?? []).includes(e.personUuid)).map((e) => e._id)

  type TabId = 'summary' | 'list' | 'board' | 'backlog' | 'sprints' | 'calendar' | 'timeline' | 'docs' | 'forms' | 'reports' | 'dashboard' | 'workflow' | 'components' | 'milestones' | 'epics' | 'ideas' | 'servicedesk'
  interface Tab { id: TabId, label: string, icon: string, component?: AnyComponent, props?: Record<string, any>, more?: boolean }
  const TABS: Tab[] = [
    { id: 'summary', label: 'Summary', icon: '◎' },
    { id: 'list', label: 'List', icon: '☰', component: tracker.component.Issues, props: { icon: tracker.icon.Issues, title: tracker.string.Issues, config: [['all', tracker.string.All, {}], ['active', tracker.string.Active, {}], ['backlog', tracker.string.Backlog, {}], ['archived', tracker.string.Archived, {}]] } },
    { id: 'board', label: 'Board', icon: '▥', component: tracker.component.SwimlaneBoard },
    { id: 'backlog', label: 'Backlog', icon: '≡', component: tracker.component.ProjectBacklog },
    { id: 'sprints', label: 'Sprints', icon: '⟳', component: tracker.component.ProjectSprints },
    { id: 'calendar', label: 'Calendar', icon: '▦' },
    { id: 'timeline', label: 'Timeline', icon: '⧖', component: tracker.component.Roadmap },
    { id: 'docs', label: 'Docs', icon: '▤' },
    { id: 'forms', label: 'Forms', icon: '✎', component: tracker.component.Forms },
    { id: 'reports', label: 'Reports', icon: '📈', component: tracker.component.ProjectReports },
    { id: 'dashboard', label: 'Dashboard', icon: '▣', component: tracker.component.Dashboard },
    { id: 'workflow', label: 'Workflow', icon: '⇄', component: tracker.component.WorkflowDesigner },
    { id: 'components', label: 'Components', icon: '◫', component: tracker.component.ProjectComponents, more: true },
    { id: 'milestones', label: 'Milestones', icon: '◆', component: tracker.component.Milestones, more: true },
    { id: 'epics', label: 'Epics', icon: '⬢', component: tracker.component.Issues, props: { icon: tracker.icon.Issues, title: tracker.string.Epics, config: [['all', tracker.string.All, { kind: tracker.taskTypes.Epic }]] }, more: true },
    { id: 'ideas', label: 'Ideas', icon: '💡', component: tracker.component.Ideas, more: true },
    { id: 'servicedesk', label: 'Service desk', icon: '☎', component: tracker.component.ServiceDesk, more: true }
  ]
  const KEY = (id: string): string => `ceepee.projectTab.${id}`
  let tab: TabId = 'summary'
  let moreOpen = false
  $: {
    try {
      const saved = localStorage.getItem(KEY(currentSpace))
      if (saved !== null && TABS.some((t) => t.id === saved)) tab = saved as TabId
    } catch {}
  }
  function pick (t: TabId): void {
    tab = t
    moreOpen = false
    try { localStorage.setItem(KEY(currentSpace), t) } catch {}
  }
  $: active = TABS.find((t) => t.id === tab) ?? TABS[0]
  $: primary = TABS.filter((t) => t.more !== true)
  $: extra = TABS.filter((t) => t.more === true)
  function settings (): void {
    if (project !== undefined) showPopup(CreateProject, { project })
  }
  async function share (): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {}
  }
  const initials = (p: Project): string => p.identifier.slice(0, 2).toUpperCase()
</script>

<div class="ph">
  <header class="ph__head">
    <div class="ph__id">
      <span class="ph__tile" style="--h: {project !== undefined ? (project.identifier.charCodeAt(0) * 37) % 360 : 260}">{project !== undefined ? initials(project) : ''}</span>
      <div class="ph__names">
        <span class="ph__crumb">Spaces</span>
        <span class="ph__name">{project?.name ?? ''}<span class="ph__key">{project?.identifier ?? ''}</span>{#if project?.private}<span class="ph__lock" title="Private">🔒</span>{/if}</span>
      </div>
      {#if members.length > 0}<span class="ph__people"><CombineAvatars _class={contact.mixin.Employee} items={members} size={'x-small'} limit={5} /></span>{/if}
    </div>
    <div class="ph__tools">
      <button class="ph__btn" title="Copy link" on:click={() => { void share() }}>⤴</button>
      <button class="ph__btn" title="Project settings" on:click={settings}>⚙</button>
    </div>
  </header>
  <nav class="ph__tabs">
    {#each primary as t (t.id)}
      <button class="ph__tab" class:ph__tab--on={tab === t.id} on:click={() => { pick(t.id) }}><span class="ph__tab-ic">{t.icon}</span>{t.label}</button>
    {/each}
    <span class="ph__more">
      <button class="ph__tab" class:ph__tab--on={active.more === true} on:click={() => { moreOpen = !moreOpen }}>{active.more === true ? `${active.icon} ${active.label}` : 'More'} ▾</button>
      {#if moreOpen}
        <div class="ph__menu">{#each extra as t (t.id)}<button class="ph__menu-item" on:click={() => { pick(t.id) }}><span class="ph__tab-ic">{t.icon}</span>{t.label}</button>{/each}</div>
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
      {:else if active.component !== undefined}
        <Component is={active.component} props={{ ...(active.props ?? {}), currentSpace, space: currentSpace }} />
      {/if}
    {/key}
  </div>
</div>

<style lang="scss">
  .ph { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .ph__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1.25rem 0.4rem; }
  .ph__id { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
  .ph__tile { display: inline-flex; align-items: center; justify-content: center; width: 2.4rem; height: 2.4rem; border-radius: 0.7rem; background: linear-gradient(135deg, hsl(var(--h) 70% 55%), hsl(calc(var(--h) + 40) 80% 60%)); color: #fff; font-weight: 800; font-size: 0.85rem; letter-spacing: 0.04em; box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.5); }
  .ph__names { display: flex; flex-direction: column; min-width: 0; }
  .ph__crumb { font-size: 0.68rem; color: var(--theme-trans-color); }
  .ph__name { display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; font-weight: 700; color: var(--theme-caption-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ph__key { padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--accent-brand-soft); font-size: 0.68rem; font-weight: 700; color: var(--accent-brand-ink); }
  .ph__lock { font-size: 0.8rem; }
  .ph__people { margin-left: 0.5rem; }
  .ph__tools { display: flex; gap: 0.3rem; }
  .ph__btn { width: 2rem; height: 2rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-panel-color); color: var(--theme-content-color); font: inherit; cursor: pointer; &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); } }
  .ph__tabs { position: relative; display: flex; align-items: center; gap: 0.15rem; padding: 0 1rem; border-bottom: 1px solid var(--theme-divider-color); overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
  .ph__tab { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.55rem 0.7rem; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: var(--theme-dark-color); font: inherit; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; cursor: pointer; transition: color var(--motion-fast) var(--ease-standard); &:hover { color: var(--theme-caption-color); } &--on { color: var(--accent-brand-ink); border-image: var(--accent-gradient) 1; border-bottom-width: 2px; font-weight: 700; } }
  .ph__tab-ic { font-size: 0.8rem; opacity: 0.8; }
  .ph__more { position: relative; margin-left: auto; }
  .ph__menu { position: absolute; right: 0; top: 100%; z-index: 5; display: flex; flex-direction: column; min-width: 11rem; padding: 0.3rem; border-radius: 0.7rem; background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); }
  .ph__menu-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border: none; border-radius: 0.5rem; background: transparent; color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .ph__body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; > :global(*) { flex: 1; min-height: 0; } }
</style>
