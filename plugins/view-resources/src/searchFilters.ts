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

// Turns the words people type after `in:` and `from:` into ids the search
// service filters on, and asks the local model for other ways to phrase a
// query when the plain search comes back thin.

import contact, { formatName } from '@hcengineering/contact'
import core, { type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
import {
  aiChat,
  aiLines,
  aiReachable,
  classesForTypes,
  getClient,
  type ParsedSearch,
  type SearchFilters
} from '@hcengineering/presentation'

const norm = (s: string): string => s.trim().toLowerCase()

/** Spaces (projects, channels, teamspaces, drives) whose name contains the word. */
export async function resolveSpaces (words: string[]): Promise<Array<Ref<Space>>> {
  if (words.length === 0) return []
  const client = getClient()
  const spaces = await client.findAll(core.class.Space, { archived: false }, { limit: 1000 })
  const out = new Set<Ref<Space>>()
  for (const w of words) {
    const n = norm(w)
    for (const s of spaces) {
      const name = norm(s.name)
      const identifier = norm(((s as any).identifier as string | undefined) ?? '')
      if (name === n || identifier === n || name.includes(n)) out.add(s._id)
    }
  }
  return [...out]
}

/** People whose name contains the word: their person ids and their social ids. */
export async function resolvePersons (words: string[]): Promise<string[]> {
  if (words.length === 0) return []
  const client = getClient()
  const people = await client.findAll(contact.mixin.Employee, {}, { limit: 2000 })
  const matched = people.filter((p) => {
    const name = norm(formatName(p.name))
    return words.some((w) => {
      const n = norm(w)
      return n === 'me' ? false : name === n || name.split(' ').some((part) => part === n) || name.includes(n)
    })
  })
  const ids = new Set<string>(matched.map((p) => p._id as string))
  if (matched.length > 0) {
    const social = await client.findAll(contact.class.SocialIdentity, { attachedTo: { $in: matched.map((p) => p._id) } } as any)
    for (const s of social) ids.add(s._id as string)
  }
  return [...ids]
}

/** All filters for one parsed search, ready for the search service. */
export async function buildSearchFilters (p: ParsedSearch): Promise<SearchFilters> {
  const [spaces, persons] = await Promise.all([resolveSpaces(p.spaces), resolvePersons(p.persons)])
  const classes = classesForTypes(p.types) as Array<Ref<Class<Doc>>>
  return {
    classes: classes.length > 0 ? classes : undefined,
    spaces: spaces.length > 0 ? spaces : p.spaces.length > 0 ? ['__none__' as Ref<Space>] : undefined,
    persons: persons.length > 0 ? persons : p.persons.length > 0 ? ['__none__'] : undefined,
    after: p.after,
    before: p.before
  }
}

/** Up to three other phrasings of a query, from the local model; empty when it is not there or slow. */
export async function expandQuery (text: string): Promise<string[]> {
  if (text.trim().length < 3) return []
  if (!(await aiReachable())) return []
  try {
    const reply = await aiChat(
      [
        { role: 'system', content: 'You rewrite search queries. Reply with up to three alternative short search phrases, one per line, no numbering, no explanations. Use synonyms and the words a colleague might have used.' },
        { role: 'user', content: text }
      ],
      { maxTokens: 60, temperature: 0.4, timeoutMs: 3000 }
    )
    return aiLines(reply)
      .map((l) => l.replace(/^["'`]+|["'`]+$/g, '').trim())
      .filter((l) => l !== '' && l.toLowerCase() !== text.toLowerCase())
      .slice(0, 3)
  } catch {
    return []
  }
}
