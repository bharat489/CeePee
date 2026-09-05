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
  The decision record for a project.

  Two rules are enforced here rather than by convention, because convention
  does not survive contact with a busy team:

  1. Only a person ratifies. AI can draft a proposal (aiDrafted), but the
     ratify action requires a human actor and stamps them as decidedBy.
  2. Nothing is edited into a new meaning and nothing is deleted. A reversal
     is a new decision that supersedes the old one, so the history of what
     the organisation believed at each point stays intact.
-->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Decision, type Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Label, showPopup } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import CreateDecisionPopup from './CreateDecisionPopup.svelte'

  export let space: Ref<Project>

  const client = getClient()
  const query = createQuery()

  let decisions: Decision[] = []

  $: query.query(
    tracker.class.Decision,
    { space },
    (res) => {
      decisions = res
    },
    { sort: { modifiedOn: SortingOrder.Descending } }
  )

  // Ratified first is wrong: a proposal is the thing needing attention.
  $: ordered = [...decisions].sort((a, b) => {
    const rank = (d: Decision): number => (d.state === 'proposed' ? 0 : d.state === 'ratified' ? 1 : 2)
    return rank(a) - rank(b)
  })

  function add (): void {
    showPopup(CreateDecisionPopup, { space })
  }

  async function ratify (d: Decision): Promise<void> {
    // decidedBy is the human who ratified. This is the line that keeps the
    // record honest: an AI-drafted proposal only ever gains an owner here.
    const person = getCurrentEmployee()
    await client.update(d, {
      state: 'ratified',
      decidedOn: Date.now(),
      // Once a human ratifies, the human owns it -- the AI-drafted marker goes.
      aiDrafted: false,
      decidedBy: person
    })
  }

  function labelFor (state: Decision['state']) {
    return state === 'ratified'
      ? tracker.string.Ratified
      : state === 'superseded'
        ? tracker.string.Superseded
        : tracker.string.Proposed
  }
</script>

<div class="decisions">
  <div class="decisions__head">
    <span class="decisions__title">
      <Label label={tracker.string.Decisions} />
      {#if decisions.length > 0}<span class="decisions__count">{decisions.length}</span>{/if}
    </span>
    <Button icon={IconAdd} kind={'ghost'} label={tracker.string.NewDecision} on:click={add} />
  </div>

  {#if ordered.length === 0}
    <div class="decisions__empty">
      <Label label={tracker.string.NoDecisions} />
      <span class="decisions__hint"><Label label={tracker.string.NoDecisionsHint} /></span>
    </div>
  {:else}
    <div class="decisions__list">
      {#each ordered as d (d._id)}
        <div class="decision" class:decision--superseded={d.state === 'superseded'}>
          <div class="decision__row">
            <span class="decision__state decision__state--{d.state}">
              <Label label={labelFor(d.state)} />
            </span>
            <span class="decision__title">{d.title}</span>
            {#if d.aiDrafted === true && d.state === 'proposed'}
              <span class="decision__ai"><Label label={tracker.string.DraftedByAI} /></span>
            {/if}
            {#if d.state === 'proposed'}
              <Button
                kind={'regular'}
                size={'small'}
                label={tracker.string.Ratify}
                showTooltip={{ label: tracker.string.RatifyHint }}
                on:click={() => {
                  void ratify(d)
                }}
              />
            {/if}
          </div>

          {#if d.rejectedOptions.length > 0}
            <div class="decision__rejected">
              <span class="decision__rejected-label"><Label label={tracker.string.RejectedOptions} /></span>
              {#each d.rejectedOptions as opt}
                <span class="decision__opt">{opt}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .decisions { display: flex; flex-direction: column; gap: 0.5rem; }
  .decisions__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .decisions__title {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-weight: 500; color: var(--theme-caption-color);
  }
  .decisions__count { font-size: 0.75rem; color: var(--theme-dark-color); }
  .decisions__empty {
    display: flex; flex-direction: column; gap: 0.15rem;
    padding: 0.85rem; border: 1px dashed var(--theme-divider-color);
    border-radius: 0.375rem; color: var(--theme-dark-color); font-size: 0.8125rem;
  }
  .decisions__hint { color: var(--theme-trans-color); }
  .decisions__list { display: flex; flex-direction: column; gap: 0.35rem; }

  .decision {
    padding: 0.5rem 0.6rem; border-radius: 0.375rem;
    border: 1px solid var(--theme-divider-color);
  }
  .decision--superseded { opacity: 0.6; }
  .decision__row { display: flex; align-items: center; gap: 0.6rem; }
  .decision__title {
    flex: 1; color: var(--theme-caption-color);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .decision__state {
    font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em;
    text-transform: uppercase; padding: 0.12rem 0.4rem; border-radius: 0.25rem;
    flex-shrink: 0;
  }
  .decision__state--proposed { background: var(--theme-button-pressed); color: var(--theme-dark-color); }
  .decision__state--ratified { background: var(--theme-button-hovered); color: var(--theme-caption-color); }
  .decision__state--superseded { background: transparent; color: var(--theme-trans-color); }
  .decision__ai {
    font-size: 0.6875rem; color: var(--theme-trans-color); flex-shrink: 0;
  }
  .decision__rejected {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem;
    margin-top: 0.35rem; font-size: 0.75rem;
  }
  .decision__rejected-label { color: var(--theme-trans-color); }
  .decision__opt {
    padding: 0.08rem 0.35rem; border-radius: 0.2rem;
    background: var(--theme-button-default); color: var(--theme-dark-color);
    text-decoration: line-through;
  }
</style>
