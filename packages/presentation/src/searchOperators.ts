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

// Inline search operators, Slack style: `type:issue in:"QA Campaign" from:alice
// after:2026-09-01 before:7d loader`. Pure parsing; resolving names to ids is
// the caller's job.

export interface ParsedSearch {
  /** The free text left after the operators are taken out. */
  text: string
  /** `type:` values, lower-cased. */
  types: string[]
  /** `in:` values (space, project or channel names). */
  spaces: string[]
  /** `from:` / `by:` / `assignee:` values (people). */
  persons: string[]
  /** `after:` as a UTC timestamp (start of that day). */
  after?: number
  /** `before:` as a UTC timestamp (end of that day). */
  before?: number
  /** Operators that were written but not understood. */
  unknown: string[]
}

export const SEARCH_OPERATORS = ['type', 'in', 'from', 'by', 'assignee', 'after', 'before', 'since', 'until'] as const

const DAY = 24 * 60 * 60 * 1000

/** A date word: 2026-09-01, 09/01/2026, today, yesterday, 7d, 2w, 3m. */
export function parseDateWord (word: string, now: number = Date.now()): number | undefined {
  const w = word.trim().toLowerCase()
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())
  if (w === 'today') return today
  if (w === 'yesterday') return today - DAY
  const rel = /^(\d+)([dwm])$/.exec(w)
  if (rel !== null) {
    const n = Number(rel[1])
    const unit = rel[2] === 'd' ? DAY : rel[2] === 'w' ? 7 * DAY : 30 * DAY
    return today - n * unit
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w)
  if (iso !== null) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(w)
  if (us !== null) return Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]))
  const t = Date.parse(word)
  return Number.isNaN(t) ? undefined : t
}

/** Split on spaces, keeping quoted strings (and `key:"quoted value"`) together. */
export function tokenize (raw: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | undefined
  for (const ch of raw) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (cur !== '') out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur !== '') out.push(cur)
  return out
}

export function parseSearchOperators (raw: string, now: number = Date.now()): ParsedSearch {
  const res: ParsedSearch = { text: '', types: [], spaces: [], persons: [], unknown: [] }
  const words: string[] = []
  for (const tok of tokenize(raw)) {
    const m = /^([a-zA-Z]+):(.*)$/.exec(tok)
    if (m === null || m[2] === '') {
      words.push(tok)
      continue
    }
    const key = m[1].toLowerCase()
    const value = m[2]
    switch (key) {
      case 'type':
        res.types.push(value.toLowerCase())
        break
      case 'in':
        res.spaces.push(value)
        break
      case 'from':
      case 'by':
      case 'assignee':
        res.persons.push(value)
        break
      case 'after':
      case 'since': {
        const t = parseDateWord(value, now)
        if (t !== undefined) res.after = t
        else res.unknown.push(tok)
        break
      }
      case 'before':
      case 'until': {
        const t = parseDateWord(value, now)
        if (t !== undefined) res.before = t + DAY - 1
        else res.unknown.push(tok)
        break
      }
      default:
        // not an operator we know, e.g. a URL or "re:" — keep it as text
        words.push(tok)
    }
  }
  res.text = words.join(' ').trim()
  return res
}

export function hasFilters (p: ParsedSearch): boolean {
  return p.types.length > 0 || p.spaces.length > 0 || p.persons.length > 0 || p.after !== undefined || p.before !== undefined
}

/** Type words people use, mapped to the class ids the search categories cover. */
export const TYPE_ALIASES: Record<string, string> = {
  issue: 'tracker:class:Issue',
  issues: 'tracker:class:Issue',
  task: 'tracker:class:Issue',
  bug: 'tracker:class:Issue',
  doc: 'document:class:Document',
  docs: 'document:class:Document',
  document: 'document:class:Document',
  page: 'document:class:Document',
  pages: 'document:class:Document',
  person: 'contact:class:Person',
  people: 'contact:class:Person',
  user: 'contact:class:Person',
  contact: 'contact:class:Person',
  org: 'contact:class:Organization',
  organization: 'contact:class:Organization',
  company: 'contact:class:Organization',
  file: 'drive:class:File',
  files: 'drive:class:File',
  folder: 'drive:class:Folder',
  meeting: 'love:class:MeetingMinutes',
  call: 'love:class:MeetingMinutes',
  card: 'card:class:Card',
  vacancy: 'recruit:class:Vacancy',
  job: 'recruit:class:Vacancy',
  candidate: 'recruit:class:Applicant',
  application: 'recruit:class:Applicant',
  pr: 'github:class:GithubPullRequest',
  product: 'products:class:Product'
}

export function classesForTypes (types: string[]): string[] {
  const out = new Set<string>()
  for (const t of types) {
    const c = TYPE_ALIASES[t]
    if (c !== undefined) out.add(c)
  }
  return [...out]
}
