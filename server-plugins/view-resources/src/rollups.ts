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

// Rollups on the server. A rollup attribute (core.class.TypeRollup) on a class
// follows one relation and folds a field of the related documents into a value
// stored on the holder. This trigger keeps those values current: when a relation
// is added or removed, when a related document changes the rolled-up field, and
// when a rollup attribute is first defined. It also removes the relations of a
// deleted document, which nothing did before.

import core, {
  type AnyAttribute,
  type Association,
  type Class,
  type Doc,
  type Ref,
  type Relation,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  type TxUpdateDoc,
  type TypeRollup,
  TxProcessor
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'

import { changed, rollup, sides } from './rollup'

interface RollupAttr {
  attr: AnyAttribute
  spec: TypeRollup
  assoc: Association
  targetClass: Ref<Class<Doc>>
}

function rollupAttributes (control: TriggerControl): RollupAttr[] {
  const res: RollupAttr[] = []
  for (const attr of control.modelDb.findAllSync(core.class.Attribute, {})) {
    if (attr.type?._class !== core.class.TypeRollup) continue
    const spec = attr.type as TypeRollup
    const assoc = control.modelDb.findAllSync(core.class.Association, { _id: spec.association })[0]
    if (assoc === undefined) continue
    res.push({ attr, spec, assoc, targetClass: spec.direction === 'A' ? assoc.classB : assoc.classA })
  }
  return res
}

/** Classes that take part in any relation, so deleting one of their documents may leave relations behind. */
function relatedClasses (control: TriggerControl): Array<Ref<Class<Doc>>> {
  const res = new Set<Ref<Class<Doc>>>()
  for (const a of control.modelDb.findAllSync(core.class.Association, {})) {
    res.add(a.classA)
    res.add(a.classB)
  }
  return [...res]
}

async function recompute (control: TriggerControl, r: RollupAttr, holderIds: Array<Ref<Doc>>): Promise<Tx[]> {
  const res: Tx[] = []
  if (holderIds.length === 0) return res
  const { holder, target } = sides(r.spec.direction)
  const holders = await control.findAll(control.ctx, r.attr.attributeOf, { _id: { $in: holderIds } })
  const relations = await control.findAll(control.ctx, core.class.Relation, {
    association: r.assoc._id,
    [holder]: { $in: holderIds }
  })
  const targetIds = [...new Set(relations.map((x) => x[target]))]
  const targets = targetIds.length > 0 ? await control.findAll(control.ctx, r.targetClass, { _id: { $in: targetIds } }) : []
  const byId = new Map(targets.map((t) => [t._id, t]))
  const mixin = control.hierarchy.isMixin(r.attr.attributeOf)
  for (const h of holders) {
    const docs = relations
      .filter((x) => x[holder] === h._id)
      .map((x) => byId.get(x[target]))
      .filter((d): d is Doc => d !== undefined)
    const value = rollup(r.spec, docs as unknown as Array<Record<string, unknown>>) ?? null
    const current = mixin ? (control.hierarchy.as(h, r.attr.attributeOf) as any)[r.attr.name] : (h as any)[r.attr.name]
    if (!changed(current, value)) continue
    res.push(
      mixin
        ? control.txFactory.createTxMixin(h._id, h._class, h.space, r.attr.attributeOf, { [r.attr.name]: value } as any)
        : control.txFactory.createTxUpdateDoc(h._class, h.space, h._id, { [r.attr.name]: value } as any)
    )
  }
  return res
}

/**
 * @public
 */
export async function OnRollup (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const attrs = rollupAttributes(control)
  const participants = relatedClasses(control)
  if (attrs.length === 0 && participants.length === 0) return []
  const res: Tx[] = []
  const pending = new Map<Ref<AnyAttribute>, { r: RollupAttr, ids: Set<Ref<Doc>> }>()
  const add = (r: RollupAttr, ids: Array<Ref<Doc> | undefined>): void => {
    const e = pending.get(r.attr._id) ?? { r, ids: new Set<Ref<Doc>>() }
    for (const id of ids) if (id !== undefined) e.ids.add(id)
    pending.set(r.attr._id, e)
  }

  for (const tx of txes) {
    const cud = tx as TxCUD<Doc>
    if (cud.objectClass === undefined) continue

    // a relation came or went: the holder on our side changes
    if (cud.objectClass === core.class.Relation) {
      if (cud._class !== core.class.TxCreateDoc && cud._class !== core.class.TxRemoveDoc) continue
      const rel =
        cud._class === core.class.TxCreateDoc
          ? TxProcessor.createDoc2Doc(cud as TxCreateDoc<Relation>)
          : (control.removedMap.get(cud.objectId) as Relation | undefined)
      if (rel === undefined) continue
      for (const r of attrs) {
        if (r.assoc._id === rel.association) add(r, [rel[sides(r.spec.direction).holder]])
      }
      continue
    }

    // a rollup attribute was defined or reconfigured: fill every holder
    if (cud.objectClass === core.class.Attribute) {
      if (cud._class !== core.class.TxCreateDoc && cud._class !== core.class.TxUpdateDoc) continue
      const r = attrs.find((x) => x.attr._id === cud.objectId)
      if (r === undefined) continue
      const holders = await control.findAll(control.ctx, r.attr.attributeOf, {}, { limit: 5000, projection: { _id: 1 } })
      add(r, holders.map((h) => h._id))
      continue
    }

    // a related document changed a rolled-up field
    if (cud._class === core.class.TxUpdateDoc || cud._class === core.class.TxMixin) {
      const ops = ((cud as TxUpdateDoc<Doc>).operations ?? (cud as any).attributes ?? {}) as Record<string, any>
      for (const r of attrs) {
        if (r.spec.aggregate === 'count') continue
        if (!control.hierarchy.isDerived(cud.objectClass, r.targetClass)) continue
        const touched =
          r.spec.field in ops ||
          Object.keys(ops).some((k) => k.startsWith('$') && ops[k] != null && typeof ops[k] === 'object' && r.spec.field in ops[k])
        if (!touched) continue
        const { holder, target } = sides(r.spec.direction)
        const rels = await control.findAll(control.ctx, core.class.Relation, { association: r.assoc._id, [target]: cud.objectId })
        add(r, rels.map((x) => x[holder]))
      }
    }

    // a document went away: its relations go with it (their removal recomputes the other side)
    if (cud._class === core.class.TxRemoveDoc && participants.some((c) => control.hierarchy.isDerived(cud.objectClass, c))) {
      const asA = await control.findAll(control.ctx, core.class.Relation, { docA: cud.objectId })
      const asB = await control.findAll(control.ctx, core.class.Relation, { docB: cud.objectId })
      for (const rel of [...asA, ...asB]) {
        control.removedMap.set(rel._id, rel)
        res.push(control.txFactory.createTxRemoveDoc(rel._class, rel.space, rel._id))
      }
    }
  }

  for (const { r, ids } of pending.values()) {
    res.push(...(await recompute(control, r, [...ids])))
  }
  return res
}
