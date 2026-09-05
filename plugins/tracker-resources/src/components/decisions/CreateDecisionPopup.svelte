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
  Recording a decision.

  The rejected options field is not optional decoration. A decision without
  its alternatives reads as arbitrary six months later, which is precisely
  when someone reopens it. Asking for one rejected option at capture time
  costs seconds and is the difference between a record and a note.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { Card, getClient } from '@hcengineering/presentation'
  import { type Decision, type Project } from '@hcengineering/tracker'
  import { Button, EditBox, IconAdd, IconClose, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'

  export let space: Ref<Project>

  const client = getClient()
  const dispatch = createEventDispatcher()

  let title = ''
  let rejected: string[] = []
  let draftOption = ''
  /** Ratify immediately when the person recording it is the one who decided. */
  let ratifyNow = true

  $: canSave = title.trim().length > 0

  function addOption (): void {
    const v = draftOption.trim()
    if (v === '' || rejected.includes(v)) return
    rejected = [...rejected, v]
    draftOption = ''
  }

  function removeOption (v: string): void {
    rejected = rejected.filter((o) => o !== v)
  }

  async function save (): Promise<void> {
    if (!canSave) return
    const person = getCurrentEmployee()
    const now = Date.now()

    await client.createDoc(tracker.class.Decision, space, {
      space,
      title: title.trim(),
      rationale: null,
      rejectedOptions: rejected,
      state: ratifyNow ? 'ratified' : 'proposed',
      decidedBy: ratifyNow ? person : null,
      decidedOn: ratifyNow ? now : null,
      consulted: [],
      affects: [],
      supersededBy: null,
      aiDrafted: false
    } as unknown as Omit<Decision, keyof import('@hcengineering/core').Doc>)

    dispatch('close')
  }
</script>

<Card
  label={tracker.string.NewDecision}
  okAction={save}
  okLabel={tracker.string.NewDecision}
  {canSave}
  on:close={() => {
    dispatch('close')
  }}
  on:changeContent
>
  <div class="form">
    <EditBox bind:value={title} placeholder={tracker.string.DecisionTitle} kind={'large-style'} autoFocus fullSize />

    <section>
      <span class="form__label"><Label label={tracker.string.RejectedOptions} /></span>
      {#if rejected.length > 0}
        <div class="form__opts">
          {#each rejected as opt (opt)}
            <button
              class="form__opt"
              on:click={() => {
                removeOption(opt)
              }}
            >
              {opt}<span class="form__x"><IconClose size={'x-small'} /></span>
            </button>
          {/each}
        </div>
      {/if}
      <div class="form__add">
        <EditBox bind:value={draftOption} placeholder={tracker.string.AddRejectedOption} kind={'default'} fullSize />
        <Button
          icon={IconAdd}
          kind={'ghost'}
          size={'small'}
          disabled={draftOption.trim() === ''}
          on:click={addOption}
        />
      </div>
    </section>

    <label class="form__ratify">
      <input type="checkbox" bind:checked={ratifyNow} />
      <span><Label label={tracker.string.Ratify} /></span>
    </label>
  </div>
</Card>

<style lang="scss">
  .form { display: flex; flex-direction: column; gap: 1rem; min-width: 24rem; }
  section { display: flex; flex-direction: column; gap: 0.4rem; }
  .form__label {
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--theme-dark-color);
  }
  .form__opts { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .form__opt {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.15rem 0.4rem; border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem; background: transparent; cursor: pointer;
    color: var(--theme-content-color); font: inherit; font-size: 0.75rem;

    &:hover { background: var(--theme-button-hovered); }
  }
  .form__x { display: inline-flex; color: var(--theme-trans-color); }
  .form__add { display: flex; align-items: center; gap: 0.35rem; }
  .form__ratify {
    display: flex; align-items: center; gap: 0.45rem;
    font-size: 0.8125rem; color: var(--theme-content-color); cursor: pointer;
  }
</style>
