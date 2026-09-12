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

// SCIM 2.0 (RFC 7644), the subset identity providers actually call:
//   GET    /scim/v2/Users?filter=userName eq "x"
//   GET    /scim/v2/Users/{id}
//   POST   /scim/v2/Users          → invite with the mapped role (auto-join)
//   PATCH  /scim/v2/Users/{id}     → active:false demotes to read-only guest,
//                                    active:true restores the last role
//   PUT    /scim/v2/Users/{id}     → same as PATCH for the fields we hold
//   DELETE /scim/v2/Users/{id}     → same as active:false
//   GET    /scim/v2/ServiceProviderConfig, /ResourceTypes, /Schemas
//
// Accounts are not deleted: a deprovisioned person keeps authorship and
// history but can no longer write. Roles come from a group-name → role
// map (SCIM_ROLE_MAP, e.g. "Admins=OWNER,Leads=MAINTAINER").

import { getClient as getAccountClient, type AccountClient } from '@hcengineering/account-client'
import { AccountRole, type AccountUuid } from '@hcengineering/core'

export interface ScimConfig {
  accountsUrl: string
  token: string
  roleMap: Record<string, AccountRole>
  defaultRole: AccountRole
}

export interface Result {
  status: number
  body: unknown
}

const SCHEMA_USER = 'urn:ietf:params:scim:schemas:core:2.0:User'
const SCHEMA_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
const SCHEMA_ERR = 'urn:ietf:params:scim:api:messages:2.0:Error'
const SCHEMA_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'

const err = (status: number, detail: string): Result => ({ status, body: { schemas: [SCHEMA_ERR], status: String(status), detail } })

interface Member {
  person: AccountUuid
  role: AccountRole
}

// role memory so re-activation restores what the person had
const lastRole = new Map<string, AccountRole>()

async function members (ac: AccountClient): Promise<Member[]> {
  return (await ac.getWorkspaceMembers()) as unknown as Member[]
}

async function toScim (ac: AccountClient, m: Member): Promise<Record<string, unknown>> {
  let email = ''
  let first = ''
  let last = ''
  try {
    const info = await ac.getPersonInfo(m.person)
    const anyInfo = info as unknown as Record<string, unknown>
    const name = String(anyInfo.name ?? '')
    const parts = name.split(',')
    last = parts[0] ?? ''
    first = parts[1] ?? ''
    const ids = (anyInfo.socialIds as Array<Record<string, unknown>> | undefined) ?? []
    email = String(ids.find((s) => String(s.type) === 'email')?.value ?? '')
  } catch {
    // person info may be unavailable for pending invites
  }
  return {
    schemas: [SCHEMA_USER],
    id: m.person,
    userName: email !== '' ? email : m.person,
    name: { givenName: first, familyName: last, formatted: `${first} ${last}`.trim() },
    emails: email !== '' ? [{ value: email, primary: true }] : [],
    active: m.role !== AccountRole.ReadOnlyGuest,
    roles: [{ value: m.role }],
    meta: { resourceType: 'User', location: `/scim/v2/Users/${m.person}` }
  }
}

