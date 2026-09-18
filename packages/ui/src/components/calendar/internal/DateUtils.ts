// Copyright © 2022 Hardcore Engineering Inc.
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

import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { type TimeZone, capitalizeFirstLetter } from '../../..'

export const DAYS_IN_WEEK = 7

export const MILLISECONDS_IN_MINUTE = 60000
export const MILLISECONDS_IN_DAY = 86400000
export const MILLISECONDS_IN_WEEK = DAYS_IN_WEEK * MILLISECONDS_IN_DAY

export function firstDay (date: Date, firstDay: number = 1): Date {
  const firstDayOfMonth = new Date(new Date(date).setHours(0, 0, 0, 0))
  firstDayOfMonth.setDate(1) // First day of month
  const result = new Date(firstDayOfMonth)
  result.setDate(result.getDate() - result.getDay() + firstDay)
  // Check if we need add one more week
  if (result.getTime() > firstDayOfMonth.getTime()) {
    result.setDate(result.getDate() - DAYS_IN_WEEK)
  }
  return result
}

export function getWeek (date: Date): number {
  const onejan = new Date(date.getFullYear(), 0, 1)
  return Math.ceil(((date.getTime() - onejan.getTime()) / MILLISECONDS_IN_DAY + onejan.getDay() + 1) / DAYS_IN_WEEK)
}

export function daysInMonth (date: Date): number {
  return 33 - new Date(date.getFullYear(), date.getMonth(), 33).getDate()
}

export function getWeekDayName (weekDay: Date, weekFormat: 'narrow' | 'short' | 'long' | undefined = 'short'): string {
  const locale = new Intl.NumberFormat().resolvedOptions().locale
  return new Intl.DateTimeFormat(locale, {
    weekday: weekFormat
  }).format(weekDay)
}

export function getWeekDayNames (): Map<number, string> {
  const today: Date = new Date()
  const offset: number = 0 - today.getDay()
  const startDate: number = today.setTime(today.getTime() + MILLISECONDS_IN_DAY * offset)
  const result: Map<number, string> = new Map<number, string>()
  for (let i = 0; i < 7; i++) {
    result.set(i, capitalizeFirstLetter(getWeekDayName(new Date(startDate + i * MILLISECONDS_IN_DAY), 'long')))
  }
  return result
}

export function day (firstDay: Date, offset: number): Date {
  return new Date(new Date(firstDay).setDate(firstDay.getDate() + offset))
}

export function weekday (firstDay: Date, w: number, d: number): Date {
  return day(firstDay, w * DAYS_IN_WEEK + d)
}

export function areDatesEqual (firstDate: Date | undefined, secondDate: Date | undefined): boolean {
  if (firstDate === undefined || secondDate === undefined) {
    return false
  }
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  )
}

export function fromCurrentToTz (date: Date | number, tz: string): Date {
  return utcToZonedTime(zonedTimeToUtc(date, getUserTimezone()), tz)
}

export function fromTzToCurrent (date: Date | number, tz: string): Date {
  return utcToZonedTime(zonedTimeToUtc(date, tz), getUserTimezone())
}

export function isWeekend (date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6
}

export function getMonthName (date: Date, option: 'narrow' | 'short' | 'long' | 'numeric' | '2-digit' = 'long'): string {
  try {
    const locale = new Intl.NumberFormat().resolvedOptions().locale
    return new Intl.DateTimeFormat(locale, { month: option }).format(date)
  } catch (err) {
    console.error(err)
    return ''
  }
}

export type TCellStyle = 'not-selected' | 'selected'
export interface ICell {
  dayOfWeek: number
  classes: TCellStyle
}

export function getLocalWeekStart (): number {
  const locale = new Intl.Locale(navigator.language)
  return typeof (locale as any)?.getWeekInfo === 'function'
    ? (locale as any)?.getWeekInfo()?.firstDay
    : ((locale as any).weekInfo?.firstDay ?? 1)
}

export function hasLocalWeekStart (): boolean {
  const locale = new Intl.Locale(navigator.language)
  return typeof (locale as any)?.getWeekInfo === 'function' || (locale as any).weekInfo?.firstDay !== undefined
}

