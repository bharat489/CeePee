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
  One version of a document next to the current text: what changed since the
  snapshot was taken, and a button to bring that version back.
-->
<script lang="ts">
  import { type Document, type DocumentSnapshot } from '@hcengineering/document'
  import { Card, MessageBox, copyMarkup, getClient, getMarkup } from '@hcengineering/presentation'
  import { MarkupDiffViewer } from '@hcengineering/text-editor-resources'
  import { Button, Label, Loading, TimeSince, showPopup } from '@hcengineering/ui'

  // markup is the editor's JSON document as a string; an empty one means an empty page
  type MarkupNode = any
  const markupToJSON = (markup: string): MarkupNode =>
    markup === '' ? { type: 'doc', content: [] } : JSON.parse(markup)
  import { createEventDispatcher } from 'svelte'
  import document from '../../plugin'

  export let doc: Document
  export let snapshot: DocumentSnapshot
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()
  const client = getClient()
  const snapCollab = { objectClass: snapshot._class, objectId: snapshot._id, objectAttr: 'content' }
  const docCollab = { objectClass: doc._class, objectId: doc._id, objectAttr: 'content' }

  let then: MarkupNode | undefined
  let now: MarkupNode | undefined
  let loading = true
  async function load (): Promise<void> {
    const [a, b] = await Promise.all([getMarkup(snapCollab, snapshot.content), getMarkup(docCollab, doc.content)])
    then = markupToJSON(a)
    now = markupToJSON(b)
    loading = false
  }
  void load()

  function restore (): void {
    showPopup(MessageBox, {
      label: document.string.Restore,
      message: document.string.RestoreConfirm,
      params: { title: snapshot.title },
      action: async () => {
        await copyMarkup(snapCollab, docCollab)
        await client.update(doc, { content: doc.content })
        dispatch('close')
      }
    })
  }
</script>

<Card label={document.string.Version} okAction={() => { dispatch('close') }} okLabel={document.string.Close} canSave={true} width="large" on:close>
  <svelte:fragment slot="header">
    <span class="head">
      <b>{snapshot.title}</b>
      <span class="muted"><TimeSince value={snapshot.createdOn} /></span>
    </span>
  </svelte:fragment>
  <div class="body">
    {#if loading || then === undefined}
      <Loading />
    {:else}
      <div class="legend"><Label label={document.string.DiffLegend} /></div>
      <div class="diff"><MarkupDiffViewer content={now ?? then} comparedVersion={then} objectClass={doc._class} /></div>
      {#if !readonly}
        <div class="tools"><Button label={document.string.Restore} kind="regular" on:click={restore} /></div>
      {/if}
    {/if}
  </div>
</Card>

<style lang="scss">
  .head { display: inline-flex; gap: 0.5rem; align-items: baseline; }
  .muted { font-size: 0.75rem; color: var(--theme-dark-color); }
  .body { display: flex; flex-direction: column; gap: 0.5rem; min-height: 12rem; max-height: 60vh; overflow: auto; }
  .legend { font-size: 0.75rem; color: var(--theme-dark-color); }
  .diff { padding: 0.5rem 0.75rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; }
</style>
