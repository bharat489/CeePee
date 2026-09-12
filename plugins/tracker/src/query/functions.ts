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

// Query functions, expanded before parsing. Each call becomes a literal the
// parser already understands: a list of names or keys, or an absolute date.
//
//   assignee in membersOf("Platform")        people of an HR department
//   key in linkedIssues(CEE-12)              issues related to or blocking/blocked by CEE-12
//   key in subtasksOf(CEE-12)                its sub-issues
//   key in issueHistory()                    issues I changed recently
//   key in watchedIssues()                   issues I watch
//   key in votedIssues()                     issues I voted for
//   sprint in openSprints() | closedSprints() | futureSprints()
//   milestone in releasedVersions() | unreleasedVersions()
//   component in componentsLeadByUser()
//   assignee = currentUser()
//   updated >= startOfWeek()  startOfDay(-3d)  endOfMonth()  startOfYear()  now()

import { type Class, type Doc, type Ref } from '@hcengineering/core'

import type { Issue } from '../index'
import type { QueryContext } from './parse'
import type { QueryClient, QueryUser } from './run'

const DAY = 86_400_000
const C = {
  Issue: 'tracker:class:Issue' as Ref<Class<Issue>>,
  Collaborator: 'core:class:Collaborator' as Ref<Class<any>>,
  DocUpdateMessage: 'activity:class:DocUpdateMessage' as Ref<Class<any>>
}

export const FUNCTIONS = [
  'membersOf', 'linkedIssues', 'subtasksOf', 'issueHistory', 'watchedIssues', 'votedIssues', 'openSprints', 'closedSprints', 'futureSprints',
  'releasedVersions', 'unreleasedVersions', 'componentsLeadByUser', 'currentUser', 'now', 'startOfDay', 'endOfDay', 'startOfWeek', 'endOfWeek',
  'startOfMonth', 'endOfMonth', 'startOfYear', 'endOfYear'
]

const arr = <T>(r: T[] | { [n: number]: T, length: number }): T[] => Array.from(r as ArrayLike<T>)
const quote = (s: string): string => `"${String(s).replace(/"/g, '')}"`
const list = (items: string[]): string => `(${items.map(quote).join(', ')})`
const ymd = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function offsetMs (arg: string): number {
  const m = /^([+-]?\d+)\s*([hdwmy])$/i.exec(arg.trim())
  if (m === null) return 0
  const n = parseInt(m[1], 10)
  const unit = { h: 3_600_000, d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY }[m[2].toLowerCase()] ?? DAY
  return n * unit
}

function dateFn (name: string, arg: string): string {
  const now = Date.now() + offsetMs(arg)
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const sod = d.getTime()
  switch (name) {
    case 'now':
      return arg.trim() === '' ? 'now' : ymd(now)
    case 'startOfDay':
      return ymd(sod)
    case 'endOfDay':
      return ymd(sod)
    case 'startOfWeek': {
      const dow = (d.getDay() + 6) % 7
      return ymd(sod - dow * DAY)
    }
    case 'endOfWeek': {
      const dow = (d.getDay() + 6) % 7
      return ymd(sod + (6 - dow) * DAY)
    }
    case 'startOfMonth':
      return ymd(new Date(d.getFullYear(), d.getMonth(), 1).getTime())
    case 'endOfMonth':
      return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime())
    case 'startOfYear':
      return ymd(new Date(d.getFullYear(), 0, 1).getTime())
    case 'endOfYear':
      return ymd(new Date(d.getFullYear(), 11, 31).getTime())
  }
  return ymd(sod)
}

