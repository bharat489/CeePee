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

// Appearance knobs that live on <html> as data attributes and in localStorage:
// the vibe (colour family), corners and motion. The theme stylesheet reads the
// attributes; index.ejs sets them before the first paint so nothing flashes.

export type Vibe = 'aurora' | 'ocean' | 'sunset' | 'lime' | 'mono'
export type Corners = 'rounded' | 'pill' | 'sharp'
export type Motion = 'full' | 'reduced'
export type Wallpaper = 'doodle' | 'aurora' | 'grid' | 'none'

export const VIBES: Array<{ id: Vibe, name: string, tagline: string, colors: [string, string, string] }> = [
  { id: 'aurora', name: 'Aurora', tagline: 'Violet to pink to orange. Loud and warm.', colors: ['#7c3aed', '#ec4899', '#f97316'] },
  { id: 'ocean', name: 'Ocean', tagline: 'Sky blue to indigo to cyan. Cool and focused.', colors: ['#0ea5e9', '#6366f1', '#22d3ee'] },
  { id: 'sunset', name: 'Sunset', tagline: 'Orange to pink to magenta. Golden hour, all day.', colors: ['#f97316', '#ec4899', '#a21caf'] },
  { id: 'lime', name: 'Lime', tagline: 'Blue to violet with a lime signal. The original.', colors: ['#2b6bea', '#6a45f5', '#c0f010'] },
  { id: 'mono', name: 'Mono', tagline: 'One blue, no gradients. For the minimalists.', colors: ['#2b6bea', '#2b6bea', '#2b6bea'] }
]

const K_VIBE = 'ceepee.vibe'
const K_CORNERS = 'ceepee.corners'
const K_MOTION = 'ceepee.motion'
const K_WALL = 'ceepee.chatWallpaper'

function read (key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function write (key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export const getVibe = (): Vibe => (VIBES.some((v) => v.id === read(K_VIBE, 'aurora')) ? (read(K_VIBE, 'aurora') as Vibe) : 'aurora')
export const getCorners = (): Corners => (['rounded', 'pill', 'sharp'].includes(read(K_CORNERS, 'rounded')) ? (read(K_CORNERS, 'rounded') as Corners) : 'rounded')
export const getWallpaper = (): Wallpaper => (['doodle', 'aurora', 'grid', 'none'].includes(read(K_WALL, 'doodle')) ? (read(K_WALL, 'doodle') as Wallpaper) : 'doodle')
export const getMotion = (): Motion => (read(K_MOTION, 'full') === 'reduced' ? 'reduced' : 'full')

export function applyStoredVibe (): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.dataset.vibe = getVibe()
  el.dataset.corners = getCorners()
  el.dataset.motion = getMotion()
  el.dataset.chatwall = getWallpaper()
}
export function setVibe (v: Vibe): void {
  write(K_VIBE, v)
  applyStoredVibe()
}
export function setCorners (c: Corners): void {
  write(K_CORNERS, c)
  applyStoredVibe()
}
export function setMotion (m: Motion): void {
  write(K_MOTION, m)
  applyStoredVibe()
}
export function setWallpaper (w: Wallpaper): void {
  write(K_WALL, w)
  applyStoredVibe()
}
