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

/** Padding for the form and the horizontal amount used to line up sibling rows (e.g. bottom links). */
export interface LoginFormLayout {
  padding: string
  /** Same as the horizontal part of `padding`; use for `margin-inline-start` on rows below the form. */
  paddingInline: string
}

export function getLoginFormLayout (docWidth: number, docHeight: number): LoginFormLayout {
  // Fluid: the form sits inside a card that already has its own padding, so this only adds
  // breathing room that scales with the viewport instead of jumping between fixed sizes.
  if (docWidth <= 480) {
    return { padding: '0.25rem 0.5rem', paddingInline: '0.5rem' }
  }
  if (docHeight <= 700) {
    return { padding: '0.25rem clamp(0.5rem, 2vw, 1.25rem)', paddingInline: 'clamp(0.5rem, 2vw, 1.25rem)' }
  }
  return { padding: 'clamp(0.5rem, 2vh, 1.5rem) clamp(0.5rem, 2vw, 1.5rem)', paddingInline: 'clamp(0.5rem, 2vw, 1.5rem)' }
}

export function loginFormPadding (docWidth: number, docHeight: number): string {
  return getLoginFormLayout(docWidth, docHeight).padding
}

export function loginFormPaddingInline (docWidth: number, docHeight: number): string {
  return getLoginFormLayout(docWidth, docHeight).paddingInline
}

export function loginFormMinHeight (docHeight: number): string {
  // the card centres its content; a forced minimum only pushes forms off short screens
  return docHeight > 1000 ? 'min(30rem, calc(100dvh - 20rem))' : '0'
}
