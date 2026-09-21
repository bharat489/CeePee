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

// Dynamic blocks ("macros") shared by the client editor and the server schema:
// a live issue list, the child pages of a page, a table of contents, and two
// inline chips (a coloured status and a date). Each stores only its settings;
// the client renders the live content.

import { mergeAttributes, Node } from '@tiptap/core'

const dataAttr = (name: string, fallback: any = null): any => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
  renderHTML: (attrs: Record<string, any>) => (attrs[name] != null ? { [`data-${name}`]: attrs[name] } : {})
})

export const ISSUE_LIST_STATUS = ['open', 'all', 'done'] as const
export const ISSUE_LIST_SORT = ['modified', 'created', 'priority', 'due'] as const
export type IssueListStatus = (typeof ISSUE_LIST_STATUS)[number]
export type IssueListSort = (typeof ISSUE_LIST_SORT)[number]

/** A live list of issues from one project, filtered and sorted by the block's settings. */
export const IssueListNode = Node.create({
  name: 'issueList',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes () {
    return {
      project: dataAttr('project'),
      projectName: dataAttr('project-name'),
      status: dataAttr('status', 'open'),
      assignee: dataAttr('assignee', 'any'),
      sort: dataAttr('sort', 'modified'),
      limit: {
        default: 10,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-limit') ?? 10),
        renderHTML: (attrs: Record<string, any>) => ({ 'data-limit': String(attrs.limit ?? 10) })
      }
    }
  },

  parseHTML () {
    return [{ tag: 'div[data-type="issueList"]' }]
  },

  renderHTML ({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'issueList', class: 'issue-list' }),
      `Issues · ${String(node.attrs.projectName ?? 'pick a project')}`
    ]
  }
})

/** The pages directly under the page this block lives on. */
export const ChildPagesNode = Node.create({
  name: 'childPages',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  parseHTML () {
    return [{ tag: 'div[data-type="childPages"]' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'childPages', class: 'child-pages' }), 'Child pages']
  }
})

/** A table of contents built from the document's headings. */
export const TocNode = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes () {
    return {
      depth: {
        default: 3,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-depth') ?? 3),
        renderHTML: (attrs: Record<string, any>) => ({ 'data-depth': String(attrs.depth ?? 3) })
      }
    }
  },

  parseHTML () {
    return [{ tag: 'div[data-type="tableOfContents"]' }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tableOfContents', class: 'toc-block' }), 'Table of contents']
  }
})

export const STATUS_CHIP_COLORS = ['grey', 'green', 'yellow', 'red', 'blue', 'purple'] as const
export type StatusChipColor = (typeof STATUS_CHIP_COLORS)[number]

/** An inline coloured label such as DRAFT, APPROVED or BLOCKED. */
export const StatusChipNode = Node.create({
  name: 'statusChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes () {
    return {
      text: dataAttr('text', 'STATUS'),
      color: dataAttr('color', 'grey')
    }
  },

  parseHTML () {
    return [{ tag: 'span[data-type="statusChip"]' }]
  },

  renderHTML ({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'statusChip', class: `status-chip status-chip--${String(node.attrs.color ?? 'grey')}` }),
      String(node.attrs.text ?? '')
    ]
  }
})

/** An inline date that reads as a date and edits with a picker. */
export const DateChipNode = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes () {
    return {
      date: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-date')
          return v === null ? null : Number(v)
        },
        renderHTML: (attrs: Record<string, any>) => (attrs.date != null ? { 'data-date': String(attrs.date) } : {})
      }
    }
  },

  parseHTML () {
    return [{ tag: 'span[data-type="dateChip"]' }]
  },

  renderHTML ({ HTMLAttributes, node }) {
    const d = node.attrs.date
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'dateChip', class: 'date-chip' }),
      d != null ? new Date(Number(d)).toISOString().slice(0, 10) : 'date'
    ]
  }
})
