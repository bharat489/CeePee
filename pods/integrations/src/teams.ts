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

// Microsoft Teams "outgoing webhook" bot: @CeePee <command> in a channel
// posts here with an HMAC-SHA256 signature; the reply is a message with
// markdown. No Azure app registration needed.

import { createHmac, timingSafeEqual } from 'crypto'
import { type PlatformClient } from '@hcengineering/api-client'

import { lineOf, runChatCommand, type ChatContext, type ChatReply } from './commands'

export function verifyTeams (secretBase64: string, raw: string, authHeader: string): boolean {
  if (secretBase64 === '' || !authHeader.startsWith('HMAC ')) return false
  const expected = createHmac('sha256', Buffer.from(secretBase64, 'base64')).update(raw, 'utf8').digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(authHeader.slice(5).trim())
  return a.length === b.length && timingSafeEqual(a, b)
}

function stripHtml (s: string): string {
  return s.replace(/<at>[^<]*<\/at>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function markdown (r: ChatReply): string {
  const bold = (s: string): string => `**${s}**`
  const link = (url: string, label: string): string => `[${label}](${url})`
  const parts: string[] = []
  if (r.text !== '') parts.push(r.text)
  if (r.card !== undefined) {
    parts.push(lineOf(r.card, bold, link))
    if (r.card.moves.length > 0) parts.push(`Move with: ${r.card.moves.map((m) => `\`status ${r.card?.issue.identifier} ${m.name}\``).join(' · ')}`)
  }
  if (r.cards !== undefined) for (const c of r.cards) parts.push('- ' + lineOf(c, bold, link))
  return parts.join('\n\n')
}

/** POST /teams/webhook */
export async function handleTeams (c: PlatformClient, ctx: ChatContext, body: Record<string, any>): Promise<Record<string, unknown>> {
  const text = stripHtml(String(body.text ?? ''))
  const from = body.from as Record<string, any> | undefined
  const r = await runChatCommand(c, ctx, text, { name: from?.name, email: typeof from?.email === 'string' ? from.email : undefined })
  return { type: 'message', text: markdown(r) }
}
