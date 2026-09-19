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

// Pure scheduling arithmetic for automation rules: when a scheduled rule is
// due (every N minutes, or daily at a time on chosen weekdays) and how long a
// failed delivery waits before the next attempt. No platform imports, so the
// unit tests run against exactly what the server uses.

import { type AutomationRule } from '@hcengineering/tracker'

const MINUTE = 60_000
const DAY = 86_400_000

/** How many times a failed action is tried before it is marked failed. */
export const MAX_ATTEMPTS = 5

/** Minutes to wait before attempt `attempt` (1-based): 5, 10, 20, 40, 80 … capped at four hours. */
export function backoffMinutes (attempt: number): number {
  return Math.min(240, 5 * 2 ** Math.max(0, attempt - 1))
}

type Schedule = Pick<AutomationRule, 'at' | 'days' | 'tz'>

/**
 * The most recent fire time of a daily schedule at or before `now`, in UTC
 * milliseconds; undefined when the rule has no valid time or no allowed day
 * has passed in the last week. `tz` is the writer's offset in minutes east of
 * UTC, so "09:00" means nine in the morning where the rule was written.
 */
export function lastFireOf (rule: Schedule, now: number): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(rule.at ?? '')
  if (m === null) return undefined
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return undefined
  const tz = (rule.tz ?? 0) * MINUTE
  const days = rule.days ?? []
  for (let back = 0; back < 8; back++) {
    const local = new Date(now + tz - back * DAY)
    const fireLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm)
    const fireUtc = fireLocal - tz
    if (fireUtc > now) continue
    if (days.length > 0 && !days.includes(new Date(fireLocal).getUTCDay())) continue
    return fireUtc
  }
  return undefined
}

/**
 * Is a scheduled rule due at `now`? A daily rule fires once after its time on
 * an allowed day (never twice for the same slot); an interval rule fires when
 * at least `every` minutes (five at the least) have passed since its last run.
 */
export function isScheduleDue (rule: Schedule & Pick<AutomationRule, 'every' | 'lastRun'>, now: number): boolean {
  if (rule.at !== undefined && rule.at !== '') {
    const fire = lastFireOf(rule, now)
    return fire !== undefined && (rule.lastRun ?? 0) < fire
  }
  return now - (rule.lastRun ?? 0) >= Math.max(5, rule.every ?? 60) * MINUTE
}
