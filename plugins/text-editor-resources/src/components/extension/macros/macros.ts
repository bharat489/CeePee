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

// Client side of the dynamic blocks: node views that render live content, and
// the commands the slash menu calls. The schema is shared with the server
// (see @hcengineering/text nodes/macros.ts).

import type { Class, Doc, Ref, Space } from '@hcengineering/core'
import {
  ChildPagesNode,
  DateChipNode,
  IssueListNode,
  StatusChipNode,
  TocNode,
  type IssueListSort,
  type IssueListStatus,
  type StatusChipColor
} from '@hcengineering/text'
import { Extension } from '@tiptap/core'

import { SvelteNodeViewRenderer } from '../../node-view'
import ChildPagesNodeView from './ChildPagesNodeView.svelte'
import DateChipNodeView from './DateChipNodeView.svelte'
import IssueListNodeView from './IssueListNodeView.svelte'
import StatusChipNodeView from './StatusChipNodeView.svelte'
import TocNodeView from './TocNodeView.svelte'

/** Where the editor lives: the document a child-pages block lists under. */
export interface MacroContext {
  objectId?: Ref<Doc>
  objectClass?: Ref<Class<Doc>>
  objectSpace?: Ref<Space>
}

export interface MacrosOptions {
  context?: MacroContext
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ceepeeMacros: {
      insertIssueList: (attrs?: { project?: string, projectName?: string, status?: IssueListStatus, sort?: IssueListSort, limit?: number }) => ReturnType
      insertChildPages: () => ReturnType
      insertTableOfContents: () => ReturnType
      insertStatusChip: (attrs?: { text?: string, color?: StatusChipColor }) => ReturnType
      insertDateChip: (date?: number) => ReturnType
    }
  }
}

export const IssueListExtension = IssueListNode.extend({
  addCommands () {
    return {
      insertIssueList:
        (attrs = {}) =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs })
    }
  },
  addNodeView () {
    return SvelteNodeViewRenderer(IssueListNodeView, {})
  }
})

export const ChildPagesExtension = ChildPagesNode.extend<MacrosOptions>({
  addOptions () {
    return { context: undefined }
  },
  addCommands () {
    return {
      insertChildPages:
        () =>
          ({ commands }) =>
            commands.insertContent({ type: this.name })
    }
  },
  addNodeView () {
    return SvelteNodeViewRenderer(ChildPagesNodeView, { componentProps: { context: this.options.context } })
  }
})

export const TocExtension = TocNode.extend({
  addCommands () {
    return {
      insertTableOfContents:
        () =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs: { depth: 3 } })
    }
  },
  addNodeView () {
    return SvelteNodeViewRenderer(TocNodeView, {})
  }
})

export const StatusChipExtension = StatusChipNode.extend({
  addCommands () {
    return {
      insertStatusChip:
        (attrs = {}) =>
          ({ commands }) =>
            commands.insertContent([{ type: this.name, attrs: { text: 'STATUS', color: 'grey', ...attrs } }, { type: 'text', text: ' ' }])
    }
  },
  addNodeView () {
    return SvelteNodeViewRenderer(StatusChipNodeView, {})
  }
})

export const DateChipExtension = DateChipNode.extend({
  addCommands () {
    return {
      insertDateChip:
        (date) =>
          ({ commands }) =>
            commands.insertContent([{ type: this.name, attrs: { date: date ?? Date.now() } }, { type: 'text', text: ' ' }])
    }
  },
  addNodeView () {
    return SvelteNodeViewRenderer(DateChipNodeView, {})
  }
})

/** All dynamic blocks as one extension, for the editor kit. */
export const MacrosExtension = Extension.create<MacrosOptions>({
  name: 'ceepeeMacros',

  addOptions () {
    return { context: undefined }
  },

  addExtensions () {
    return [
      IssueListExtension,
      ChildPagesExtension.configure({ context: this.options.context }),
      TocExtension,
      StatusChipExtension,
      DateChipExtension
    ]
  }
})