export function getWeekStart (date: Date = new Date(), firstDay: number = 1): Date {
  date = new Date(new Date(date).setHours(0, 0, 0, 0))
  return new Date(date.setDate(date.getDate() - ((date.getDay() - firstDay + 7) % 7)))
}

export function addZero (value: number): string {
  if (value < 10) {
    return `0${value}`
  }
  return `${value}`
}

export const getDaysDifference = (from: Date, to: Date): number => {
  const firstDateMs = from.setHours(0, 0, 0, 0)
  const secondDateMs = to.setHours(0, 0, 0, 0)

  return Math.round(Math.abs(secondDateMs - firstDateMs) / MILLISECONDS_IN_DAY)
}

export const getMillisecondsInMonth = (date: Date): number => {
  return daysInMonth(date) * MILLISECONDS_IN_DAY
}

const WARNING_DAYS = 7

export const getDueDateIconModifier = (
  isOverdue: boolean,
  daysDifference: number | null,
  shouldIgnoreOverdue: boolean
): 'overdue' | 'critical' | 'warning' | 'normal' => {
  if (shouldIgnoreOverdue) return 'normal'
  if (isOverdue) return 'overdue'
  if (daysDifference === 0) return 'critical'
  if (daysDifference !== null && daysDifference <= WARNING_DAYS) return 'warning'
  return 'normal'
}

export function getFormattedDate (value: number | null, options?: Intl.DateTimeFormatOptions): string {
  return value === null ? '' : new Date(value).toLocaleString('default', options ?? { month: 'short', day: 'numeric' })
}

// Legacy IANA ids browsers still report (Windows maps India to Asia/Calcutta) → the name people use.
const LEGACY_ZONE_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Kolkata',
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Saigon': 'Ho Chi Minh City',
  'Asia/Rangoon': 'Yangon',
  'Asia/Dacca': 'Dhaka',
  'Asia/Macao': 'Macau',
  'Asia/Ulan_Bator': 'Ulaanbaatar',
  'Europe/Kiev': 'Kyiv',
  'America/Buenos_Aires': 'Buenos Aires',
  'Asia/Thimbu': 'Thimphu'
}

/** Cities people look for that share a zone with the IANA city; searchable in the clock's timezone list. */
export const CITY_ALIASES: Array<{ city: string, zone: string }> = [
  { city: 'Mumbai', zone: 'Asia/Kolkata' }, { city: 'New Delhi', zone: 'Asia/Kolkata' }, { city: 'Bengaluru', zone: 'Asia/Kolkata' }, { city: 'Chennai', zone: 'Asia/Kolkata' }, { city: 'Hyderabad', zone: 'Asia/Kolkata' }, { city: 'Pune', zone: 'Asia/Kolkata' }, { city: 'Ahmedabad', zone: 'Asia/Kolkata' }, { city: 'Jaipur', zone: 'Asia/Kolkata' }, { city: 'Lucknow', zone: 'Asia/Kolkata' }, { city: 'Chandigarh', zone: 'Asia/Kolkata' }, { city: 'Kochi', zone: 'Asia/Kolkata' }, { city: 'Goa', zone: 'Asia/Kolkata' },
  { city: 'Islamabad', zone: 'Asia/Karachi' }, { city: 'Lahore', zone: 'Asia/Karachi' }, { city: 'Abu Dhabi', zone: 'Asia/Dubai' }, { city: 'Doha', zone: 'Asia/Qatar' }, { city: 'Tel Aviv', zone: 'Asia/Jerusalem' }, { city: 'Beijing', zone: 'Asia/Shanghai' }, { city: 'Shenzhen', zone: 'Asia/Shanghai' }, { city: 'Hanoi', zone: 'Asia/Bangkok' }, { city: 'Osaka', zone: 'Asia/Tokyo' },
  { city: 'San Francisco', zone: 'America/Los_Angeles' }, { city: 'Seattle', zone: 'America/Los_Angeles' }, { city: 'San Diego', zone: 'America/Los_Angeles' }, { city: 'Austin', zone: 'America/Chicago' }, { city: 'Dallas', zone: 'America/Chicago' }, { city: 'Houston', zone: 'America/Chicago' }, { city: 'Boston', zone: 'America/New_York' }, { city: 'Washington', zone: 'America/New_York' }, { city: 'Miami', zone: 'America/New_York' }, { city: 'Atlanta', zone: 'America/New_York' }, { city: 'Montreal', zone: 'America/Toronto' },
  { city: 'Manchester', zone: 'Europe/London' }, { city: 'Edinburgh', zone: 'Europe/London' }, { city: 'Munich', zone: 'Europe/Berlin' }, { city: 'Frankfurt', zone: 'Europe/Berlin' }, { city: 'Hamburg', zone: 'Europe/Berlin' }, { city: 'Milan', zone: 'Europe/Rome' }, { city: 'Barcelona', zone: 'Europe/Madrid' }, { city: 'Lyon', zone: 'Europe/Paris' }, { city: 'Geneva', zone: 'Europe/Zurich' }, { city: 'Rotterdam', zone: 'Europe/Amsterdam' }, { city: 'Krakow', zone: 'Europe/Warsaw' }, { city: 'St Petersburg', zone: 'Europe/Moscow' },
  { city: 'Cape Town', zone: 'Africa/Johannesburg' }, { city: 'Rio de Janeiro', zone: 'America/Sao_Paulo' }, { city: 'Guadalajara', zone: 'America/Mexico_City' }, { city: 'Wellington', zone: 'Pacific/Auckland' }, { city: 'Brisbane', zone: 'Australia/Brisbane' }
]

