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

// Create an issue outside the create dialog (service desk, importers, rules
// previews): numbering, rank, parents and description markup in one place.

import core, { generateId, makeCollabId, SortingOrder, type DocData, type Ref } from '@hcengineering/core'
import { createMarkup, getClient } from '@hcengineering/presentation'
import { makeRank } from '@hcengineering/task'
import { jsonToMarkup, type MarkupNode } from '@hcengineering/text'
import { IssuePriority, type Issue, type IssueParentInfo, type IssueStatus, type Project } from '@hcengineering/tracker'

import tracker from './plugin'

export function paragraphs (text: string): MarkupNode[] {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }) as unknown as MarkupNode)
}

export interface NewIssue extends Partial<DocData<Issue>> {
  title: string
  status: Ref<IssueStatus>
  kind: Issue['kind']
}

export async function createIssueDoc (project: Project, data: NewIssue, descriptionText?: string, parent?: Issue): Promise<Ref<Issue>> {
  const client = getClient()
  const inc = await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true)
  const number = (inc as any).object.sequence as number
  const identifier = `${project.identifier}-${number}`
  const _id = generateId<Issue>()
  const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
  const parents: IssueParentInfo[] =
    parent !== undefined ? [{ parentId: parent._id, parentTitle: parent.title, space: project._id, identifier: parent.identifier }, ...parent.parents] : []
  let description = null
  if (descriptionText !== undefined && descriptionText.trim() !== '') {
    const node = { type: 'doc', content: paragraphs(descriptionText) } as unknown as MarkupNode
    description = await createMarkup(makeCollabId(tracker.class.Issue, _id, 'description'), jsonToMarkup(node))
  }
  const value: DocData<Issue> = {
    description,
    assignee: null,
    component: null,
    milestone: null,
    number,
    priority: IssuePriority.NoPriority,
    rank: makeRank(last?.rank, undefined),
    comments: 0,
    subIssues: 0,
    startDate: null,
    dueDate: null,
    parents,
    reportedTime: 0,
    remainingTime: 0,
    estimation: 0,
    reports: 0,
    relations: [],
    blockedBy: [],
    childInfo: [],
    identifier,
    ...data
  }
  await client.addCollection(tracker.class.Issue, project._id, parent?._id ?? tracker.ids.NoParent, tracker.class.Issue, 'subIssues', value, _id)
  return _id
}