function splitArgs (raw: string): string[] {
  return raw.split(',').map((a) => a.trim().replace(/^["']|["']$/g, '')).filter((a) => a !== '')
}

/** Replace every function call in `text` with a literal the parser understands. */
export async function expandFunctions (text: string, ctx: QueryContext, client: QueryClient, user: QueryUser): Promise<{ text: string, errors: string[] }> {
  const errors: string[] = []
  if (!/[A-Za-z]\w*\s*\(/.test(text)) return { text, errors }
  const re = /\b([A-Za-z]\w*)\s*\(([^()]*)\)/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const [whole, name, rawArgs] = m
    const canon = FUNCTIONS.find((f) => f.toLowerCase() === name.toLowerCase())
    out += text.slice(last, m.index)
    last = m.index + whole.length
    if (canon === undefined) {
      errors.push(`unknown function ${name}()`)
      out += whole
      continue
    }
    const args = splitArgs(rawArgs)
    try {
      out += await resolve(canon, args, ctx, client, user, errors)
    } catch (e: any) {
      errors.push(`${canon}(): ${String(e?.message ?? e)}`)
      out += whole
    }
  }
  out += text.slice(last)
  return { text: out, errors }
}

async function keysOf (client: QueryClient, ids: Array<Ref<Issue>>): Promise<string[]> {
  if (ids.length === 0) return []
  const issues = arr(await client.findAll(C.Issue, { _id: { $in: ids } }, { limit: 2000 }))
  return issues.map((i) => i.identifier)
}

async function byKey (client: QueryClient, key: string): Promise<Issue | undefined> {
  return arr(await client.findAll(C.Issue, { identifier: key.toUpperCase() }, { limit: 1 }))[0]
}

async function resolve (name: string, args: string[], ctx: QueryContext, client: QueryClient, user: QueryUser, errors: string[]): Promise<string> {
  const empty = (what: string): string => {
    errors.push(`${name}(): ${what}`)
    return '("__none__")'
  }
  switch (name) {
    case 'currentUser':
      return 'me'
    case 'now':
    case 'startOfDay':
    case 'endOfDay':
    case 'startOfWeek':
    case 'endOfWeek':
    case 'startOfMonth':
    case 'endOfMonth':
    case 'startOfYear':
    case 'endOfYear':
      return dateFn(name, args[0] ?? '')
    case 'membersOf': {
      const dept = (args[0] ?? '').toLowerCase()
      const hits = (ctx.departments ?? []).filter((d) => d.name.toLowerCase() === dept || (dept !== '' && d.name.toLowerCase().includes(dept)))
      const people = new Set<string>()
      for (const d of hits) for (const id of d.members) {
        const p = ctx.people.find((x) => x._id === id)
        if (p !== undefined) people.add(p.name)
      }
      return people.size === 0 ? empty(hits.length === 0 ? `no department "${args[0] ?? ''}"` : 'department has no members') : list(Array.from(people))
    }
    case 'linkedIssues': {
      const target = await byKey(client, args[0] ?? '')
      if (target === undefined) return empty(`no issue ${args[0] ?? ''}`)
      const mode = (args[1] ?? 'all').toLowerCase()
      const ids = new Set<Ref<Issue>>()
      if (mode === 'all' || mode === 'relates') for (const r of target.relations ?? []) ids.add(r._id as Ref<Issue>)
      if (mode === 'all' || mode === 'blockedby' || mode === 'blocked-by') for (const b of target.blockedBy ?? []) ids.add(b._id as Ref<Issue>)
      if (mode === 'all' || mode === 'blocks') {
        const blocking = arr(await client.findAll(C.Issue, { space: target.space, blockedBy: { $exists: true } } as any, { limit: 2000 }))
        for (const i of blocking) if ((i.blockedBy ?? []).some((b) => b._id === target._id)) ids.add(i._id)
      }
      const keys = await keysOf(client, Array.from(ids))
      return keys.length === 0 ? empty('nothing linked') : list(keys)
    }
    case 'subtasksOf': {
      const target = await byKey(client, args[0] ?? '')
      if (target === undefined) return empty(`no issue ${args[0] ?? ''}`)
      const kids = arr(await client.findAll(C.Issue, { attachedTo: target._id }, { limit: 2000 }))
      return kids.length === 0 ? empty('no sub-issues') : list(kids.map((i) => i.identifier))
    }
    case 'issueHistory': {
      if (user.socialIds.length === 0) return empty('no current user')
      const msgs = arr(await client.findAll(C.DocUpdateMessage, { objectClass: C.Issue, createdBy: { $in: user.socialIds } } as any, { limit: 500, sort: { createdOn: -1 as any } }))
      const ids = Array.from(new Set(msgs.map((x) => x.objectId as Ref<Issue>)))
      const keys = await keysOf(client, ids)
      return keys.length === 0 ? empty('no history') : list(keys)
    }
    case 'watchedIssues': {
      if (user.uuid === undefined) return empty('no current user')
      const collabs = arr(await client.findAll(C.Collaborator, { collaborator: user.uuid, attachedToClass: C.Issue } as any, { limit: 2000 }))
      const keys = await keysOf(client, Array.from(new Set(collabs.map((c) => c.attachedTo as Ref<Issue>))))
      return keys.length === 0 ? empty('you watch nothing') : list(keys)
    }
    case 'votedIssues': {
      if (user.me === undefined) return empty('no current user')
      const voted = arr(await client.findAll(C.Issue, { votes: user.me } as any, { limit: 2000 }))
      return voted.length === 0 ? empty('no votes') : list(voted.map((i) => i.identifier))
    }
    case 'openSprints': {
      const s = ctx.sprints.filter((x) => x.state === 'active').map((x) => x.name)
      return s.length === 0 ? empty('no active sprint') : list(s)
    }
    case 'closedSprints': {
      const s = ctx.sprints.filter((x) => x.state === 'completed').map((x) => x.name)
      return s.length === 0 ? empty('no completed sprints') : list(s)
    }
    case 'futureSprints': {
      const s = ctx.sprints.filter((x) => x.state === 'planned').map((x) => x.name)
      return s.length === 0 ? empty('no planned sprints') : list(s)
    }
    case 'releasedVersions': {
      const v = ctx.milestones.filter((x) => x.status === 2).map((x) => x.label)
      return v.length === 0 ? empty('no released versions') : list(v)
    }
    case 'unreleasedVersions': {
      const v = ctx.milestones.filter((x) => x.status !== 2 && x.status !== 3).map((x) => x.label)
      return v.length === 0 ? empty('no unreleased versions') : list(v)
    }
    case 'componentsLeadByUser': {
      const c = ctx.components.filter((x) => x.lead !== undefined && x.lead !== null && x.lead === user.me).map((x) => x.label)
      return c.length === 0 ? empty('you lead no component') : list(c)
    }
  }
  return empty('unsupported')
}
