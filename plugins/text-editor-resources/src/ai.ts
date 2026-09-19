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

// AI writing inside the editor. Each action takes the selection (or, with
// nothing selected, the whole page), asks the configured open-source model,
// and writes the answer back: replacing the selection for rewrites, or
// inserting below it for summaries, outlines and action items. Everything
// stays editable afterwards; nothing is sent anywhere but the configured
// endpoint.

import { type Editor } from '@tiptap/core'
import { addNotification, getEventPositionElement, Menu, NotificationSeverity, showPopup, type Action } from '@hcengineering/ui'
import { aiAvailable, aiChat, AiError, aiLines, aiReachable } from '@hcengineering/presentation'
import { type ActionContext } from '@hcengineering/text-editor'
import { getEmbeddedLabel } from '@hcengineering/platform'
import AiNotification from './components/AiNotification.svelte'

const SYSTEM = 'You are a writing assistant inside a work platform. Answer with the rewritten or generated text only: no preamble, no explanations, no quotes around the answer, no markdown headings unless asked. Keep the language of the input unless asked to translate.'

interface Take {
  text: string
  from: number
  to: number
  whole: boolean
}

function take (editor: Editor): Take | undefined {
  const { from, to, empty } = editor.state.selection
  if (!empty) {
    const text = editor.state.doc.textBetween(from, to, '\n').trim()
    if (text !== '') return { text, from, to, whole: false }
  }
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n').trim()
  if (text === '') return undefined
  return { text, from: 0, to: editor.state.doc.content.size, whole: true }
}

function paragraphs (lines: string[]): any[] {
  return lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }))
}

function toast (title: string, message: string, severity: NotificationSeverity = NotificationSeverity.Info): void {
  addNotification(title, message, AiNotification as any, { message }, severity)
}

function fail (err: unknown): void {
  const e = err as AiError
  const kind = e?.kind ?? 'model'
  const title = kind === 'not-configured' ? 'No model configured' : kind === 'timeout' ? 'The model is slow' : kind === 'network' ? 'Model unreachable' : 'AI could not answer'
  toast(title, String(e?.message ?? err), NotificationSeverity.Error)
}

