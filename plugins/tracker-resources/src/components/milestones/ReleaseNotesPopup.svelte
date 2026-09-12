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
  Release notes for a milestone, generated from its issues and grouped by
  resolution. Markdown, so it pastes into a changelog, a chat, or a
  document as-is. Open issues are listed too: a release note that hides
  what did not ship is a marketing page.
-->
<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, type IssueStatus, type Milestone, type Resolution } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'

  import tracker from '../../plugin'

  export let milestone: Milestone

  const client = getClient()
  const dispatch = createEventDispatcher()

  let text = ''
  let busy = true
  let copied = false

  function line (i: Issue): string {
    return `- ${i.identifier} — ${i.title}`
  }

  onMount(async () => {
    const [issues, statuses, resolutions] = await Promise.all([
      client.findAll(tracker.class.Issue, { milestone: milestone._id }, { limit: 2000 }),
      client.findAll(tracker.class.IssueStatus, {}),
      client.findAll(tracker.class.Resolution, {})
    ])
    const category = new Map<string, IssueStatus['category']>(statuses.map((s) => [s._id, s.category]))
    const done = (i: Issue): boolean => {
      const c = category.get(i.status)
      return c === task.statusCategory.Won || c === task.statusCategory.Lost
    }
    const resName = new Map<string, string>(resolutions.map((r: Resolution) => [r._id, r.name]))

    const closed = issues.filter(done)
    const open = issues.filter((i) => !done(i))
    const groups = new Map<string, Issue[]>()
    for (const i of closed) {
      const key = i.resolution != null ? resName.get(i.resolution) ?? 'Resolved' : 'Resolved'
      groups.set(key, [...(groups.get(key) ?? []), i])
    }
    const when = new Date(milestone.targetDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    const out: string[] = [`# ${milestone.label} — ${when}`, '']
    // Resolutions that mean "delivered" first, then the rest, then open work.
    const order = Array.from(groups.keys()).sort((a, b) => (a === 'Fixed' ? -1 : b === 'Fixed' ? 1 : a.localeCompare(b)))
    for (const key of order) {
      const list = groups.get(key) ?? []
      out.push(`## ${key} (${list.length})`)
      for (const i of list) out.push(line(i))
      out.push('')
    }
    if (open.length > 0) {
      out.push(`## Not shipped (${open.length})`)
      for (const i of open) out.push(line(i))
      out.push('')
    }
    if (issues.length === 0) out.push('_No issues in this milestone._')
    text = out.join('\n')
    busy = false
  })

  async function copy (): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      setTimeout(() => {
        copied = false
      }, 1600)
    } catch {
      // clipboard unavailable: the textarea is selectable
    }
  }
</script>

<div class="notes">
  <div class="notes__head">
    <span class="notes__title"><Label label={tracker.string.ReleaseNotes} /></span>
    <span class="notes__sub">{milestone.label}</span>
  </div>
  <textarea class="notes__text" readonly value={busy ? '…' : text} />
  <div class="notes__actions">
    <Button
      kind={'ghost'}
      label={tracker.string.Close}
      on:click={() => {
        dispatch('close')
      }}
    />
    <Button
      kind={'primary'}
      label={copied ? tracker.string.Copied : tracker.string.CopyMarkdown}
      disabled={busy}
      on:click={() => {
        void copy()
      }}
    />
  </div>
</div>

<style lang="scss">
  .notes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(44rem, 92vw);
    padding: 1rem 1.25rem;
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.75rem;
    box-shadow: var(--theme-popup-shadow);
  }
  .notes__head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .notes__title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .notes__sub {
    font-size: 0.8125rem;
    color: var(--theme-trans-color);
  }
  .notes__text {
    width: 100%;
    min-height: 18rem;
    max-height: 60vh;
    padding: 0.75rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    background: var(--theme-bg-color);
    color: var(--theme-content-color);
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.8125rem;
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }
  .notes__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
