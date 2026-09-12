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
  Automation and service levels for one project. Switches, not a rule
  builder: each rule is one sentence, on or off. The rules run on the
  server (see server-plugins/tracker-resources/src/automation.ts), so they
  apply to API writes and imports too.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { IssuePriority, type IssueStatus, type Project, type ProjectAutomation } from '@hcengineering/tracker'
  import task from '@hcengineering/task'
  import { Button, EditBox, Label, Toggle } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import RuleBuilder from './RuleBuilder.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const query = createQuery()
  let project: Project | undefined
  $: query.query(tracker.class.Project, { _id: currentSpace }, (r) => {
    project = r[0]
  })

  interface Rule {
    key: keyof ProjectAutomation
    label: string
    hint: string
  }
  const rules: Rule[] = [
    {
      key: 'assignComponentLead',
      label: 'Assign new issues to the component lead',
      hint: 'When an issue is created with a component and no assignee, the component lead gets it.'
    },
    {
      key: 'parentFollowsChildren',
      label: 'Close the parent when every child is done',
      hint: 'When the last sub-issue reaches a done status, the parent moves to done. Skipped if the parent’s type requires fields before closing, or its workflow forbids the move.'
    },
    {
      key: 'startParentOnChildStart',
      label: 'Start the parent when a child starts',
      hint: 'When any sub-issue moves to an in-progress status, a parent that has not started moves to in progress.'
    }
  ]

  // ---- development flow: statuses for branch / PR opened / PR merged --------------
  const stq = createQuery()
  let allStatuses: IssueStatus[] = []
  stq.query(tracker.class.IssueStatus, {}, (r) => { allStatuses = r })
  let projectStatuses: IssueStatus[] = []
  $: void (async () => {
    if (project === undefined) return
    const ptype = await client.findOne(task.class.ProjectType, { _id: project.type })
    const ids = new Set((ptype?.statuses ?? []).map((x) => x._id))
    projectStatuses = allStatuses.filter((x) => ids.has(x._id))
  })()
  const DEV: Array<{ key: 'branchStatus' | 'prOpenStatus' | 'prMergeStatus', label: string }> = [
    { key: 'branchStatus', label: 'When a branch with the issue key appears' },
    { key: 'prOpenStatus', label: 'When a pull request opens' },
    { key: 'prMergeStatus', label: 'When a pull request merges' }
  ]
  async function setDev (key: 'branchStatus' | 'prOpenStatus' | 'prMergeStatus', v: string): Promise<void> {
    if (project === undefined) return
    await client.update(project, { automation: { ...(project.automation ?? {}), [key]: v === '' ? null : v } })
  }

  async function toggle (key: keyof ProjectAutomation, on: boolean): Promise<void> {
    if (project === undefined) return
    await client.update(project, { automation: { ...(project.automation ?? {}), [key]: on } })
  }

  // ---- service levels ---------------------------------------------------
  const levels: Array<{ p: IssuePriority, label: string }> = [
    { p: IssuePriority.Urgent, label: 'Urgent' },
    { p: IssuePriority.High, label: 'High' },
    { p: IssuePriority.Medium, label: 'Medium' },
    { p: IssuePriority.Low, label: 'Low' }
  ]
  let sla: Record<string, number | undefined> = {}
  let slaLoaded: Ref<Project> | undefined
  $: if (project !== undefined && slaLoaded !== project._id) {
    sla = { ...(project.sla ?? {}) }
    slaLoaded = project._id
  }
  $: slaDirty = project !== undefined && JSON.stringify(normalize(sla)) !== JSON.stringify(project.sla ?? {})

  function normalize (v: Record<string, number | undefined>): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [k, n] of Object.entries(v)) {
      const num = Number(n)
      if (n !== undefined && n !== null && !Number.isNaN(num) && num > 0) out[k] = num
    }
    return out
  }
  async function saveSla (): Promise<void> {
    if (project === undefined) return
    await client.update(project, { sla: normalize(sla) })
  }
</script>

<div class="auto">
  <header class="auto__head">
    <span class="auto__title"><Label label={tracker.string.Automation} /></span>
    <span class="auto__sub"><Label label={tracker.string.AutomationHint} /></span>
  </header>

  <section class="card motion-rise" style="--i: 0">
    <span class="card__title"><Label label={tracker.string.Rules} /></span>
    {#each rules as r, idx (r.key)}
      <div class="rule motion-rise" style="--i: {idx}">
        <div class="rule__text">
          <span class="rule__label">{r.label}</span>
          <span class="rule__hint">{r.hint}</span>
        </div>
        <Toggle
          on={project?.automation?.[r.key] === true}
          on:change={(e) => {
            void toggle(r.key, e.detail)
          }}
        />
      </div>
    {/each}
  </section>

  <section class="card motion-rise" style="--i: 1">
    <span class="card__title"><Label label={tracker.string.Development} /></span>
    <p class="card__hint">Driven by the GitHub, GitLab and Bitbucket webhooks on the integrations service. The workflow may still refuse a move.</p>
    {#each DEV as d (d.key)}
      <div class="rule">
        <div class="rule__text"><span class="rule__label">{d.label}</span></div>
        <select class="devsel" value={project?.automation?.[d.key] ?? ''} on:change={(e) => { void setDev(d.key, e.currentTarget.value) }}>
          <option value="">do nothing</option>
          {#each projectStatuses as st (st._id)}<option value={st._id}>move to {st.name}</option>{/each}
        </select>
      </div>
    {/each}
  </section>

  <section class="card motion-rise" style="--i: 2">
    <span class="card__title"><Label label={tracker.string.ServiceLevels} /></span>
    <p class="card__hint"><Label label={tracker.string.ServiceLevelsHint} /></p>
    <div class="sla">
      {#each levels as l (l.p)}
        <span class="sla__label">{l.label}</span>
        <div class="sla__input">
          <EditBox bind:value={sla[String(l.p)]} format={'number'} placeholder={tracker.string.Hours} kind={'default'} />
        </div>
        <span class="sla__unit"><Label label={tracker.string.Hours} /></span>
      {/each}
    </div>
    <div class="card__actions">
      <Button kind={'primary'} label={presentation.string.Save} disabled={!slaDirty} on:click={saveSla} />
    </div>
  </section>

  <RuleBuilder {currentSpace} />
</div>

<style lang="scss">
  .auto {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    max-width: 56rem;
    overflow: auto;
  }
  .auto__head {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .auto__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .auto__sub {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    background: var(--theme-panel-color);
  }
  .card__title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .card__hint {
    margin: -0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .card__actions {
    display: flex;
    justify-content: flex-end;
  }
  .rule {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--theme-divider-color);
  }
  .rule__text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .rule__label {
    color: var(--theme-caption-color);
    font-weight: 500;
  }
  .rule__hint {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .sla {
    display: grid;
    grid-template-columns: 6rem 8rem auto;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .sla__label {
    color: var(--theme-content-color);
  }
  .sla__input {
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
  }
  .sla__unit {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .devsel { padding: 0.3rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
</style>
