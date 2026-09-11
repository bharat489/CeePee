//
// Copyright © 2026 Hardcore Engineering Inc.
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

// The integrations service: inbound webhooks, SCIM provisioning and the
// daily digest, in one small Node process with no framework. It signs in
// to one workspace as a service account (INTEGRATIONS_EMAIL/PASSWORD) and
// authorises callers with static bearer tokens.

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { AccountRole } from '@hcengineering/core'
import { getClient as getAccountClient } from '@hcengineering/account-client'

import { scheduleDigest } from './digest'
import { handleDeploy, handleEmail, handleGeneric, handleGit, handleSentry, type InboundConfig, type Result } from './inbound'
import { getPlatform, resetPlatform, type PlatformConfig } from './platform'
import { handleScim, parseRoleMap } from './scim'

const env = process.env
const PORT = Number(env.PORT ?? 8095)
const platformCfg: PlatformConfig = {
  url: env.FRONT_URL ?? 'http://front:8080',
  email: env.INTEGRATIONS_EMAIL ?? '',
  password: env.INTEGRATIONS_PASSWORD ?? '',
  workspace: env.WORKSPACE ?? ''
}
const inboundCfg: InboundConfig = { defaultProject: env.INBOUND_PROJECT ?? '' }
const INBOUND_TOKEN = env.INBOUND_TOKEN ?? ''
const SCIM_TOKEN = env.SCIM_TOKEN ?? ''
const ACCOUNTS_URL = env.ACCOUNTS_URL ?? 'http://account:3000'

const log = (m: string): void => {
  console.log(new Date().toISOString(), m)
}

function bearer (req: IncomingMessage, query: URLSearchParams): string {
  const h = req.headers.authorization ?? ''
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim()
  return query.get('token') ?? ''
}

async function readBody (req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const ch of req) chunks.push(ch as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim() === '') return {}
  const ct = (req.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('application/x-www-form-urlencoded')) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v
    return out
  }
  if (ct.includes('multipart/form-data')) {
    // enough for Mailgun/SendGrid text parts; binary attachments are ignored
    const boundary = /boundary=([^;]+)/.exec(ct)?.[1]
    const out: Record<string, unknown> = {}
    if (boundary !== undefined) {
      for (const part of raw.split('--' + boundary)) {
        const m = /name="([^"]+)"[^]*?\r\n\r\n([^]*?)\r\n$/.exec(part)
        if (m !== null && !/filename=/.test(part)) out[m[1]] = m[2]
      }
    }
    return out
  }
  try {
    return JSON.parse(raw)
  } catch {
    return { text: raw }
  }
}

function send (res: ServerResponse, status: number, body: unknown): void {
  if (body === undefined) {
    res.writeHead(status)
    res.end()
    return
  }
  const data = JSON.stringify(body)
  res.writeHead(status, { 'content-type': status >= 200 && status < 300 && String(res.getHeader('x-scim') ?? '') === '1' ? 'application/scim+json' : 'application/json', 'content-length': Buffer.byteLength(data) })
  res.end(data)
}

// workspace-scoped account token for SCIM, refreshed when it fails
let scimToken: string | undefined
async function getScimToken (): Promise<string> {
  if (scimToken !== undefined) return scimToken
  const ac = getAccountClient(ACCOUNTS_URL)
  const login = await ac.login(platformCfg.email, platformCfg.password)
  const ws = await getAccountClient(ACCOUNTS_URL, login.token).selectWorkspace(platformCfg.workspace)
  if (ws.token === undefined || ws.token === '') throw new Error('no workspace token for the integrations account')
  scimToken = ws.token
  return scimToken
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const method = (req.method ?? 'GET').toUpperCase()
    try {
      if (path === '/' || path === '/health') {
        send(res, 200, { ok: true, service: 'ceepee-integrations', workspace: platformCfg.workspace, inbound: INBOUND_TOKEN !== '', scim: SCIM_TOKEN !== '' })
        return
      }
      if (path.startsWith('/scim/v2')) {
        if (SCIM_TOKEN === '' || bearer(req, url.searchParams) !== SCIM_TOKEN) {
          send(res, 401, { schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '401', detail: 'invalid token' })
          return
        }
        const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req)
        res.setHeader('x-scim', '1')
        let r: Result
        try {
          r = await handleScim({ accountsUrl: ACCOUNTS_URL, token: await getScimToken(), roleMap: parseRoleMap(env.SCIM_ROLE_MAP), defaultRole: (env.SCIM_DEFAULT_ROLE as AccountRole | undefined) ?? AccountRole.User }, method, path, url.searchParams, body) as Result
        } catch (e) {
          scimToken = undefined
          throw e
        }
        send(res, r.status, r.body)
        return
      }
      if (path.startsWith('/inbound/')) {
        if (INBOUND_TOKEN === '' || bearer(req, url.searchParams) !== INBOUND_TOKEN) {
          send(res, 401, { error: 'invalid token' })
          return
        }
        if (method !== 'POST') {
          send(res, 405, { error: 'POST only' })
          return
        }
        const body = await readBody(req)
        const kind = path.slice('/inbound/'.length)
        let c
        try {
          c = await getPlatform(platformCfg)
        } catch (e: any) {
          resetPlatform()
          send(res, 503, { error: 'workspace connection failed: ' + String(e?.message ?? e) })
          return
        }
        let r: Result
        switch (kind) {
          case 'generic':
            r = await handleGeneric(c, inboundCfg, body, url.searchParams)
            break
          case 'email':
            r = await handleEmail(c, inboundCfg, body, url.searchParams)
            break
          case 'sentry':
            r = await handleSentry(c, inboundCfg, body, url.searchParams)
            break
          case 'github':
          case 'gitlab':
          case 'bitbucket':
            r = await handleGit(kind, c, body, req.headers)
            break
          case 'deploy':
            r = await handleDeploy(c, body)
            break
          default:
            r = { status: 404, body: { error: 'unknown inbound kind', kinds: ['generic', 'email', 'sentry', 'github', 'gitlab', 'bitbucket', 'deploy'] } }
        }
        log(`inbound ${kind} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
        send(res, r.status, r.body)
        return
      }
      send(res, 404, { error: 'not found' })
    } catch (e: any) {
      log(`error ${method} ${path}: ${String(e?.message ?? e)}`)
      if (String(e?.message ?? '').includes('connection')) resetPlatform()
      send(res, 500, { error: String(e?.message ?? e) })
    }
  })()
})

export function start (): void {
  if (platformCfg.email === '' || platformCfg.workspace === '') {
    log('INTEGRATIONS_EMAIL / INTEGRATIONS_PASSWORD / WORKSPACE are required; inbound endpoints will fail until set')
  }
  server.listen(PORT, () => {
    log(`integrations service on :${PORT} (inbound ${INBOUND_TOKEN !== '' ? 'on' : 'off'}, scim ${SCIM_TOKEN !== '' ? 'on' : 'off'})`)
  })
  scheduleDigest(async () => await getPlatform(platformCfg), {
    mailUrl: env.MAIL_URL,
    mailApiKey: env.MAIL_API_KEY,
    hour: Number(env.DIGEST_HOUR ?? 8),
    frontUrl: env.PUBLIC_FRONT_URL ?? platformCfg.url,
    workspace: platformCfg.workspace
  }, log)
}
