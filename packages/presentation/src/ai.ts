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

// The one door to the language model. CeePee talks to any OpenAI-compatible
// chat endpoint (Ollama in the stack by default, or anything else set as
// AI_CHAT_URL); nothing here needs a key. Every feature that writes,
// summarises, translates or extracts goes through aiChat so limits, errors
// and the "no model configured" state are handled in one place.

export interface AiConfig {
  url: string
  model: string
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiOptions {
  /** upper bound on the answer length, in tokens */
  maxTokens?: number
  /** 0 = deterministic; defaults to 0.3 */
  temperature?: number
  /** milliseconds before giving up; defaults to 90 s (small models on CPU are slow) */
  timeoutMs?: number
}

export class AiError extends Error {
  constructor (message: string, readonly kind: 'not-configured' | 'network' | 'model' | 'timeout' | 'empty') {
    super(message)
  }
}

export function aiConfig (): AiConfig {
  const c = typeof window !== 'undefined' ? (window as any).CEEPEE_AI : undefined
  return { url: String(c?.url ?? '').replace(/\/$/, ''), model: String(c?.model ?? '') }
}

/** Is a model endpoint configured for this deployment? */
export function aiAvailable (): boolean {
  return aiConfig().url !== ''
}

/** One chat completion; resolves to the assistant's text. */
export async function aiChat (messages: AiMessage[], opts: AiOptions = {}): Promise<string> {
  const cfg = aiConfig()
  if (cfg.url === '') throw new AiError('No model is configured. Set AI_CHAT_URL to an OpenAI-compatible endpoint such as Ollama.', 'not-configured')
  const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined
  const timer = setTimeout(() => ctrl?.abort(), opts.timeoutMs ?? 90_000)
  try {
    let res: Response
    try {
      res = await fetch(`${cfg.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model !== '' ? cfg.model : 'llama3.2', stream: false, temperature: opts.temperature ?? 0.3, ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}), messages }),
        signal: ctrl?.signal
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new AiError('The model took too long to answer.', 'timeout')
      throw new AiError(`Could not reach the model at ${cfg.url}.`, 'network')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AiError(`The model answered HTTP ${res.status}${body !== '' ? `: ${body.slice(0, 200)}` : ''}`, 'model')
    }
    const json = await res.json()
    const text = String(json?.choices?.[0]?.message?.content ?? '').trim()
    if (text === '') throw new AiError('The model returned an empty answer.', 'empty')
    return text
  } finally {
    clearTimeout(timer)
  }
}

/** A quick reachability probe for settings pages and health checks. */
export async function aiPing (timeoutMs = 5000): Promise<{ ok: boolean, models?: string[], error?: string }> {
  const cfg = aiConfig()
  if (cfg.url === '') return { ok: false, error: 'not configured' }
  const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs)
  try {
    const res = await fetch(`${cfg.url}/v1/models`, { signal: ctrl?.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = await res.json().catch(() => ({}))
    const models = Array.isArray(json?.data) ? json.data.map((m: any) => String(m.id)) : []
    return { ok: true, models }
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

/** Split a model answer into trimmed non-empty lines, dropping list bullets and numbering. */
export function aiLines (text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l !== '')
}
