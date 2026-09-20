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

import { aggregatesFor, changed, rollup, sides } from '../rollup'

const docs = [
  { estimation: 3, done: true, title: 'a', tags: ['x', 'y'] },
  { estimation: 5, done: false, title: 'b', tags: ['y'] },
  { estimation: '2', done: true, title: '', tags: [] },
  { done: null, title: 'a' }
]

describe('rollup', () => {
  it('counts, sums and averages numbers, tolerating strings and gaps', () => {
    expect(rollup({ field: 'estimation', aggregate: 'count' }, docs)).toBe(4)
    expect(rollup({ field: 'estimation', aggregate: 'sum' }, docs)).toBe(10)
    expect(rollup({ field: 'estimation', aggregate: 'avg' }, docs)).toBe(3.33)
    expect(rollup({ field: 'estimation', aggregate: 'min' }, docs)).toBe(2)
    expect(rollup({ field: 'estimation', aggregate: 'max' }, docs)).toBe(5)
  })
  it('is well defined on nothing', () => {
    expect(rollup({ field: 'estimation', aggregate: 'sum' }, [])).toBe(0)
    expect(rollup({ field: 'estimation', aggregate: 'avg' }, [])).toBeUndefined()
    expect(rollup({ field: 'estimation', aggregate: 'percent' }, [])).toBe(0)
    expect(rollup({ field: 'estimation', aggregate: 'list' }, [])).toEqual([])
  })
  it('lists and de-duplicates, flattening arrays and dropping blanks', () => {
    expect(rollup({ field: 'title', aggregate: 'list' }, docs)).toEqual(['a', 'b', 'a'])
    expect(rollup({ field: 'title', aggregate: 'unique' }, docs)).toBe(2)
    expect(rollup({ field: 'tags', aggregate: 'list' }, docs)).toEqual(['x', 'y', 'y'])
    expect(rollup({ field: 'tags', aggregate: 'unique' }, docs)).toBe(2)
  })
  it('handles booleans as checked counts and percentages', () => {
    expect(rollup({ field: 'done', aggregate: 'checked' }, docs)).toBe(2)
    expect(rollup({ field: 'done', aggregate: 'percent' }, docs)).toBe(50)
  })
  it('knows when a stored value needs rewriting', () => {
    expect(changed(3, 3)).toBe(false)
    expect(changed(3, 4)).toBe(true)
    expect(changed(['a'], ['a'])).toBe(false)
    expect(changed(['a'], ['a', 'b'])).toBe(true)
    expect(changed(undefined, 0)).toBe(true)
  })
  it('maps the holder side to the relation columns', () => {
    expect(sides('A')).toEqual({ holder: 'docA', target: 'docB' })
    expect(sides('B')).toEqual({ holder: 'docB', target: 'docA' })
  })
  it('offers sensible aggregates per field kind', () => {
    expect(aggregatesFor('none')).toEqual(['count'])
    expect(aggregatesFor('number')).toContain('sum')
    expect(aggregatesFor('boolean')).toContain('percent')
    expect(aggregatesFor('text')).not.toContain('sum')
  })
})
