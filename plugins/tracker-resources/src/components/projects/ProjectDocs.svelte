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
  Docs tab: the project's documents, kept in a Documents teamspace named after
  the project (created on first use). Lists the pages, opens them, makes new
  ones. The Documents app shows the same space with its full tree.
-->
<script lang="ts">
  import core, { generateId, getCurrentAccount, SortingOrder, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/task'
  import { type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'

  export let currentSpace: Ref<Project>

  // the Documents plugin, addressed by id so this page needs no build dependency on it
  const TEAMSPACE = 'document:class:Teamspace' as Ref<Class<Space>>
  const DOCUMENT = 'document:class:Document' as Ref<Class<Doc>>
  const TEAMSPACE_TYPE = 'document:spaceType:DefaultTeamspaceType'
  const NO_PARENT = 'document:ids:NoParent'

  const client = getClient()
  const pq = createQuery()
  const tq = createQuery()
  const dq = createQuery()
  let project: Project | undefined
  let spaces: Space[] = []
  let docs: Array<Doc & { title: string, modifiedOn: number }> = []
  $: pq.query(tracker.class.Project, { _id: currentSpace }, (r) => { project = r[0] })
  tq.query(TEAMSPACE, { archived: false }, (r) => { spaces = r })
  $: teamspace = project !== undefined ? spaces.find((s) => s.name.toLowerCase() === project?.name.toLowerCase() || s.name.toUpperCase() === project?.identifier) : undefined
  $: if (teamspace !== undefined) dq.query(DOCUMENT, { space: teamspace._id } as any, (r) => { docs = r as any }, { sort: { modifiedOn: SortingOrder.Descending }, limit: 200 })
  let busy = false
  async function createSpace (): Promise<void> {
    if (project === undefined) return
    busy = true
    try {
      await client.createDoc(TEAMSPACE, core.space.Space, { name: project.name, description: `Documents for ${project.name}`, private: project.private, members: project.members, owners: project.owners ?? [], archived: false, autoJoin: project.autoJoin, type: TEAMSPACE_TYPE } as any)
    } finally {
      busy = false
    }
  }
  async function newDoc (): Promise<void> {
    if (teamspace === undefined) return
    const title = prompt('Page title', 'Untitled')
    if (title === null) return
    const id = generateId<Doc>()
    await client.createDoc(DOCUMENT, teamspace._id, { title: title.trim() || 'Untitled', content: null, attachments: 0, embeddings: 0, labels: 0, comments: 0, references: 0, rank: makeRank(undefined, undefined), parent: NO_PARENT } as any, id)
    showPanel(view.component.EditDoc, id, DOCUMENT, 'content')
  }
  const open = (d: Doc): void => { showPanel(view.component.EditDoc, d._id, d._class, 'content') }
  const ago = (t: number): string => { const d = Math.floor((Date.now() - t) / 86_400_000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago` }
  const me = getCurrentAccount().uuid
</script>

<div class="pd">
  {#if teamspace === undefined}
    <div class="pd__empty motion-pop">
      <span class="pd__big">📄</span>
      <b>No docs space yet</b>
      <span class="muted">Specs, meeting notes, runbooks and decisions live next to the work. One click creates a Documents space named "{project?.name ?? ''}" with the same members.</span>
      <Button kind={'primary'} icon={IconAdd} label={tracker.string.CreateDocsSpace} loading={busy} on:click={() => { void createSpace() }} />
    </div>
  {:else}
    <header class="pd__head">
      <span class="pd__title">{teamspace.name}</span>
      <span class="muted">{docs.length} page{docs.length === 1 ? '' : 's'}{teamspace.members.includes(me) ? '' : ' · you are not a member of this space'}</span>
      <span class="grow" />
      <Button kind={'primary'} icon={IconAdd} label={tracker.string.NewPage} on:click={() => { void newDoc() }} />
    </header>
    {#if docs.length > 0}
      <div class="pd__list">
        {#each docs as d, k (d._id)}
          <button class="pd__row motion-rise" style="--i: {Math.min(k, 12)}" on:click={() => { open(d) }}><span class="pd__ic">📝</span><span class="pd__name">{d.title}</span><span class="muted">{ago(d.modifiedOn)}</span></button>
        {/each}
      </div>
    {:else}
      <p class="muted">No pages yet. Create the first one.</p>
    {/if}
  {/if}
</div>

<style lang="scss">
  .pd { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.25rem; overflow: auto; }
  .pd__empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; max-width: 30rem; margin: 3rem auto; padding: 1.5rem; border: 1px dashed var(--accent-brand); border-radius: 1rem; text-align: center; color: var(--theme-content-color); b { color: var(--theme-caption-color); font-size: 1.05rem; } }
  .pd__big { font-size: 2.2rem; }
  .pd__head { display: flex; align-items: center; gap: 0.6rem; }
  .pd__title { font-weight: 700; color: var(--theme-caption-color); }
  .grow { flex: 1; }
  .muted { margin: 0; font-size: 0.78rem; color: var(--theme-trans-color); }
  .pd__list { display: flex; flex-direction: column; gap: 0.2rem; }
  .pd__row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; background: var(--theme-panel-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
  .pd__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
