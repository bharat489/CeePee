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

// The integrations service: inbound webhooks, per-rule webhook triggers,
// the public customer portal, Jira Cloud API import, SCIM provisioning,
// the automation heartbeat and the daily digest -- one small Node process
// with no framework. It signs in to one workspace as a service account
// (INTEGRATIONS_EMAIL/PASSWORD) and authorises callers with static bearer
// tokens; the portal is public by design and rate-limited per address.

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { AccountRole } from '@hcengineering/core'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import tracker, { type AutomationRule } from '@hcengineering/tracker'

import { scheduleDigest } from './digest'
import { handleDeploy, handleEmail, handleGeneric, handleGit, handleSentry, type InboundConfig, type Result } from './inbound'
import { jobStatus, startJiraImport, type JiraImportRequest } from './jira'
import { getPlatform, heartbeat, resetPlatform, type PlatformConfig } from './platform'
import { portalArticle, portalHome, portalKb, portalOrg, portalRate, portalReply, portalStatus, portalSubmit, resolvePortal, type PortalConfig, type Result as PortalResult } from './portal'
import { scheduleSubscriptions } from './subscriptions'
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
const PUBLIC_URL = (env.PUBLIC_INTEGRATIONS_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const portalCfg: PortalConfig = {
  name: env.PORTAL_NAME ?? 'Help centre',
  color: env.PORTAL_COLOR ?? '#2b6bea',
  logoUrl: env.PORTAL_LOGO_URL ?? '',
  project: env.PORTAL_PROJECT ?? env.INBOUND_PROJECT ?? '',
  publicUrl: PUBLIC_URL,
  base: '/portal',
  welcome: env.PORTAL_WELCOME ?? ''
}
const PORTAL_ENABLED = (env.PORTAL_ENABLED ?? 'true') !== 'false'
const HEARTBEAT_MINUTES = Math.max(1, Number(env.HEARTBEAT_MINUTES ?? 5))

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

function cors (res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
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

function sendPortal (res: ServerResponse, r: PortalResult): void {
  if (r.status === 303 && (r as any).location !== undefined) {
    res.writeHead(303, { location: String((r as any).location) })
    res.end()
    return
  }
  if (r.html === true && typeof r.body === 'string') {
    res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(r.body), 'cache-control': 'no-store' })
    res.end(r.body)
    return
  }
  send(res, r.status, r.body)
}

// per-address limiter for the public surfaces: N requests per minute
const hits = new Map<string, { n: number, at: number }>()
function limited (req: IncomingMessage, perMinute: number): boolean {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim()
  const now = Date.now()
  const h = hits.get(ip)
  if (h === undefined || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now })
    if (hits.size > 5000) hits.clear()
    return false
  }
  h.n++
  return h.n > perMinute
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

