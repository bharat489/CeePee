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

// Page permissions on the server. A page's PageAccess mixin says whether it
// inherits from its parent, is open to its space, or is restricted to named
// people and groups with view / comment / edit levels. This middleware hides
// pages the account may not view from every query and rejects edits,
// deletions, sub-page creation and comments the account's level does not
// allow. Workspace owners and the system pass through; space membership is
// still checked earlier in the pipeline.

import core, {
  AccountRole,
  toFindResult,
  type AttachedDoc,
  type Class,
  type Doc,
  type DocumentQuery,
  type FindOptions,
  type FindResult,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxApplyIf,
  type TxCreateDoc,
  type TxCUD,
  type TxMixin
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { BaseMiddleware, type Middleware, type PipelineContext, type TxMiddlewareResult } from '@hcengineering/server-core'
import { allowed, effectiveAccess, hidden, type PageAccessData, type PageLevel } from './pageAccessRules'

const DOCUMENT = 'document:class:Document' as Ref<Class<Doc>>
const PAGE_ACCESS = 'document:mixin:PageAccess'
const USER_GROUP = 'contact:class:UserGroup' as Ref<Class<Doc>>
const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const NO_PARENT = 'document:ids:NoParent'
const MAX_DEPTH = 24

interface PageDoc extends Doc {
  parent?: Ref<PageDoc>
  [PAGE_ACCESS]?: PageAccessData
}

/**
 * @public
 */
export class PageAccessMiddleware extends BaseMiddleware implements Middleware {
  private constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)
  }

  static async create (ctx: MeasureContext, context: PipelineContext, next: Middleware | undefined): Promise<PageAccessMiddleware> {
    return new PageAccessMiddleware(context, next)
  }

  private hasDocuments (): boolean {
    return this.context.hierarchy.hasClass(DOCUMENT)
  }

  private isPage (_class: Ref<Class<Doc>>): boolean {
    return this.hasDocuments() && this.context.hierarchy.isDerived(_class, DOCUMENT)
  }

  private bypass (ctx: MeasureContext<SessionData>): boolean {
    const account = ctx.contextData.account
    return account.primarySocialId === core.account.System || account.role === AccountRole.Owner || account.role === AccountRole.Admin
  }

  private async groupsOf (ctx: MeasureContext<SessionData>): Promise<Set<string>> {
    if (!this.context.hierarchy.hasClass(USER_GROUP)) return new Set()
    const groups = await this.provideFindAll(ctx, USER_GROUP, { members: ctx.contextData.account.uuid } as any)
    return new Set(groups.map((g) => g._id as string))
  }

  /** The page and its ancestors, nearest first; pages already loaded are reused. */
  private async chainOf (ctx: MeasureContext<SessionData>, page: PageDoc, known: Map<string, PageDoc>): Promise<PageDoc[]> {
    const chain: PageDoc[] = [page]
    let current = page
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const parentId = current.parent
      if (parentId === undefined || parentId === NO_PARENT || (parentId as string) === '') break
      let parent = known.get(parentId as string)
      if (parent === undefined) {
        parent = (await this.provideFindAll(ctx, DOCUMENT, { _id: parentId } as any, { limit: 1 }))[0] as PageDoc | undefined
        if (parent === undefined) break
        known.set(parent._id as string, parent)
      }
      chain.push(parent)
      current = parent
    }
    return chain
  }

  private toNodes (chain: PageDoc[]): Array<{ _id: string, access?: PageAccessData }> {
    return chain.map((p) => ({ _id: p._id as string, access: p[PAGE_ACCESS] }))
  }

  override async findAll<T extends Doc>(ctx: MeasureContext<SessionData>, _class: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>): Promise<FindResult<T>> {
    const result = await this.provideFindAll(ctx, _class, query, options)
    if (result.length === 0 || !this.isPage(_class) || this.bypass(ctx)) return result
    // anything restricted at all? cheap exit when no page in the result or its ancestry carries the mixin
    const known = new Map<string, PageDoc>()
    for (const d of result) known.set(d._id as string, d as unknown as PageDoc)
    const account = ctx.contextData.account.uuid as string
    let groups: Set<string> | undefined
    const kept: T[] = []
    let removed = 0
    for (const d of result) {
      const chain = await this.chainOf(ctx, d as unknown as PageDoc, known)
      const access = effectiveAccess(this.toNodes(chain))
      if (access.mode === 'open') {
        kept.push(d)
        continue
      }
      if (groups === undefined) groups = await this.groupsOf(ctx)
      if (hidden(access, account, groups)) removed++
      else kept.push(d)
    }
    if (removed === 0) return result
    return toFindResult(kept, result.total !== undefined && result.total >= 0 ? result.total - removed : result.total, result.lookupMap)
  }

  private forbid (): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
  }

  private async require (ctx: MeasureContext<SessionData>, pageId: Ref<Doc>, need: PageLevel, groups: Set<string>): Promise<void> {
    const page = (await this.provideFindAll(ctx, DOCUMENT, { _id: pageId } as any, { limit: 1 }))[0] as PageDoc | undefined
    if (page === undefined) return
    const chain = await this.chainOf(ctx, page, new Map())
    const access = effectiveAccess(this.toNodes(chain))
    if (access.mode === 'open') return
    if (!allowed(access, need, ctx.contextData.account.uuid as string, groups)) this.forbid()
  }

  private async check (ctx: MeasureContext<SessionData>, tx: Tx, groups: () => Promise<Set<string>>): Promise<void> {
    if (tx._class === core.class.TxApplyIf) {
      for (const t of (tx as TxApplyIf).txes) await this.check(ctx, t, groups)
      return
    }
    const cud = tx as TxCUD<Doc>
    if (cud.objectClass === undefined) return
    if (this.isPage(cud.objectClass)) {
      if (cud._class === core.class.TxCreateDoc) {
        const attrs = (cud as TxCreateDoc<PageDoc>).attributes
        const parent = attrs.parent
        if (parent !== undefined && parent !== (NO_PARENT as Ref<PageDoc>)) await this.require(ctx, parent, 'edit', await groups())
        return
      }
      // update, remove, mixin (including the access settings themselves) need edit
      await this.require(ctx, cud.objectId, 'edit', await groups())
      return
    }
    if (cud._class === core.class.TxCreateDoc && cud.objectClass === CHAT_MESSAGE) {
      const attrs = (cud as TxCreateDoc<AttachedDoc>).attributes
      if (attrs.attachedToClass !== undefined && this.isPage(attrs.attachedToClass)) await this.require(ctx, attrs.attachedTo, 'comment', await groups())
      return
    }
    if (cud._class === core.class.TxMixin && this.isPage((cud as TxMixin<Doc, Doc>).objectClass)) {
      await this.require(ctx, cud.objectId, 'edit', await groups())
    }
  }

  override async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    if (this.hasDocuments() && !this.bypass(ctx)) {
      let cached: Set<string> | undefined
      const groups = async (): Promise<Set<string>> => {
        if (cached === undefined) cached = await this.groupsOf(ctx)
        return cached
      }
      for (const tx of txes) await this.check(ctx, tx, groups)
    }
    return await this.provideTx(ctx, txes)
  }
}
