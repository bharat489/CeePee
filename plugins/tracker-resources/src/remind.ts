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

import { type Issue } from '@hcengineering/tracker'
import { showPopup } from '@hcengineering/ui'

import RemindPopup from './components/notify/RemindPopup.svelte'

export async function remindMe (docs: Issue | Issue[] | undefined): Promise<void> {
  const issue = Array.isArray(docs) ? docs[0] : docs
  if (issue === undefined) return
  showPopup(RemindPopup, { issue }, 'top')
}
