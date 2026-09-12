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
  Import a Trello board from its JSON export (Menu → More → Print and
  export → Export as JSON). Lists become statuses (by name, else mapped by
  position: first list = default, last = done), cards become issues with
  labels, members, due dates, descriptions, comments and attachment links;
  checklist items become sub-issues.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { type Project } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { buildMapping, Importer, type Mapping, type NewIssue } from './common'

  const projectQuery = createQuery()
  let projects: Project[] = []
  projectQuery.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  let projectId: Ref<Project> | undefined
  $: if (projectId === undefined && projects.length > 0) projectId = projects[0]._id
  $: project = projects.find((p) => p._id === projectId)

  interface Board {
    name?: string
    lists?: Array<{ id: string, name: string, closed?: boolean, pos?: number }>
    cards?: Array<{ id: string, name: string, desc?: string, idList: string, closed?: boolean, due?: string | null, labels?: Array<{ name: string, color?: string }>, idMembers?: string[], idChecklists?: string[], attachments?: Array<{ url: string, name: string }>, shortUrl?: string, pos?: number }>
    members?: Array<{ id: string, fullName: string, username: string }>
    checklists?: Array<{ id: string, idCard: string, name: string, checkItems: Array<{ name: string, state: string }> }>
    actions?: Array<{ type: string, date: string, data: { card?: { id: string }, text?: string }, memberCreator?: { fullName: string } }>
  }
  let board: Board | undefined
  let error = ''
  let includeArchived = false
  let checklistsAsSubissues = true
  let includeComments = true
  async function onFile (e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f === undefined) return
    error = ''
    try {
      const j = JSON.parse(await f.text())
      if (!Array.isArray(j.cards) || !Array.isArray(j.lists)) throw new Error('not a Trello board export (no cards/lists)')
      board = j
    } catch (err: any) {
      board = undefined
      error = String(err?.message ?? err)
    }
  }
  $: lists = (board?.lists ?? []).filter((l) => includeArchived || l.closed !== true).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
  $: cards = (board?.cards ?? []).filter((c) => (includeArchived || c.closed !== true) && lists.some((l) => l.id === c.idList))
  $: comments = (board?.actions ?? []).filter((a) => a.type === 'commentCard')

  let importing = false
  let done = 0
  let total = 0
  let errors: string[] = []
  let finished = false
  async function run (): Promise<void> {
    if (project === undefined || board === undefined) return
    importing = true
    finished = false
    errors = []
    done = 0
    total = cards.length
    const m: Mapping = await buildMapping(project)
    const imp = new Importer(m)
    const memberName = new Map((board.members ?? []).map((u) => [u.id, u.fullName]))
    const listById = new Map(lists.map((l) => [l.id, l]))
    const lastList = lists[lists.length - 1]
    const statusForList = (id: string): NewIssue['status'] => {
      const l = listById.get(id)
      if (l === undefined) return m.defaultStatus
      const byName = m.statuses.find((s) => s.name.toLowerCase() === l.name.toLowerCase())
      if (byName !== undefined) return byName._id
      const mapped = m.statusFor(l.name)
      if (mapped !== m.defaultStatus) return mapped
      if (lastList !== undefined && l.id === lastList.id && m.doneStatus !== undefined) return m.doneStatus
      return m.defaultStatus
    }
    for (const c of cards.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))) {
      try {
        const desc: string[] = []
        if (c.desc) desc.push(c.desc)
        const links = [...(c.attachments ?? []).filter((a) => /^https?:/.test(a.url)).map((a) => ({ url: a.url, label: a.name || 'attachment' })), ...(c.shortUrl ? [{ url: c.shortUrl, label: 'Trello card' }] : [])]
        const cardComments = includeComments ? comments.filter((a) => a.data.card?.id === c.id).map((a) => ({ author: a.memberCreator?.fullName ?? 'Trello', date: Date.parse(a.date), body: a.data.text ?? '' })) : []
        const created = await imp.create({
          title: c.name,
          description: desc,
          status: statusForList(c.idList),
          assignee: (c.idMembers ?? []).map((id) => m.personFor(memberName.get(id) ?? '')).find((p) => p !== null) ?? null,
          dueDate: c.due != null ? Date.parse(c.due) : undefined,
          labels: [...(c.labels ?? []).map((l) => l.name).filter((n) => n !== ''), `list: ${listById.get(c.idList)?.name ?? ''}`],
          comments: cardComments,
          externalLinks: links
        }, `Trello · ${board.name ?? 'board'}`)
        if (checklistsAsSubissues) {
          for (const cl of (board.checklists ?? []).filter((x) => x.idCard === c.id)) {
            for (const item of cl.checkItems) {
              await imp.create({ title: item.name, description: [`Checklist: ${cl.name}`], status: item.state === 'complete' ? m.doneStatus ?? m.defaultStatus : m.defaultStatus, parent: created }, 'Trello checklist')
            }
          }
        }
      } catch (err: any) {
        errors = [...errors, `${c.name}: ${String(err?.message ?? err)}`]
      }
      done++
    }
    importing = false
    finished = true
  }
