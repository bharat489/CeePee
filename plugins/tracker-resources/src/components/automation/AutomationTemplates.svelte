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
  Automation templates for a project: one click installs a ready rule, adapted
  to the project's workflow; rules can also be copied to other projects.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type AutomationRule, type Project } from '@hcengineering/tracker'
  import { addNotification, NotificationSeverity } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { icon } from '../projects/icons'
  import { AUTOMATION_TEMPLATES, copyRules, installTemplate, type AutomationTemplate, type TemplateCategory } from './templates'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const pq = createQuery()
  const rq = createQuery()
  const aq = createQuery()
  let project: Project | undefined
  let rules: AutomationRule[] = []
  let projects: Project[] = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: rq.query(tracker.class.AutomationRule, { space: currentSpace }, (r) => { rules = r })
  aq.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  $: installed = new Set(rules.map((r) => r.name))

  const CATS: Array<'All' | TemplateCategory> = ['All', 'Triage', 'Flow', 'Hygiene', 'Announce']
  let cat: 'All' | TemplateCategory = 'All'
  let open = false
  $: shown = AUTOMATION_TEMPLATES.filter((t) => cat === 'All' || t.category === cat)

  let busy = ''
  async function install (t: AutomationTemplate): Promise<void> {
    if (project === undefined || busy !== '') return
    busy = t.id
    try {
      await installTemplate(t, project)
      addNotification(
        t.needs !== undefined ? 'Rule added, switched off' : 'Rule added',
        t.needs !== undefined ? `Fill in ${t.needs} in the rule, then enable it.` : `"${t.name}" is now running in ${project.identifier}.`,
        undefined as any,
        {},
        NotificationSeverity.Success
      )
    } finally {
      busy = ''
    }
  }

  // copy this project's rules elsewhere
  let copyOpen = false
  let targets: Set<Ref<Project>> = new Set()
  function toggleTarget (id: Ref<Project>): void {
    const next = new Set(targets)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    targets = next
  }
  async function doCopy (): Promise<void> {
    if (rules.length === 0 || targets.size === 0) return
    busy = 'copy'
    try {
      const n = await copyRules(rules, projects.filter((p) => targets.has(p._id)))
      addNotification('Rules copied', `${n} rule${n === 1 ? '' : 's'} added across ${targets.size} project${targets.size === 1 ? '' : 's'}; rules that already existed there were left alone.`, undefined as any, {}, NotificationSeverity.Success)
      copyOpen = false
      targets = new Set()
    } finally {
      busy = ''
    }
  }
  $: void client
</script>

<section class="at">
  <div class="at__head">
    <span class="at__ic">{@html icon('automation')}</span>
    <div class="at__titles">
      <b>Rule templates</b>
      <span class="muted">Ready-made automations, adapted to this project's workflow. {installed.size > 0 ? `${rules.length} rule${rules.length === 1 ? '' : 's'} in this project.` : ''}</span>
    </div>
    <button class="btn" on:click={() => { open = !open }}>{open ? 'Hide templates' : `Browse ${AUTOMATION_TEMPLATES.length} templates`}</button>
    <button class="btn" disabled={rules.length === 0} title={rules.length === 0 ? 'Add a rule first' : 'Copy this project’s rules to other projects'} on:click={() => { copyOpen = !copyOpen }}>Copy rules to…</button>
  </div>

  {#if copyOpen}
    <div class="copy">
      <span class="muted">Copy the {rules.length} rule{rules.length === 1 ? '' : 's'} of this project into:</span>
      <div class="copy__list">
        {#each projects.filter((p) => p._id !== currentSpace) as p (p._id)}
          <label class="copy__item"><input type="checkbox" checked={targets.has(p._id)} on:change={() => { toggleTarget(p._id) }} /> <b>{p.identifier}</b> {p.name}</label>
        {/each}
      </div>
      <div class="copy__tools">
        <button class="btn btn--primary" disabled={targets.size === 0 || busy !== ''} on:click={() => { void doCopy() }}>Copy to {targets.size} project{targets.size === 1 ? '' : 's'}</button>
        <button class="btn" on:click={() => { copyOpen = false }}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if open}
    <div class="cats">
      {#each CATS as c}<button class="cat" class:cat--on={cat === c} on:click={() => { cat = c }}>{c}</button>{/each}
    </div>
    <div class="grid">
      {#each shown as t (t.id)}
        <div class="card" class:card--done={installed.has(t.name)}>
          <span class="card__emoji">{t.emoji}</span>
          <div class="card__body">
            <b>{t.name}</b>
            <span class="muted">{t.tagline}</span>
            {#if t.needs !== undefined}<span class="card__needs">Needs {t.needs}; installs switched off.</span>{/if}
          </div>
          {#if installed.has(t.name)}
            <span class="card__on">Installed</span>
          {:else}
            <button class="btn btn--primary" disabled={busy !== '' || project === undefined} on:click={() => { void install(t) }}>{busy === t.id ? 'Adding…' : 'Install'}</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style lang="scss">
  .at { display: flex; flex-direction: column; gap: 0.6rem; margin: 0 0 1rem; padding: 0.85rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .at__head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .at__ic { display: inline-flex; color: var(--accent-brand); :global(svg) { width: 1.1rem; height: 1.1rem; } }
  .at__titles { display: flex; flex-direction: column; flex: 1; min-width: 12rem; b { color: var(--theme-caption-color); } }
  .muted { font-size: 0.78rem; color: var(--theme-dark-color); }
  .btn { padding: 0.35rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-button-default); color: var(--theme-content-color); font: inherit; font-size: 0.8rem; cursor: pointer; &--primary { background: var(--primary-button-default); border-color: transparent; color: #fff; } &:disabled { opacity: 0.5; cursor: default; } }
  .copy { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.6rem 0.75rem; border: 1px dashed var(--theme-divider-color); border-radius: 0.6rem; }
  .copy__list { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; }
  .copy__item { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: var(--theme-content-color); b { color: var(--theme-caption-color); } }
  .copy__tools { display: flex; gap: 0.4rem; }
  .cats { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .cat { border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; padding: 0.15rem 0.65rem; font: inherit; font-size: 0.75rem; color: var(--theme-content-color); cursor: pointer; &--on { background: var(--theme-button-hovered); color: var(--theme-caption-color); font-weight: 600; } }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 0.5rem; }
  .card { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-bg-color); &--done { opacity: 0.75; } }
  .card__emoji { font-size: 1.3rem; line-height: 1; }
  .card__body { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 0; b { color: var(--theme-caption-color); font-size: 0.85rem; } }
  .card__needs { font-size: 0.72rem; color: #b45309; }
  .card__on { font-size: 0.72rem; font-weight: 700; color: #15803d; white-space: nowrap; }
</style>
