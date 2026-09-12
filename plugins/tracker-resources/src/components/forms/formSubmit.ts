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

// Turn form answers into an issue: mapped fields set attributes, the rest
// become "Label: answer" lines in the description.

import contact, { formatName, type Person } from '@hcengineering/contact'
import { SocialIdType, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import tags from '@hcengineering/tags'
import { IssuePriority, type Issue, type IssueForm, type Project } from '@hcengineering/tracker'

import tracker from '../../plugin'
import { buildMapping, Importer, PRIORITY_WORDS } from '../import/common'

export type Answers = Record<string, string | string[] | boolean | number | undefined>

export function validate (form: IssueForm, a: Answers): string[] {
  const errors: string[] = []
  for (const f of form.fields) {
    const v = a[f.key]
    const empty = v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)
    if (f.required === true && empty) errors.push(`${f.label} is required`)
    if (f.type === 'email' && typeof v === 'string' && v !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push(`${f.label} must be an email address`)
    if (f.type === 'url' && typeof v === 'string' && v !== '' && !/^https?:\/\//i.test(v)) errors.push(`${f.label} must start with http:// or https://`)
  }
  return errors
}

export async function submitForm (form: IssueForm, a: Answers, project: Project): Promise<Issue | undefined> {
  const client = getClient()
  const m = await buildMapping(project)
  const imp = new Importer(m)
  const text = (v: Answers[string]): string => (Array.isArray(v) ? v.join(', ') : v === true ? 'yes' : v === false ? 'no' : v === undefined ? '' : String(v))
  let title = ''
  const lines: string[] = []
  const extra: Record<string, unknown> = {}
  let priority: IssuePriority | undefined
  let assignee: Ref<Person> | null | undefined
  let dueDate: number | undefined
  const labels: string[] = []
  for (const f of form.fields) {
    const v = a[f.key]
    const t = text(v)
    if (t === '') continue
    switch (f.mapTo) {
      case 'title':
        title = t
        break
      case 'description':
        lines.push(t)
        break
      case 'priority':
        priority = PRIORITY_WORDS[t.toLowerCase()] ?? (Number.isNaN(Number(t)) ? undefined : (Number(t) as IssuePriority))
        break
      case 'assignee':
        assignee = m.personFor(t)
        break
      case 'dueDate':
        dueDate = Number.isNaN(Date.parse(t)) ? undefined : Date.parse(t)
        break
      case 'labels':
        labels.push(...(Array.isArray(v) ? v : t.split(',')).map((x) => String(x).trim()).filter((x) => x !== ''))
        break
      case 'estimation':
        extra.estimation = Number(t) || 0
        break
      case 'severity':
        extra.severity = Math.min(4, Math.max(1, Number(t) || 3))
        break
      case 'risk':
        extra.risk = ['low', 'medium', 'high'].includes(t.toLowerCase()) ? t.toLowerCase() : 'medium'
        break
      case 'portalEmail':
        extra.portalEmail = t
        break
      case 'component':
      case 'milestone':
      default:
        lines.push(`${f.label}: ${t}`)
    }
  }
  if (title === '') title = `${form.name} · ${new Date().toLocaleDateString()}`
  const created = await imp.create({ title, description: lines, priority, assignee: assignee ?? null, dueDate, labels: [...labels, `form: ${form.slug}`] }, `form "${form.name}"`)
  const issue = await client.findOne(tracker.class.Issue, { _id: created._id })
  if (issue === undefined) return undefined
  const ops: Record<string, unknown> = { ...extra }
  if (form.requestType != null) ops.requestType = form.requestType
  if (Object.keys(ops).length > 0) await client.update(issue, ops as any)
  await client.update(form, { submissions: (form.submissions ?? 0) + 1 })
  void tags
  void contact
  void formatName
  void SocialIdType
  return issue
}
