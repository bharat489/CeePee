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

import { classesForTypes, hasFilters, parseDateWord, parseSearchOperators, tokenize } from '../searchOperators'

const now = Date.UTC(2026, 8, 21, 12) // Mon 21 Sep 2026 noon
const DAY = 24 * 60 * 60 * 1000

describe('tokenize', () => {
  it('keeps quoted values together and drops the quotes', () => {
    expect(tokenize('in:"QA Campaign" loader')).toEqual(['in:QA Campaign', 'loader'])
    expect(tokenize("from:'Ann Lee' bug")).toEqual(['from:Ann Lee', 'bug'])
    expect(tokenize('  a   b ')).toEqual(['a', 'b'])
  })
})

describe('parseDateWord', () => {
  it('reads absolute and relative dates', () => {
    expect(parseDateWord('2026-09-01', now)).toBe(Date.UTC(2026, 8, 1))
    expect(parseDateWord('9/1/2026', now)).toBe(Date.UTC(2026, 8, 1))
    expect(parseDateWord('today', now)).toBe(Date.UTC(2026, 8, 21))
    expect(parseDateWord('yesterday', now)).toBe(Date.UTC(2026, 8, 20))
    expect(parseDateWord('7d', now)).toBe(Date.UTC(2026, 8, 14))
    expect(parseDateWord('2w', now)).toBe(Date.UTC(2026, 8, 7))
    expect(parseDateWord('nonsense', now)).toBeUndefined()
  })
})

describe('parseSearchOperators', () => {
  it('separates operators from text', () => {
    const p = parseSearchOperators('type:issue in:"QA Campaign" from:ann after:2026-09-01 before:today loader crash', now)
    expect(p.text).toBe('loader crash')
    expect(p.types).toEqual(['issue'])
    expect(p.spaces).toEqual(['QA Campaign'])
    expect(p.persons).toEqual(['ann'])
    expect(p.after).toBe(Date.UTC(2026, 8, 1))
    expect(p.before).toBe(Date.UTC(2026, 8, 21) + DAY - 1)
    expect(hasFilters(p)).toBe(true)
  })
  it('leaves unknown prefixes and bare colons as text', () => {
    const p = parseSearchOperators('re: meeting http://x.y/z type:', now)
    expect(p.text).toBe('re: meeting http://x.y/z type:')
    expect(hasFilters(p)).toBe(false)
  })
  it('accepts by: and assignee: as person filters and since/until as dates', () => {
    const p = parseSearchOperators('by:bob assignee:cy since:1d until:yesterday', now)
    expect(p.persons).toEqual(['bob', 'cy'])
    expect(p.after).toBe(Date.UTC(2026, 8, 20))
    expect(p.before).toBe(Date.UTC(2026, 8, 20) + DAY - 1)
  })
  it('reports dates it cannot read', () => {
    const p = parseSearchOperators('after:soon x', now)
    expect(p.after).toBeUndefined()
    expect(p.unknown).toEqual(['after:soon'])
    expect(p.text).toBe('x')
  })
})

describe('classesForTypes', () => {
  it('maps type words to classes and ignores unknown ones', () => {
    expect(classesForTypes(['issue', 'bug', 'docs', 'zebra'])).toEqual(['tracker:class:Issue', 'document:class:Document'])
  })
})