async function ask (editor: Editor, instruction: string, mode: 'replace' | 'below' | 'todos', opts: { maxTokens?: number, temperature?: number } = {}): Promise<void> {
  const t = take(editor)
  if (t === undefined) {
    toast('Nothing to work on', 'Select some text or write something first.')
    return
  }
  const limit = 12_000
  const input = t.text.length > limit ? t.text.slice(0, limit) : t.text
  toast('Thinking…', mode === 'replace' ? 'The selection is replaced when the model answers.' : 'The answer is inserted below the selection.')
  let answer: string
  try {
    answer = await aiChat([{ role: 'system', content: SYSTEM }, { role: 'user', content: `${instruction}\n\n---\n${input}` }], { maxTokens: opts.maxTokens ?? 800, temperature: opts.temperature })
  } catch (err) {
    fail(err)
    return
  }
  const lines = aiLines(answer)
  if (lines.length === 0) {
    fail(new AiError('The model returned an empty answer.', 'empty'))
    return
  }
  if (mode === 'replace') {
    editor.chain().focus().insertContentAt({ from: t.from, to: t.to }, paragraphs(lines)).run()
  } else if (mode === 'todos') {
    const list = { type: 'todoList', content: lines.map((l) => ({ type: 'todoItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: l }] }] })) }
    editor.chain().focus().insertContentAt(t.to, [{ type: 'paragraph', content: [{ type: 'text', text: 'Action items', marks: [{ type: 'bold' }] }] }, list]).run()
  } else {
    editor.chain().focus().insertContentAt(t.to, paragraphs(lines)).run()
  }
}

export async function aiImprove (editor: Editor): Promise<void> {
  await ask(editor, 'Improve the writing: fix grammar and spelling, make it clear and concise, keep the meaning, tone and formatting. Return the full improved text.', 'replace')
}
export async function aiRewrite (editor: Editor): Promise<void> {
  await ask(editor, 'Rewrite this text in different words with the same meaning. Return the full rewritten text.', 'replace', { temperature: 0.7 })
}
export async function aiShorten (editor: Editor): Promise<void> {
  await ask(editor, 'Make this text about half as long without losing the key points. Return the shortened text.', 'replace')
}
export async function aiExpand (editor: Editor): Promise<void> {
  await ask(editor, 'Expand this text with more detail, examples and explanation, keeping its structure. Return the expanded text.', 'replace', { maxTokens: 1200, temperature: 0.5 })
}
export async function aiFormal (editor: Editor): Promise<void> {
  await ask(editor, 'Rewrite this text in a professional, formal tone. Return the full text.', 'replace')
}
export async function aiCasual (editor: Editor): Promise<void> {
  await ask(editor, 'Rewrite this text in a friendly, casual tone. Return the full text.', 'replace', { temperature: 0.6 })
}
export async function aiSummarize (editor: Editor): Promise<void> {
  await ask(editor, 'Summarise this text in three to five short sentences a busy reader can skim.', 'below', { maxTokens: 400 })
}
export async function aiOutline (editor: Editor): Promise<void> {
  await ask(editor, 'Produce an outline for this text or topic: five to nine short headings, one per line, no numbering.', 'below', { maxTokens: 400 })
}
export async function aiActionItems (editor: Editor): Promise<void> {
  await ask(editor, 'Extract the action items from this text: one per line, each starting with a verb and naming who does it when that is stated. Only list actual actions; no headings, no commentary.', 'todos', { maxTokens: 500 })
}
export async function aiContinue (editor: Editor): Promise<void> {
  await ask(editor, 'Continue writing from where this text stops, in the same voice and format, for one or two paragraphs.', 'below', { maxTokens: 500, temperature: 0.7 })
}
export async function aiTranslate (editor: Editor): Promise<void> {
  const lang = window.prompt('Translate into which language?', 'English')
  if (lang === null || lang.trim() === '') return
  await ask(editor, `Translate this text into ${lang.trim()}. Return only the translation.`, 'replace', { maxTokens: 1200 })
}
export async function aiAsk (editor: Editor): Promise<void> {
  const q = window.prompt('Ask the model about this text', 'What are the main risks here?')
  if (q === null || q.trim() === '') return
  await ask(editor, `${q.trim()}\n\nAnswer in a few sentences based only on the text below.`, 'below', { maxTokens: 500 })
}

/** The toolbar's single AI entry: a menu with every writing action. */
export async function aiMenu (editor: Editor, event: MouseEvent): Promise<void> {
  const items: Array<[string, (e: Editor) => Promise<void>]> = [
    ['Improve writing', aiImprove], ['Rewrite', aiRewrite], ['Make shorter', aiShorten], ['Make longer', aiExpand],
    ['Formal tone', aiFormal], ['Casual tone', aiCasual], ['Summarise', aiSummarize], ['Outline', aiOutline],
    ['Action items', aiActionItems], ['Continue writing', aiContinue], ['Translate…', aiTranslate], ['Ask AI…', aiAsk]
  ]
  const actions: Action[] = items.map(([label, fn]) => ({ label: getEmbeddedLabel(label), action: async () => { await fn(editor) } }))
  showPopup(Menu, { actions }, getEventPositionElement(event))
}

/** Toolbar actions show only when a model is configured and the editor is editable. */
export async function isAiAvailable (editor: Editor, ctx: ActionContext): Promise<boolean> {
  return editor.isEditable && ctx.mode !== 'compact' && aiAvailable() && (await aiReachable())
}

/** Slash-command entries; ids are handled by handleAiCommand. */
export const AI_COMMANDS: Array<{ id: string, label: string }> = [
  { id: 'ai-summarize', label: 'AI: summarise' },
  { id: 'ai-outline', label: 'AI: outline' },
  { id: 'ai-action-items', label: 'AI: action items' },
  { id: 'ai-continue', label: 'AI: continue writing' },
  { id: 'ai-improve', label: 'AI: improve writing' }
]
export const aiCommandLabel = (id: string): ReturnType<typeof getEmbeddedLabel> => getEmbeddedLabel(AI_COMMANDS.find((c) => c.id === id)?.label ?? id)

export async function handleAiCommand (editor: Editor, id: string): Promise<boolean> {
  switch (id) {
    case 'ai-summarize': await aiSummarize(editor); return true
    case 'ai-outline': await aiOutline(editor); return true
    case 'ai-action-items': await aiActionItems(editor); return true
    case 'ai-continue': await aiContinue(editor); return true
    case 'ai-improve': await aiImprove(editor); return true
  }
  return false
}
