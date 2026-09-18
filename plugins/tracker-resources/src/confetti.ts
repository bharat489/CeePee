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

/** A short burst of confetti at (x, y). Skipped when motion is reduced. */
export function confetti (x: number, y: number): void {
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.motion === 'reduced') return
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const colors = ['#a855f7', '#ec4899', '#f97316', '#22d3ee', '#c0f010', '#facc15', '#ffffff']
  for (let i = 0; i < 32; i++) {
    const el = document.createElement('i')
    const size = 5 + Math.random() * 6
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 0.5)}px;border-radius:${Math.random() < 0.4 ? '50%' : '2px'};background:${colors[i % colors.length]};pointer-events:none;z-index:100000;will-change:transform,opacity`
    document.body.appendChild(el)
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
    const dist = 90 + Math.random() * 190
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const anim = el.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) rotate(${Math.random() * 360}deg) scale(1.1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy + 160}px) rotate(${Math.random() * 900}deg) scale(0.6)`, opacity: 0 }
      ],
      { duration: 850 + Math.random() * 550, easing: 'cubic-bezier(.2,.8,.3,1)' }
    )
    anim.onfinish = () => { el.remove() }
  }
}
