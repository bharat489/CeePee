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

// 16 × 16 stroke icons for the project pages (tabs, KPI cards, work types).
// Each is the inner SVG markup; the host renders it in a currentColor <svg>.
const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'
export const ICONS: Record<string, string> = {
  globe: `<circle cx="8" cy="8" r="6.25" ${S}/><path d="M1.75 8h12.5M8 1.75c1.9 1.9 2.75 4 2.75 6.25S9.9 12.35 8 14.25M8 1.75C6.1 3.65 5.25 5.75 5.25 8S6.1 12.35 8 14.25" ${S}/>`,
  list: `<path d="M5.5 4h8M5.5 8h8M5.5 12h8" ${S}/><circle cx="2.5" cy="4" r="0.9" fill="currentColor"/><circle cx="2.5" cy="8" r="0.9" fill="currentColor"/><circle cx="2.5" cy="12" r="0.9" fill="currentColor"/>`,
  board: `<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.5" ${S}/><path d="M6 2.25v11.5M10 2.25v11.5" ${S}/>`,
  backlog: `<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.5" ${S}/><path d="M1.75 6h12.5M1.75 9.75h12.5" ${S}/>`,
  calendar: `<rect x="1.75" y="2.75" width="12.5" height="11" rx="1.5" ${S}/><path d="M1.75 6.25h12.5M5 1.5v2.5M11 1.5v2.5" ${S}/>`,
  timeline: `<path d="M2 4h6M2 8h9M2 12h5" ${S}/><path d="M10 4h4M13 8h1M9 12h5" ${S} stroke-opacity="0.45"/>`,
  docs: `<rect x="2.75" y="1.75" width="10.5" height="12.5" rx="1.5" ${S}/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" ${S}/>`,
  forms: `<path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" ${S}/><path d="M2 3.5l1 1 1.5-2M2 8l1 1 1.5-2" ${S}/>`,
  reports: `<path d="M2 13.5h12" ${S}/><path d="M3 10l3.5-3.5 2.5 2.5L13 4.5" ${S}/><path d="M10 4.5h3v3" ${S}/>`,
  dashboard: `<rect x="1.75" y="1.75" width="5.25" height="5.25" rx="1.2" ${S}/><rect x="9" y="1.75" width="5.25" height="5.25" rx="1.2" ${S}/><rect x="1.75" y="9" width="5.25" height="5.25" rx="1.2" ${S}/><rect x="9" y="9" width="5.25" height="5.25" rx="1.2" ${S}/>`,
  workflow: `<circle cx="3.5" cy="8" r="1.75" ${S}/><circle cx="12.5" cy="4" r="1.75" ${S}/><circle cx="12.5" cy="12" r="1.75" ${S}/><path d="M5.25 8h2.5c1 0 1.5-.5 2-1.5l1-1.5M7.75 8c1 0 1.5.5 2 1.5l1 1.5" ${S}/>`,
  components: `<rect x="2" y="2" width="5" height="5" rx="1" ${S}/><rect x="9" y="2" width="5" height="5" rx="1" ${S}/><rect x="2" y="9" width="5" height="5" rx="1" ${S}/><path d="M11.5 9v5M9 11.5h5" ${S}/>`,
  milestone: `<path d="M8 1.75l6.25 6.25L8 14.25 1.75 8z" ${S}/>`,
  epic: `<path d="M9 1.5L3.5 9h4l-1 5.5L11.5 7h-4z" fill="currentColor"/>`,
  issue: `<rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor"/><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  subtask: `<rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor"/><path d="M5 5h2v2H5zM9 9h2v2H9zM7 6h1.5v3.5H9" fill="none" stroke="#fff" stroke-width="1.3"/>`,
  initiative: `<rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor"/><path d="M8 4.5l3 3-3 3-3-3z" fill="#fff"/>`,
  request: `<rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor"/><path d="M5 6.5h6M5 9.5h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`,
  ideas: `<path d="M5.5 11.5h5M6.5 14h3M8 2a4 4 0 0 0-2.4 7.2c.5.4.9.9.9 1.3v1h3v-1c0-.4.4-.9.9-1.3A4 4 0 0 0 8 2z" ${S}/>`,
  servicedesk: `<path d="M3 9V7.5a5 5 0 0 1 10 0V9" ${S}/><rect x="2" y="9" width="3" height="4" rx="1" ${S}/><rect x="11" y="9" width="3" height="4" rx="1" ${S}/><path d="M12.5 13v.5a1.5 1.5 0 0 1-1.5 1.5H9" ${S}/>`,
  automation: `<path d="M9 1.5L3.5 9h4l-1 5.5L11.5 7h-4z" ${S}/>`,
  permissions: `<rect x="3" y="7" width="10" height="7" rx="1.5" ${S}/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" ${S}/>`,
  fields: `<path d="M2 4h12M2 8h8M2 12h5" ${S}/>`,
  people: `<circle cx="6" cy="5.5" r="2.5" ${S}/><path d="M1.75 13.5c0-2.4 1.9-4 4.25-4s4.25 1.6 4.25 4" ${S}/><circle cx="11.5" cy="6" r="2" ${S}/><path d="M11 9.75c1.9 0 3.25 1.4 3.25 3.25" ${S}/>`,
  more: `<circle cx="3" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="13" cy="8" r="1.25" fill="currentColor"/>`,
  share: `<circle cx="12" cy="3.5" r="1.75" ${S}/><circle cx="4" cy="8" r="1.75" ${S}/><circle cx="12" cy="12.5" r="1.75" ${S}/><path d="M5.6 7.2l4.8-2.8M5.6 8.8l4.8 2.8" ${S}/>`,
  feedback: `<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" ${S}/><path d="M5.5 6.5h5M5.5 8.5h3" ${S}/>`,
  fullscreen: `<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" ${S}/>`,
  filter: `<path d="M2 3.5h12M4.5 8h7M7 12.5h2" ${S}/>`,
  check: `<circle cx="8" cy="8" r="6.25" ${S}/><path d="M5.25 8.25l1.9 1.9 3.6-4" ${S}/>`,
  edit: `<path d="M2.5 13.5h11" ${S}/><path d="M3.5 10.5l7-7 2 2-7 7H3.5z" ${S}/>`,
  created: `<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" ${S}/><path d="M8 5v6M5 8h6" ${S}/>`,
  due: `<rect x="1.75" y="2.75" width="12.5" height="11" rx="1.5" ${S}/><path d="M1.75 6.25h12.5M5 1.5v2.5M11 1.5v2.5" ${S}/><circle cx="10.5" cy="10.5" r="1" fill="currentColor"/>`,
  chevron: `<path d="M4 6l4 4 4-4" ${S}/>`,
  sparkle: `<path d="M8 1.5l1.6 4.1 4.1 1.6-4.1 1.6L8 12.9 6.4 8.8 2.3 7.2l4.1-1.6L8 1.5z" fill="currentColor"/>`,
  mail: `<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" ${S}/><path d="M2.5 4.5L8 9l5.5-4.5" ${S}/>`,
  chat: `<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" ${S}/>`,
  link: `<path d="M6.5 9.5l3-3M5 11a2.5 2.5 0 0 1 0-3.5l1.5-1.5M11 5a2.5 2.5 0 0 1 0 3.5L9.5 10" ${S}/>`,
  urgent: `<path d="M3.5 9l4.5-4.5L12.5 9M3.5 12.5L8 8l4.5 4.5" ${S} stroke-width="1.8"/>`,
  high: `<path d="M3.5 10.5L8 6l4.5 4.5" ${S} stroke-width="1.8"/>`,
  medium: `<path d="M3.5 6h9M3.5 10h9" ${S} stroke-width="1.8"/>`,
  low: `<path d="M3.5 5.5L8 10l4.5-4.5" ${S} stroke-width="1.8"/>`,
  none: `<circle cx="8" cy="8" r="3.5" ${S}/>`
}
export const icon = (name: string): string => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] ?? ''}</svg>`
