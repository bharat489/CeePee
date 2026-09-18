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

// Emails to the customer behind a request: one when their request is created
// (portal, form, email-to-ticket -- anything that sets portalEmail), one when
// the team writes a customer-visible reply. Both use the workspace's email
// templates and need MAIL_URL on the transactor.

import core, { type Doc, type Ref, type Tx, type TxCreateDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import tracker, { type CustomerReply, type Issue, type Project } from '@hcengineering/tracker'

import { fill, templateFor } from './mailTemplates'
import { env, sendMail } from './rules'

function portalBase (project: Project | undefined): string {
  const root = env('PUBLIC_INTEGRATIONS_URL').replace(/\/$/, '')
  const base = root !== '' ? root : 'http://huly.local:8095'
  const slug = project?.portal?.enabled === true && project.portal.slug !== '' ? `/${project.portal.slug}` : ''
  return `${base}/portal${slug}`
}

export async function OnCustomerMail (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  if (env('MAIL_URL') === '') return []
  for (const tx of txes) {
    if (tx._class !== core.class.TxCreateDoc) continue
    const c = tx as TxCreateDoc<Doc>
    if (c.objectClass === tracker.class.Issue) {
      const attrs = c.attributes as Partial<Issue>
      const email = attrs.portalEmail
      if (email === undefined || !email.includes('@')) continue
      const tpl = await templateFor(control, 'portal-created')
      if (tpl === undefined) continue
      const project = (await control.findAll(control.ctx, tracker.class.Project, { _id: c.objectSpace as Ref<Project> }, { limit: 1 }))[0]
      const base = portalBase(project)
      const key = attrs.identifier ?? ''
      const vars = { key, title: attrs.title ?? '', name: '', portal: base, statusUrl: `${base}/status?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}` }
      sendMail([email], fill(tpl.subject, vars), fill(tpl.body, vars))
    } else if (c.objectClass === tracker.class.CustomerReply) {
      const attrs = c.attributes as Partial<CustomerReply> & { attachedTo?: Ref<Issue> }
      if (attrs.fromCustomer === true || attrs.attachedTo === undefined) continue
      const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: attrs.attachedTo }, { limit: 1 }))[0]
      const email = issue?.portalEmail
      if (issue === undefined || email === undefined || !email.includes('@')) continue
      const tpl = await templateFor(control, 'portal-reply')
      if (tpl === undefined) continue
      const project = (await control.findAll(control.ctx, tracker.class.Project, { _id: issue.space }, { limit: 1 }))[0]
      const base = portalBase(project)
      const vars = { key: issue.identifier, title: issue.title, author: attrs.author !== undefined && attrs.author !== '' ? attrs.author : 'Support', text: attrs.text ?? '', statusUrl: `${base}/status?key=${encodeURIComponent(issue.identifier)}&email=${encodeURIComponent(email)}` }
      sendMail([email], fill(tpl.subject, vars), fill(tpl.body, vars))
    }
  }
  return []
}
