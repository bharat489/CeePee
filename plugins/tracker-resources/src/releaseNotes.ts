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

import { type Milestone } from '@hcengineering/tracker'
import { showPopup } from '@hcengineering/ui'

import ReleaseNotesPopup from './components/milestones/ReleaseNotesPopup.svelte'

/** Action: generate release notes for a milestone. */
export async function releaseNotes (milestone: Milestone | Milestone[] | undefined): Promise<void> {
  const m = Array.isArray(milestone) ? milestone[0] : milestone
  if (m === undefined) return
  showPopup(ReleaseNotesPopup, { milestone: m }, 'top')
}
