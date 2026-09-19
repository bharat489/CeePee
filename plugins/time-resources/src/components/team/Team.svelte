<!--
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
-->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Ref, Doc, getCurrentAccount } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import task, { Project } from '@hcengineering/task'
  import {
    ModeSelector,
    Separator,
    defineSeparators,
    deviceOptionsStore as deviceInfo,
    Header,
    themeStore,
    Breadcrumbs,
    getPlatformColorDef,
    getPlatformColorForTextDef
  } from '@hcengineering/ui'
  import type { BreadcrumbItem } from '@hcengineering/ui'
  import time from '../../plugin'
  import { teamSeparators } from '../../utils'
  import TeamNavigator from './TeamNavigator.svelte'
  import Agenda from './agenda/Agenda.svelte'
  import Calendar from './calendar/Calendar.svelte'
  import { IconWithEmoji, createQuery, getClient } from '@hcengineering/presentation'
  import view from '@hcengineering/view'
  import { Analytics } from '@hcengineering/analytics'
  import tracker, { Project as Proj } from '@hcengineering/tracker'
  import { TimeEvents } from '@hcengineering/time'

  const client = getClient()

  let currentDate: Date = new Date()

  let space: Ref<Project> | undefined = undefined
  // the planner needs a project; without the navigator open nothing would ever pick one,
  // so remember the last choice and otherwise start with the first project the person is in
  const projectsQuery = createQuery()
  let projects: Project[] = []
  projectsQuery.query(task.class.Project, { archived: false, members: getCurrentAccount().uuid }, (r) => { projects = r })
  $: if (space === undefined && projects.length > 0) {
    const saved = localStorage.getItem('team_last_mode')
    space = (saved !== null && projects.some((p) => p._id === saved) ? saved : projects[0]._id) as Ref<Project>
  }
  const teamBreadcrumb: BreadcrumbItem = { icon: time.icon.Team, label: time.string.Team }
  let items: BreadcrumbItem[]
  let replacedPanel: HTMLElement

  async function updateSpace (space?: Ref<Project>): Promise<void> {
    if (space === undefined) {
      items = [teamBreadcrumb]
      return
    }
    const _space = await client.findOne(task.class.Project, { _id: space })
    if (_space) {
      const project = _space as Proj
      const icon = project.icon === view.ids.IconWithEmoji ? IconWithEmoji : (project.icon ?? undefined)
      const iconProps =
        project.icon === view.ids.IconWithEmoji
          ? { icon: project.color }
          : {
              fill:
                project.color !== undefined && typeof project.color !== 'string'
                  ? getPlatformColorDef(project.color, $themeStore.dark).icon
                  : getPlatformColorForTextDef(project.name, $themeStore.dark).icon
            }
      items = [teamBreadcrumb, { icon, iconProps, title: project.name }]
    } else items = [teamBreadcrumb]
  }
  $: updateSpace(space)

  function changeMode (_mode: string): void {
    mode = _mode

    Analytics.handleEvent(TimeEvents.TeamOpenTab, { tab: _mode })
  }

  const config: Array<[string, IntlString, object]> = [
    ['agenda', time.string.Agenda, {}],
    ['calendar', time.string.Calendar, {}]
  ]

  let mode = config[0][0]

  defineSeparators('team', teamSeparators)
  $: $deviceInfo.replacedPanel = replacedPanel
  onDestroy(() => ($deviceInfo.replacedPanel = undefined))
</script>

<div class="hulyPanels-container">
  {#if $deviceInfo.navigator.visible}
    <TeamNavigator bind:selected={space} />
    <Separator
      name={'team'}
      float={$deviceInfo.navigator.float}
      index={0}
      color={'transparent'}
      separatorSize={0}
      short
    />
  {/if}
  <div class="hulyComponent" bind:this={replacedPanel}>
    <Header adaptive={'disabled'}>
      <Breadcrumbs {items} currentOnly />

      <svelte:fragment slot="actions">
        <ModeSelector
          kind={'subtle'}
          props={{
            mode,
            config,
            onChange: changeMode
          }}
        />
      </svelte:fragment>
    </Header>
    {#if space}
      {#if mode === 'calendar'}
        <Calendar {space} bind:currentDate />
      {:else}
        <Agenda {space} bind:currentDate />
      {/if}
    {:else}
      <div class="team-empty">
        <b>{projects.length === 0 ? 'You are not a member of any project yet' : 'Pick a project'}</b>
        <span>{projects.length === 0 ? 'Join or create a project in Tracker; the planner shows its members\' agenda and calendar here.' : 'Choose a project in the panel on the left to see its team\'s agenda and calendar.'}</span>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .team-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.35rem; flex: 1; padding: 3rem 1rem; text-align: center; color: var(--theme-dark-color); b { font-size: 1rem; color: var(--theme-caption-color); } span { max-width: 28rem; font-size: 0.875rem; } }
</style>
