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

import { allowed, effectiveAccess, hidden, levelOf, type PageAccessData } from '../pageAccessRules'

const restricted: PageAccessData = { mode: 'restricted', viewers: ['v'], commenters: ['c'], editors: ['e'], viewerGroups: ['gv'], editorGroups: ['ge'] }
const none = new Set<string>()

describe('effective access walks up the tree', () => {
  it('a page without settings is open', () => {
    expect(effectiveAccess([{ _id: 'p' }])).toEqual({ mode: 'open' })
    expect(effectiveAccess([{ _id: 'p', access: { mode: 'inherit' } }, { _id: 'root' }])).toEqual({ mode: 'open' })
  })
  it('the nearest non-inheriting ancestor decides', () => {
    const r = effectiveAccess([{ _id: 'leaf', access: { mode: 'inherit' } }, { _id: 'mid', access: restricted }, { _id: 'root', access: { mode: 'open' } }])
    expect(r.mode).toBe('restricted')
    expect(r.source).toBe('mid')
  })
  it('a page can override a restricted parent by being open', () => {
    const r = effectiveAccess([{ _id: 'leaf', access: { mode: 'open' } }, { _id: 'mid', access: restricted }])
    expect(r).toEqual({ mode: 'open', source: 'leaf', data: { mode: 'open' } })
  })
})

describe('levels', () => {
  it('rank people and groups', () => {
    expect(levelOf(restricted, 'e', none)).toBe('edit')
    expect(levelOf(restricted, 'c', none)).toBe('comment')
    expect(levelOf(restricted, 'v', none)).toBe('view')
    expect(levelOf(restricted, 'x', none)).toBeUndefined()
    expect(levelOf(restricted, 'x', new Set(['gv']))).toBe('view')
    expect(levelOf(restricted, 'x', new Set(['ge']))).toBe('edit')
    expect(levelOf(restricted, 'v', new Set(['ge']))).toBe('edit')
  })
  it('allow by rank, hide strangers, open means everything', () => {
    const r = effectiveAccess([{ _id: 'p', access: restricted }])
    expect(allowed(r, 'view', 'v', none)).toBe(true)
    expect(allowed(r, 'comment', 'v', none)).toBe(false)
    expect(allowed(r, 'comment', 'c', none)).toBe(true)
    expect(allowed(r, 'edit', 'c', none)).toBe(false)
    expect(allowed(r, 'edit', 'e', none)).toBe(true)
    expect(hidden(r, 'x', none)).toBe(true)
    expect(hidden(r, 'x', new Set(['gv']))).toBe(false)
    const open = effectiveAccess([{ _id: 'p' }])
    expect(allowed(open, 'edit', 'anyone', none)).toBe(true)
    expect(hidden(open, 'anyone', none)).toBe(false)
  })
})
