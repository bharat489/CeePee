//
// Copyright © 2023 Hardcore Engineering Inc.
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

import type { Class, Ref, Doc, SearchResultDoc, Space, TxOperations } from '@hcengineering/core'
import { type ObjectSearchCategory } from './types'
import plugin from './plugin'
import { getClient } from './utils'

/** Narrowing from inline operators; resolved to ids by the caller. */
export interface SearchFilters {
  classes?: Array<Ref<Class<Doc>>>
  spaces?: Array<Ref<Space>>
  persons?: string[]
  after?: number
  before?: number
}

interface SearchSection {
  category: ObjectSearchCategory
  items: SearchResultDoc[]
}

/**
 * @public
 */
export interface SearchItem {
  num: number
  item: SearchResultDoc
  category: ObjectSearchCategory
}

function packSearchResultsForListView (sections: SearchSection[]): SearchItem[] {
  let results: SearchItem[] = []
  for (const section of sections) {
    const category = section.category
    const items = section.items

    if (category.classToSearch !== undefined) {
      results = results.concat(
        items.map((item, num) => {
          return { num, category, item }
        })
      )
    }
  }
  return results
}

async function searchCategory (
  client: TxOperations,
  category: ObjectSearchCategory,
  query: string,
  limit?: number,
  filters?: SearchFilters
): Promise<SearchSection | undefined> {
  if (category.classToSearch === undefined) return
  let classes =
    category.includeChilds === true
      ? client.getHierarchy().getDescendants(category.classToSearch)
      : [category.classToSearch]
  if (filters?.classes !== undefined) {
    // a type filter: only categories that cover one of the asked classes take part
    const wanted = new Set<string>(filters.classes)
    const hierarchy = client.getHierarchy()
    classes = classes.filter((c) => wanted.has(c) || filters.classes?.some((w) => hierarchy.isDerived(c, w)) === true)
    if (classes.length === 0) return
  }
  const text = query.trim()
  const r = await client.searchFulltext(
    {
      query: text === '' ? '*' : `${text}*`,
      classes,
      spaces: filters?.spaces,
      persons: filters?.persons,
      modifiedAfter: filters?.after,
      modifiedBefore: filters?.before
    },
    {
      limit: limit ?? 5
    }
  )
  return { category, items: r.docs }
}

async function doFulltextSearch (
  client: TxOperations,
  categories: ObjectSearchCategory[],
  query: string,
  limit?: number,
  filters?: SearchFilters
): Promise<SearchSection[]> {
  const sections: SearchSection[] = []
  const promises: Array<Promise<SearchSection | undefined>> = []
  for (const cat of categories) {
    promises.push(searchCategory(client, cat, query, limit, filters))
  }

  const resolvedSections = await Promise.all(promises)
  for (const s of resolvedSections) {
    if (s !== undefined) sections.push(s)
  }

  return sections.sort((a, b) => {
    const ac = categories.indexOf(a.category)
    const bc = categories.indexOf(b.category)
    if (ac === bc) {
      const maxScoreA = Math.max(...(a?.items ?? []).map((obj) => obj?.score ?? 0))
      const maxScoreB = Math.max(...(b?.items ?? []).map((obj) => obj?.score ?? 0))
      return maxScoreB - maxScoreA
    }
    return ac - bc
  })
}

const categoriesByContext = new Map<string, ObjectSearchCategory[]>()

export async function searchFor (
  context: 'mention' | 'spotlight',
  query: string,
  category?: Ref<ObjectSearchCategory>,
  limit?: number,
  filters?: SearchFilters
): Promise<{ items: SearchItem[], query: string }> {
  const client = getClient()
  let categories = categoriesByContext.get(context)
  if (categories === undefined) {
    categories = await client.findAll(plugin.class.ObjectSearchCategory, { context })

    categories.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    categoriesByContext.set(context, categories)
  }

  if (categories === undefined) {
    return { items: [], query }
  }

  const classesToSearch: Array<Ref<Class<Doc>>> = []
  const cats = category === undefined ? categories : categories.filter((it) => it._id === category)
  for (const cat of cats) {
    if (cat.classToSearch !== undefined) {
      classesToSearch.push(cat.classToSearch)
    }
  }

  const sections = await doFulltextSearch(client, cats, query, limit, filters)
  return { items: packSearchResultsForListView(sections), query }
}
