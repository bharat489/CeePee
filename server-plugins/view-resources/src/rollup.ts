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

// Rollups, the pure part. A rollup attribute on a class follows one relation to
// the documents on the other side, reads one field of each, and folds the
// values into a single number or list. The server keeps the folded value on the
// holding document (see OnRollup), so it sorts, filters and displays like any
// other attribute.

export type RollupAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'list' | 'unique' | 'checked' | 'percent'

export interface RollupSpec {
  association: string
  /** The side the holder is on: 'A' rolls up the docB documents, 'B' the docA documents. */
  direction: 'A' | 'B'
  /** Field read on each related document; ignored by `count`. */
  field: string
  aggregate: RollupAggregate
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

const present = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)

/** Fold the related documents' field values into the rollup value. */
export function rollup (spec: Pick<RollupSpec, 'field' | 'aggregate'>, docs: Array<Record<string, unknown>>): number | unknown[] | undefined {
  const values = docs.map((d) => d[spec.field])
  switch (spec.aggregate) {
    case 'count':
      return docs.length
    case 'sum': {
      const ns = values.map(num).filter((v): v is number => v !== undefined)
      return ns.length > 0 ? round(ns.reduce((a, b) => a + b, 0)) : 0
    }
    case 'avg': {
      const ns = values.map(num).filter((v): v is number => v !== undefined)
      return ns.length > 0 ? round(ns.reduce((a, b) => a + b, 0) / ns.length) : undefined
    }
    case 'min': {
      const ns = values.map(num).filter((v): v is number => v !== undefined)
      return ns.length > 0 ? Math.min(...ns) : undefined
    }
    case 'max': {
      const ns = values.map(num).filter((v): v is number => v !== undefined)
      return ns.length > 0 ? Math.max(...ns) : undefined
    }
    case 'list':
      return values.filter(present).flatMap((v) => (Array.isArray(v) ? v : [v]))
    case 'unique':
      return new Set(values.filter(present).flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => (typeof v === 'object' ? JSON.stringify(v) : v))).size
    case 'checked':
      return values.filter((v) => v === true).length
    case 'percent':
      return docs.length > 0 ? Math.round((values.filter((v) => v === true).length / docs.length) * 100) : 0
  }
}

const round = (n: number): number => Math.round(n * 100) / 100

/** Do two stored rollup values differ (so an update is worth writing)? */
export function changed (a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length !== b.length || a.some((v, i) => v !== b[i])
  }
  return (a ?? null) !== (b ?? null)
}

/** Which side of a relation the holder occupies, and which side is rolled up. */
export function sides (direction: 'A' | 'B'): { holder: 'docA' | 'docB', target: 'docA' | 'docB' } {
  return direction === 'A' ? { holder: 'docA', target: 'docB' } : { holder: 'docB', target: 'docA' }
}

/** Aggregates that make sense for a field of the given kind. */
export function aggregatesFor (kind: 'number' | 'boolean' | 'text' | 'other' | 'none'): RollupAggregate[] {
  switch (kind) {
    case 'none':
      return ['count']
    case 'number':
      return ['count', 'sum', 'avg', 'min', 'max', 'list', 'unique']
    case 'boolean':
      return ['count', 'checked', 'percent']
    case 'text':
      return ['count', 'list', 'unique']
    default:
      return ['count', 'list', 'unique']
  }
}
