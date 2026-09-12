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

// Actions on one or many selected issues: the bulk change wizard, archive, restore.

import { getClient } from '@hcengineering/presentation'
import { type Issue } from '@hcengineering/tracker'
import { showPopup } from '@hcengineering/ui'

import BulkChange from './components/issues/BulkChange.svelte'

const list = (docs: Issue | Issue[] | undefined): Issue[] => (Array.isArray(docs) ? docs : docs !== undefined ? [docs] : [])

export async function bulkChange (docs: Issue | Issue[] | undefined): Promise<void> {
  const issues = list(docs)
  if (issues.length === 0) return
  showPopup(BulkChange, { docs: issues }, 'top')
}

export async function archiveIssue (docs: Issue | Issue[] | undefined): Promise<void> {
  const client = getClient()
  for (const i of list(docs)) if (i.archived !== true) await client.update(i, { archived: true })
}

export async function unarchiveIssue (docs: Issue | Issue[] | undefined): Promise<void> {
  const client = getClient()
  for (const i of list(docs)) if (i.archived === true) await client.update(i, { archived: false })
}
