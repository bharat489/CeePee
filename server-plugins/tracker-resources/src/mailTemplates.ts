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

// Outgoing email templates: a workspace can override the subject and body of
// each kind under Settings → Email templates. Placeholders are {name} tokens.

import { type TriggerControl } from '@hcengineering/server-core'
import tracker, { type EmailTemplate, type EmailTemplateKind } from '@hcengineering/tracker'

export const DEFAULT_TEMPLATES: Record<EmailTemplateKind, { subject: string, body: string }> = {
  'portal-created': {
    subject: '[{key}] We received your request: {title}',
    body: 'Hi{name},\n\nThanks for getting in touch. Your request {key} "{title}" is with the team.\n\nFollow progress and reply to us here:\n{statusUrl}\n\n{portal}'
  },
  'portal-reply': {
    subject: '[{key}] New reply from {author}',
    body: '{author} wrote on {key} "{title}":\n\n{text}\n\nReply or check progress here:\n{statusUrl}'
  },
  digest: {
    subject: 'Your day in {workspace}: {count} open, {due} due soon',
    body: 'Good morning. {count} open issue(s) assigned to you.'
  },
  rule: {
    subject: '{identifier} {title}',
    body: '{identifier} {title}\n{status} · {priority}\n{url}'
  }
}

/** Replace {token}s; unknown tokens are left as they are. */
export function fill (s: string, vars: Record<string, string | number | undefined>): string {
  return s.replace(/\{([a-zA-Z]+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k])))
}

/** The template to use for a kind: the workspace's override when present and enabled, the default otherwise, undefined when switched off. */
export async function templateFor (control: TriggerControl, kind: EmailTemplateKind): Promise<{ subject: string, body: string } | undefined> {
  const cached = control.cache.get(`mail-template-${kind}`) as { at: number, tpl: { subject: string, body: string } | undefined } | undefined
  if (cached !== undefined && Date.now() - cached.at < 60_000) return cached.tpl
  const own = (await control.findAll(control.ctx, tracker.class.EmailTemplate, { kind }, { limit: 1 }))[0] as EmailTemplate | undefined
  let tpl: { subject: string, body: string } | undefined
  if (own === undefined) tpl = DEFAULT_TEMPLATES[kind]
  else if (!own.enabled) tpl = undefined
  else tpl = { subject: own.subject.trim() !== '' ? own.subject : DEFAULT_TEMPLATES[kind].subject, body: own.body.trim() !== '' ? own.body : DEFAULT_TEMPLATES[kind].body }
  control.cache.set(`mail-template-${kind}`, { at: Date.now(), tpl })
  return tpl
}
