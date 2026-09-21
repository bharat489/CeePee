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

// Client side of the structural blocks: node views, commands and input rules for
// callouts, toggles, columns and synced blocks. The schema itself is shared with
// the server (see @hcengineering/text nodes/blocks.ts).

import {
  CALLOUT_KINDS,
  CalloutNode,
  ColumnListNode,
  ColumnNode,
  DetailsContentNode,
  DetailsNode,
  DetailsSummaryNode,
  SyncedBlockNode,
  type CalloutKind
} from '@hcengineering/text'
import { Extension, InputRule } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { Doc as YDoc } from 'yjs'

import { SvelteNodeViewRenderer } from '../../node-view'
import CalloutNodeView from './CalloutNodeView.svelte'
import DetailsNodeView from './DetailsNodeView.svelte'
import SyncedBlockNodeView from './SyncedBlockNodeView.svelte'

/** What a synced block needs from its host: the source document's live session. */
export interface SyncedSource {
  ydoc: YDoc
  loaded: Promise<void>
}
export type OpenSyncedSource = (sourceId: string, sourceClass: string, content: string | null) => SyncedSource

export interface SyncedBlockOptions {
  openSource?: OpenSyncedSource
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ceepeeBlocks: {
      setCallout: (kind?: CalloutKind) => ReturnType
      setCalloutKind: (kind: CalloutKind) => ReturnType
      setDetails: () => ReturnType
      setColumns: (count?: number) => ReturnType
      setSyncedBlock: (attrs: { sourceId: string, sourceClass: string, title: string }) => ReturnType
    }
  }
}

export const CalloutExtension = CalloutNode.extend({
  addCommands () {
    return {
      setCallout:
        (kind = 'info') =>
          ({ commands, state }) => {
            const { $from } = state.selection
            const text = $from.parent.textContent
            if ($from.parent.type.name === 'paragraph' && text === '') {
              return commands.insertContent({ type: this.name, attrs: { kind }, content: [{ type: 'paragraph' }] })
            }
            return commands.wrapIn(this.name, { kind })
          },
      setCalloutKind:
        (kind) =>
          ({ commands }) =>
            commands.updateAttributes(this.name, { kind })
    }
  },

  addInputRules () {
    // ":::tip " at the start of an empty paragraph opens a callout of that kind
    return [
      new InputRule({
        find: new RegExp(`^:::(${CALLOUT_KINDS.join('|')})?\\s$`),
        handler: ({ range, match, chain }) => {
          const kind = (match[1] as CalloutKind | undefined) ?? 'info'
          chain().deleteRange(range).setCallout(kind).run()
        }
      })
    ]
  },

  addNodeView () {
    return SvelteNodeViewRenderer(CalloutNodeView, { contentAs: 'div', contentClass: 'callout-body' })
  }
})

export const DetailsExtension = DetailsNode.extend({
  addCommands () {
    return {
      setDetails:
        () =>
          ({ chain }) =>
            chain()
              .insertContent({
                type: this.name,
                attrs: { open: true },
                content: [
                  { type: 'detailsSummary' },
                  { type: 'detailsContent', content: [{ type: 'paragraph' }] }
                ]
              })
              // insertContent leaves the cursor in the body; typing should start in the summary
              .command(({ tr, dispatch }) => {
                const $from = tr.selection.$from
                for (let d = $from.depth; d > 0; d--) {
                  if ($from.node(d).type.name === this.name) {
                    if (dispatch !== undefined) tr.setSelection(TextSelection.create(tr.doc, $from.before(d) + 2))
                    return true
                  }
                }
                return true
              })
              .run()
    }
  },

  addInputRules () {
    // "> " already makes a quote; ">> " makes a toggle
    return [
      new InputRule({
        find: /^>>\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setDetails().run()
        }
      })
    ]
  },

  addKeyboardShortcuts () {
    return {
      // Enter on the summary moves into the body instead of splitting the summary
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection
        if ($from.parent.type.name !== 'detailsSummary') return false
        const details = $from.node(-1)
        if (details?.type.name !== 'details') return false
        const start = $from.before(-1)
        const summaryEnd = start + 1 + details.firstChild!.nodeSize
        editor.commands.updateAttributes('details', { open: true })
        return editor.commands.focus(summaryEnd + 2)
      }
    }
  },

  addNodeView () {
    return SvelteNodeViewRenderer(DetailsNodeView, { contentAs: 'div', contentClass: 'details-body' })
  }
})

export const DetailsSummaryExtension = DetailsSummaryNode.extend({})
export const DetailsContentExtension = DetailsContentNode.extend({})

export const ColumnListExtension = ColumnListNode.extend({
  addCommands () {
    return {
      setColumns:
        (count = 2) =>
          ({ chain }) => {
            const n = Math.min(4, Math.max(2, count))
            return chain()
              .insertContent({
                type: this.name,
                content: Array.from({ length: n }, () => ({ type: 'column', content: [{ type: 'paragraph' }] }))
              })
              // start typing in the first column, not the last
              .command(({ tr, dispatch }) => {
                const $from = tr.selection.$from
                for (let d = $from.depth; d > 0; d--) {
                  if ($from.node(d).type.name === this.name) {
                    if (dispatch !== undefined) tr.setSelection(TextSelection.create(tr.doc, $from.before(d) + 3))
                    return true
                  }
                }
                return true
              })
              .run()
          }
    }
  }
})

export const ColumnExtension = ColumnNode.extend({})

export const SyncedBlockExtension = SyncedBlockNode.extend<SyncedBlockOptions>({
  addOptions () {
    return { openSource: undefined }
  },

  addCommands () {
    return {
      setSyncedBlock:
        (attrs) =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs })
    }
  },

  addNodeView () {
    return SvelteNodeViewRenderer(SyncedBlockNodeView, {
      componentProps: { openSource: this.options.openSource }
    })
  }
})

/** All structural blocks as one extension, for the editor kit. */
export const BlocksExtension = Extension.create<SyncedBlockOptions>({
  name: 'ceepeeBlocks',

  addOptions () {
    return { openSource: undefined }
  },

  addExtensions () {
    return [
      CalloutExtension,
      DetailsExtension,
      DetailsSummaryExtension,
      DetailsContentExtension,
      ColumnListExtension,
      ColumnExtension,
      SyncedBlockExtension.configure({ openSource: this.options.openSource })
    ]
  }
})
