//
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
//

// Runs a query-language expression against any client that can findAll:
// the browser client, the Node api-client in the integrations service, or a
// server trigger control. Class ids are spelled as strings so this module
// has no runtime import from the plugin index.

import { type Person } from '@hcengineering/contact'
import { SortingOrder, type Class, type Doc, type DocumentQuery, type FindOptions, type PersonId, type Ref } from '@hcengineering/core'

import type { Issue } from '../index'
import { compile, type Aux, type Change, type QueryContext } from './parse'
import { expandFunctions } from './functions'

/** The subset of a client the runner needs. */
export interface QueryClient {
  findAll: <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>) => Promise<T[] | { [n: number]: T, length: number }>
}

export interface QueryUser {
  me: Ref<Person> | undefined
  socialIds: PersonId[]
  /** account uuid, for watchedIssues() */
  uuid?: string
}

const C = {
  Issue: 'tracker:class:Issue' as Ref<Class<Issue>>,
  IssueStatus: 'tracker:class:IssueStatus' as Ref<Class<any>>,
  Project: 'tracker:class:Project' as Ref<Class<any>>,
  Sprint: 'tracker:class:Sprint' as Ref<Class<any>>,
  Milestone: 'tracker:class:Milestone' as Ref<Class<any>>,
  Component: 'tracker:class:Component' as Ref<Class<any>>,
  Resolution: 'tracker:class:Resolution' as Ref<Class<any>>,
  Person: 'contact:class:Person' as Ref<Class<any>>,
  SocialIdentity: 'contact:class:SocialIdentity' as Ref<Class<any>>,
  TaskType: 'task:class:TaskType' as Ref<Class<any>>,
  TagElement: 'tags:class:TagElement' as Ref<Class<any>>,
  TagReference: 'tags:class:TagReference' as Ref<Class<any>>,
  DocUpdateMessage: 'activity:class:DocUpdateMessage' as Ref<Class<any>>,
  Department: 'hr:class:Department' as Ref<Class<any>>
}

const arr = <T>(r: T[] | { [n: number]: T, length: number }): T[] => Array.from(r as ArrayLike<T>)

function personName (name: string): string {
  // Huly stores "Last,First"; show "First Last".
  const [last, first] = String(name ?? '').split(',')
  return [first, last].filter((x) => x !== undefined && x.trim() !== '').join(' ').trim()
}

export async function buildQueryContext (client: QueryClient, user: QueryUser): Promise<QueryContext> {
  const [statuses, projects, sprints, milestones, components, resolutions, persons, socials, taskTypes, tagElements, departments] = await Promise.all([
    client.findAll(C.IssueStatus, {}),
    client.findAll(C.Project, {}),
    client.findAll(C.Sprint, {}),
    client.findAll(C.Milestone, {}),
    client.findAll(C.Component, {}),
    client.findAll(C.Resolution, {}),
    client.findAll(C.Person, {}, { limit: 2000 }),
    client.findAll(C.SocialIdentity, {}, { limit: 5000 }),
    client.findAll(C.TaskType, {}),
    client.findAll(C.TagElement, { targetClass: C.Issue }, { limit: 1000 }),
    client.findAll(C.Department, {}, { limit: 500 }).catch(() => [] as any[])
  ])
  const byPerson = new Map<Ref<Person>, PersonId[]>()
  for (const s of arr(socials)) byPerson.set(s.attachedTo, [...(byPerson.get(s.attachedTo) ?? []), s._id])
  return {
    me: user.me,
    mySocialIds: user.socialIds,
    statuses: arr(statuses).map((s) => ({ _id: s._id, name: s.name, category: s.category })),
    projects: arr(projects).map((p) => ({ _id: p._id, name: p.name, identifier: p.identifier })),
    sprints: arr(sprints).map((s) => ({ _id: s._id, name: s.name, state: s.state })),
    milestones: arr(milestones).map((m) => ({ _id: m._id, label: m.label, status: m.status })),
    people: arr(persons).map((p) => ({ _id: p._id, name: personName(p.name), socialIds: byPerson.get(p._id) ?? [] })),
    components: arr(components).map((c) => ({ _id: c._id, label: c.label, lead: c.lead })),
    types: Array.from(new Map(arr(taskTypes).map((t) => [t.name, t])).values()).map((t) => ({ _id: t._id, name: t.name })),
    resolutions: arr(resolutions).map((r) => ({ _id: r._id, name: r.name })),
    labels: Array.from(new Set(arr(tagElements).map((t) => String(t.title)))).sort(),
    departments: arr(departments as any[]).map((d) => ({ name: String(d.name ?? ''), members: (d.members ?? []) as Ref<Person>[] }))
  }
}

export async function loadAuxWith (client: QueryClient, issues: Issue[], needLabels: boolean, historyFields: Set<string>): Promise<Aux> {
  const aux: Aux = { labels: new Map(), history: new Map() }
  const ids = issues.map((i) => i._id)
  if (ids.length === 0) return aux
  if (needLabels) {
    const refs = arr(await client.findAll(C.TagReference, { attachedTo: { $in: ids } }, { limit: 20000 }))
    for (const r of refs) {
      const set = aux.labels.get(r.attachedTo as Ref<Issue>) ?? new Set<string>()
      set.add(String(r.title).toLowerCase())
      aux.labels.set(r.attachedTo as Ref<Issue>, set)
    }
  }
  if (historyFields.size > 0) {
    const msgs = arr(await client.findAll(C.DocUpdateMessage, { objectClass: C.Issue, objectId: { $in: ids }, action: 'update' }, { limit: 50000, sort: { createdOn: SortingOrder.Ascending } }))
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

export interface QueryResult {
  issues: Issue[]
  errors: string[]
}

/** Compile and run `text`; archived issues are excluded unless the query names them. */
export async function runQueryWith (client: QueryClient, ctx: QueryContext, text: string, limit = 500, user?: QueryUser): Promise<QueryResult> {
  const expanded = await expandFunctions(text, ctx, client, user ?? { me: ctx.me, socialIds: ctx.mySocialIds })
  if (expanded.errors.length > 0) return { issues: [], errors: expanded.errors }
  text = expanded.text
  const plan = compile(text, ctx)
  if (plan.clauses === 0 || plan.errors.length > 0) return { issues: [], errors: plan.errors }
  const q: DocumentQuery<Issue> = { ...plan.query }
  if (!/\barchived\b/i.test(text)) (q as any).archived = { $ne: true }
  const candidates = arr(await client.findAll(C.Issue, q, { limit: 5000, sort: { modifiedOn: SortingOrder.Descending } }))
  const aux = await loadAuxWith(client, candidates, plan.needsLabels, plan.historyFields)
  let issues = candidates.filter((i) => plan.test(i, aux))
  if (plan.order !== undefined) {
    const f = plan.order.field as keyof Issue
    const dir = plan.order.desc ? -1 : 1
    issues = issues.sort((a, b) => {
      const x = a[f] as any
      const y = b[f] as any
      return (x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0) * dir
    })
  }
  return { issues: issues.slice(0, limit), errors: [] }
}
