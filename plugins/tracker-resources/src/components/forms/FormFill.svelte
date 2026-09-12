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
<!-- Fill in a form inside the app; submitting creates the issue. -->
<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import { type IssueForm, type Project } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'

  import tracker from '../../plugin'
  import { submitForm, validate, type Answers } from './formSubmit'

  export let form: IssueForm

  const client = getClient()
  const dispatch = createEventDispatcher()
  let answers: Answers = {}
  for (const f of form.fields) answers[f.key] = f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : ''
  let errors: string[] = []
  let busy = false
  let created = ''
  async function submit (): Promise<void> {
    errors = validate(form, answers)
    if (errors.length > 0) return
    busy = true
    try {
      const project = await client.findOne(tracker.class.Project, { _id: form.space })
      if (project === undefined) throw new Error('project not found')
      const issue = await submitForm(form, answers, project)
      if (issue !== undefined) {
        created = issue.identifier
        showPanel(view.component.EditDoc, issue._id, issue._class, 'content')
        dispatch('close')
      }
    } catch (e: any) {
      errors = [String(e?.message ?? e)]
    } finally {
      busy = false
    }
  }
  function has (key: string, opt: string): boolean {
    const v = answers[key]
    return Array.isArray(v) && v.includes(opt)
  }
  function toggleMulti (key: string, opt: string): void {
    const cur = (answers[key] as string[] | undefined) ?? []
    answers[key] = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]
  }
</script>

<Card label={tracker.string.OpenForm} okLabel={tracker.string.Submit} canSave={!busy} okAction={() => { void submit() }} on:close={() => { dispatch('close') }} width={'medium'}>
  <div class="ff">
    <span class="ff__title">{form.name}</span>
    {#if form.description}<p class="ff__desc">{form.description}</p>{/if}
    {#each form.fields as f (f.key)}
      <label class="field">
        <span class="field__label">{f.label}{#if f.required}<i>*</i>{/if}</span>
        {#if f.type === 'textarea'}<textarea class="input" rows="4" placeholder={f.placeholder ?? ''} bind:value={answers[f.key]} />
        {:else if f.type === 'select'}<select class="input" bind:value={answers[f.key]}><option value="">—</option>{#each f.options ?? [] as o}<option value={o}>{o}</option>{/each}</select>
        {:else if f.type === 'multiselect'}<span class="chips">{#each f.options ?? [] as o}<button type="button" class="chip" class:chip--on={has(f.key, o)} on:click={() => { toggleMulti(f.key, o) }}>{o}</button>{/each}</span>
        {:else if f.type === 'checkbox'}<input type="checkbox" checked={answers[f.key] === true} on:change={(e) => { answers[f.key] = e.currentTarget.checked }} />
        {:else if f.type === 'number'}<input class="input" type="number" placeholder={f.placeholder ?? ''} bind:value={answers[f.key]} />
        {:else if f.type === 'date'}<input class="input" type="date" bind:value={answers[f.key]} />
        {:else if f.type === 'email'}<input class="input" type="email" placeholder={f.placeholder ?? ''} bind:value={answers[f.key]} />
        {:else if f.type === 'url'}<input class="input" type="url" placeholder={f.placeholder ?? ''} bind:value={answers[f.key]} />
        {:else}<input class="input" type="text" placeholder={f.placeholder ?? ''} bind:value={answers[f.key]} />{/if}
        {#if f.hint}<span class="field__hint">{f.hint}</span>{/if}
      </label>
    {/each}
    {#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}
    {#if created}<p class="ok">Created {created}</p>{/if}
  </div>
</Card>

<style lang="scss">
  .ff { display: flex; flex-direction: column; gap: 0.6rem; min-width: 26rem; max-width: 40rem; }
  .ff__title { font-size: 1.05rem; font-weight: 600; color: var(--theme-caption-color); }
  .ff__desc { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  .field__label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); i { color: var(--negative-button-default); font-style: normal; margin-left: 0.15rem; } }
  .field__hint { font-size: 0.7rem; color: var(--theme-trans-color); }
  .input { padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; outline: none; &:focus { border-color: var(--accent-brand); } }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { padding: 0.2rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 999px; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; cursor: pointer; &--on { border-color: var(--accent-brand); background: var(--accent-brand-soft); color: var(--theme-caption-color); } }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.8125rem; color: var(--negative-button-default); }
  .ok { margin: 0; font-size: 0.875rem; color: var(--accent-brand-ink); }
</style>
