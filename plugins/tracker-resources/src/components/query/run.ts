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

// Browser-side wrapper over the shared query runner: the current client and
// the current user, with the context cached for a minute.

import { getCurrentEmployee } from '@hcengineering/contact'
import { getCurrentAccount } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import { buildQueryContext, loadAuxWith, runQueryWith, type Aux, type Issue, type QueryContext } from '@hcengineering/tracker'

let cached: { at: number, ctx: QueryContext } | undefined

export async function loadQueryContext (): Promise<QueryContext> {
  if (cached !== undefined && Date.now() - cached.at < 60_000) return cached.ctx
  const ctx = await buildQueryContext(getClient(), { me: getCurrentEmployee(), socialIds: getCurrentAccount().socialIds })
  cached = { at: Date.now(), ctx }
  return ctx
}

export async function loadAux (issues: Issue[], needLabels: boolean, historyFields: Set<string>): Promise<Aux> {
  return await loadAuxWith(getClient(), issues, needLabels, historyFields)
}

export async function runQuery (text: string, limit = 500): Promise<{ issues: Issue[], errors: string[] }> {
  return await runQueryWith(getClient(), await loadQueryContext(), text, limit, { me: getCurrentEmployee(), socialIds: getCurrentAccount().socialIds, uuid: getCurrentAccount().uuid })
}
