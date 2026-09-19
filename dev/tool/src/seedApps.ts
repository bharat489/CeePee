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

// Sample data for the other apps: companies, recruiting (vacancies, talents,
// applications), HR departments, a calendar week and planner to-dos. Each
// block skips itself when the workspace already has that kind of data.

import calendar, { AccessLevel } from '@hcengineering/calendar'
import contact, { AvatarType, type Employee, type SocialIdentity } from '@hcengineering/contact'
import core, { generateId, type PersonId, type Ref, type TxOperations } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import recruit from '@hcengineering/recruit'
import task from '@hcengineering/task'

const DAY = 86_400_000
// the tool has no build dependency on the hr and time plugins: address them by id
const hr = { class: { Department: 'hr:class:Department' as Ref<any> }, ids: { Head: 'hr:ids:Head' as Ref<any> } }
const time = { class: { ToDo: 'time:class:ToDo' as Ref<any> }, space: { ToDos: 'time:space:ToDos' as Ref<any> }, ids: { NotAttached: 'time:ids:NotAttached' as Ref<any> } }
enum ToDoPriority { High, Medium, Low, NoPriority, Urgent }
const CANDIDATES: Array<[string, string, string, string]> = [
  ['Ananya', 'Iyer', 'Senior Android Engineer', 'Bengaluru'], ['Rahul', 'Mehta', 'Product Designer', 'Mumbai'], ['Priya', 'Nair', 'Backend Engineer', 'Kochi'],
  ['Arjun', 'Singh', 'QA Engineer', 'Delhi'], ['Sneha', 'Kulkarni', 'Data Analyst', 'Pune'], ['Vikram', 'Rao', 'Engineering Manager', 'Hyderabad'],
  ['Meera', 'Joshi', 'iOS Engineer', 'Bengaluru'], ['Karan', 'Kapoor', 'Customer Success Lead', 'Mumbai']
]
const VACANCIES = [
  { name: 'Senior Android Engineer', description: 'Own the Android app: Kotlin, Compose, payments SDKs.', location: 'Bengaluru · Hybrid' },
  { name: 'Product Designer', description: 'Design the onboarding and payments experience end to end.', location: 'Remote (India)' },
  { name: 'Backend Engineer', description: 'Node.js services, PostgreSQL, payment integrations.', location: 'Mumbai' }
]
const COMPANIES: Array<[string, string]> = [['Quicky Fintech', 'Mumbai'], ['Northstar Labs', 'Bengaluru'], ['Blue Harbor Partners', 'Pune']]
const DEPARTMENTS: Array<[string, string]> = [['Engineering', 'Builds the product'], ['Product & Design', 'Owns what we build and why'], ['Customer Success', 'Keeps customers and partners happy']]
const EVENTS: Array<[string, number, number, number]> = [
  ['Sprint planning', 1, 10, 11], ['Design review', 2, 15, 16], ['Customer call · Quicky Fintech', 3, 12, 12.5], ['Weekly demo', 4, 16, 17], ['Retrospective', 6, 11, 12], ['1:1 with manager', 0, 14, 14.5]
]
const TODOS: Array<[string, number, ToDoPriority]> = [['Review the onboarding PR', 0, ToDoPriority.High], ['Prepare sprint demo slides', 1, ToDoPriority.Medium], ['Reply to partner emails', 0, ToDoPriority.Low], ['Update the release checklist', 2, ToDoPriority.Medium], ['Book the design review room', 3, ToDoPriority.NoPriority]]
const SOURCES = ['LinkedIn', 'Referral', 'Naukri', 'Careers page']

