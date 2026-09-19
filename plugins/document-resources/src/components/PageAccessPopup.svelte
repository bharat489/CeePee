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
  Page permissions. Inherit from the parent (the default), open the page to
  everyone in its space, or restrict it to named people and groups with
  view, comment or edit levels. The effective setting is shown with where it
  comes from; sub-pages inherit unless they override. Enforced by the
  server: hidden pages leave search, lists and links; edits and comments
  without the level are rejected.
-->
<script lang="ts">
  import contact, { type UserGroup } from '@hcengineering/contact'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import core, { type AccountUuid, type Doc, type Ref } from '@hcengineering/core'
  import { type Document, type PageAccess } from '@hcengineering/document'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { Button } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import document from '../plugin'

  export let value: Document

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const dispatch = createEventDispatcher()
  const gq = createQuery()
  const cq = createQuery()
  let groups: UserGroup[] = []
  gq.query(contact.class.UserGroup, {}, (r) => { groups = r })

  // the page's own setting and the chain of ancestors (nearest first) for "inherited from"
  type Mode = PageAccess['mode']
  const own = hierarchy.hasMixin(value, document.mixin.PageAccess) ? hierarchy.as(value, document.mixin.PageAccess) : undefined
  let mode: Mode = own?.mode ?? 'inherit'
  let viewers: AccountUuid[] = [...(own?.viewers ?? [])]
  let commenters: AccountUuid[] = [...(own?.commenters ?? [])]
  let editors: AccountUuid[] = [...(own?.editors ?? [])]
  let viewerGroups: Ref<Doc>[] = [...(own?.viewerGroups ?? [])]
  let commenterGroups: Ref<Doc>[] = [...(own?.commenterGroups ?? [])]
  let editorGroups: Ref<Doc>[] = [...(own?.editorGroups ?? [])]

  let chain: Document[] = []
  let source: Document | undefined
  let sourceMode: Mode | undefined
  $: cq.query(document.class.Document, { space: value.space }, (r) => {
    const byId = new Map(r.map((d) => [d._id, d]))
    const out: Document[] = []
    let cur = byId.get(value.parent)
    for (let i = 0; i < 24 && cur !== undefined; i++) {
      out.push(cur)
      cur = byId.get(cur.parent)
    }
    chain = out
    source = undefined
    sourceMode = undefined
    for (const p of out) {
      if (!hierarchy.hasMixin(p, document.mixin.PageAccess)) continue
      const a = hierarchy.as(p, document.mixin.PageAccess)
      if (a.mode === 'inherit') continue
      source = p
      sourceMode = a.mode
      break
    }
  })
  const toggle = (list: Ref<Doc>[], id: Ref<Doc>): Ref<Doc>[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  let busy = false
  async function save (): Promise<void> {
    busy = true
    try {
      const data: Pick<PageAccess, 'mode' | 'viewers' | 'commenters' | 'editors' | 'viewerGroups' | 'commenterGroups' | 'editorGroups'> = mode === 'restricted' ? { mode, viewers, commenters, editors, viewerGroups, commenterGroups, editorGroups } : { mode, viewers: [], commenters: [], editors: [], viewerGroups: [], commenterGroups: [], editorGroups: [] }
      if (own === undefined) await client.createMixin(value._id, value._class, value.space, document.mixin.PageAccess, data)
      else await client.updateMixin(value._id, value._class, value.space, document.mixin.PageAccess, data)
      dispatch('close')
    } finally {
      busy = false
    }
  }
  $: effective = mode !== 'inherit' ? mode : (sourceMode ?? 'open')
  $: total = mode === 'restricted' ? new Set([...viewers, ...commenters, ...editors]).size + viewerGroups.length + commenterGroups.length + editorGroups.length : 0
</script>

<div class="pa">
  <div class="pa__head">
    <span class="pa__t">Who can see and edit "{value.title}"</span>
    <span class="pa__eff" class:pa__eff--r={effective === 'restricted'}>{effective === 'restricted' ? '🔒 restricted' : '🌐 open to the space'}{#if mode === 'inherit'} · inherited{source !== undefined ? ` from "${source.title}"` : chain.length > 0 ? ' (nothing above restricts it)' : ' (top-level page)'}{/if}</span>
  </div>

  <div class="modes">
    <label class="mode" class:mode--on={mode === 'inherit'}><input type="radio" bind:group={mode} value="inherit" /><span><b>Inherit from the parent</b><small>Follows the page above it; sub-pages follow this one.</small></span></label>
    <label class="mode" class:mode--on={mode === 'open'}><input type="radio" bind:group={mode} value="open" /><span><b>Open to the space</b><small>Everyone who can see this teamspace can read and edit, whatever the parent says.</small></span></label>
    <label class="mode" class:mode--on={mode === 'restricted'}><input type="radio" bind:group={mode} value="restricted" /><span><b>Restricted</b><small>Only the people and groups below. Others do not see the page at all.</small></span></label>
  </div>

  {#if mode === 'restricted'}
    <div class="levels">
      {#each [['Can edit', 'edit'], ['Can comment', 'comment'], ['Can view', 'view']] as [label, level] (level)}
        <div class="level">
          <span class="level__t">{label}</span>
          {#if level === 'edit'}<AccountArrayEditor label={core.string.Members} value={editors} onChange={(r) => { editors = r }} kind={'regular'} size={'small'} />
          {:else if level === 'comment'}<AccountArrayEditor label={core.string.Members} value={commenters} onChange={(r) => { commenters = r }} kind={'regular'} size={'small'} />
          {:else}<AccountArrayEditor label={core.string.Members} value={viewers} onChange={(r) => { viewers = r }} kind={'regular'} size={'small'} />{/if}
          {#if groups.length > 0}
            <div class="chips">
              {#each groups as g (g._id)}
                {@const on = level === 'edit' ? editorGroups.includes(g._id) : level === 'comment' ? commenterGroups.includes(g._id) : viewerGroups.includes(g._id)}
                <button class="chip" class:chip--on={on} on:click={() => { if (level === 'edit') editorGroups = toggle(editorGroups, g._id); else if (level === 'comment') commenterGroups = toggle(commenterGroups, g._id); else viewerGroups = toggle(viewerGroups, g._id) }}>{g.name} · {g.members.length}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <p class="muted">{total === 0 ? 'Nobody is listed yet: only workspace owners would see this page.' : 'Workspace owners always keep access. Edit includes comment and view.'}</p>
    </div>
  {/if}

  <div class="actions">
    <Button kind={'ghost'} label={presentation.string.Cancel} on:click={() => { dispatch('close') }} />
    <Button kind={'primary'} label={presentation.string.Save} loading={busy} on:click={() => { void save() }} />
  </div>
</div>

<style lang="scss">
  .pa { display: flex; flex-direction: column; gap: 0.8rem; width: min(34rem, 92vw); padding: 1rem 1.1rem; background: var(--theme-popup-color); border: 1px solid var(--theme-popup-divider); border-radius: 0.9rem; box-shadow: var(--theme-popup-shadow); }
  .pa__head { display: flex; flex-direction: column; gap: 0.2rem; }
  .pa__t { font-weight: 700; color: var(--theme-caption-color); }
  .pa__eff { font-size: 0.78rem; color: var(--theme-dark-color); &--r { color: #b45309; font-weight: 600; } }
  .modes { display: flex; flex-direction: column; gap: 0.35rem; }
  .mode { display: flex; gap: 0.55rem; align-items: flex-start; padding: 0.55rem 0.7rem; border: 1px solid var(--theme-divider-color); border-radius: 0.6rem; cursor: pointer; font-size: 0.8375rem; color: var(--theme-content-color); &--on { border-color: var(--accent-brand, var(--primary-button-default)); background: var(--accent-brand-soft, var(--theme-button-hovered)); } input { margin-top: 0.2rem; } span { display: flex; flex-direction: column; gap: 0.1rem; } b { color: var(--theme-caption-color); } small { font-size: 0.72rem; color: var(--theme-dark-color); line-height: 1.4; } }
  .levels { display: flex; flex-direction: column; gap: 0.6rem; }
  .level { display: flex; flex-direction: column; gap: 0.3rem; padding-top: 0.5rem; border-top: 1px solid var(--theme-divider-color); }
  .level__t { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.75rem; cursor: pointer; &--on { border-color: var(--accent-brand, var(--primary-button-default)); background: var(--accent-brand-soft, var(--theme-button-hovered)); font-weight: 600; } }
  .muted { margin: 0; font-size: 0.75rem; color: var(--theme-dark-color); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
