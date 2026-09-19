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

import { planGroupSync, sameApplied } from '../groupPlan'

const none = new Map<string, Set<string>>()

describe('group → space membership', () => {
  it('adds new members to every applied space and records what it applied', () => {
    const plan = planGroupSync({
      spaces: ['p1', 'p2'],
      members: ['a', 'b'],
      applied: {},
      current: new Map([['p1', ['a', 'x']], ['p2', []]]),
      providedByOthers: none
    })
    expect(plan.changes).toEqual([
      { space: 'p1', add: ['b'], remove: [] },
      { space: 'p2', add: ['a', 'b'], remove: [] }
    ])
    expect(plan.applied).toEqual({ p1: ['a', 'b'], p2: ['a', 'b'] })
  })

  it('removes only the members it added itself', () => {
    const plan = planGroupSync({
      spaces: ['p1'],
      members: ['a'],
      applied: { p1: ['a', 'b'] },
      current: new Map([['p1', ['a', 'b', 'x']]]),
      providedByOthers: none
    })
    expect(plan.changes).toEqual([{ space: 'p1', add: [], remove: ['b'] }])
    expect(plan.applied).toEqual({ p1: ['a'] })
  })

  it('keeps members another group still provides', () => {
    const plan = planGroupSync({
      spaces: ['p1'],
      members: [],
      applied: { p1: ['a', 'b'] },
      current: new Map([['p1', ['a', 'b']]]),
      providedByOthers: new Map([['p1', new Set(['b'])]])
    })
    expect(plan.changes).toEqual([{ space: 'p1', add: [], remove: ['a'] }])
    expect(plan.applied).toEqual({})
  })

  it('pulls its members out of a space it no longer applies to', () => {
    const plan = planGroupSync({
      spaces: ['p2'],
      members: ['a'],
      applied: { p1: ['a'] },
      current: new Map([['p1', ['a']], ['p2', ['a']]]),
      providedByOthers: none
    })
    expect(plan.changes).toEqual([{ space: 'p1', add: [], remove: ['a'] }])
    expect(plan.applied).toEqual({ p2: ['a'] })
  })

  it('does nothing when everything already matches', () => {
    const plan = planGroupSync({
      spaces: ['p1'],
      members: ['a', 'a'],
      applied: { p1: ['a'] },
      current: new Map([['p1', ['a']]]),
      providedByOthers: none
    })
    expect(plan.changes).toEqual([])
    expect(sameApplied(plan.applied, { p1: ['a'] })).toBe(true)
  })

  it('ignores members who already left the space by other means', () => {
    const plan = planGroupSync({
      spaces: [],
      members: [],
      applied: { p1: ['a'] },
      current: new Map([['p1', []]]),
      providedByOthers: none
    })
    expect(plan.changes).toEqual([])
  })

  it('compares applied records as sets', () => {
    expect(sameApplied({ p1: ['b', 'a'] }, { p1: ['a', 'b'] })).toBe(true)
    expect(sameApplied({ p1: ['a'] }, { p1: ['a'], p2: [] })).toBe(false)
    expect(sameApplied({ p1: ['a'] }, { p1: ['a', 'b'] })).toBe(false)
  })
})
