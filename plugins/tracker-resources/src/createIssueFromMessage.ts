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

import { type ChatMessage } from '@hcengineering/chunter'
import { type Doc } from '@hcengineering/core'
import { markupToText } from '@hcengineering/text'
import { showPopup } from '@hcengineering/ui'

import CreateIssue from './components/CreateIssue.svelte'

// The message becomes the issue's first draft, not a link to it. The decision
// history therefore stays attached to the work rather than living in a chat
// scroll the ticket cannot see -- which is the failure every "create Jira
// issue from Slack" integration has, because those paste a permalink.

const TITLE_MAX = 120

/** First line of the message, trimmed to a sane title length. */
function titleFrom (message: ChatMessage): string {
  const text = markupToText(message.message).trim()
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  return firstLine.length > TITLE_MAX ? firstLine.slice(0, TITLE_MAX - 1) + '…' : firstLine
}

/**
 * Open the issue dialog pre-filled from a chat message.
 *
 * The full message markup goes into the description; the first line becomes
 * the title; and the message is linked as a relation so the issue can be
 * traced back to where it was raised. Drafts are disabled for this dialog so
 * a stale unsaved draft never overrides the message content.
 */
export async function createIssueFromMessage (doc: Doc | Doc[], evt?: Event): Promise<void> {
  const message = (Array.isArray(doc) ? doc[0] : doc) as ChatMessage | undefined
  if (message === undefined) return
  evt?.preventDefault()

  showPopup(CreateIssue, {
    space: undefined,
    relatedTo: message,
    title: titleFrom(message),
    description: message.message,
    shouldSaveDraft: false
  })
}
