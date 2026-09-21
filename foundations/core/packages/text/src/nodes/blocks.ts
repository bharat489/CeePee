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

// Structural blocks shared by the client editor and the server schema: callouts,
// toggles (details), columns and synced blocks. The client extends these with
// node views and commands; the server only needs the schema so that content
// containing them survives indexing, export and markup conversion.

import { mergeAttributes, Node } from '@tiptap/core'

export const CALLOUT_KINDS = ['info', 'tip', 'warning', 'danger', 'note'] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

const dataAttr = (name: string, fallback: any = null): any => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
  renderHTML: (attrs: Record<string, any>) => (attrs[name] != null ? { [`data-${name}`]: attrs[name] } : {})
})

/** A highlighted box: info, tip, warning, danger or note, with an optional emoji. */
export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes () {
    return {
      kind: dataAttr('kind', 'info'),
      emoji: dataAttr('emoji')
    }
  },

  parseHTML () {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'callout' }), 0]
  }
})

/** A collapsible section: a summary line and a body that folds away. */
export const DetailsNode = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,
  isolating: true,

  addAttributes () {
    return {
      open: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs: Record<string, any>) => ({ 'data-open': attrs.open === false ? 'false' : 'true' })
      }
    }
  },

  parseHTML () {
    return [{ tag: 'div[data-type="details"]' }, { tag: 'details' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details', class: 'details' }), 0]
  }
})

export const DetailsSummaryNode = Node.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,
  selectable: false,
  isolating: true,

  parseHTML () {
    return [{ tag: 'div[data-type="detailsSummary"]' }, { tag: 'summary' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'detailsSummary', class: 'details-summary' }), 0]
  }
})

export const DetailsContentNode = Node.create({
  name: 'detailsContent',
  content: 'block+',
  defining: true,
  selectable: false,
  isolating: true,

  parseHTML () {
    return [{ tag: 'div[data-type="detailsContent"]' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'detailsContent', class: 'details-content' }), 0]
  }
})

/** Side-by-side columns; each column holds ordinary blocks. */
export const ColumnListNode = Node.create({
  name: 'columnList',
  group: 'block',
  content: 'column{2,}',
  defining: true,
  isolating: true,

  parseHTML () {
    return [{ tag: 'div[data-type="columnList"]' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columnList', class: 'column-list' }), 0]
  }
})

export const ColumnNode = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes () {
    return {
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-width'),
        renderHTML: (attrs: Record<string, any>) =>
          attrs.width != null ? { 'data-width': attrs.width, style: `flex-basis: ${attrs.width}%` } : {}
      }
    }
  },

  parseHTML () {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'column' }), 0]
  }
})

/**
 * Another document's body shown, and edited, in place. The content itself lives in
 * the source document's collaborative session, so every page showing the block sees
 * the same text at the same moment; only the pointer is stored here.
 */
export const SyncedBlockNode = Node.create({
  name: 'syncedBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes () {
    return {
      sourceId: dataAttr('source-id'),
      sourceClass: dataAttr('source-class'),
      title: dataAttr('title')
    }
  },

  parseHTML () {
    return [{ tag: 'div[data-type="syncedBlock"]' }]
  },

  renderHTML ({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'syncedBlock', class: 'synced-block' }),
      `⟳ ${String(node.attrs.title ?? 'Synced block')}`
    ]
  }
})
