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
  Pick "blocked by" and "relates to" issues while the ticket is still being
  written, rather than having to save first and link afterwards.

  Both bind out as RelatedDocument[], which is the shape Issue.blockedBy and
  Issue.relations already use, so the caller can assign them straight onto the
  document it is about to create -- no post-save round trip.
-->
<script lang="ts">
  import { type Ref, type RelatedDocument } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { type Issue, type Project } from '@hcengineering/tracker'
  import { Button, Label, showPopup } from '@hcengineering/ui'
  import { ObjectBoxPopup } from '@hcengineering/view-resources'

  import tracker from '../plugin'

  export let blockedBy: RelatedDocument[] = []
  export let relations: RelatedDocument[] = []
  export let space: Ref<Project> | undefined = undefined
  /** The issue being created/edited, so it can never relate to itself. */
  export let exclude: Ref<Issue> | undefined = undefined

  type RelationKind = 'blockedBy' | 'relations'

  const client = getClient()

  let titles = new Map<Ref<Issue>, string>()

  // Titles are resolved lazily and cached: the picked refs are all we hold, but
  // a bare id is meaningless to read back.
  async function resolve (docs: RelatedDocument[]): Promise<void> {
    const missing = docs.map((d) => d._id as Ref<Issue>).filter((id) => !titles.has(id))
    if (missing.length === 0) return
    const found = await client.findAll(tracker.class.Issue, { _id: { $in: missing } })
    const next = new Map(titles)
    for (const i of found) next.set(i._id, i.identifier)
    titles = next
  }

  $: void resolve([...blockedBy, ...relations])

  // Declared as a typed array so `group.kind` narrows to the union rather than
  // widening to string when the template passes it back into pick/remove.
  $: groups = [
    { kind: 'blockedBy' as RelationKind, label: tracker.string.BlockedBy, docs: blockedBy },
    { kind: 'relations' as RelationKind, label: tracker.string.RelatedTo, docs: relations }
  ]

  function pick (kind: RelationKind, ev: MouseEvent): void {
    const current = kind === 'blockedBy' ? blockedBy : relations
    const ignore = [
      ...current.map((d) => d._id),
      ...(exclude !== undefined ? [exclude] : [])
    ] as Array<Ref<any>>

    showPopup(
      ObjectBoxPopup,
      {
        _class: tracker.class.Issue,
        docQuery: space !== undefined ? { space } : {},
        multiSelect: true,
        selectedObjects: current.map((d) => d._id),
        ignoreObjects: ignore
      },
      ev.target as HTMLElement,
      undefined,
      (result: any) => {
        if (result == null) return
        const picked: Issue[] = Array.isArray(result) ? result : [result]
        const added = picked
          .filter((i) => i?._id !== undefined)
          .map((i) => ({ _id: i._id, _class: i._class }) as unknown as RelatedDocument)

        const merged = [...current]
        for (const a of added) {
          if (!merged.some((m) => m._id === a._id)) merged.push(a)
        }
        if (kind === 'blockedBy') blockedBy = merged
        else relations = merged
      }
    )
  }

  function titleOf (doc: RelatedDocument): string {
    return titles.get(doc._id as Ref<Issue>) ?? '…'
  }

  function remove (kind: RelationKind, id: Ref<any>): void {
    if (kind === 'blockedBy') blockedBy = blockedBy.filter((d) => d._id !== id)
    else relations = relations.filter((d) => d._id !== id)
  }
</script>

<div class="relations">
  {#each groups as group (group.kind)}
    <div class="relations__group">
      <Button
        kind={'regular'}
        size={'large'}
        on:click={(ev) => {
          pick(group.kind, ev)
        }}
      >
        <svelte:fragment slot="content">
          <span class="relations__btn">
            <Label label={group.label} />
            {#if group.docs.length > 0}
              <span class="relations__count">{group.docs.length}</span>
            {/if}
          </span>
        </svelte:fragment>
      </Button>

      {#if group.docs.length > 0}
        <div class="relations__chips">
          {#each group.docs as doc (doc._id)}
            <button
              class="relations__chip"
              title="Remove"
              on:click={() => {
                remove(group.kind, doc._id)
              }}
            >
              {titleOf(doc)}
              <span class="relations__x">×</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style lang="scss">
  .relations {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .relations__group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .relations__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .relations__count {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .relations__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .relations__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--theme-content-color);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;

    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
    }
  }
  .relations__x {
    color: var(--theme-trans-color);
  }
</style>
