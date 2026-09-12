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

// Slack app: slash command, @mentions, link unfurls with buttons, button
// interactions. Requests are verified with the app's signing secret.

import { createHmac, timingSafeEqual } from 'crypto'
import { type PlatformClient } from '@hcengineering/api-client'

import { cardOf, runChatCommand, type ChatContext, type ChatReply, type ChatUser, type IssueCard } from './commands'
import { findIssue } from './platform'
import tracker from '@hcengineering/tracker'
import { type Ref } from '@hcengineering/core'
import { type IssueStatus } from '@hcengineering/tracker'

export interface SlackConfig extends ChatContext {
  signingSecret: string
  botToken: string
}

export function verifySlack (secret: string, timestamp: string, raw: string, signature: string): boolean {
  if (secret === '' || timestamp === '' || signature === '') return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function api (cfg: SlackConfig, method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (cfg.botToken === '') return { ok: false, error: 'no bot token' }
  const r = await fetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${cfg.botToken}` }, body: JSON.stringify(body) })
  return (await r.json()) as Record<string, unknown>
}

const userCache = new Map<string, ChatUser>()
async function slackUser (cfg: SlackConfig, id: string | undefined): Promise<ChatUser> {
  if (id === undefined || id === '') return {}
  const hit = userCache.get(id)
  if (hit !== undefined) return hit
  let u: ChatUser = {}
  try {
    const r = await api(cfg, 'users.info', { user: id })
    const user = r.user as Record<string, any> | undefined
    u = { email: user?.profile?.email, name: user?.real_name ?? user?.name }
  } catch {}
  userCache.set(id, u)
  return u
}

const PRIO = ['none', 'urgent', 'high', 'medium', 'low']
function cardBlocks (card: IssueCard, withButtons = true): unknown[] {
  const i = card.issue
  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `<${card.url}|*${i.identifier}*> ${escapeMd(i.title)}\n${card.status} · ${card.assignee} · ${PRIO[i.priority] ?? ''}${i.dueDate != null ? ` · due ${new Date(i.dueDate).toLocaleDateString()}` : ''}` } }
  ]
  if (withButtons) {
    const elements: unknown[] = [{ type: 'button', text: { type: 'plain_text', text: 'Assign to me' }, action_id: 'assign_me', value: i._id }]
    for (const m of card.moves) elements.push({ type: 'button', text: { type: 'plain_text', text: m.name }, action_id: `set_status:${m._id}`, value: `${i._id}|${m._id}` })
    blocks.push({ type: 'actions', elements: elements.slice(0, 5) })
  }
  return blocks
}
function escapeMd (s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function replyBody (r: ChatReply): Record<string, unknown> {
  const blocks: unknown[] = []
  if (r.text !== '') blocks.push({ type: 'section', text: { type: 'mrkdwn', text: r.text } })
  if (r.card !== undefined) blocks.push(...cardBlocks(r.card))
  if (r.cards !== undefined) for (const c of r.cards) blocks.push(...cardBlocks(c, false))
  return { response_type: r.ephemeral === true ? 'ephemeral' : 'in_channel', text: r.text !== '' ? r.text : r.card !== undefined ? `${r.card.issue.identifier} ${r.card.issue.title}` : 'CeePee', blocks }
}

/** POST /slack/commands (application/x-www-form-urlencoded) */
export async function handleSlackCommand (c: PlatformClient, cfg: SlackConfig, params: URLSearchParams): Promise<Record<string, unknown>> {
  const user = await slackUser(cfg, params.get('user_id') ?? undefined)
  const r = await runChatCommand(c, cfg, params.get('text') ?? '', { ...user, name: user.name ?? params.get('user_name') ?? undefined })
  return replyBody(r)
}

/** POST /slack/events (JSON) */
export async function handleSlackEvent (c: PlatformClient, cfg: SlackConfig, body: Record<string, any>, log: (m: string) => void): Promise<Record<string, unknown>> {
  if (body.type === 'url_verification') return { challenge: body.challenge }
  const ev = body.event as Record<string, any> | undefined
  if (body.type !== 'event_callback' || ev === undefined) return { ok: true }
  // answer fast; Slack retries after 3 s
  void (async () => {
    try {
      if (ev.type === 'link_shared') {
        const unfurls: Record<string, unknown> = {}
        for (const l of (ev.links as Array<{ url: string }> | undefined) ?? []) {
          const m = /\/tracker\/([A-Z][A-Z0-9]{1,9}-\d+)/i.exec(l.url)
          if (m === null) continue
          const issue = await findIssue(c, m[1].toUpperCase())
          if (issue === undefined) continue
          unfurls[l.url] = { blocks: cardBlocks(await cardOf(c, cfg, issue)) }
        }
        if (Object.keys(unfurls).length > 0) await api(cfg, 'chat.unfurl', { channel: ev.channel, ts: ev.message_ts, unfurls })
      } else if (ev.type === 'app_mention') {
        const text = String(ev.text ?? '').replace(/<@[A-Z0-9]+>/g, '').trim()
        const user = await slackUser(cfg, ev.user)
        const r = await runChatCommand(c, cfg, text, user)
        const b = replyBody(r)
        await api(cfg, 'chat.postMessage', { channel: ev.channel, thread_ts: ev.thread_ts ?? ev.ts, text: b.text, blocks: b.blocks })
      }
    } catch (e: any) {
      log(`slack event failed: ${String(e?.message ?? e)}`)
    }
  })()
  return { ok: true }
}

/** POST /slack/interactions (payload=<json>) */
export async function handleSlackInteraction (c: PlatformClient, cfg: SlackConfig, payload: Record<string, any>, log: (m: string) => void): Promise<Record<string, unknown>> {
  if (payload.type !== 'block_actions') return {}
  const user = await slackUser(cfg, payload.user?.id)
  const action = (payload.actions as Array<Record<string, any>> | undefined)?.[0]
  if (action === undefined) return {}
  let reply: ChatReply
  try {
    if (action.action_id === 'assign_me') {
      const issue = await c.findOne(tracker.class.Issue, { _id: String(action.value) as any })
      reply = issue === undefined ? { text: 'Issue not found.', ephemeral: true } : await runChatCommand(c, cfg, `assign ${issue.identifier} me`, user)
    } else if (String(action.action_id).startsWith('set_status:')) {
      const [issueId, statusId] = String(action.value).split('|')
      const issue = await c.findOne(tracker.class.Issue, { _id: issueId as any })
      const st = await c.findOne(tracker.class.IssueStatus, { _id: statusId as Ref<IssueStatus> })
      reply = issue === undefined || st === undefined ? { text: 'Issue not found.', ephemeral: true } : await runChatCommand(c, cfg, `status ${issue.identifier} ${st.name}`, user)
    } else return {}
  } catch (e: any) {
    reply = { text: String(e?.message ?? e), ephemeral: true }
  }
  if (typeof payload.response_url === 'string') {
    const b = replyBody(reply)
    void fetch(payload.response_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...b, replace_original: reply.card !== undefined, response_type: reply.ephemeral === true ? 'ephemeral' : 'in_channel' }) }).catch((e) => { log(`slack response_url failed: ${String(e)}`) })
  }
  return {}
}