export async function seedApps (ops: TxOperations, log: (s: string) => void): Promise<void> {
  const employees = await ops.findAll(contact.mixin.Employee, { active: true })
  const people: Employee[] = employees.slice(0, 8)
  if (people.length === 0) throw new Error('no active employees')
  const identities = await ops.findAll(contact.class.SocialIdentity, { attachedTo: { $in: people.map((p) => p._id) } })
  const authorOf = (p: Employee): PersonId | undefined => (identities.find((i: SocialIdentity) => i.attachedTo === p._id)?._id as PersonId | undefined)
  const pick = <T>(arr: T[], k: number): T => arr[k % arr.length]
  const now = Date.now()

  // companies
  const orgs = await ops.findAll(contact.class.Organization, {})
  const orgIds: Array<Ref<any>> = []
  for (const [name, city] of COMPANIES) {
    const found = orgs.find((o) => o.name === name)
    if (found !== undefined) {
      orgIds.push(found._id)
      continue
    }
    orgIds.push(await ops.createDoc(contact.class.Organization, contact.space.Contacts, { name, city, avatarType: AvatarType.COLOR, members: 0, description: null, channels: 0 } as any))
  }
  log(`companies: ${COMPANIES.length}`)

  // recruiting: vacancies, talents, applications
  const vtypes = await ops.findAll(task.class.TaskType, { parent: 'recruit:template:DefaultVacancy' as Ref<any> })
  const applicantType = vtypes[0]
  const existingVac = await ops.findAll(recruit.class.Vacancy, {})
  if (applicantType !== undefined && existingVac.length === 0) {
    const members = people.map((p) => p.personUuid).filter((u): u is NonNullable<typeof u> => u != null)
    const vseq = await ops.findOne(core.class.Sequence, { attachedTo: recruit.class.Vacancy })
    const aseq = await ops.findOne(core.class.Sequence, { attachedTo: recruit.class.Applicant })
    let vnum = vseq?.sequence ?? 0
    let anum = aseq?.sequence ?? 0
    const vacIds: Array<Ref<any>> = []
    for (const [k, v] of VACANCIES.entries()) {
      vnum++
      vacIds.push(await ops.createDoc(recruit.class.Vacancy, core.space.Space, { name: v.name, description: v.description, fullDescription: null, private: false, archived: false, number: vnum, company: orgIds[k % orgIds.length], members, autoJoin: true, owners: members.slice(0, 1), type: 'recruit:template:DefaultVacancy', location: v.location, dueTo: now + (30 + k * 15) * DAY } as any, undefined, now - (20 - k * 3) * DAY, authorOf(pick(people, k))))
    }
    if (vseq !== undefined) await ops.update(vseq, { sequence: vnum })
    const statuses = applicantType.statuses as Array<Ref<any>>
    for (const [k, [first, last, title, city]] of CANDIDATES.entries()) {
      const _id = generateId<any>()
      await ops.createDoc(contact.class.Person, contact.space.Contacts, { name: `${last},${first}`, city, avatarType: AvatarType.COLOR, channels: 0 } as any, _id, now - (18 - k) * DAY, authorOf(pick(people, k)))
      await ops.createMixin(_id, contact.class.Person, contact.space.Contacts, recruit.mixin.Candidate, { title, onsite: k % 2 === 0, remote: k % 3 !== 0, source: pick(SOURCES, k), skills: 0 } as any)
      if (k < 6) {
        anum++
        const vac = vacIds[k % vacIds.length]
        const status = statuses[Math.min(statuses.length - 1, k % Math.max(1, statuses.length - 1))]
        await ops.addCollection(recruit.class.Applicant, vac, _id, recruit.mixin.Candidate, 'applications', { status, number: anum, identifier: `APP-${anum}`, rank: '', kind: applicantType._id, assignee: pick(people, k)._id, startDate: null, dueDate: k % 2 === 0 ? now + (5 + k) * DAY : null, attachments: 0, comments: 0, labels: 0, isDone: false } as any, undefined, now - (15 - k) * DAY, authorOf(pick(people, k + 1)))
      }
    }
    if (aseq !== undefined) await ops.update(aseq, { sequence: anum })
    log(`recruiting: ${VACANCIES.length} vacancies, ${CANDIDATES.length} talents, 6 applications`)
  } else log('recruiting: already has vacancies or no applicant type, skipped')

  // HR departments under the head office
  const deps = await ops.findAll(hr.class.Department, {})
  if (deps.length <= 1) {
    for (const [k, [name, description]] of DEPARTMENTS.entries()) {
      const members = people.filter((_, i) => i % DEPARTMENTS.length === k).map((p) => p._id)
      await ops.createDoc(hr.class.Department, core.space.Workspace, { name, description, parent: hr.ids.Head, members, teamLead: members[0] ?? null, managers: members.slice(0, 1) } as any)
    }
    log(`hr: ${DEPARTMENTS.length} departments`)
  } else log('hr: departments exist, skipped')

  // calendar: a working week for everyone who has a calendar
  const calendars = await ops.findAll(calendar.class.Calendar, {})
  const existingEvents = await ops.findAll(calendar.class.Event, {}, { limit: 1, total: true })
  if (calendars.length > 0 && existingEvents.total === 0) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const monday = d.getTime()
    let n = 0
    for (const [ci, cal] of calendars.slice(0, 6).entries()) {
      for (const [k, [title, dow, from, to]] of EVENTS.entries()) {
        if ((k + ci) % 2 === 1) continue
        await ops.addCollection(calendar.class.Event, calendar.space.Calendar, calendar.ids.NoAttached, calendar.class.Event, 'events', { calendar: cal._id, eventId: generateId(), date: monday + dow * DAY + from * 3_600_000, dueDate: monday + dow * DAY + to * 3_600_000, description: '', participants: people.slice(0, 3).map((p) => p._id), visibility: 'public', title, location: k % 2 === 0 ? 'Meeting room 2' : 'Google Meet', allDay: false, access: AccessLevel.Owner, user: cal.user, externalParticipants: [], reminders: [], blockTime: true } as any)
        n++
      }
    }
    log(`calendar: ${n} events`)
  } else log('calendar: events exist or no calendars yet, skipped')

  // planner: to-dos for the first few people
  const existingTodos = await ops.findAll(time.class.ToDo, {}, { limit: 1, total: true })
  if (existingTodos.total === 0) {
    let n = 0
    let rank: string | undefined
    for (const [pi, p] of people.slice(0, 4).entries()) {
      for (const [k, [title, dayOffset, priority]] of TODOS.entries()) {
        if ((k + pi) % 3 === 2) continue
        rank = makeRank(rank, undefined)
        await ops.addCollection(time.class.ToDo, time.space.ToDos, time.ids.NotAttached, time.class.ToDo, 'todos', { workslots: 0, title, description: '', priority, visibility: 'public', user: p._id, doneOn: k === 0 && pi % 2 === 0 ? now - DAY : null, dueDate: now + dayOffset * DAY, rank } as any, undefined, now - 2 * DAY, authorOf(p))
        n++
      }
    }
    log(`planner: ${n} to-dos`)
  } else log('planner: to-dos exist, skipped')
}
