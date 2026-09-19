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

// Page permissions, the pure part. A page either inherits from its parent,
// is open to everyone who can see its space, or is restricted to named
// people and groups with view / comment / edit levels. Inheritance walks
// up the page tree; the first page that does not inherit decides. No
// platform imports, unit-tested directly; the middleware feeds it data.

export type PageAccessMode = 'inherit' | 'open' | 'restricted'
export type PageLevel = 'view' | 'comment' | 'edit'

/** The access settings stored on a page (the PageAccess mixin). */
export interface PageAccessData {
  mode: PageAccessMode
  viewers?: string[]
  commenters?: string[]
  editors?: string[]
  viewerGroups?: string[]
  commenterGroups?: string[]
  editorGroups?: string[]
}

export interface ResolvedAccess {
  mode: 'open' | 'restricted'
  /** the page whose settings apply (the page itself or an ancestor) */
  source?: string
  data?: PageAccessData
}

/**
 * Walk from the page up to the root: `chain[0]` is the page, then its parent,
 * and so on. The first entry whose mode is not 'inherit' wins; with none, the
 * page is open.
 */
export function effectiveAccess (chain: Array<{ _id: string, access?: PageAccessData }>): ResolvedAccess {
  for (const node of chain) {
    const a = node.access
    if (a === undefined || a.mode === 'inherit') continue
    if (a.mode === 'open') return { mode: 'open', source: node._id, data: a }
    return { mode: 'restricted', source: node._id, data: a }
  }
  return { mode: 'open' }
}

const RANK: Record<PageLevel, number> = { view: 1, comment: 2, edit: 3 }

/** The highest level `account` holds on restricted `data`, given the groups the account belongs to. */
export function levelOf (data: PageAccessData, account: string, groups: Set<string>): PageLevel | undefined {
  const inGroup = (ids: string[] | undefined): boolean => (ids ?? []).some((g) => groups.has(g))
  if ((data.editors ?? []).includes(account) || inGroup(data.editorGroups)) return 'edit'
  if ((data.commenters ?? []).includes(account) || inGroup(data.commenterGroups)) return 'comment'
  if ((data.viewers ?? []).includes(account) || inGroup(data.viewerGroups)) return 'view'
  return undefined
}

/** May `account` do `need` on a page with `access`? Open pages allow everything the space allows. */
export function allowed (access: ResolvedAccess, need: PageLevel, account: string, groups: Set<string>): boolean {
  if (access.mode === 'open' || access.data === undefined) return true
  const have = levelOf(access.data, account, groups)
  return have !== undefined && RANK[have] >= RANK[need]
}

/** Is the page hidden from `account` entirely? */
export function hidden (access: ResolvedAccess, account: string, groups: Set<string>): boolean {
  return !allowed(access, 'view', account, groups)
}