async function platform (res: ServerResponse): Promise<Awaited<ReturnType<typeof getPlatform>> | undefined> {
  if (platformCfg.email === '' || platformCfg.password === '' || platformCfg.workspace === '') {
    send(res, 503, { error: 'integrations account not configured: set INTEGRATIONS_EMAIL, INTEGRATIONS_PASSWORD and WORKSPACE' })
    return undefined
  }
  try {
    return await getPlatform(platformCfg)
  } catch (e: any) {
    resetPlatform()
    send(res, 503, { error: 'workspace connection failed: ' + String(e?.message ?? e) })
    return undefined
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const method = (req.method ?? 'GET').toUpperCase()
    const wantsHtml = (req.headers.accept ?? '').includes('text/html')
    try {
      if (path === '/' && !PORTAL_ENABLED) {
        send(res, 200, { ok: true, service: 'ceepee-integrations' })
        return
      }
      if (path === '/health') {
        send(res, 200, { ok: true, service: 'ceepee-integrations', workspace: platformCfg.workspace, inbound: INBOUND_TOKEN !== '', scim: SCIM_TOKEN !== '', portal: PORTAL_ENABLED, heartbeatMinutes: HEARTBEAT_MINUTES })
        return
      }
      if (method === 'OPTIONS') {
        cors(res)
        send(res, 204, undefined)
        return
      }

      // ---- public customer portal (no login) -------------------------------
      if (path === '/' || path === '/portal' || path.startsWith('/portal/')) {
        if (!PORTAL_ENABLED) {
          send(res, 404, { error: 'portal disabled: set PORTAL_PROJECT' })
          return
        }
        if (limited(req, 60)) {
          send(res, 429, { error: 'too many requests' })
          return
        }
        cors(res)
        const c = await platform(res)
        if (c === undefined) return
        const parts = path === '/' || path === '/portal' ? [] : path.slice('/portal/'.length).split('/').filter((x) => x !== '')
        const KNOWN = ['kb', 'article', 'submit', 'status', 'rate', 'reply', 'org']
        const slug = parts.length > 0 && !KNOWN.includes(parts[0]) ? parts[0] : ''
        const rest = slug !== '' ? parts.slice(1) : parts
        const cfg = await resolvePortal(c, portalCfg, slug)
        if (cfg === undefined) {
          send(res, 404, { error: 'no such portal' })
          return
        }
        const sub = rest.join('/')
        let r: PortalResult
        if (sub === '') r = await portalHome(c, cfg, url.searchParams.get('q') ?? '')
        else if (sub === 'kb') r = await portalKb(c, url.searchParams.get('q') ?? '')
        else if (sub.startsWith('article/')) r = await portalArticle(c, cfg, decodeURIComponent(sub.slice('article/'.length)))
        else if (sub === 'submit' && method === 'POST') r = await portalSubmit(c, cfg, await readBody(req), wantsHtml)
        else if (sub === 'status') {
          const o = method === 'POST' ? await readBody(req) : {}
          r = await portalStatus(c, cfg, String(o.key ?? url.searchParams.get('key') ?? ''), String(o.email ?? url.searchParams.get('email') ?? ''), wantsHtml || method === 'GET')
        } else if (sub === 'reply' && method === 'POST') r = await portalReply(c, cfg, await readBody(req), wantsHtml)
        else if (sub === 'org') {
          const o = method === 'POST' ? await readBody(req) : {}
          r = await portalOrg(c, cfg, String(o.email ?? url.searchParams.get('email') ?? ''), wantsHtml || method === 'GET')
        } else if (sub === 'rate' && method === 'POST') r = await portalRate(c, cfg, await readBody(req), wantsHtml)
        else r = { status: 404, body: { error: 'not found' } }
        sendPortal(res, r)
        return
      }

      // ---- SCIM -----------------------------------------------------------------
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

      // ---- per-rule incoming webhooks: POST /inbound/rule/<ruleId>?token=<rule token>
      if (path.startsWith('/inbound/rule/')) {
        cors(res)
        if (method !== 'POST') {
          send(res, 405, { error: 'POST only' })
          return
        }
        if (limited(req, 120)) {
          send(res, 429, { error: 'too many requests' })
          return
        }
        const id = path.slice('/inbound/rule/'.length)
        const token = bearer(req, url.searchParams)
        const c = await platform(res)
        if (c === undefined) return
        const rule = await c.findOne(tracker.class.AutomationRule, { _id: id as AutomationRule['_id'] })
        if (rule === undefined || rule.trigger !== 'webhook' || rule.token === undefined || rule.token === '' || rule.token !== token) {
          send(res, 401, { error: 'unknown rule or invalid token' })
          return
        }
        if (!rule.enabled) {
          send(res, 200, { ok: true, skipped: 'rule disabled' })
          return
        }
        const payload = await readBody(req)
        const raw = JSON.stringify(payload)
        const lastPayload = raw.length > 20_000 ? { truncated: true, text: raw.slice(0, 20_000) } : payload
        await c.updateDoc(tracker.class.AutomationRule, rule.space, rule._id, { lastWebhook: Date.now(), lastPayload })
        log(`rule webhook ${rule.name} (${rule._id})`)
        send(res, 202, { ok: true, rule: rule.name })
        return
      }

      // ---- Jira Cloud API import -----------------------------------------------
      if (path === '/inbound/jira-import' || path.startsWith('/inbound/jira-import/')) {
        cors(res)
        if (INBOUND_TOKEN === '' || bearer(req, url.searchParams) !== INBOUND_TOKEN) {
          send(res, 401, { error: 'invalid token' })
          return
        }
        if (method === 'GET') {
          const id = path.slice('/inbound/jira-import/'.length)
          const s = jobStatus(id)
          send(res, s === undefined ? 404 : 200, s ?? { error: 'unknown job' })
          return
        }
        if (method !== 'POST') {
          send(res, 405, { error: 'POST only' })
          return
        }
        const body = await readBody(req)
        const reqd: JiraImportRequest = {
          baseUrl: String(body.baseUrl ?? '').replace(/\/$/, ''),
          email: String(body.email ?? ''),
          token: String(body.token ?? ''),
          jql: String(body.jql ?? ''),
          project: String(body.project ?? inboundCfg.defaultProject),
          attachments: body.attachments !== false,
          history: body.history !== false,
          comments: body.comments !== false,
          worklogs: body.worklogs !== false
        }
        if (reqd.baseUrl === '' || reqd.email === '' || reqd.token === '' || reqd.project === '') {
          send(res, 400, { error: 'baseUrl, email, token and project are required' })
          return
        }
        const c = await platform(res)
        if (c === undefined) return
        const s = startJiraImport(c, reqd, log)
        send(res, 202, s)
        return
      }

      // ---- inbound webhooks (shared token) --------------------------------------
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
        const c = await platform(res)
        if (c === undefined) return
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
            r = { status: 404, body: { error: 'unknown inbound kind', kinds: ['generic', 'email', 'sentry', 'github', 'gitlab', 'bitbucket', 'deploy', 'rule/<id>', 'jira-import'] } }
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
    log('INTEGRATIONS_EMAIL / INTEGRATIONS_PASSWORD / WORKSPACE are required; inbound endpoints, the portal and the heartbeat will fail until set')
  }
  server.listen(PORT, () => {
    log(`integrations service on :${PORT} (inbound ${INBOUND_TOKEN !== '' ? 'on' : 'off'}, scim ${SCIM_TOKEN !== '' ? 'on' : 'off'}, portal ${PORTAL_ENABLED ? PUBLIC_URL + '/portal' : 'off'}, heartbeat every ${HEARTBEAT_MINUTES}m)`)
  })
  scheduleDigest(async () => await getPlatform(platformCfg), {
    mailUrl: env.MAIL_URL,
    mailApiKey: env.MAIL_API_KEY,
    hour: Number(env.DIGEST_HOUR ?? 8),
    frontUrl: env.PUBLIC_FRONT_URL ?? platformCfg.url,
    workspace: platformCfg.workspace
  }, log)
  scheduleSubscriptions(async () => await getPlatform(platformCfg), {
    mailUrl: env.MAIL_URL,
    mailApiKey: env.MAIL_API_KEY,
    frontUrl: env.PUBLIC_FRONT_URL ?? platformCfg.url,
    workspace: platformCfg.workspace
  }, log)
  // the automation heartbeat: a tiny doc update the server trigger sees, so scheduled rules run without a client
  if (platformCfg.email !== '' && platformCfg.workspace !== '') {
    const beat = async (): Promise<void> => {
      try {
        await heartbeat(await getPlatform(platformCfg))
      } catch (e: any) {
        resetPlatform()
        log(`heartbeat failed: ${String(e?.message ?? e)}`)
      }
    }
    setTimeout(() => { void beat() }, 30_000)
    setInterval(() => { void beat() }, HEARTBEAT_MINUTES * 60_000)
  }
}
