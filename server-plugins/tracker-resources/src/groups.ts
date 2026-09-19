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

// User groups: when a group's members or applied spaces change (or the group
// is deleted), the spaces it is applied to get the members added or removed.
// The group remembers what it applied (`applied`), so it only ever removes
// people it added itself, and never someone another group still provides.

import core, { type AccountUuid, type Doc, type Ref, type Space, type Tx, type TxCUD, type TxRemoveDoc, type TxUpdateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import { planGroupSync, sameApplied } from './groupPlan'

const USER_GROUP = 'contact:class:UserGroup' as Ref<any>

interface UserGroupDoc extends Doc {
  name: string
  members: AccountUuid[]
  spaces: Ref<Space>[]
  applied?: Record<string, AccountUuid[]>
}

export async function OnUserGroups (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const out: Tx[] = []
  for (const tx of txes) {
    const cud = tx as TxCUD<UserGroupDoc>
    if (cud.objectClass !== USER_GROUP) continue
    // our own bookkeeping write: nothing to do
    if (cud._class === core.class.TxUpdateDoc) {
      const ops = (cud as TxUpdateDoc<UserGroupDoc>).operations as Record<string, unknown>
      const keys = Object.keys(ops).filter((k) => !k.startsWith('$'))
      if (keys.length > 0 && keys.every((k) => k === 'applied')) continue
    }
    let group: UserGroupDoc | undefined
    let removed = false
    if (cud._class === core.class.TxRemoveDoc) {
      group = control.removedMap.get((cud as TxRemoveDoc<UserGroupDoc>).objectId) as UserGroupDoc | undefined
      removed = true
    } else {
      group = (await control.findAll(control.ctx, USER_GROUP, { _id: cud.objectId }, { limit: 1 }))[0] as UserGroupDoc | undefined
    }
    if (group === undefined) continue

    const spaces = removed ? [] : (group.spaces ?? [])
    const members = removed ? [] : (group.members ?? [])
    const applied = group.applied ?? {}
    const involved = Array.from(new Set<Ref<Space>>([...spaces, ...(Object.keys(applied) as Ref<Space>[])]))
    if (involved.length === 0) continue

    const spaceDocs = await control.findAll(control.ctx, core.class.Space, { _id: { $in: involved } })
    const current = new Map<Ref<Space>, AccountUuid[]>(spaceDocs.map((s) => [s._id, s.members ?? []]))
    // members other groups still provide to these spaces
    const others = (await control.findAll(control.ctx, USER_GROUP, { _id: { $ne: group._id } })) as unknown as UserGroupDoc[]
    const providedByOthers = new Map<Ref<Space>, Set<AccountUuid>>()
    for (const o of others) {
      for (const s of o.spaces ?? []) {
        if (!current.has(s)) continue
        const set = providedByOthers.get(s) ?? new Set<AccountUuid>()
        for (const m of o.members ?? []) set.add(m)
        providedByOthers.set(s, set)
      }
    }
    const plan = planGroupSync<Ref<Space>, AccountUuid>({ spaces, members, applied, current, providedByOthers })
    for (const change of plan.changes) {
      const space = spaceDocs.find((s) => s._id === change.space)
      if (space === undefined) continue
      if (change.add.length > 0) out.push(control.txFactory.createTxUpdateDoc(space._class, space.space, space._id, { $push: { members: { $each: change.add, $position: 0 } } } as any))
      // owners are never pulled out by a group change
      const pull = change.remove.filter((m) => !(space.owners ?? []).includes(m))
      for (const m of pull) out.push(control.txFactory.createTxUpdateDoc(space._class, space.space, space._id, { $pull: { members: m } } as any))
    }
    if (!removed && !sameApplied(applied, plan.applied)) {
      out.push(control.txFactory.createTxUpdateDoc(USER_GROUP, group.space, group._id, { applied: plan.applied } as any))
    }
  }
  return out
}
