//
// Copyright © 2026 Qicky Globaltech Private Limited
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express as implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Clone an issue with its whole sub-issue tree. Fields, labels and
// relations come across; comments, attachments and history stay with the
// original, because a clone is a new piece of work, not a copy of a
// conversation.

import core, { generateId, SortingOrder, type DocData, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import tags from '@hcengineering/tags'
import { makeRank } from '@hcengineering/task'
import { type Issue, type IssueParentInfo, type Project } from '@hcengineering/tracker'
import { showPanel } from '@hcengineering/ui'
import view from '@hcengineering/view'

import tracker from './plugin'

async function cloneOne (
  src: Issue,
  project: Project,
  parent: { _id: Ref<Issue>, title: string, identifier: string, parents: IssueParentInfo[] } | undefined,
  titleSuffix: string,
  rankAfter: string | undefined
): Promise<Ref<Issue>> {
  const client = getClient()
  const inc = await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true)
  const number = (inc as any).object.sequence as number
  const identifier = `${project.identifier}-${number}`
  const _id = generateId<Issue>()
  const parents: IssueParentInfo[] =
    parent !== undefined ? [{ parentId: parent._id, parentTitle: parent.title, space: project._id, identifier: parent.identifier }, ...parent.parents] : []
  const value: DocData<Issue> = {
    title: src.title + titleSuffix,
    description: null,
    assignee: src.assignee,
    component: src.component,
    milestone: src.milestone,
    number,
    status: src.status,
    priority: src.priority,
    rank: makeRank(rankAfter, undefined),
    comments: 0,
    subIssues: 0,
    startDate: src.startDate,
    dueDate: src.dueDate,
    parents,
    reportedTime: 0,
    remainingTime: src.estimation,
    estimation: src.estimation,
    reports: 0,
    relations: src.relations ?? [],
    blockedBy: src.blockedBy ?? [],
    childInfo: [],
    kind: src.kind,
    identifier,
    storyPoints: src.storyPoints,
    sprint: src.sprint,
    externalLinks: src.externalLinks
  }
  await client.addCollection(
    tracker.class.Issue,
    project._id,
    parent?._id ?? tracker.ids.NoParent,
    tracker.class.Issue,
    'subIssues',
    value,
    _id
  )
  const labels = await client.findAll(tags.class.TagReference, { attachedTo: src._id })
  for (const l of labels) {
    await client.addCollection(tags.class.TagReference, project._id, _id, tracker.class.Issue, 'labels', { tag: l.tag, title: l.title, color: l.color })
  }
  const children = await client.findAll(tracker.class.Issue, { attachedTo: src._id }, { sort: { rank: SortingOrder.Ascending } })
  let last: string | undefined
  for (const c of children) {
    await cloneOne(c, project, { _id, title: value.title, identifier, parents }, '', last)
    last = undefined
  }
  return _id
}

/** Action: clone an issue together with its sub-issues. */
export async function cloneWithSubIssues (issue: Issue | Issue[] | undefined): Promise<void> {
  const src = Array.isArray(issue) ? issue[0] : issue
  if (src === undefined) return
  const client = getClient()
  const project = await client.findOne(tracker.class.Project, { _id: src.space })
  if (project === undefined) return
  const parent =
    src.attachedTo !== tracker.ids.NoParent ? await client.findOne(tracker.class.Issue, { _id: src.attachedTo as Ref<Issue> }) : undefined
  const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
  const id = await cloneOne(
    src,
    project,
    parent !== undefined ? { _id: parent._id, title: parent.title, identifier: parent.identifier, parents: parent.parents } : undefined,
    ' (copy)',
    last?.rank
  )
  showPanel(view.component.EditDoc, id, tracker.class.Issue, 'content')
}
