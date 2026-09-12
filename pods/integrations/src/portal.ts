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

// The public help centre: no login, one page per project that switched its
// portal on (/portal/<slug>) plus the default one from the environment
// (/portal). Search the knowledge base, submit a request of a chosen type,
// follow it by key + email, exchange customer-visible replies with the team,
// see your organisation's other requests, and rate the outcome.

import { type PlatformClient } from '@hcengineering/api-client'
import { type Class, type Doc, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type CustomerOrg, type CustomerReply, type FormField, type Issue, type IssueForm, type Project, type RequestType } from '@hcengineering/tracker'

import { addComment, createIssue, findIssue, findProject, personByEmail } from './platform'

export interface PortalConfig {
  name: string
  color: string
  logoUrl: string
  project: string
  publicUrl: string
  /** URL base for links: "/portal" or "/portal/<slug>". */
  base: string
  welcome?: string
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

/** The portal for a slug: '' = the environment's default project; otherwise a project whose portal is enabled. */
export async function resolvePortal (c: PlatformClient, env: PortalConfig, slug: string): Promise<PortalConfig | undefined> {
  if (slug === '') return env.project !== '' ? { ...env, base: '/portal' } : { ...env, base: '/portal' }
  const projects = await c.findAll(tracker.class.Project, { archived: false })
  const p = Array.from(projects).find((x) => x.portal?.enabled === true && x.portal.slug === slug)
  if (p === undefined || p.portal === undefined) return undefined
  return { name: p.portal.name || p.name, color: p.portal.color || env.color, logoUrl: p.portal.logoUrl ?? '', project: p.identifier, publicUrl: env.publicUrl, base: `/portal/${slug}`, welcome: p.portal.welcome }
}

export function page (cfg: PortalConfig, title: string, body: string): string {
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
.msg{padding:.6rem .8rem;border-radius:.6rem;background:color-mix(in srgb,var(--mut) 12%,transparent);margin:.4rem 0}.msg.me{background:color-mix(in srgb,var(--c) 12%,transparent)}.msg small{display:block;color:var(--mut);font-size:.75rem;margin-bottom:.15rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{padding:.45rem .4rem;border-top:1px solid var(--line);text-align:left}th{color:var(--mut);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
footer{color:var(--mut);font-size:.75rem;text-align:center;padding:1rem}
article{line-height:1.7}article img{max-width:100%}
</style></head><body><header><div class="in">${cfg.logoUrl !== '' ? `<img src="${esc(cfg.logoUrl)}" alt="">` : ''}<h1><a href="${cfg.base}">${esc(cfg.name)}</a></h1></div></header><main>${body}</main><footer>Powered by CeePee</footer></body></html>`
}

export async function portalHome (c: PlatformClient, cfg: PortalConfig, q: string): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  const types: RequestType[] = project !== undefined ? Array.from(await c.findAll(tracker.class.RequestType, { space: project._id })) : []
  const kb = q.trim() !== '' ? await searchKb(c, q) : []
  const body = `
${cfg.welcome !== undefined && cfg.welcome !== '' ? `<div class="card"><p style="margin:0">${esc(cfg.welcome)}</p></div>` : ''}
<div class="card"><h2>How can we help?</h2>
<form method="get" action="${cfg.base}"><input name="q" value="${esc(q)}" placeholder="Search help articles…"></form>
${kb.length > 0 ? `<ul class="kb">${kb.map((a) => `<li><a href="${cfg.base}/article/${esc(a._id)}">${esc(a.title)}</a></li>`).join('')}</ul>` : q.trim() !== '' ? '<p class="m">No articles match. Send us a request below.</p>' : ''}
</div>
<div class="card"><h2>Submit a request</h2><p class="m">Pick what you need, tell us what happened. You will get a ticket key to check progress.</p>
${project === undefined ? '<p class="m">The help centre is not configured yet.</p>' : `
<form method="post" action="${cfg.base}/submit" id="f">
<div class="types">${types.map((t, i) => `<label class="type${i === 0 ? ' on' : ''}" onclick="document.querySelectorAll('.type').forEach(e=>e.classList.remove('on'));this.classList.add('on')"><input type="radio" name="type" value="${esc(t._id)}" ${i === 0 ? 'checked' : ''} style="display:none"><b>${esc(t.name)}</b><span>${esc(t.description)}</span>${t.slaHours !== undefined && t.slaHours > 0 ? `<span>Response within ${t.slaHours}h</span>` : ''}${t.requiresApproval === true ? '<span>Needs approval</span>' : ''}</label>`).join('')}</div>
<label>Your email</label><input name="email" type="email" required placeholder="you@company.com">
<label>Your name</label><input name="name" placeholder="Optional">
<label>What happened</label><input name="title" required placeholder="One line">
<label>Details</label><textarea name="details" rows="6" placeholder="Steps, what you expected, what you saw"></textarea>
<p></p><button type="submit">Send request</button>
</form>`}
</div>
<div class="card"><h2>Check a request</h2><form method="get" action="${cfg.base}/status"><label>Ticket key</label><input name="key" placeholder="${esc(project?.identifier ?? 'KEY')}-12"><label>Your email</label><input name="email" type="email"><p></p><button type="submit">Check status</button></form>
<p class="m">Your organisation's requests: <form method="get" action="${cfg.base}/org" style="display:inline"><input name="email" type="email" placeholder="you@company.com" style="width:14rem;display:inline-block"> <button type="submit">Show</button></form></p></div>`
  return { status: 200, body: page(cfg, cfg.name, body), html: true }
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
  return { status: 200, body: page(cfg, String(doc.title ?? ''), `<div class="card"><h2>${esc(doc.title)}</h2><article>${html}</article></div><p><a class="btn" href="${cfg.base}">← ${esc(cfg.name)}</a></p>`), html: true }
}

async function orgFor (c: PlatformClient, project: Project, email: string): Promise<CustomerOrg | undefined> {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (domain === '') return undefined
  const orgs = await c.findAll(tracker.class.CustomerOrg, { space: project._id })
  return Array.from(orgs).find((o) => o.domains.map((d) => d.toLowerCase()).includes(domain))
}

export async function portalSubmit (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const email = String(o.email ?? '').trim().toLowerCase()
  const title = String(o.title ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || title === '') {
    return wantsHtml ? { status: 400, body: page(cfg, 'Missing details', `<div class="card"><h2>Please give an email and a one-line summary.</h2><p><a class="btn" href="${cfg.base}">Back</a></p></div>`), html: true } : { status: 400, body: { error: 'email and title are required' } }
  }
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  if (project === undefined) return { status: 503, body: { error: 'portal project not configured' } }
  const typeId = String(o.type ?? '')
  const type = typeId !== '' ? (await c.findAll(tracker.class.RequestType, { _id: typeId as Ref<RequestType> }, { limit: 1 }))[0] : undefined
  const name = String(o.name ?? '').trim()
  const org = await orgFor(c, project, email)
  const issue = await createIssue(c, project, {
    title,
    description: `From: ${name !== '' ? `${name} <${email}>` : email}${org !== undefined ? ` (${org.name})` : ''}\n\n${String(o.details ?? '')}`,
    priority: type?.priority ?? IssuePriority.Medium,
    assignee: null,
    requestType: true,
    portalEmail: email,
    requestTypeId: type?._id,
    customerOrg: org?._id
  })
  const statusUrl = `${cfg.publicUrl.replace(/\/$/, '')}${cfg.base}/status?key=${encodeURIComponent(issue.identifier)}&email=${encodeURIComponent(email)}`
  if (wantsHtml) {
    return { status: 200, body: page(cfg, 'Request sent', `<div class="card"><h2>Request <span class="pill">${esc(issue.identifier)}</span> sent</h2><p class="m">Keep this link to follow progress and talk to us: <a href="${esc(statusUrl)}">${esc(statusUrl)}</a></p>${type?.requiresApproval === true ? '<p class="m">This kind of request is approved before work starts; you will see the outcome on the status page.</p>' : ''}<p><a class="btn" href="${cfg.base}">Back to help centre</a></p></div>`), html: true }
  }
  return { status: 200, body: { created: issue.identifier, status: statusUrl } }
}

async function requestFor (c: PlatformClient, key: string, email: string): Promise<Issue | undefined> {
  const issue = await findIssue(c, key)
  if (issue === undefined) return undefined
  return (issue.portalEmail ?? '').toLowerCase() === email.trim().toLowerCase() ? issue : undefined
}

async function statusLabel (c: PlatformClient, issue: Issue): Promise<{ name: string, done: boolean }> {
  const st = (await c.findAll(tracker.class.IssueStatus, { _id: issue.status }, { limit: 1 }))[0]
  return { name: st?.name ?? '', done: st !== undefined && (st.category === task.statusCategory.Won || st.category === task.statusCategory.Lost) }
}

export async function portalStatus (c: PlatformClient, cfg: PortalConfig, key: string, email: string, wantsHtml: boolean): Promise<Result> {
  const issue = await requestFor(c, key, email)
  if (issue === undefined) {
    return wantsHtml ? { status: 404, body: page(cfg, 'Not found', `<div class="card"><h2>No request with that key and email.</h2><p><a class="btn" href="${cfg.base}">Back</a></p></div>`), html: true } : { status: 404, body: { error: 'not found' } }
  }
  const { name: status, done } = await statusLabel(c, issue)
  const replies: CustomerReply[] = Array.from(await c.findAll(tracker.class.CustomerReply, { attachedTo: issue._id }, { sort: { at: 1 as any } }))
  const approval = issue.approval !== undefined ? issue.approval.state : undefined
  const info = { key: issue.identifier, title: issue.title, status, done, approval, rated: issue.csat !== undefined, updated: issue.modifiedOn, slaDue: issue.slaDue ?? null, replies: replies.map((r) => ({ at: r.at, fromCustomer: r.fromCustomer, author: r.author, text: r.text })) }
  if (!wantsHtml) return { status: 200, body: info }
  const hidden = `<input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="email" value="${esc(email)}">`
  const stars = [1, 2, 3, 4, 5].map((v) => `<form method="post" action="${cfg.base}/rate" style="display:inline">${hidden}<input type="hidden" name="score" value="${v}"><button title="${v} of 5">★</button></form>`).join('')
  const conv = replies.map((r) => `<div class="msg${r.fromCustomer ? ' me' : ''}"><small>${esc(r.fromCustomer ? 'You' : r.author || 'Support')} · ${new Date(r.at).toLocaleString()}</small>${esc(r.text)}</div>`).join('')
  return {
    status: 200,
    body: page(cfg, issue.identifier, `<div class="card"><h2><span class="pill">${esc(issue.identifier)}</span> ${esc(issue.title)}</h2><p class="m">Status: <b>${esc(status)}</b>${approval !== undefined ? ` · approval ${esc(approval)}` : ''} · updated ${new Date(issue.modifiedOn).toLocaleString()}${issue.slaDue != null && !done ? ` · response due ${new Date(issue.slaDue).toLocaleString()}` : ''}</p>
${done && issue.csat === undefined ? `<h2>How did we do?</h2><div class="stars">${stars}</div>` : issue.csat !== undefined ? `<p class="m">Thanks for rating this request ${'★'.repeat(issue.csat)}.</p>` : ''}</div>
<div class="card"><h2>Conversation</h2>${conv !== '' ? conv : '<p class="m">No messages yet. Anything the team writes here will show up for you.</p>'}
${done ? '' : `<form method="post" action="${cfg.base}/reply">${hidden}<label>Add a message</label><textarea name="text" rows="3" required placeholder="More details, a screenshot link, or a question"></textarea><p></p><button type="submit">Send</button></form>`}</div>
<p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p>`),
    html: true
  }
}

export async function portalReply (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const key = String(o.key ?? '')
  const email = String(o.email ?? '')
  const text = String(o.text ?? '').trim().slice(0, 5000)
  const issue = await requestFor(c, key, email)
  if (issue === undefined || text === '') return { status: 404, body: { error: 'not found' } }
  await c.addCollection(tracker.class.CustomerReply, issue.space, issue._id, tracker.class.Issue, 'customerReplies', { text, fromCustomer: true, author: email, at: Date.now() })
  await addComment(c, issue, `Customer wrote via the portal:\n${text}`)
  if (wantsHtml) {
    return { status: 303, body: '', html: true, ...({ location: `${cfg.base}/status?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}` } as any) }
  }
  return { status: 200, body: { ok: true } }
}

export async function portalOrg (c: PlatformClient, cfg: PortalConfig, email: string, wantsHtml: boolean): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  if (project === undefined || domain === '') return wantsHtml ? { status: 400, body: page(cfg, 'Organisation', `<div class="card"><h2>Enter your work email.</h2><p><a class="btn" href="${cfg.base}">Back</a></p></div>`), html: true } : { status: 400, body: { error: 'email required' } }
  const org = await orgFor(c, project, email)
  const issues = Array.from(await c.findAll(tracker.class.Issue, org !== undefined ? { space: project._id, customerOrg: org._id } : { space: project._id, portalEmail: { $like: `%@${domain}` } as any }, { limit: 200, sort: { modifiedOn: -1 as any } }))
  const statuses = await c.findAll(tracker.class.IssueStatus, {})
  const nameOf = new Map(Array.from(statuses).map((s) => [s._id, s.name]))
  if (!wantsHtml) return { status: 200, body: { organisation: org?.name ?? domain, requests: issues.map((i) => ({ key: i.identifier, title: i.title, status: nameOf.get(i.status) ?? '', updated: i.modifiedOn })) } }
  const rows = issues.map((i) => `<tr><td><a href="${cfg.base}/status?key=${encodeURIComponent(i.identifier)}&email=${encodeURIComponent(i.portalEmail ?? email)}">${esc(i.identifier)}</a></td><td>${esc(i.title)}</td><td>${esc(nameOf.get(i.status) ?? '')}</td><td>${esc(i.portalEmail ?? '')}</td><td>${new Date(i.modifiedOn).toLocaleDateString()}</td></tr>`).join('')
  return { status: 200, body: page(cfg, org?.name ?? domain, `<div class="card"><h2>${esc(org?.name ?? domain)} · ${issues.length} request${issues.length === 1 ? '' : 's'}</h2><p class="m">Everyone with an @${esc(domain)} address sees this list. Open a request with the email it was raised with.</p>${issues.length > 0 ? `<table><thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Raised by</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>` : ''}</div><p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p>`), html: true }
}

const PRIORITY_WORDS: Record<string, IssuePriority> = { highest: IssuePriority.Urgent, urgent: IssuePriority.Urgent, critical: IssuePriority.Urgent, high: IssuePriority.High, medium: IssuePriority.Medium, normal: IssuePriority.Medium, low: IssuePriority.Low, lowest: IssuePriority.Low }

function fieldHtml (f: FormField, value: string): string {
  const req = f.required === true ? ' required' : ''
  const name = esc(f.key)
  const label = `<label>${esc(f.label)}${f.required === true ? ' *' : ''}</label>`
  switch (f.type) {
    case 'textarea':
      return `${label}<textarea name="${name}" rows="5" placeholder="${esc(f.placeholder ?? '')}"${req}>${esc(value)}</textarea>`
    case 'select':
      return `${label}<select name="${name}"${req}><option value="">—</option>${(f.options ?? []).map((o) => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    case 'multiselect':
      return `${label}<div>${(f.options ?? []).map((o) => `<label style="display:inline-flex;gap:.3rem;margin-right:.8rem;text-transform:none;font-weight:400;color:inherit"><input type="checkbox" name="${name}" value="${esc(o)}" style="width:auto">${esc(o)}</label>`).join('')}</div>`
    case 'checkbox':
      return `<label style="display:inline-flex;gap:.4rem;align-items:center;text-transform:none;font-weight:400;color:inherit"><input type="checkbox" name="${name}" value="yes" style="width:auto">${esc(f.label)}</label>`
    case 'number':
      return `${label}<input type="number" name="${name}" value="${esc(value)}"${req}>`
    case 'date':
      return `${label}<input type="date" name="${name}" value="${esc(value)}"${req}>`
    case 'email':
      return `${label}<input type="email" name="${name}" value="${esc(value)}" placeholder="${esc(f.placeholder ?? 'you@company.com')}"${req}>`
    case 'url':
      return `${label}<input type="url" name="${name}" value="${esc(value)}" placeholder="https://…"${req}>`
    default:
      return `${label}<input name="${name}" value="${esc(value)}" placeholder="${esc(f.placeholder ?? '')}"${req}>`
  }
}

/** GET renders a public form; POST creates the issue from its answers. */
export async function portalForm (c: PlatformClient, cfg: PortalConfig, formSlug: string, method: string, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  const form: IssueForm | undefined = project !== undefined ? (await c.findAll(tracker.class.IssueForm, { space: project._id, slug: formSlug, public: true }, { limit: 1 }))[0] : undefined
  if (project === undefined || form === undefined) {
    return wantsHtml ? { status: 404, body: page(cfg, 'Not found', `<div class="card"><h2>No such form.</h2><p><a class="btn" href="${cfg.base}">Back</a></p></div>`), html: true } : { status: 404, body: { error: 'no such form' } }
  }
  const hasEmail = form.fields.some((f) => f.mapTo === 'portalEmail' || f.type === 'email')
  const render = (errors: string[], values: Record<string, string>): Result => ({
    status: errors.length > 0 ? 400 : 200,
    html: true,
    body: page(cfg, form.name, `<div class="card"><h2>${esc(form.name)}</h2>${form.description ? `<p class="m">${esc(form.description)}</p>` : ''}${errors.length > 0 ? `<p class="m" style="color:#dc2626">${errors.map(esc).join('<br>')}</p>` : ''}
<form method="post" action="${cfg.base}/form/${esc(form.slug)}">${form.fields.map((f) => fieldHtml(f, values[f.key] ?? '')).join('')}${hasEmail ? '' : `<label>Your email</label><input type="email" name="__email" value="${esc(values.__email ?? '')}" placeholder="you@company.com" required>`}<p></p><button type="submit">Send</button></form></div>`)
  })
  if (method !== 'POST') return wantsHtml ? render([], {}) : { status: 200, body: { name: form.name, description: form.description, fields: form.fields } }
  const val = (k: string): string => {
    const v = o[k]
    return Array.isArray(v) ? v.map(String).join(', ') : v == null ? '' : String(v)
  }
  const errors: string[] = []
  for (const f of form.fields) {
    const v = val(f.key)
    if (f.required === true && v.trim() === '' && !(f.type === 'checkbox' && v === 'yes')) errors.push(`${f.label} is required`)
    if (f.type === 'email' && v !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push(`${f.label} must be an email address`)
  }
  const emailField = form.fields.find((f) => f.mapTo === 'portalEmail') ?? form.fields.find((f) => f.type === 'email')
  const email = (emailField !== undefined ? val(emailField.key) : val('__email')).trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('A valid email is required')
  if (errors.length > 0) return wantsHtml ? render(errors, Object.fromEntries(form.fields.map((f) => [f.key, val(f.key)]).concat([['__email', val('__email')]]))) : { status: 400, body: { errors } }
  let title = ''
  const lines: string[] = []
  const extra: Record<string, unknown> = {}
  let priority: IssuePriority | undefined
  let assignee = null as Awaited<ReturnType<typeof personByEmail>>
  let dueDate: number | undefined
  const labels: string[] = []
  for (const f of form.fields) {
    const v = val(f.key).trim()
    if (v === '') continue
    switch (f.mapTo) {
      case 'title': title = v; break
      case 'description': lines.push(v); break
      case 'priority': priority = PRIORITY_WORDS[v.toLowerCase()]; break
      case 'assignee': assignee = v.includes('@') ? await personByEmail(c, v) : null; break
      case 'dueDate': dueDate = Number.isNaN(Date.parse(v)) ? undefined : Date.parse(v); break
      case 'labels': labels.push(...v.split(',').map((x) => x.trim()).filter((x) => x !== '')); break
      case 'estimation': extra.estimation = Number(v) || 0; break
      case 'severity': extra.severity = Math.min(4, Math.max(1, Number(v) || 3)); break
      case 'risk': extra.risk = ['low', 'medium', 'high'].includes(v.toLowerCase()) ? v.toLowerCase() : 'medium'; break
      case 'portalEmail': break
      default: lines.push(`${f.label}: ${v}`)
    }
  }
  if (title === '') title = `${form.name} · ${new Date().toLocaleDateString()}`
  const org = await orgFor(c, project, email)
  const issue = await createIssue(c, project, {
    title,
    description: `From: ${email}${org !== undefined ? ` (${org.name})` : ''} via form "${form.name}"\n\n${lines.join('\n\n')}`,
    priority,
    assignee,
    requestType: form.requestType != null,
    requestTypeId: form.requestType ?? undefined,
    portalEmail: email,
    customerOrg: org?._id,
    dueDate
  })
  if (Object.keys(extra).length > 0) await c.updateDoc(tracker.class.Issue, issue.space, issue._id, extra as any)
  for (const l of [...labels, `form: ${form.slug}`]) await addTag(c, issue, l)
  await c.updateDoc(tracker.class.IssueForm, form.space, form._id, { submissions: (form.submissions ?? 0) + 1 })
  const statusUrl = `${cfg.publicUrl.replace(/\/$/, '')}${cfg.base}/status?key=${encodeURIComponent(issue.identifier)}&email=${encodeURIComponent(email)}`
  if (wantsHtml) return { status: 200, html: true, body: page(cfg, 'Thank you', `<div class="card"><h2>${esc(form.successText ?? 'Thank you')} <span class="pill">${esc(issue.identifier)}</span></h2><p class="m">Follow progress and talk to us here: <a href="${esc(statusUrl)}">${esc(statusUrl)}</a></p><p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p></div>`) }
  return { status: 200, body: { created: issue.identifier, status: statusUrl } }
}

async function addTag (c: PlatformClient, issue: Issue, title: string): Promise<void> {
  const TAG_ELEMENT = 'tags:class:TagElement' as Ref<Class<Doc>>
  const TAG_REFERENCE = 'tags:class:TagReference' as Ref<Class<Doc>>
  let el = (await c.findAll(TAG_ELEMENT, { title, targetClass: tracker.class.Issue } as any, { limit: 1 }))[0] as any
  if (el === undefined) {
    const _id = await c.createDoc(TAG_ELEMENT, 'core:space:Workspace' as any, { title, description: '', targetClass: tracker.class.Issue, color: Math.floor(Math.random() * 20), category: 'tags:category:NoCategory' } as any)
    el = { _id, title, color: 0 }
  }
  await c.addCollection(TAG_REFERENCE, issue.space, issue._id, tracker.class.Issue, 'labels', { tag: el._id, title, color: el.color ?? 0 } as any)
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
  if (wantsHtml) return { status: 200, body: page(cfg, 'Thank you', `<div class="card"><h2>Thank you</h2><p class="m">Your rating for ${esc(key)} is recorded.</p><p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p></div>`), html: true }
  return { status: 200, body: { ok: true } }
}
