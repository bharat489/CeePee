<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
-->
<script lang="ts">
  import { generateId } from '@hcengineering/core'
  import { Document, DocumentSnapshot } from '@hcengineering/document'
  import { Card, createMarkup, getClient, getMarkup } from '@hcengineering/presentation'
  import { EditBox } from '@hcengineering/ui'
  import document from '../plugin'

  export let doc: Document

  const client = getClient()

  let name = ''

  // A version is a copy of the document's collaborative body under its own id,
  // attached to the document so the history panel can list, compare and restore it.
  async function create (): Promise<void> {
    const id = generateId<DocumentSnapshot>()
    const markup = await getMarkup({ objectClass: doc._class, objectId: doc._id, objectAttr: 'content' }, doc.content)
    const content = await createMarkup(
      { objectClass: document.class.DocumentSnapshot, objectId: id, objectAttr: 'content' },
      markup
    )
    await client.addCollection(
      document.class.DocumentSnapshot,
      doc.space,
      doc._id,
      doc._class,
      'snapshots',
      { title: name.trim(), content, parent: doc.parent },
      id
    )
  }
</script>

<Card label={document.string.Snapshot} okAction={create} canSave={name.trim().length > 0} on:close>
  <div class="flex-row-center clear-mins">
    <EditBox placeholder={document.string.Name} bind:value={name} kind={'large-style'} autoFocus />
  </div>
</Card>
