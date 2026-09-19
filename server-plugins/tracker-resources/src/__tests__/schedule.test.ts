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

import { backoffMinutes, isScheduleDue, lastFireOf, MAX_ATTEMPTS } from '../schedule'

const MIN = 60_000
const IST = 330 // minutes east of UTC
// Saturday 19 September 2026, 04:00 UTC = 09:30 IST
const SAT_0930_IST = Date.UTC(2026, 8, 19, 4, 0)
const SAT_0900_IST = Date.UTC(2026, 8, 19, 3, 30)
const FRI_0900_IST = Date.UTC(2026, 8, 18, 3, 30)

describe('backoff', () => {
  it('doubles from five minutes and caps at four hours', () => {
    expect([1, 2, 3, 4, 5].map(backoffMinutes)).toEqual([5, 10, 20, 40, 80])
    expect(backoffMinutes(9)).toBe(240)
    expect(backoffMinutes(0)).toBe(5)
    expect(MAX_ATTEMPTS).toBe(5)
  })
})

describe('interval rules', () => {
  const now = SAT_0930_IST
  it('fire when the interval has passed, never more often than every five minutes', () => {
    expect(isScheduleDue({ every: 60, lastRun: now - 59 * MIN }, now)).toBe(false)
    expect(isScheduleDue({ every: 60, lastRun: now - 61 * MIN }, now)).toBe(true)
    expect(isScheduleDue({ every: 60 }, now)).toBe(true)
    expect(isScheduleDue({ every: 1, lastRun: now - 3 * MIN }, now)).toBe(false)
    expect(isScheduleDue({ every: 1, lastRun: now - 6 * MIN }, now)).toBe(true)
  })
  it('default to hourly', () => {
    expect(isScheduleDue({ lastRun: now - 30 * MIN }, now)).toBe(false)
    expect(isScheduleDue({ lastRun: now - 61 * MIN }, now)).toBe(true)
  })
})

describe('daily rules', () => {
  it('resolve the time in the writer\'s timezone', () => {
    expect(lastFireOf({ at: '09:00', tz: IST }, SAT_0930_IST)).toBe(SAT_0900_IST)
    // 08:30 IST: today's slot has not come yet, so yesterday's is the latest
    expect(lastFireOf({ at: '09:00', tz: IST }, SAT_0900_IST - 30 * MIN)).toBe(FRI_0900_IST)
    // same wall-clock time written in UTC fires five and a half hours later
    expect(lastFireOf({ at: '09:00', tz: 0 }, Date.UTC(2026, 8, 19, 9, 0))).toBe(Date.UTC(2026, 8, 19, 9, 0))
  })
  it('fire once per slot', () => {
    expect(isScheduleDue({ at: '09:00', tz: IST }, SAT_0930_IST)).toBe(true)
    expect(isScheduleDue({ at: '09:00', tz: IST, lastRun: SAT_0900_IST + MIN }, SAT_0930_IST)).toBe(false)
    expect(isScheduleDue({ at: '09:00', tz: IST, lastRun: FRI_0900_IST + MIN }, SAT_0930_IST)).toBe(true)
    // the interval setting is ignored when a time of day is set
    expect(isScheduleDue({ at: '09:00', tz: IST, every: 5, lastRun: SAT_0900_IST + MIN }, SAT_0930_IST + 60 * MIN)).toBe(false)
  })
  it('skip days that are not allowed', () => {
    const weekdays = [1, 2, 3, 4, 5]
    // Saturday: the last allowed slot is Friday's
    expect(lastFireOf({ at: '09:00', tz: IST, days: weekdays }, SAT_0930_IST)).toBe(FRI_0900_IST)
    expect(isScheduleDue({ at: '09:00', tz: IST, days: weekdays, lastRun: FRI_0900_IST + MIN }, SAT_0930_IST)).toBe(false)
    expect(isScheduleDue({ at: '09:00', tz: IST, days: [6] }, SAT_0930_IST)).toBe(true)
    // no allowed day in the last week
    expect(lastFireOf({ at: '09:00', tz: IST, days: [] as number[] }, SAT_0930_IST)).toBe(SAT_0900_IST)
  })
  it('reject malformed times', () => {
    expect(lastFireOf({ at: '9am' }, SAT_0930_IST)).toBeUndefined()
    expect(lastFireOf({ at: '25:00' }, SAT_0930_IST)).toBeUndefined()
    expect(isScheduleDue({ at: 'x', every: 60 }, SAT_0930_IST)).toBe(false)
  })
})
