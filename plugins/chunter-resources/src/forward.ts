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

import { type ChatMessage } from '@hcengineering/chunter'
import { showPopup } from '@hcengineering/ui'

import ForwardPopup from './components/ForwardPopup.svelte'

export async function forwardMessage (docs: ChatMessage | ChatMessage[] | undefined): Promise<void> {
  const message = Array.isArray(docs) ? docs[0] : docs
  if (message === undefined) return
  showPopup(ForwardPopup, { message }, 'top')
}