const CLOCK_LABEL_KEY = 'ceepee.clockLabel'
const CLOCK_ZONES_KEY = 'TimeZones'

/** The zone the status bar clock follows: the first one picked in the clock popup, else the browser's. */
export function getPrimaryTimeZone (): string {
  try {
    const saved = localStorage.getItem(CLOCK_ZONES_KEY)
    if (saved !== null) {
      const list = JSON.parse(saved) as string[]
      if (Array.isArray(list) && typeof list[0] === 'string' && list[0] !== '') return list[0]
    }
  } catch {}
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function getClockLabel (): string | undefined {
  try {
    const v = localStorage.getItem(CLOCK_LABEL_KEY)
    return v === null || v.trim() === '' ? undefined : v.trim()
  } catch {
    return undefined
  }
}

export function setClockLabel (label: string | undefined): void {
  try {
    if (label === undefined || label.trim() === '') localStorage.removeItem(CLOCK_LABEL_KEY)
    else localStorage.setItem(CLOCK_LABEL_KEY, label.trim())
  } catch {}
}

/** Short zone abbreviation when the locale has a real one (IST, CET, EST); empty for GMT+5:30 style. */
export function getTimeZoneAbbreviation (zone: string): string {
  try {
    const part = new Intl.DateTimeFormat(navigator.language, { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? ''
    return /^[A-Z]{2,5}$/.test(part) ? part : ''
  } catch {
    return ''
  }
}

/** City name for a zone id, with legacy ids translated (Asia/Calcutta → Kolkata). */
export function getTimeZoneCity (zone: string): string {
  const legacy = LEGACY_ZONE_NAMES[zone]
  if (legacy !== undefined) return legacy
  return zone.replace(/_/g, ' ').split('/').slice(-1)[0] ?? ''
}

/** What the status bar shows next to the time: the person's own label, else the primary zone's city plus its abbreviation. */
export const getTimeZoneName = (val?: string): string => {
  if (val !== undefined) return getTimeZoneCity(val)
  const own = getClockLabel()
  if (own !== undefined) return own
  const zone = getPrimaryTimeZone()
  const city = getTimeZoneCity(zone)
  const abbr = getTimeZoneAbbreviation(zone)
  return abbr !== '' && abbr !== city ? `${city} · ${abbr}` : city
}

export const convertTimeZone = (tz: string): TimeZone => {
  const tzSpace = tz.replace(/_/gi, ' ')
  const parts = tzSpace.split('/')
  if (tz === '' || parts.length === 1) return { id: tz, continent: tzSpace, city: tzSpace, short: tzSpace }
  return {
    id: tz,
    continent: parts[0],
    city: parts.length > 2 ? `${parts[1]} - ${parts[2]}` : parts[1],
    short: parts.length > 2 ? parts[2] : parts[1]
  }
}

export function getUserTimezone (): string {
  if (window.Intl !== undefined) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } else {
    return 'Etc/GMT'
  }
}
