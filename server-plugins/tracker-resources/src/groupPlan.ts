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

// User groups drive space membership: a group applied to a project, teamspace
// or channel keeps its members in that space. This is the pure arithmetic the
// server trigger runs: given what the group wants now, what it last applied,
// who is in each space today and who other groups still provide, decide whom
// to add and whom to remove. No platform imports, unit-tested directly.

export interface GroupSyncInput<S extends string, A extends string> {
  /** spaces the group is applied to now */
  spaces: S[]
  /** members of the group now */
  members: A[]
  /** what this group applied last time: space → members it put there */
  applied: Record<string, A[]>
  /** current members of every space involved */
  current: Map<S, A[]>
  /** members other groups still provide per space; these are never removed */
  providedByOthers: Map<S, Set<A>>
}

export interface SpaceSync<S extends string, A extends string> {
  space: S
  add: A[]
  remove: A[]
}

export interface GroupSyncPlan<S extends string, A extends string> {
  changes: Array<SpaceSync<S, A>>
  /** the new `applied` record to store on the group */
  applied: Record<string, A[]>
}

export function planGroupSync<S extends string, A extends string> (input: GroupSyncInput<S, A>): GroupSyncPlan<S, A> {
  const wanted = new Set(input.spaces)
  const involved = new Set<S>([...input.spaces, ...(Object.keys(input.applied) as S[])])
  const changes: Array<SpaceSync<S, A>> = []
  const applied: Record<string, A[]> = {}
  for (const space of involved) {
    const desired = wanted.has(space) ? Array.from(new Set(input.members)) : []
    const previous = input.applied[space] ?? []
    const now = new Set(input.current.get(space) ?? [])
    const others = input.providedByOthers.get(space) ?? new Set<A>()
    const add = desired.filter((m) => !now.has(m))
    const remove = previous.filter((m) => !desired.includes(m) && now.has(m) && !others.has(m))
    if (add.length > 0 || remove.length > 0) changes.push({ space, add, remove })
    if (desired.length > 0) applied[space] = desired
  }
  return { changes, applied }
}

/** Are two applied records the same set of spaces with the same members? */
export function sameApplied<A extends string> (a: Record<string, A[]>, b: Record<string, A[]>): boolean {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
  return ka.every((k) => {
    const x = [...a[k]].sort()
    const y = [...b[k]].sort()
    return x.length === y.length && x.every((v, i) => v === y[i])
  })
}
