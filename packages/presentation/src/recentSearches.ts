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

// Recent searches, kept in this browser only. Remembered when a result is
// opened, not on every keystroke, so the list holds searches that worked.

export interface RecentSearch {
  raw: string
  at: number
}

const KEY = 'search.recent'
const MAX = 10

export function getRecentSearches (): RecentSearch[] {
  try {
    const v = localStorage.getItem(KEY)
    if (v === null) return []
    const list = JSON.parse(v)
    return Array.isArray(list) ? list.filter((r) => typeof r?.raw === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberSearch (raw: string): RecentSearch[] {
  const text = raw.trim()
  if (text === '' || text.startsWith('/')) return getRecentSearches()
  const list = [{ raw: text, at: Date.now() }, ...getRecentSearches().filter((r) => r.raw !== text)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
  return list
}

export function forgetSearch (raw: string): RecentSearch[] {
  const list = getRecentSearches().filter((r) => r.raw !== raw)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
  return list
}

export function clearRecentSearches (): void {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
