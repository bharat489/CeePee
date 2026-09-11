//
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
//

// The public help centre: no account, no login. Served by the integrations
// service on behalf of a service account.
//
//   GET  /portal                     help centre: search, request types, submit form
//   GET  /portal/kb?q=...            knowledge-base search (JSON)
//   GET  /portal/article/:id         one knowledge-base page, rendered
//   POST /portal/submit              create a request (form or JSON)
//   GET  /portal/status?key=&email=  progress of a request, for its reporter
//   POST /portal/rate                satisfaction rating from the reporter
//
// The reporter's email is kept on the request (portalEmail) so status and
// rating are gated on it -- the only secret an anonymous visitor has.

import { type PlatformClient } from '@hcengineering/api-client'
import { type Class, type Doc, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type Issue, type RequestType } from '@hcengineering/tracker'

import { addComment, createIssue, findIssue, findProject } from './platform'

export interface PortalConfig {
  name: string
  color: string
  logoUrl: string
  project: string
  publicUrl: string
}

export interface Result {
  status: number
  body: string | Record<string, unknown>
  html?: boolean
}

const DOC_CLASS = 'document:class:Document' as Ref<Class<Doc>>

function esc (s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

function page (cfg: PortalConfig, title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(cfg.name)}</title>
<style>
:root{--c:${esc(cfg.color)};--bg:#f6f7f9;--ink:#15171c;--mut:#6b7280;--line:#e5e7eb}
@media(prefers-color-scheme:dark){:root{--bg:#0e0f10;--ink:#f3f4f6;--mut:#9ca3af;--line:#2a2d33}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--c);color:#fff;padding:1.4rem 1.2rem}header .in{max-width:56rem;margin:0 auto;display:flex;align-items:center;gap:.8rem}
header img{height:2rem}header h1{font-size:1.25rem;margin:0}header a{color:#fff;text-decoration:none}
main{max-width:56rem;margin:0 auto;padding:1.5rem 1.2rem}
.card{background:#fff;border:1px solid var(--line);border-radius:.9rem;padding:1.2rem;margin:0 0 1rem}@media(prefers-color-scheme:dark){.card{background:#15171c}}
h2{margin:0 0 .6rem;font-size:1.05rem}p.m{color:var(--mut);margin:.2rem 0 .8rem;font-size:.9rem}
input,textarea,select{width:100%;padding:.6rem .7rem;border:1px solid var(--line);border-radius:.55rem;font:inherit;background:transparent;color:inherit}
label{display:block;font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);margin:.7rem 0 .25rem}
button,.btn{display:inline-block;padding:.6rem 1.1rem;border:0;border-radius:.6rem;background:var(--c);color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.types{display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.6rem}.type{border:1px solid var(--line);border-radius:.7rem;padding:.7rem .8rem;cursor:pointer}.type.on{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}
.type b{display:block}.type span{font-size:.8rem;color:var(--mut)}
ul.kb{list-style:none;margin:0;padding:0}ul.kb li{padding:.5rem 0;border-top:1px solid var(--line)}ul.kb a{color:var(--c);text-decoration:none;font-weight:600}
.pill{display:inline-block;padding:.1rem .55rem;border-radius:999px;background:color-mix(in srgb,var(--c) 15%,transparent);color:var(--c);font-size:.75rem;font-weight:600}
.stars button{background:none;color:#f5a623;font-size:1.6rem;padding:0 .1rem}
footer{color:var(--mut);font-size:.75rem;text-align:center;padding:1rem}
article{line-height:1.7}article img{max-width:100%}
</style></head><body><header><div class="in">${cfg.logoUrl !== '' ? `<img src="${esc(cfg.logoUrl)}" alt="">` : ''}<h1><a href="/portal">${esc(cfg.name)}</a></h1></div></header><main>${body}</main><footer>Powered by CeePee</footer></body></html>`
}

export async function portalHome (c: PlatformClient, cfg: PortalConfig, q: string): Promise<Result> {
  const project = await findProject(c, cfg.project)
  const types: RequestType[] = project !== undefined ? await c.findAll(tracker.class.RequestType, { space: project._id }) : []
  const kb = q.trim() !== '' ? await searchKb(c, q) : []
  const body = `
<div class="card"><h2>How can we help?</h2>
<form method="get" action="/portal"><input name="q" value="${esc(q)}" placeholder="Search help articles…"></form>
${kb.length > 0 ? `<ul class="kb">${kb.map((a) => `<li><a href="/portal/article/${esc(a._id)}">${esc(a.title)}</a></li>`).join('')}</ul>` : q.trim() !== '' ? '<p class="m">No articles match. Send us a request below.</p>' : ''}
</div>
<div class="card"><h2>Submit a request</h2><p class="m">Pick what you need, tell us what happened. You will get a ticket key to check progress.</p>
${project === undefined ? '<p class="m">The help centre is not configured yet.</p>' : `
<form method="post" action="/portal/submit" id="f">
<div class="types">${types.map((t, i) => `<label class="type${i === 0 ? ' on' : ''}" onclick="document.querySelectorAll('.type').forEach(e=>e.classList.remove('on'));this.classList.add('on')"><input type="radio" name="type" value="${esc(t._id)}" ${i === 0 ? 'checked' : ''} style="display:none"><b>${esc(t.name)}</b><span>${esc(t.description)}</span>${t.slaHours !== undefined && t.slaHours > 0 ? `<span>Response within ${t.slaHours}h</span>` : ''}</label>`).join('')}</div>
<label>Your email</label><input name="email" type="email" required placeholder="you@company.com">
<label>Your name</label><input name="name" placeholder="Optional">
<label>What happened</label><input name="title" required placeholder="One line">
<label>Details</label><textarea name="details" rows="6" placeholder="Steps, what you expected, what you saw"></textarea>
<p></p><button type="submit">Send request</button>
</form>`}
</div>
<div class="card"><h2>Check a request</h2><form method="get" action="/portal/status"><label>Ticket key</label><input name="key" placeholder="${esc(project?.identifier ?? 'KEY')}-12"><label>Your email</label><input name="email" type="email"><p></p><button type="submit">Check status</button></form></div>`
  return { status: 200, body: page(cfg, 'Help centre', body), html: true }
}

async function searchKb (c: PlatformClient, q: string): Promise<Array<{ _id: Ref<Doc>, title: string }>> {
  const words = q.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 3).slice(0, 4)
  const found = new Map<Ref<Doc>, { _id: Ref<Doc>, title: string }>()
  for (const w of words.length > 0 ? words : [q.trim()]) {
    try {
      const docs = await c.findAll(DOC_CLASS, { title: { $like: `%${w}%` } } as any, { limit: 8 })
      for (const d of docs) found.set(d._id, { _id: d._id, title: String((d as any).title ?? '') })
    } catch {
      // documents plugin may be absent
    }
  }
  return Array.from(found.values()).slice(0, 10)
}

export async function portalKb (c: PlatformClient, q: string): Promise<Result> {
  return { status: 200, body: { results: await searchKb(c, q) } }
}

export async function portalArticle (c: PlatformClient, cfg: PortalConfig, id: string): Promise<Result> {
  const doc = (await c.findAll(DOC_CLASS, { _id: id as Ref<Doc> } as any, { limit: 1 }))[0] as any
  if (doc === undefined) return { status: 404, body: page(cfg, 'Not found', '<div class="card"><h2>Article not found</h2></div>'), html: true }
  let html = ''
  try {
    html = doc.content != null ? await c.fetchMarkup(DOC_CLASS, doc._id, 'content', doc.content, 'html') : ''
  } catch {
    html = '<p>This article cannot be displayed.</p>'
  }
  return { status: 200, body: page(cfg, String(doc.title ?? ''), `<div class="card"><h2>${esc(doc.title)}</h2><article>${html}</article></div><p><a class="btn" href="/portal">← Help centre</a></p>`), html: true }
}

export async function portalSubmit (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const email = String(o.email ?? '').trim().toLowerCase()
  const title = String(o.title ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || title === '') {
    return wantsHtml ? { status: 400, body: page(cfg, 'Missing details', '<div class="card"><h2>Please give an email and a one-line summary.</h2><p><a class="btn" href="/portal">Back</a></p></div>'), html: true } : { status: 400, body: { error: 'email and title are required' } }
  }
  const project = await findProject(c, cfg.project)
  if (project === undefined) return { status: 503, body: { error: 'portal project not configured' } }
  const typeId = String(o.type ?? '')
  const type = typeId !== '' ? (await c.findAll(tracker.class.RequestType, { _id: typeId as Ref<RequestType> }, { limit: 1 }))[0] : undefined
  const name = String(o.name ?? '').trim()
  const issue = await createIssue(c, project, {
    title,
    description: `From: ${name !== '' ? `${name} <${email}>` : email}\n\n${String(o.details ?? '')}`,
    priority: type?.priority ?? IssuePriority.Medium,
    assignee: null,
    requestType: true,
    portalEmail: email,
    requestTypeId: type?._id
  })
  const statusUrl = `${cfg.publicUrl.replace(/\/$/, '')}/portal/status?key=${encodeURIComponent(issue.identifier)}&email=${encodeURIComponent(email)}`
  if (wantsHtml) {
    return { status: 200, body: page(cfg, 'Request sent', `<div class="card"><h2>Request <span class="pill">${esc(issue.identifier)}</span> sent</h2><p class="m">Keep this link to follow progress: <a href="${esc(statusUrl)}">${esc(statusUrl)}</a></p><p><a class="btn" href="/portal">Back to help centre</a></p></div>`), html: true }
  }
  return { status: 200, body: { created: issue.identifier, status: statusUrl } }
}

async function requestFor (c: PlatformClient, key: string, email: string): Promise<Issue | undefined> {
  const issue = await findIssue(c, key)
  if (issue === undefined) return undefined
  return (issue.portalEmail ?? '').toLowerCase() === email.trim().toLowerCase() ? issue : undefined
}

export async function portalStatus (c: PlatformClient, cfg: PortalConfig, key: string, email: string, wantsHtml: boolean): Promise<Result> {
  const issue = await requestFor(c, key, email)
  if (issue === undefined) {
    return wantsHtml ? { status: 404, body: page(cfg, 'Not found', '<div class="card"><h2>No request with that key and email.</h2><p><a class="btn" href="/portal">Back</a></p></div>'), html: true } : { status: 404, body: { error: 'not found' } }
  }
  const statuses = await c.findAll(tracker.class.IssueStatus, { _id: issue.status }, { limit: 1 })
  const st = statuses[0]
  const done = st !== undefined && (st.category === task.statusCategory.Won || st.category === task.statusCategory.Lost)
  const info = { key: issue.identifier, title: issue.title, status: st?.name ?? '', done, rated: issue.csat !== undefined, updated: issue.modifiedOn, slaDue: issue.slaDue ?? null }
  if (!wantsHtml) return { status: 200, body: info }
  const stars = [1, 2, 3, 4, 5].map((v) => `<form method="post" action="/portal/rate" style="display:inline"><input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="email" value="${esc(email)}"><input type="hidden" name="score" value="${v}"><button title="${v} of 5">★</button></form>`).join('')
  return {
    status: 200,
    body: page(cfg, issue.identifier, `<div class="card"><h2><span class="pill">${esc(issue.identifier)}</span> ${esc(issue.title)}</h2><p class="m">Status: <b>${esc(info.status)}</b> · updated ${new Date(issue.modifiedOn).toLocaleString()}${issue.slaDue != null && !done ? ` · response due ${new Date(issue.slaDue).toLocaleString()}` : ''}</p>
${done && issue.csat === undefined ? `<h2>How did we do?</h2><div class="stars">${stars}</div>` : issue.csat !== undefined ? `<p class="m">Thanks for rating this request ${'★'.repeat(issue.csat)}.</p>` : ''}
<p><a class="btn" href="/portal">Help centre</a></p></div>`),
    html: true
  }
}

export async function portalRate (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const key = String(o.key ?? '')
  const email = String(o.email ?? '')
  const score = Math.min(5, Math.max(1, Number(o.score ?? 0)))
  const issue = await requestFor(c, key, email)
  if (issue === undefined || Number.isNaN(score)) return { status: 404, body: { error: 'not found' } }
  if (issue.csat === undefined) {
    await c.updateDoc(tracker.class.Issue, issue.space, issue._id, { csat: score, csatComment: String(o.comment ?? '').trim() || undefined })
    await addComment(c, issue, `Customer rated this request ${score}/5 via the help centre.`)
  }
  if (wantsHtml) return { status: 200, body: page(cfg, 'Thank you', `<div class="card"><h2>Thank you</h2><p class="m">Your rating for ${esc(key)} is recorded.</p><p><a class="btn" href="/portal">Help centre</a></p></div>`), html: true }
  return { status: 200, body: { ok: true } }
}
