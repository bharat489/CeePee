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
  A synced block: another document's body, live. The host editor opens the
  source document's collaborative session and hands it over; a nested editor
  binds to it, so edits made here or on the source page appear everywhere at
  once. Without a host-provided session the block shows its title only.
-->
<script lang="ts">
  import { type Class, type Doc, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { ServerKit } from '@hcengineering/text'
  import { type AnyComponent, getCurrentLocation, getPanelURI, navigate } from '@hcengineering/ui'
  import { Editor } from '@tiptap/core'
  import Collaboration from '@tiptap/extension-collaboration'
  import { onDestroy, onMount } from 'svelte'
  import { type NodeViewProps } from '../../node-view'
  import NodeViewWrapper from '../../node-view/NodeViewWrapper.svelte'
  import type { OpenSyncedSource } from './blocks'

  export let node: NodeViewProps['node']
  export let editor: NodeViewProps['editor']
  export let openSource: OpenSyncedSource | undefined = undefined

  $: sourceId = node.attrs.sourceId as string | null
  $: sourceClass = (node.attrs.sourceClass as string | null) ?? 'document:class:Document'
  $: title = (node.attrs.title as string | null) ?? 'Synced block'

  let host: HTMLDivElement
  let nested: Editor | undefined
  let state: 'loading' | 'ready' | 'missing' | 'static' = 'loading'

  async function mount (): Promise<void> {
    if (sourceId == null || openSource === undefined) {
      state = openSource === undefined ? 'static' : 'missing'
      return
    }
    const client = getClient()
    const source = await client.findOne(sourceClass as Ref<Class<Doc>>, { _id: sourceId as Ref<Doc> })
    if (source === undefined) {
      state = 'missing'
      return
    }
    const content = ((source as any).content as string | null | undefined) ?? null
    const { ydoc, loaded } = openSource(sourceId, sourceClass, content)
    await loaded
    nested = new Editor({
      element: host,
      editable: editor.isEditable,
      extensions: [ServerKit.configure({ history: false } as any), Collaboration.configure({ document: ydoc, field: 'content' })],
      editorProps: { attributes: { class: 'synced-block__editor' } }
    })
    state = 'ready'
  }

  onMount(() => {
    void mount()
  })
  onDestroy(() => {
    nested?.destroy()
  })
  $: nested?.setEditable(editor.isEditable)

  function open (): void {
    if (sourceId == null) return
    const loc = getCurrentLocation()
    navigate({ ...loc, fragment: getPanelURI('document:component:EditDoc' as AnyComponent, sourceId, sourceClass) })
  }
</script>

<NodeViewWrapper data-type="syncedBlock">
  <div class="synced" contenteditable="false">
    <div class="synced__head">
      <span class="synced__mark" title="Synced with the source document; edits here change it everywhere">⟳</span>
      <span class="synced__title">{title}</span>
      {#if sourceId != null}<button class="synced__open" type="button" on:click={open}>open source</button>{/if}
      {#if state === 'missing'}<span class="synced__warn">source not found</span>{/if}
    </div>
    <div class="synced__body" bind:this={host} class:synced__body--hidden={state !== 'ready'}></div>
    {#if state === 'loading'}<div class="synced__note">loading…</div>{/if}
    {#if state === 'static'}<div class="synced__note">Synced content shows on the document page.</div>{/if}
  </div>
</NodeViewWrapper>

<style lang="scss">
  .synced { margin: 0.5rem 0; border: 1px solid var(--primary-button-default); border-radius: 0.6rem; overflow: hidden; }
  .synced__head { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--theme-dark-color); background: color-mix(in srgb, var(--primary-button-default) 10%, transparent); border-bottom: 1px solid var(--theme-divider-color); }
  .synced__mark { color: var(--primary-button-default); font-weight: 700; }
  .synced__title { font-weight: 600; color: var(--theme-caption-color); }
  .synced__open { margin-left: auto; border: none; background: transparent; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; }
  .synced__warn { color: var(--negative-button-default); }
  .synced__body { padding: 0.25rem 0.75rem; }
  .synced__body--hidden { display: none; }
  .synced__note { padding: 0.4rem 0.75rem; font-size: 0.75rem; color: var(--theme-dark-color); }
  :global(.synced-block__editor) { outline: none; }
</style>