</script>

<div class="imp">
  <section class="card"><span class="card__step">1</span><div class="card__body"><span class="card__title">Target project</span><select class="select" bind:value={projectId}>{#each projects as p (p._id)}<option value={p._id}>{p.name} ({p.identifier})</option>{/each}</select></div></section>
  <section class="card"><span class="card__step">2</span><div class="card__body"><span class="card__title">Trello JSON export</span><p class="hint">Board menu → More → Print and export → Export as JSON.</p><input class="file" type="file" accept=".json,application/json" on:change={onFile} />{#if error}<p class="err">{error}</p>{/if}</div></section>
  {#if board !== undefined}
    <section class="card"><span class="card__step">3</span><div class="card__body">
      <span class="card__title">Preview · {board.name ?? 'board'}</span>
      <ul class="facts">
        <li><b>{cards.length}</b> cards in <b>{lists.length}</b> lists → <b>{project?.name}</b></li>
        <li>Lists → statuses: {lists.map((l) => l.name).join(', ')}. Matched by name; the last list counts as done; the list name is also added as a label.</li>
        <li><b>{(board.checklists ?? []).reduce((a, c) => a + c.checkItems.length, 0)}</b> checklist items{checklistsAsSubissues ? ' → sub-issues' : ' skipped'} · <b>{comments.length}</b> comments · attachments kept as links</li>
        <li>Members match by full name; unmatched cards stay unassigned.</li>
      </ul>
      <div class="opts"><label class="check"><input type="checkbox" bind:checked={includeArchived} /> include archived lists and cards</label><label class="check"><input type="checkbox" bind:checked={checklistsAsSubissues} /> checklists as sub-issues</label><label class="check"><input type="checkbox" bind:checked={includeComments} /> comments</label></div>
      <div class="actions"><Button kind={'primary'} label={tracker.string.ImportIssues} disabled={importing || cards.length === 0} on:click={() => { void run() }} /></div>
      {#if importing || finished}<div class="progress"><span class="progress__fill" style="width: {total === 0 ? 100 : (done / total) * 100}%" /></div><p class="hint">{done} / {total}{#if finished} · done{/if}{#if errors.length > 0} · {errors.length} failed{/if}</p>{#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}{/if}
    </div></section>
  {/if}
</div>

<style lang="scss">
  .imp { display: flex; flex-direction: column; gap: 0.75rem; }
  .card { display: flex; gap: 0.9rem; padding: 1rem 1.1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); }
  .card__step { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 1.6rem; height: 1.6rem; border-radius: 50%; background-image: var(--accent-gradient); color: #fff; font-size: 0.8rem; font-weight: 700; }
  .card__body { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-width: 0; }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .hint { margin: 0; font-size: 0.8125rem; color: var(--theme-dark-color); }
  .select { padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; }
  .file { font-size: 0.8125rem; color: var(--theme-content-color); }
  .err { margin: 0; color: var(--negative-button-default); font-size: 0.8125rem; }
  .facts { margin: 0; padding-left: 1.2rem; font-size: 0.875rem; color: var(--theme-content-color); line-height: 1.6; b { color: var(--theme-caption-color); } }
  .opts { display: flex; gap: 1rem; flex-wrap: wrap; }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .actions { display: flex; justify-content: flex-end; }
  .progress { height: 0.4rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .progress__fill { display: block; height: 100%; background-image: var(--accent-gradient); transition: width var(--motion-fast) linear; }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
</style>
