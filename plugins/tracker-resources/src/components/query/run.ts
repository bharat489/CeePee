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

// Run a query-language string outside the Query screen (dashboard widgets,
// automation previews). Reference data is loaded once and cached for a
// minute; widgets on one dashboard share it.

import activity from '@hcengineering/activity'
import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
import { getCurrentAccount, SortingOrder, type PersonId, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import tags from '@hcengineering/tags'
import task from '@hcengineering/task'
import { type Issue } from '@hcengineering/tracker'

import tracker from '../../plugin'
import { compile, type Aux, type Change, type QueryContext } from './parse'

let cached: { at: number, ctx: QueryContext } | undefined

export async function loadQueryContext (): Promise<QueryContext> {
  if (cached !== undefined && Date.now() - cached.at < 60_000) return cached.ctx
  const client = getClient()
  const [statuses, projects, sprints, milestones, components, resolutions, persons, socials, taskTypes, tagElements] = await Promise.all([
    client.findAll(tracker.class.IssueStatus, {}),
    client.findAll(tracker.class.Project, {}),
    client.findAll(tracker.class.Sprint, {}),
    client.findAll(tracker.class.Milestone, {}),
    client.findAll(tracker.class.Component, {}),
    client.findAll(tracker.class.Resolution, {}),
    client.findAll(contact.class.Person, {}, { limit: 2000 }),
    client.findAll(contact.class.SocialIdentity, {}, { limit: 5000 }),
    client.findAll(task.class.TaskType, {}),
    client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue }, { limit: 1000 })
  ])
  const byPerson = new Map<Ref<Person>, PersonId[]>()
  for (const s of socials) byPerson.set(s.attachedTo, [...(byPerson.get(s.attachedTo) ?? []), s._id])
  const ctx: QueryContext = {
    me: getCurrentEmployee(),
    mySocialIds: getCurrentAccount().socialIds,
    statuses: statuses.map((s) => ({ _id: s._id, name: s.name, category: s.category })),
    projects: projects.map((p) => ({ _id: p._id, name: p.name, identifier: p.identifier })),
    sprints: sprints.map((s) => ({ _id: s._id, name: s.name, state: s.state })),
    milestones: milestones.map((m) => ({ _id: m._id, label: m.label })),
    people: persons.map((p) => ({ _id: p._id, name: formatName(p.name), socialIds: byPerson.get(p._id) ?? [] })),
    components: components.map((c) => ({ _id: c._id, label: c.label })),
    types: Array.from(new Map(taskTypes.map((t) => [t.name, t])).values()).map((t) => ({ _id: t._id, name: t.name })),
    resolutions: resolutions.map((r) => ({ _id: r._id, name: r.name })),
    labels: Array.from(new Set(tagElements.map((t) => t.title))).sort()
  }
  cached = { at: Date.now(), ctx }
  return ctx
}

export async function loadAux (issues: Issue[], needLabels: boolean, historyFields: Set<string>): Promise<Aux> {
  const client = getClient()
  const aux: Aux = { labels: new Map(), history: new Map() }
  const ids = issues.map((i) => i._id)
  if (ids.length === 0) return aux
  if (needLabels) {
    const refs = await client.findAll(tags.class.TagReference, { attachedTo: { $in: ids } }, { limit: 20000 })
    for (const r of refs) {
      const set = aux.labels.get(r.attachedTo as Ref<Issue>) ?? new Set<string>()
      set.add(r.title.toLowerCase())
      aux.labels.set(r.attachedTo as Ref<Issue>, set)
    }
  }
  if (historyFields.size > 0) {
    const msgs = await client.findAll(
      activity.class.DocUpdateMessage,
      { objectClass: tracker.class.Issue, objectId: { $in: ids }, action: 'update' },
      { limit: 50000, sort: { createdOn: SortingOrder.Ascending } }
    )
    for (const m of msgs) {
      const u = m.attributeUpdates
      if (u === undefined || !historyFields.has(u.attrKey)) continue
      const c: Change = { field: u.attrKey, at: m.createdOn ?? m.modifiedOn, value: u.set[0] ?? null, by: m.createdBy }
      const id = m.objectId as Ref<Issue>
      aux.history.set(id, [...(aux.history.get(id) ?? []), c])
    }
  }
  return aux
}

export async function runQuery (text: string, limit = 500): Promise<{ issues: Issue[], errors: string[] }> {
  const client = getClient()
  const ctx = await loadQueryContext()
  const plan = compile(text, ctx)
  if (plan.clauses === 0 || plan.errors.length > 0) return { issues: [], errors: plan.errors }
  const candidates = await client.findAll(tracker.class.Issue, plan.query, { limit: 5000, sort: { modifiedOn: SortingOrder.Descending } })
  const aux = await loadAux(candidates, plan.needsLabels, plan.historyFields)
  return { issues: candidates.filter((i) => plan.test(i, aux)).slice(0, limit), errors: [] }
}
