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
  Fields per issue type: which fields appear on the create form, which on
  the issue panel, and which must be filled before an issue can be created.
  Stored on the task type, so every project sharing the type agrees.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task, { type TaskType } from '@hcengineering/task'
  import { type Project } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const pq = createQuery()
  const tq = createQuery()
  let project: Project | undefined
  let types: TaskType[] = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  $: if (project !== undefined) tq.query(task.class.TaskType, { parent: project.type }, (r) => { types = r })

  const FIELDS: Array<{ key: string, label: string, always?: boolean }> = [
    { key: 'title', label: 'Title', always: true },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status', always: true },
    { key: 'priority', label: 'Priority' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'labels', label: 'Labels' },
    { key: 'component', label: 'Component' },
    { key: 'milestone', label: 'Milestone' },
    { key: 'sprint', label: 'Sprint' },
    { key: 'estimation', label: 'Estimation' },
    { key: 'storyPoints', label: 'Story points' },
    { key: 'startDate', label: 'Start date' },
    { key: 'dueDate', label: 'Due date' },
    { key: 'relations', label: 'Relations / blocked by' },
    { key: 'parent', label: 'Parent issue' },
    { key: 'externalLinks', label: 'External links' },
    { key: 'votes', label: 'Votes & watchers' }
  ]
  type Cfg = { hiddenOnCreate?: string[], hiddenOnEdit?: string[], requiredOnCreate?: string[] }
  const cfg = (t: TaskType): Cfg => (t as any).fieldConfig ?? {}
  const has = (list: string[] | undefined, k: string): boolean => list?.includes(k) === true

  async function toggle (t: TaskType, list: keyof Cfg, key: string): Promise<void> {
    const c = cfg(t)
    const cur = c[list] ?? []
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    await client.update(t, { fieldConfig: { ...c, [list]: next } } as any)
  }
</script>

<div class="fields">
  <header class="fields__head">
    <span class="fields__title"><Label label={tracker.string.Fields} /></span>
    <span class="fields__sub"><Label label={tracker.string.FieldsHint} /></span>
  </header>
  {#each types as t, idx (t._id)}
    <section class="card motion-rise" style="--i: {idx}">
      <span class="card__title">{t.name}</span>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th class="th th--name">Field</th><th class="th">On create form</th><th class="th">On issue panel</th><th class="th">Required to create</th></tr></thead>
          <tbody>
            {#each FIELDS as f (f.key)}
              <tr>
                <td class="td td--name">{f.label}</td>
                <td class="td"><input type="checkbox" disabled={f.always} checked={f.always === true || !has(cfg(t).hiddenOnCreate, f.key)} on:change={() => { void toggle(t, 'hiddenOnCreate', f.key) }} /></td>
                <td class="td"><input type="checkbox" disabled={f.always} checked={f.always === true || !has(cfg(t).hiddenOnEdit, f.key)} on:change={() => { void toggle(t, 'hiddenOnEdit', f.key) }} /></td>
                <td class="td"><input type="checkbox" disabled={f.always || ['relations', 'parent', 'externalLinks', 'votes', 'description'].includes(f.key)} checked={f.always === true || has(cfg(t).requiredOnCreate, f.key)} on:change={() => { void toggle(t, 'requiredOnCreate', f.key) }} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}
  {#if types.length === 0}<p class="muted">…</p>{/if}
</div>

<style lang="scss">
  .fields { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; max-width: 56rem; overflow: auto; }
  .fields__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .fields__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .fields__sub, .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .table-wrap { overflow-x: auto; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--theme-divider-color); text-align: center; }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); &--name { text-align: left; } }
  .td { color: var(--theme-content-color); &--name { text-align: left; color: var(--theme-caption-color); } }
</style>
