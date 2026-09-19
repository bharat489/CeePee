<!--
//
// Copyright © 2022, 2023, 2024 Hardcore Engineering Inc.
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
//
-->
<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { Data, generateId, makeCollabId, Ref } from '@hcengineering/core'
  import { Document, DocumentEvents, Teamspace } from '@hcengineering/document'
  import { IconWithEmoji, Card, createMarkup, DOC_TEMPLATES, docTemplateMarkup, getClient, SpaceSelector, type DocTemplate } from '@hcengineering/presentation'
  import {
    Button,
    createFocusManager,
    EditBox,
    FocusHandler,
    getPlatformColorDef,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { IconPicker, ObjectBox } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  import document from '../plugin'
  import { createEmptyDocument } from '../utils'
  import TeamspacePresenter from './teamspace/TeamspacePresenter.svelte'

  export function canClose (): boolean {
    return object.title === ''
  }

  export let space: Ref<Teamspace>
  export let parent: Ref<Document> | undefined

  const id: Ref<Document> = generateId()

  const object: Pick<Data<Document>, 'title' | 'icon' | 'color'> = {
    title: ''
  }

  const dispatch = createEventDispatcher()
  const client = getClient()

  let _space = space
  let _parent = parent

  $: if (_space !== space) _parent = undefined
  $: canSave = getTitle(object.title).length > 0 && _space !== undefined

  function chooseIcon (): void {
    const { icon, color } = object
    const icons = [document.icon.Document, document.icon.Teamspace]
    const update = (result: any): void => {
      if (result !== undefined && result !== null) {
        object.icon = result.icon
        object.color = result.color
      }
    }
    showPopup(IconPicker, { icon, color, icons }, 'top', update, update)
  }

  function getTitle (value: string): string {
    return value.trim()
  }

  // page templates: the structure is written into the new page
  let template: DocTemplate = DOC_TEMPLATES[0]
  let titleTouched = false
  function chooseTemplate (t: DocTemplate): void {
    template = t
    if (!titleTouched || object.title.trim() === '') object.title = t.id === 'blank' ? '' : t.name
  }

  async function create (): Promise<void> {
    const markup = docTemplateMarkup(template.id)
    const content = markup === null ? null : await createMarkup(makeCollabId(document.class.Document, id, 'content'), markup)
    await createEmptyDocument(client, id, _space, _parent, { ...object, title: getTitle(object.title), content })
    Analytics.handleEvent(DocumentEvents.DocumentCreated, { id, parent: _parent })
    dispatch('close', id)
  }

  const manager = createFocusManager()
</script>

<FocusHandler {manager} />

<Card
  label={document.string.CreateDocument}
  okAction={create}
  {canSave}
  on:close={() => {
    dispatch('close')
  }}
  on:changeContent
>
  <svelte:fragment slot="header">
    <SpaceSelector
      _class={document.class.Teamspace}
      label={document.string.Teamspace}
      bind:space={_space}
      kind={'regular'}
      size={'small'}
      component={TeamspacePresenter}
      iconWithEmoji={view.ids.IconWithEmoji}
      defaultIcon={document.icon.Teamspace}
    />
    <ObjectBox
      _class={document.class.Document}
      bind:value={_parent}
      docQuery={{
        space: _space
      }}
      kind={'regular'}
      size={'small'}
      label={document.string.NoParentDocument}
      searchField={'title'}
      allowDeselect={true}
      showNavigate={false}
      docProps={{ disabled: true, noUnderline: true }}
      focusIndex={20000}
    />
  </svelte:fragment>

  <div class="flex-row-center clear-mins">
    <div class="mr-3">
      <Button
        size={'medium'}
        kind={'link-bordered'}
        noFocus
        icon={object.icon === view.ids.IconWithEmoji ? IconWithEmoji : (object.icon ?? document.icon.Document)}
        iconProps={object.icon === view.ids.IconWithEmoji
          ? { icon: object.color, size: 'medium' }
          : {
              fill:
                object.color !== undefined && typeof object.color !== 'string'
                  ? getPlatformColorDef(object.color, $themeStore.dark).icon
                  : 'currentColor'
            }}
        on:click={chooseIcon}
      />
    </div>
    <EditBox
      placeholder={document.string.DocumentNamePlaceholder}
      bind:value={object.title}
      kind={'large-style'}
      autoFocus
      focusIndex={1}
      on:input={() => { titleTouched = true }}
    />
  </div>
  <div class="tpls">
    {#each DOC_TEMPLATES as t (t.id)}
      <button class="tpl" class:tpl--on={template.id === t.id} title={t.tagline} on:click={() => { chooseTemplate(t) }}><span>{t.emoji}</span>{t.name}</button>
    {/each}
  </div>
</Card>

<style lang="scss">
  .tpls { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.75rem; max-width: 34rem; }
  .tpl { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.78rem; cursor: pointer; transition: border-color var(--motion-fast, 0.12s) var(--ease-standard, ease); &:hover { border-color: var(--accent-brand, var(--primary-button-default)); } &--on { border-color: var(--accent-brand, var(--primary-button-default)); background: var(--accent-brand-soft, var(--theme-button-hovered)); color: var(--theme-caption-color); font-weight: 600; } }
</style>
