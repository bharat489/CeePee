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
  Import GitHub Issues straight from the API (it allows browser calls).
  Public repositories need no token; private ones need a fine-grained token
  with Issues: read. Labels, assignees (by GitHub login → matching name),
  milestones as labels, state, comments, and a link back to GitHub.
-->
<script lang="ts">
  import { type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { type Project } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { buildMapping, Importer, PRIORITY_WORDS } from './common'

  const projectQuery = createQuery()
  let projects: Project[] = []
  projectQuery.query(tracker.class.Project, { archived: false }, (r) => { projects = r })
  let projectId: Ref<Project> | undefined
  $: if (projectId === undefined && projects.length > 0) projectId = projects[0]._id
  $: project = projects.find((p) => p._id === projectId)

  let repo = ''
  let token = ''
  let state: 'open' | 'all' = 'open'
  let includeComments = true
  interface GhIssue {
    number: number
    title: string
    body: string | null
    state: string
    html_url: string
    labels: Array<{ name: string }>
    assignees: Array<{ login: string, name?: string | null }>
    milestone: { title: string } | null
    comments: number
    created_at: string
    pull_request?: unknown
  }
  let list: GhIssue[] = []
  let error = ''
  let loading = false
  const headers = (): Record<string, string> => ({ accept: 'application/vnd.github+json', ...(token.trim() !== '' ? { authorization: `Bearer ${token.trim()}` } : {}) })
  async function fetchAll (): Promise<void> {
    error = ''
    list = []
    const m = /github\.com\/([^/]+)\/([^/#?]+)|^([^/\s]+)\/([^/\s]+)$/.exec(repo.trim())
    const owner = m?.[1] ?? m?.[3]
    const name = (m?.[2] ?? m?.[4] ?? '').replace(/\.git$/, '')
    if (owner === undefined || name === '') {
      error = 'Enter owner/repo or a repository URL.'
      return
    }
    loading = true
    try {
      for (let page = 1; page <= 30; page++) {
        const r = await fetch(`https://api.github.com/repos/${owner}/${name}/issues?state=${state}&per_page=100&page=${page}`, { headers: headers() })
        if (!r.ok) throw new Error(`GitHub answered ${r.status}${r.status === 403 ? ' (rate limit or private repository: add a token)' : r.status === 404 ? ' (not found: private repository needs a token)' : ''}`)
        const batch = (await r.json()) as GhIssue[]
        list = [...list, ...batch.filter((i) => i.pull_request === undefined)]
        if (batch.length < 100) break
      }
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      loading = false
    }
  }
  async function commentsOf (i: GhIssue): Promise<Array<{ author: string, date?: number, body: string }>> {
    if (!includeComments || i.comments === 0) return []
    const m = /github\.com\/([^/]+)\/([^/]+)\/issues/.exec(i.html_url)
    if (m === null) return []
    const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/issues/${i.number}/comments?per_page=100`, { headers: headers() })
    if (!r.ok) return []
    const cs = (await r.json()) as Array<{ user: { login: string }, created_at: string, body: string }>
    return cs.map((c) => ({ author: c.user?.login ?? 'github', date: Date.parse(c.created_at), body: c.body ?? '' }))
  }

  let importing = false
  let done = 0
  let errors: string[] = []
  let finished = false
  async function run (): Promise<void> {
    if (project === undefined || list.length === 0) return
    importing = true
    finished = false
    errors = []
    done = 0
    const m = await buildMapping(project)
    const imp = new Importer(m)
    for (const i of [...list].sort((a, b) => a.number - b.number)) {
      try {
        const labels = i.labels.map((l) => l.name)
        const prio = labels.map((l) => PRIORITY_WORDS[l.toLowerCase().replace(/^priority[:\s-]*/, '')]).find((p) => p !== undefined)
        await imp.create({
          title: i.title,
          description: [i.body ?? ''].filter((x) => x !== ''),
          status: i.state === 'closed' ? m.doneStatus ?? m.defaultStatus : m.defaultStatus,
          assignee: i.assignees.map((a) => m.personFor(a.name ?? '') ?? m.personFor(a.login)).find((p) => p !== null) ?? null,
          labels: [...labels, ...(i.milestone !== null ? [`milestone: ${i.milestone.title}`] : [])],
          priority: prio,
          comments: await commentsOf(i),
          externalLinks: [{ url: i.html_url, label: `GitHub #${i.number}` }]
        }, `GitHub #${i.number}`)
      } catch (err: any) {
        errors = [...errors, `#${i.number}: ${String(err?.message ?? err)}`]
      }
      done++
    }
    importing = false
    finished = true
  }
</script>

<div class="imp">
  <section class="card"><span class="card__step">1</span><div class="card__body"><span class="card__title">Target project</span><select class="select" bind:value={projectId}>{#each projects as p (p._id)}<option value={p._id}>{p.name} ({p.identifier})</option>{/each}</select></div></section>
  <section class="card"><span class="card__step">2</span><div class="card__body">
    <span class="card__title">Repository</span>
    <div class="row"><input class="select select--w" placeholder="owner/repo or https://github.com/owner/repo" bind:value={repo} /><input class="select" type="password" placeholder="token (private repos, higher rate limit)" bind:value={token} /><select class="select" bind:value={state}><option value="open">open issues</option><option value="all">open and closed</option></select><Button kind={'primary'} label={tracker.string.Run} disabled={loading || repo.trim() === ''} on:click={() => { void fetchAll() }} /></div>
    <p class="hint">Pull requests are skipped. Fine-grained token: Settings → Developer settings → tokens, with Issues: read.</p>
    {#if error}<p class="err">{error}</p>{/if}
  </div></section>
  {#if list.length > 0}
    <section class="card"><span class="card__step">3</span><div class="card__body">
      <span class="card__title">Preview</span>
      <ul class="facts">
        <li><b>{list.length}</b> issues ({list.filter((i) => i.state === 'open').length} open) → <b>{project?.name}</b></li>
        <li>Labels → labels (a priority label such as "high" sets priority) · milestones → labels · closed → done · assignees by name, then login</li>
        <li><b>{list.reduce((a, i) => a + i.comments, 0)}</b> comments{includeComments ? '' : ' (skipped)'} · every issue keeps a link back to GitHub</li>
      </ul>
      <label class="check"><input type="checkbox" bind:checked={includeComments} /> import comments (one API call per issue with comments)</label>
      <div class="actions"><Button kind={'primary'} label={tracker.string.ImportIssues} disabled={importing} on:click={() => { void run() }} /></div>
      {#if importing || finished}<div class="progress"><span class="progress__fill" style="width: {(done / list.length) * 100}%" /></div><p class="hint">{done} / {list.length}{#if finished} · done{/if}{#if errors.length > 0} · {errors.length} failed{/if}</p>{#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}{/if}
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
  .row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .select { padding: 0.45rem 0.6rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.875rem; &--w { flex: 1; min-width: 16rem; } }
  .err { margin: 0; color: var(--negative-button-default); font-size: 0.8125rem; }
  .facts { margin: 0; padding-left: 1.2rem; font-size: 0.875rem; color: var(--theme-content-color); line-height: 1.6; b { color: var(--theme-caption-color); } }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .actions { display: flex; justify-content: flex-end; }
  .progress { height: 0.4rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; }
  .progress__fill { display: block; height: 100%; background-image: var(--accent-gradient); transition: width var(--motion-fast) linear; }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
</style>
