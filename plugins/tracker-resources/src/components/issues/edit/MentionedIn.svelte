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
  Where this issue is mentioned: documents, chat messages, other issues.
  The platform records a reference whenever an issue is @-mentioned; this
  is that record, grouped by kind, so a page-to-issue trace is one click.
-->
<script lang="ts">
  import activity, { type ActivityReference } from '@hcengineering/activity'
  import { type Class, type Doc, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Issue } from '@hcengineering/tracker'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { ObjectPresenter } from '@hcengineering/view-resources'

  import tracker from '../../../plugin'

  export let issue: Issue

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const query = createQuery()
  let refs: ActivityReference[] = []
  $: query.query(activity.class.ActivityReference, { attachedTo: issue._id }, (r) => { refs = r }, { limit: 50 })

  // one row per source document
  $: sources = Array.from(new Map(refs.map((r) => [r.srcDocId, r])).values())
  $: groups = ((): Array<{ cls: Ref<Class<Doc>>, items: ActivityReference[] }> => {
    const m = new Map<Ref<Class<Doc>>, ActivityReference[]>()
    for (const r of sources) m.set(r.srcDocClass, [...(m.get(r.srcDocClass) ?? []), r])
    return Array.from(m.entries()).map(([cls, items]) => ({ cls, items }))
  })()
  function labelOf (cls: Ref<Class<Doc>>): any {
    try {
      return hierarchy.getClass(cls).label
    } catch {
      return undefined
    }
  }
  function open (r: ActivityReference): void {
    showPanel(view.component.EditDoc, r.srcDocId, r.srcDocClass, 'content')
  }
</script>

{#if sources.length > 0}
  <span class="labelTop"><Label label={tracker.string.MentionedIn} /></span>
  <div class="mentioned">
    {#each groups as g (g.cls)}
      <span class="mentioned__kind">{#if labelOf(g.cls) !== undefined}<Label label={labelOf(g.cls)} />{:else}{g.cls}{/if} · {g.items.length}</span>
      {#each g.items as r (r._id)}
        <button class="mentioned__row" on:click={() => { open(r) }}>
          <ObjectPresenter objectId={r.srcDocId} _class={r.srcDocClass} shouldShowAvatar={false} disabled />
        </button>
      {/each}
    {/each}
  </div>
{/if}

<style lang="scss">
  .mentioned { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .mentioned__kind { margin-top: 0.25rem; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .mentioned__row { display: block; width: 100%; padding: 0.2rem 0.3rem; border: none; border-radius: 0.3rem; background: transparent; font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
</style>
