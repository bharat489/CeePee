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

// Public incident status page, /status/<portal slug>. Components are the
// project's assets of kind Service; their state comes from open incidents
// linked to them; timeline entries marked public are the updates; changes
// with a window in the future are scheduled maintenance.

import { type PlatformClient } from '@hcengineering/api-client'
import task from '@hcengineering/task'
import tracker, { type Issue, type Project, type SupportAsset } from '@hcengineering/tracker'

import { page, type PortalConfig, type Result } from './portal'
import { findProject } from './platform'

const DAY = 86_400_000
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
const SEV: Record<number, { label: string, cls: string }> = { 1: { label: 'Major outage', cls: 'major' }, 2: { label: 'Partial outage', cls: 'partial' }, 3: { label: 'Degraded performance', cls: 'degraded' }, 4: { label: 'Under investigation', cls: 'minor' } }

async function projectForSlug (c: PlatformClient, env: PortalConfig, slug: string): Promise<Project | undefined> {
  if (slug === '') return env.project !== '' ? await findProject(c, env.project) : undefined
  const projects = Array.from(await c.findAll(tracker.class.Project, { archived: false }))
  return projects.find((p) => p.portal?.slug === slug && (p.statusPage?.enabled === true || p.portal?.enabled === true))
}

export async function statusPage (c: PlatformClient, env: PortalConfig, slug: string, json: boolean): Promise<Result> {
  const project = await projectForSlug(c, env, slug)
  if (project === undefined || project.statusPage?.enabled !== true) {
    return json ? { status: 404, body: { error: 'no status page' } } : { status: 404, body: page({ ...env, base: slug !== '' ? `/portal/${slug}` : '/portal' }, 'Status', '<div class="card"><h2>No status page is published here.</h2></div>'), html: true }
  }
  const cfg: PortalConfig = { ...env, name: project.statusPage.name ?? project.portal?.name ?? project.name, color: project.portal?.color ?? env.color, logoUrl: project.portal?.logoUrl ?? '', project: project.identifier, base: slug !== '' ? `/portal/${slug}` : '/portal' }
  const statuses = Array.from(await c.findAll(tracker.class.IssueStatus, {}))
  const done = new Set(statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id))
  const assets: SupportAsset[] = Array.from(await c.findAll(tracker.class.Asset, { space: project._id }))
  const components = (assets.some((a) => a.kind === 'Service') ? assets.filter((a) => a.kind === 'Service') : assets).filter((a) => a.status !== 'retired')
  const now = Date.now()
  const incidents: Issue[] = Array.from(await c.findAll(tracker.class.Issue, { space: project._id, severity: { $exists: true } } as any, { limit: 500, sort: { modifiedOn: -1 as any } })).filter((i) => i.archived !== true && i.severity !== undefined)
  const active = incidents.filter((i) => !done.has(i.status))
  const resolved = incidents.filter((i) => done.has(i.status) && i.modifiedOn > now - 7 * DAY)
  const maintenance: Issue[] = Array.from(await c.findAll(tracker.class.Issue, { space: project._id, changeStart: { $ne: null } } as any, { limit: 200 })).filter((i) => i.archived !== true && !done.has(i.status) && i.changeStart != null && (i.changeEnd ?? i.changeStart) > now - DAY)
  const stateOf = (a: SupportAsset): { label: string, cls: string } => {
    const hits = active.filter((i) => (i.assets ?? []).includes(a._id))
    if (hits.length === 0) return { label: 'Operational', cls: 'ok' }
    const worst = Math.min(...hits.map((i) => i.severity ?? 4))
    return SEV[worst] ?? SEV[4]
  }
  const overall = active.length === 0 ? { label: 'All systems operational', cls: 'ok' } : SEV[Math.min(...active.map((i) => i.severity ?? 4))] ?? SEV[4]
  const updates = (i: Issue): Array<{ at: number, text: string }> => [
    ...((i.timeline ?? []).filter((t) => t.public === true).map((t) => ({ at: t.at, text: t.text }))),
    { at: i.createdOn ?? i.modifiedOn, text: 'Investigating' }
  ].sort((a, b) => b.at - a.at)
  const data = {
    name: cfg.name,
    updatedAt: now,
    overall: overall.label,
    note: project.statusPage.note ?? '',
    components: components.map((a) => ({ name: a.name, state: stateOf(a).label })),
    incidents: active.map((i) => ({ key: i.identifier, title: i.title, severity: i.severity, since: i.createdOn ?? i.modifiedOn, components: components.filter((a) => (i.assets ?? []).includes(a._id)).map((a) => a.name), updates: updates(i) })),
    resolved: resolved.map((i) => ({ key: i.identifier, title: i.title, severity: i.severity, resolvedAt: i.modifiedOn, updates: updates(i) })),
    maintenance: maintenance.map((i) => ({ key: i.identifier, title: i.title, start: i.changeStart, end: i.changeEnd, components: components.filter((a) => (i.assets ?? []).includes(a._id)).map((a) => a.name) }))
  }
  if (json) return { status: 200, body: data }
  const fmt = (t: number | null | undefined): string => (t == null ? '' : new Date(t).toLocaleString())
  const incHtml = (i: (typeof data.incidents)[number]): string => `<div class="inc"><h3><span class="pill">${esc(i.key)}</span> ${esc(i.title)} <span class="sev sev-${SEV[i.severity ?? 4]?.cls ?? 'minor'}">${esc(SEV[i.severity ?? 4]?.label ?? '')}</span></h3>${i.components.length > 0 ? `<p class="m">Affects: ${i.components.map(esc).join(', ')}</p>` : ''}<ul class="upd">${i.updates.map((u) => `<li><small>${esc(fmt(u.at))}</small>${esc(u.text)}</li>`).join('')}</ul></div>`
  const body = `
<style>.overall{padding:1rem 1.2rem;border-radius:.9rem;color:#fff;font-weight:700;font-size:1.1rem;background:#16a34a}.overall.major{background:#dc2626}.overall.partial{background:#ea580c}.overall.degraded{background:#d97706}.overall.minor{background:#2563eb}
.comp{display:flex;justify-content:space-between;padding:.6rem 0;border-top:1px solid var(--line)}.state{font-weight:600}.state.ok{color:#16a34a}.state.major{color:#dc2626}.state.partial{color:#ea580c}.state.degraded{color:#d97706}.state.minor{color:#2563eb}
.inc{padding:.8rem 0;border-top:1px solid var(--line)}.inc h3{margin:0 0 .3rem;font-size:1rem}.sev{font-size:.75rem;padding:.1rem .5rem;border-radius:999px;color:#fff;background:#2563eb;margin-left:.4rem}.sev-major{background:#dc2626}.sev-partial{background:#ea580c}.sev-degraded{background:#d97706}
ul.upd{list-style:none;margin:.3rem 0 0;padding:0}ul.upd li{padding:.2rem 0}ul.upd small{display:inline-block;width:11rem;color:var(--mut)}</style>
<div class="overall ${overall.cls}">${esc(overall.label)}</div>
${project.statusPage.note ? `<div class="card"><p style="margin:0">${esc(project.statusPage.note)}</p></div>` : ''}
<div class="card"><h2>Components</h2>${components.length === 0 ? '<p class="m">No components published yet (assets of kind Service).</p>' : components.map((a) => { const s = stateOf(a); return `<div class="comp"><span>${esc(a.name)}</span><span class="state ${s.cls}">${esc(s.label)}</span></div>` }).join('')}</div>
<div class="card"><h2>Active incidents</h2>${data.incidents.length === 0 ? '<p class="m">None.</p>' : data.incidents.map(incHtml).join('')}</div>
${data.maintenance.length > 0 ? `<div class="card"><h2>Scheduled maintenance</h2>${data.maintenance.map((m) => `<div class="inc"><h3><span class="pill">${esc(m.key)}</span> ${esc(m.title)}</h3><p class="m">${esc(fmt(m.start))} → ${esc(fmt(m.end))}${m.components.length > 0 ? ` · ${m.components.map(esc).join(', ')}` : ''}</p></div>`).join('')}</div>` : ''}
<div class="card"><h2>Resolved in the last 7 days</h2>${data.resolved.length === 0 ? '<p class="m">None.</p>' : data.resolved.map((i) => incHtml({ ...i, since: 0, components: [] })).join('')}</div>
<p class="m">Updated ${esc(fmt(now))} · <a href="${cfg.base === '/portal' ? '/status' : `/status/${slug}`}.json">JSON</a></p>`
  return { status: 200, body: page(cfg, 'Status', body), html: true }
}
