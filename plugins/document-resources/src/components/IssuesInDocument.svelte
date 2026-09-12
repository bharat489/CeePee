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
  Issues referenced from this page. An @-mention of an issue in the text
  records a reference; this lists them with their live state, so a spec or
  a runbook shows the work it drives without anyone maintaining a table.
-->
<script lang="ts">
  import activity, { type ActivityReference } from '@hcengineering/activity'
  import { type Class, type Doc, type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { Label, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { ObjectPresenter } from '@hcengineering/view-resources'

  import document from '../plugin'

  export let doc: Ref<Doc>

  const ISSUE = 'tracker:class:Issue' as Ref<Class<Doc>>
  const query = createQuery()
  let refs: ActivityReference[] = []
  $: query.query(activity.class.ActivityReference, { srcDocId: doc, attachedToClass: ISSUE }, (r) => { refs = r }, { limit: 100 })
  $: issues = Array.from(new Map(refs.map((r) => [r.attachedTo, r])).values())
</script>

{#if issues.length > 0}
  <div class="doc-divider" />
  <div class="issues-in-doc">
    <span class="labelOnPanel"><Label label={document.string.IssuesInDocument} /> · {issues.length}</span>
    {#each issues as r (r._id)}
      <button class="issues-in-doc__row" on:click={() => { showPanel(view.component.EditDoc, r.attachedTo, ISSUE, 'content') }}>
        <ObjectPresenter objectId={r.attachedTo} _class={ISSUE} shouldShowAvatar={false} disabled />
      </button>
    {/each}
  </div>
{/if}

<style lang="scss">
  .issues-in-doc { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.5rem 0; }
  .issues-in-doc__row { display: block; width: 100%; padding: 0.25rem 0.4rem; border: none; border-radius: 0.3rem; background: transparent; font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); } }
</style>
