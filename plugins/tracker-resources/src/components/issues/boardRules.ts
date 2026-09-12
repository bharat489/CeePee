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

// Board rules evaluated in the browser: card colours by query and quick filters.

import { type Ref } from '@hcengineering/core'
import { compile, type CardColorRule, type Issue, type Project } from '@hcengineering/tracker'

import { loadAux, loadQueryContext, runQuery } from '../query/run'

/** Map of issue → colour for the first matching card-colour rule. */
export async function colorMapFor (project: Project | undefined, issues: Issue[]): Promise<Map<Ref<Issue>, string>> {
  const out = new Map<Ref<Issue>, string>()
  const rules: CardColorRule[] = project?.cardColors ?? []
  if (rules.length === 0 || issues.length === 0) return out
  const ctx = await loadQueryContext()
  const plans = rules.map((r) => ({ color: r.color, plan: compile(r.query, ctx) })).filter((p) => p.plan.errors.length === 0 && p.plan.clauses > 0)
  const needLabels = plans.some((p) => p.plan.needsLabels)
  const history = new Set<string>()
  for (const p of plans) for (const f of p.plan.historyFields) history.add(f)
  const aux = await loadAux(issues, needLabels, history)
  for (const i of issues) {
    const hit = plans.find((p) => p.plan.test(i, aux))
    if (hit !== undefined) out.set(i._id, hit.color)
  }
  return out
}

/** Issue ids matching every active quick filter (intersection), scoped to the project. */
export async function quickFilterIds (project: Project | undefined, active: string[]): Promise<Set<Ref<Issue>> | undefined> {
  if (project === undefined || active.length === 0) return undefined
  let acc: Set<Ref<Issue>> | undefined
  for (const name of active) {
    const f = (project.quickFilters ?? []).find((q) => q.name === name)
    if (f === undefined) continue
    const r = await runQuery(`(${f.query}) AND project = ${project.identifier}`, 5000)
    const ids = new Set(r.issues.map((i) => i._id))
    acc = acc === undefined ? ids : new Set(Array.from(acc).filter((x) => ids.has(x)))
  }
  return acc ?? new Set()
}