export async function handleScim (cfg: ScimConfig, method: string, path: string, query: URLSearchParams, body: Record<string, unknown>): Promise<Result> {
  const ac = getAccountClient(cfg.accountsUrl, cfg.token)
  const rest = path.replace(/^\/scim\/v2/, '')

  if (method === 'GET' && rest === '/ServiceProviderConfig') {
    return { status: 200, body: { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'], patch: { supported: true }, bulk: { supported: false }, filter: { supported: true, maxResults: 200 }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false }, authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'Static bearer token configured on the integrations service' }] } }
  }
  if (method === 'GET' && rest === '/ResourceTypes') {
    return { status: 200, body: { schemas: [SCHEMA_LIST], totalResults: 1, Resources: [{ schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: SCHEMA_USER }] } }
  }
  if (method === 'GET' && rest === '/Schemas') {
    return { status: 200, body: { schemas: [SCHEMA_LIST], totalResults: 1, Resources: [{ id: SCHEMA_USER, name: 'User', attributes: [{ name: 'userName', type: 'string', required: true }, { name: 'name', type: 'complex' }, { name: 'emails', type: 'complex', multiValued: true }, { name: 'active', type: 'boolean' }] }] } }
  }

  if (rest === '/Users' && method === 'GET') {
    const all = await members(ac)
    const filter = query.get('filter') ?? ''
    const m = /userName\s+eq\s+"([^"]+)"/i.exec(filter)
    let list = await Promise.all(all.map(async (x) => await toScim(ac, x)))
    if (m !== null) list = list.filter((u) => String(u.userName).toLowerCase() === m[1].toLowerCase())
    const start = Math.max(1, Number(query.get('startIndex') ?? 1))
    const count = Math.min(200, Number(query.get('count') ?? 100))
    return { status: 200, body: { schemas: [SCHEMA_LIST], totalResults: list.length, startIndex: start, itemsPerPage: count, Resources: list.slice(start - 1, start - 1 + count) } }
  }

  if (rest === '/Users' && method === 'POST') {
    const email = String(body.userName ?? (body.emails as Array<Record<string, unknown>> | undefined)?.[0]?.value ?? '').trim().toLowerCase()
    if (email === '') return err(400, 'userName (email) is required')
    const name = (body.name as Record<string, unknown> | undefined) ?? {}
    const groups = ((body.groups as Array<Record<string, unknown>> | undefined) ?? []).map((g) => String(g.display ?? g.value ?? ''))
    const role = groups.map((g) => cfg.roleMap[g]).find((r) => r !== undefined) ?? cfg.defaultRole
    const link = await ac.createInviteLink(email, role, true, String(name.givenName ?? ''), String(name.familyName ?? ''))
    return {
      status: 201,
      body: {
        schemas: [SCHEMA_USER],
        id: email,
        userName: email,
        name: { givenName: name.givenName ?? '', familyName: name.familyName ?? '' },
        emails: [{ value: email, primary: true }],
        active: true,
        roles: [{ value: role }],
        'urn:ceepee:params:scim:schemas:extension:Invite': { link },
        meta: { resourceType: 'User' }
      }
    }
  }

  const one = /^\/Users\/([^/]+)$/.exec(rest)
  if (one !== null) {
    const id = decodeURIComponent(one[1])
    const all = await members(ac)
    const m = all.find((x) => x.person === id)
    if (method === 'GET') {
      if (m === undefined) return err(404, 'not found')
      return { status: 200, body: await toScim(ac, m) }
    }
    if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
      if (m === undefined) return err(404, 'not found')
      let active: boolean | undefined
      if (method === 'DELETE') active = false
      else if (method === 'PUT') active = body.active !== false
      else {
        const ops = ((body.Operations as Array<Record<string, unknown>> | undefined) ?? [])
        if (!Array.isArray(body.schemas) || !(body.schemas as unknown[]).includes(SCHEMA_PATCH)) return err(400, 'expected a PatchOp')
        for (const op of ops) {
          const path = String(op.path ?? '').toLowerCase()
          const value = op.value
          if (path === 'active') active = value === true || value === 'true' || value === 'True'
          else if (path === '' && value !== null && typeof value === 'object' && 'active' in (value as object)) active = (value as Record<string, unknown>).active === true
        }
      }
      if (active === false && m.role !== AccountRole.ReadOnlyGuest) {
        lastRole.set(id, m.role)
        await ac.updateWorkspaceRole(id, AccountRole.ReadOnlyGuest)
      } else if (active === true && m.role === AccountRole.ReadOnlyGuest) {
        await ac.updateWorkspaceRole(id, lastRole.get(id) ?? cfg.defaultRole)
      }
      if (method === 'DELETE') return { status: 204, body: undefined }
      const fresh = (await members(ac)).find((x) => x.person === id) ?? m
      return { status: 200, body: await toScim(ac, fresh) }
    }
  }
  return err(404, 'unsupported SCIM path')
}

export function parseRoleMap (s: string | undefined): Record<string, AccountRole> {
  const out: Record<string, AccountRole> = {}
  for (const part of (s ?? '').split(',')) {
    const [group, role] = part.split('=').map((x) => x.trim())
    if (group !== undefined && group !== '' && role !== undefined && (Object.values(AccountRole) as string[]).includes(role)) out[group] = role as AccountRole
  }
  return out
}
