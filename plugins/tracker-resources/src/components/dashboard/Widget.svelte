<!--
// Copyright © 2026 Hardcore Engineering Inc.
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
-->
<!--
  One dashboard widget. All kinds share this file so a dashboard is a list
  of {type, params}. Every widget accepts params.filter (a query-language
  expression) and params.project to narrow its issue set, plus its own
  knobs. `tick` re-runs the loads (wallboard refresh).
-->
<script lang="ts">
  import activity from '@hcengineering/activity'
  import contact, { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task from '@hcengineering/task'
  import { IssuePriority, MilestoneStatus, type Decision, type Issue, type IssueStatus, type Milestone, type Project, type Sprint, type TimeSpendReport } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'
  import { runQuery } from '../query/run'

  export let type: string
  export let params: Record<string, any> = {}
  export let tick = 0
  export let wall = false

  const client = getClient()
  const me = getCurrentEmployee()
  const DAY = 86_400_000

  const statusQuery = createQuery()
  const projectQuery = createQuery()
  let statuses: IssueStatus[] = []
  let projects: Project[] = []
  statusQuery.query(tracker.class.IssueStatus, {}, (r) => { statuses = r })
  projectQuery.query(tracker.class.Project, {}, (r) => { projects = r })
  $: openIds = statuses.filter((s) => s.category !== task.statusCategory.Won && s.category !== task.statusCategory.Lost).map((s) => s._id)
  $: doneIds = statuses.filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost).map((s) => s._id)
  $: statusName = new Map(statuses.map((s) => [s._id, s.name]))
  $: projectName = new Map(projects.map((p) => [p._id, p.identifier]))
  $: category = new Map(statuses.map((s) => [s._id, s.category]))

  let names = new Map<Ref<Person>, string>()
  async function resolveNames (ids: Array<Ref<Person> | null | undefined>): Promise<void> {
    const missing = Array.from(new Set(ids.filter((x): x is Ref<Person> => x != null))).filter((id) => !names.has(id))
    if (missing.length === 0) return
    const people = await client.findAll(contact.class.Person, { _id: { $in: missing } })
    const next = new Map(names)
    for (const p of people) next.set(p._id, formatName(p.name))
    names = next
  }

  // ---- data -----------------------------------------------------------------
  let rows: Issue[] = []
  let groups: Array<{ label: string, n: number, color?: string }> = []
  let progress: Array<{ label: string, sub: string, done: number, total: number }> = []
  let decisions: Decision[] = []
  let series: { days: number[], a: number[], b?: number[] } | undefined
  let table: { x: string[], y: string[], cells: number[][] } | undefined
  let countdown: Array<{ label: string, sub: string, days: number }> = []
  let burn: { total: number, remaining: number[], ideal: number[] } | undefined
  let errors: string[] = []
  let busy = false
  let feed: Array<{ when: number, text: string, id: Ref<Issue> }> = []
  let kpi: { value: string, sub: string } | undefined

  const rank = (p: IssuePriority): number => (p === IssuePriority.NoPriority ? 99 : p)
  const PALETTE = ['#2b6bea', '#c0f010', '#6a45f5', '#f5a623', '#e0475b', '#2bb3a0', '#8d8f9a', '#d97ce0']
  const prioLabel: Record<IssuePriority, string> = { [IssuePriority.Urgent]: 'Urgent', [IssuePriority.High]: 'High', [IssuePriority.Medium]: 'Medium', [IssuePriority.Low]: 'Low', [IssuePriority.NoPriority]: 'None' }

  // the issue set every widget starts from: project + filter narrowing
  async function baseIssues (extra: Record<string, any>, limit = 5000): Promise<Issue[]> {
    const q: Record<string, any> = { ...extra }
    if (params.project !== undefined && params.project !== '') q.space = params.project
    let list: Issue[] = await client.findAll(tracker.class.Issue, q, { limit })
    if (typeof params.filter === 'string' && params.filter.trim() !== '') {
      const r = await runQuery(params.filter, 5000)
      errors = r.errors
      const allowed = new Set(r.issues.map((i) => i._id))
      list = list.filter((i) => allowed.has(i._id))
    }
    return list
  }
  function fieldOf (i: Issue, field: string): string {
    switch (field) {
      case 'status':
        return statusName.get(i.status) ?? '—'
      case 'priority':
        return prioLabel[i.priority]
      case 'project':
        return projectName.get(i.space) ?? '—'
      case 'assignee':
        return i.assignee != null ? names.get(i.assignee) ?? '—' : 'Unassigned'
      case 'kind':
        return i.kind === tracker.taskTypes.Epic ? 'Epic' : i.kind === tracker.taskTypes.Initiative ? 'Initiative' : 'Issue'
      case 'category': {
        const c = category.get(i.status)
        return c === task.statusCategory.Won || c === task.statusCategory.Lost ? 'Done' : c === task.statusCategory.Active ? 'In progress' : 'To do'
      }
      default:
        return '—'
    }
  }
  function startOfDay (t: number): number {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  async function load (): Promise<void> {
    if (statuses.length === 0) return
    busy = true
    errors = []
    try {
      switch (type) {
        case 'mine': {
          const list = await baseIssues({ assignee: me, status: { $in: openIds } }, 300)
          rows = list.sort((a, b) => rank(a.priority) - rank(b.priority) || (a.dueDate ?? 9e15) - (b.dueDate ?? 9e15)).slice(0, params.limit ?? 8)
          groups = [IssuePriority.Urgent, IssuePriority.High, IssuePriority.Medium, IssuePriority.Low, IssuePriority.NoPriority].map((p) => ({ label: prioLabel[p], n: list.filter((i) => i.priority === p).length }))
          break
        }
        case 'due': {
          const list = await baseIssues({ ...(params.everyone === true ? {} : { assignee: me }), status: { $in: openIds }, dueDate: { $lt: Date.now() + (params.days ?? 7) * DAY } })
          rows = list.filter((i) => i.dueDate != null).sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0)).slice(0, params.limit ?? 8)
          await resolveNames(rows.map((i) => i.assignee))
          break
        }
        case 'stale': {
          rows = (await baseIssues({ status: { $in: openIds }, modifiedOn: { $lt: Date.now() - (params.days ?? 7) * DAY } })).sort((a, b) => a.modifiedOn - b.modifiedOn).slice(0, params.limit ?? 8)
          break
        }
        case 'recent': {
          rows = (await baseIssues({ createdOn: { $gte: Date.now() - (params.days ?? 7) * DAY } })).sort((a, b) => (b.createdOn ?? 0) - (a.createdOn ?? 0)).slice(0, params.limit ?? 10)
          await resolveNames(rows.map((i) => i.assignee))
          break
        }
        case 'sprints': {
          const sprints: Sprint[] = await client.findAll(tracker.class.Sprint, { state: 'active', ...(params.project ? { space: params.project } : {}) })
          const out: typeof progress = []
          for (const s of sprints) {
            const list = await client.findAll(tracker.class.Issue, { sprint: s._id })
            out.push({ label: s.name, sub: `${projectName.get(s.space) ?? ''} · ${Math.max(0, Math.ceil((s.endDate - Date.now()) / DAY))}d left`, done: list.filter((i) => doneIds.includes(i.status)).length, total: list.length })
          }
          progress = out
          break
        }
        case 'workload': {
          const list = await baseIssues({ status: { $in: openIds }, assignee: { $ne: null } })
          const counts = new Map<Ref<Person>, number>()
          for (const i of list) if (i.assignee != null) counts.set(i.assignee, (counts.get(i.assignee) ?? 0) + 1)
          await resolveNames(Array.from(counts.keys()))
          groups = Array.from(counts.entries()).map(([id, n]) => ({ label: names.get(id) ?? '—', n })).sort((a, b) => b.n - a.n).slice(0, params.limit ?? 8)
          break
        }
        case 'decisions': {
          decisions = await client.findAll(tracker.class.Decision, params.project ? { space: params.project } : {}, { limit: params.limit ?? 6, sort: { modifiedOn: SortingOrder.Descending } })
          break
        }
        case 'query': {
          const r = await runQuery(String(params.text ?? ''), params.limit ?? 10)
          rows = r.issues
          errors = r.errors
          await resolveNames(rows.map((i) => i.assignee))
          break
        }
        case 'pie': {
          const field: string = params.field ?? 'status'
          const list = await baseIssues(params.includeDone === true ? {} : { status: { $in: openIds } })
          await resolveNames(list.map((i) => i.assignee))
          const m = new Map<string, number>()
          for (const i of list) m.set(fieldOf(i, field), (m.get(fieldOf(i, field)) ?? 0) + 1)
          groups = Array.from(m.entries()).map(([label, n], k) => ({ label, n, color: PALETTE[k % PALETTE.length] })).sort((a, b) => b.n - a.n)
          break
        }
        case 'two-dim': {
          const xf: string = params.x ?? 'status'
          const yf: string = params.y ?? 'assignee'
          const list = await baseIssues(params.includeDone === true ? {} : { status: { $in: openIds } })
          await resolveNames(list.map((i) => i.assignee))
          const xs = Array.from(new Set(list.map((i) => fieldOf(i, xf)))).sort()
          const ys = Array.from(new Set(list.map((i) => fieldOf(i, yf)))).sort()
          const cells = ys.map((y) => xs.map((x) => list.filter((i) => fieldOf(i, xf) === x && fieldOf(i, yf) === y).length))
          table = { x: xs, y: ys, cells }
          break
        }
        case 'cvr': {
          const days = params.days ?? 30
          const since = startOfDay(Date.now()) - (days - 1) * DAY
          const created = await baseIssues({ createdOn: { $gte: since } })
          const msgs = await client.findAll(activity.class.DocUpdateMessage, { objectClass: tracker.class.Issue, action: 'update', createdOn: { $gte: since } }, { limit: 20000 })
          const done = new Set(doneIds)
          const ids = new Set((await baseIssues({})).map((i) => i._id))
          const resolvedAt = new Map<string, number>()
          for (const m of msgs) {
            const u = m.attributeUpdates
            if (u?.attrKey === 'status' && done.has(u.set[0] as Ref<IssueStatus>) && !resolvedAt.has(m.objectId) && ids.has(m.objectId as Ref<Issue>)) resolvedAt.set(m.objectId, m.createdOn ?? m.modifiedOn)
          }
          const dayList: number[] = []
          for (let d = since; d <= startOfDay(Date.now()); d += DAY) dayList.push(d)
          const a = dayList.map(() => 0)
          const b = dayList.map(() => 0)
          const idx = (t: number): number => Math.min(dayList.length - 1, Math.max(0, Math.floor((t - since) / DAY)))
          for (const i of created) if (i.createdOn !== undefined) a[idx(i.createdOn)]++
          for (const t of resolvedAt.values()) b[idx(t)]++
          series = { days: dayList, a, b }
          break
        }
        case 'avg-age': {
          const days = params.days ?? 30
          const today = startOfDay(Date.now())
          const since = today - (days - 1) * DAY
          const list = await baseIssues({})
          const msgs = await client.findAll(activity.class.DocUpdateMessage, { objectClass: tracker.class.Issue, action: 'update', createdOn: { $gte: since - 180 * DAY } }, { limit: 50000, sort: { createdOn: SortingOrder.Ascending } })
          const byIssue = new Map<string, Array<{ at: number, status: Ref<IssueStatus> }>>()
          for (const m of msgs) if (m.attributeUpdates?.attrKey === 'status') byIssue.set(m.objectId, [...(byIssue.get(m.objectId) ?? []), { at: m.createdOn ?? m.modifiedOn, status: m.attributeUpdates.set[0] as Ref<IssueStatus> }])
          const isDone = (st: Ref<IssueStatus> | undefined): boolean => st !== undefined && doneIds.includes(st)
          const statusAt = (i: Issue, t: number): Ref<IssueStatus> | undefined => {
            const l = byIssue.get(i._id)
            if (l === undefined) return i.status
            let s: Ref<IssueStatus> | undefined
            for (const c of l) if (c.at <= t) s = c.status
            return s
          }
          const dayList: number[] = []
          for (let d = since; d <= today; d += DAY) dayList.push(d)
          const a = dayList.map((d) => {
            const eod = d + DAY - 1
            const open = list.filter((i) => (i.createdOn ?? 0) <= eod && !isDone(statusAt(i, eod)))
            return open.length === 0 ? 0 : Math.round((open.reduce((acc, i) => acc + (eod - (i.createdOn ?? eod)) / DAY, 0) / open.length) * 10) / 10
          })
          series = { days: dayList, a }
          kpi = { value: `${a[a.length - 1] ?? 0}d`, sub: 'average age of open issues today' }
          break
        }
        case 'sla': {
          rows = (await baseIssues({ status: { $in: openIds }, slaDue: { $lt: Date.now() + (params.hours ?? 24) * 3_600_000 } })).sort((a, b) => (a.slaDue ?? 0) - (b.slaDue ?? 0)).slice(0, params.limit ?? 10)
          await resolveNames(rows.map((i) => i.assignee))
          break
        }
        case 'activity': {
          const msgs = await client.findAll(activity.class.DocUpdateMessage, { objectClass: tracker.class.Issue }, { limit: params.limit ?? 10, sort: { createdOn: SortingOrder.Descending } })
          const ids = Array.from(new Set(msgs.map((m) => m.objectId as Ref<Issue>)))
          const issues = ids.length > 0 ? await client.findAll(tracker.class.Issue, { _id: { $in: ids } }) : []
          const byId = new Map(issues.map((i) => [i._id, i]))
          feed = msgs.map((m) => {
            const i = byId.get(m.objectId as Ref<Issue>)
            const u = m.attributeUpdates
            const what = m.action === 'create' ? 'created' : u !== undefined ? `${u.attrKey}${u.attrKey === 'status' && u.set[0] != null ? ' → ' + (statusName.get(u.set[0] as Ref<IssueStatus>) ?? '') : ''}` : m.action
            return { when: m.createdOn ?? m.modifiedOn, text: `${i?.identifier ?? ''} ${what}`, id: m.objectId as Ref<Issue> }
          })
          break
        }
        case 'hours': {
          const d = new Date()
          d.setHours(0, 0, 0, 0)
          const start = d.getTime() - ((d.getDay() + 6) % 7) * DAY
          const reports: TimeSpendReport[] = await client.findAll(tracker.class.TimeSpendReport, { date: { $gte: start, $lt: start + 7 * DAY } }, { limit: 5000 })
          const m = new Map<string, number>()
          for (const r of reports) m.set(r.employee ?? 'none', (m.get(r.employee ?? 'none') ?? 0) + r.value)
          await resolveNames(Array.from(m.keys()).filter((k) => k !== 'none') as Ref<Person>[])
          groups = Array.from(m.entries()).map(([id, n]) => ({ label: id === 'none' ? '—' : names.get(id as Ref<Person>) ?? '…', n: Math.round(n * 10) / 10 })).sort((a, b) => b.n - a.n)
          break
        }
        case 'labels': {
          const list = await baseIssues({ status: { $in: openIds } })
          const ids = new Set(list.map((i) => i._id))
          const refs = await client.findAll(tags.class.TagReference, { attachedToClass: tracker.class.Issue }, { limit: 20000 })
          const m = new Map<string, number>()
          for (const r of refs) if (ids.has(r.attachedTo as Ref<Issue>)) m.set(r.title, (m.get(r.title) ?? 0) + 1)
          groups = Array.from(m.entries()).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, params.limit ?? 10)
          break
        }
        case 'countdown': {
          const ms: Milestone[] = await client.findAll(tracker.class.Milestone, { status: { $nin: [MilestoneStatus.Completed, MilestoneStatus.Canceled] }, ...(params.project ? { space: params.project } : {}) }, { limit: 50 })
          const sps: Sprint[] = await client.findAll(tracker.class.Sprint, { state: 'active', ...(params.project ? { space: params.project } : {}) })
          countdown = [
            ...ms.filter((m) => (m as any).archived !== true).map((m) => ({ label: m.label, sub: `${projectName.get(m.space) ?? ''} · milestone`, days: Math.ceil((m.targetDate - Date.now()) / DAY) })),
            ...sps.map((s) => ({ label: s.name, sub: `${projectName.get(s.space) ?? ''} · sprint`, days: Math.ceil((s.endDate - Date.now()) / DAY) }))
          ].sort((a, b) => a.days - b.days).slice(0, params.limit ?? 6)
          break
        }
        case 'burndown': {
          const sps: Sprint[] = await client.findAll(tracker.class.Sprint, { state: 'active', ...(params.project ? { space: params.project } : {}) }, { limit: 1 })
          const s = sps[0]
          if (s === undefined) {
            burn = undefined
            break
          }
          const list = await client.findAll(tracker.class.Issue, { sprint: s._id })
          const pts = list.some((i) => (i.storyPoints ?? 0) > 0)
          const size = (i: Issue): number => (pts ? i.storyPoints ?? 0 : 1)
          const total = list.reduce((a, i) => a + size(i), 0)
          const msgs = await client.findAll(activity.class.DocUpdateMessage, { objectClass: tracker.class.Issue, objectId: { $in: list.map((i) => i._id) }, action: 'update' }, { limit: 20000, sort: { createdOn: SortingOrder.Ascending } })
          const byIssue = new Map<string, Array<{ at: number, status: Ref<IssueStatus> }>>()
          for (const m of msgs) if (m.attributeUpdates?.attrKey === 'status') byIssue.set(m.objectId, [...(byIssue.get(m.objectId) ?? []), { at: m.createdOn ?? m.modifiedOn, status: m.attributeUpdates.set[0] as Ref<IssueStatus> }])
          const start = startOfDay(s.startDate)
          const end = startOfDay(s.endDate)
          const today = startOfDay(Date.now())
          const days: number[] = []
          for (let d = start; d <= end; d += DAY) days.push(d)
          const span = Math.max(1, (end - start) / DAY)
          const ideal = days.map((d) => Math.max(0, total * (1 - (d - start) / DAY / span)))
          const remaining = days.filter((d) => d <= today).map((d) => {
            const eod = d + DAY - 1
            return list.filter((i) => (i.createdOn ?? 0) <= eod).reduce((a, i) => {
              const l = byIssue.get(i._id)
              let st: Ref<IssueStatus> | undefined = l === undefined ? i.status : undefined
              if (l !== undefined) for (const c of l) if (c.at <= eod) st = c.status
              return a + (st !== undefined && doneIds.includes(st) ? 0 : size(i))
            }, 0)
          })
          burn = { total, remaining, ideal }
          kpi = { value: `${remaining[remaining.length - 1] ?? total} / ${total}`, sub: `${s.name} · ${pts ? 'points' : 'issues'} remaining` }
          break
        }
        case 'csat': {
          const list = (await baseIssues({})).filter((i) => typeof i.csat === 'number')
          const avg = list.length > 0 ? list.reduce((a, i) => a + (i.csat ?? 0), 0) / list.length : 0
          groups = [5, 4, 3, 2, 1].map((v) => ({ label: '★'.repeat(v), n: list.filter((i) => i.csat === v).length }))
          kpi = { value: list.length > 0 ? avg.toFixed(2) : '—', sub: `${list.length} ratings` }
          break
        }
        case 'heatmap': {
          const list = await baseIssues({ createdOn: { $gte: Date.now() - (params.days ?? 90) * DAY } })
          const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          const counts = dow.map(() => 0)
          for (const i of list) if (i.createdOn !== undefined) counts[(new Date(i.createdOn).getDay() + 6) % 7]++
          groups = dow.map((d, k) => ({ label: d, n: counts[k] }))
          break
        }
        case 'text':
        case 'links':
          break
      }
    } finally {
      busy = false
    }
  }
  $: if (statuses.length > 0 && projects.length >= 0 && tick >= 0) void load()

  $: maxN = Math.max(1, ...groups.map((g) => g.n))
  $: total = groups.reduce((a, g) => a + g.n, 0)

  function open (i: Issue): void {
    showPanel(view.component.EditDoc, i._id, i._class, 'content')
  }
  function ago (ts: number): string {
    const d = Math.floor((Date.now() - ts) / DAY)
    return d <= 0 ? 'today' : d === 1 ? '1d' : d + 'd'
  }
  function due (ts: number | null | undefined): string {
    if (ts == null) return ''
    const d = Math.ceil((ts - Date.now()) / DAY)
    return d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`
  }
  function hoursLeft (ts: number | null | undefined): string {
    if (ts == null) return ''
    const h = Math.round((ts - Date.now()) / 3_600_000)
    return h < 0 ? `${-h}h breached` : `${h}h`
  }
  function arc (s: number, e: number): string {
    const r = 40
    const ri = 24
    const cx = 50
    const cy = 50
    const a0 = s * 2 * Math.PI - Math.PI / 2
    const a1 = Math.min(e, 0.9999) * 2 * Math.PI - Math.PI / 2
    const large = e - s > 0.5 ? 1 : 0
    const p = (a: number, rad: number): string => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
    return `M${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, ri)} A${ri},${ri} 0 ${large} 0 ${p(a0, ri)} Z`
  }
  function lx (i: number, n: number): number {
    return 4 + (i / Math.max(1, n - 1)) * 292
  }
  function ly (v: number, max: number): number {
    return 4 + (1 - v / max) * 92
  }
  function linePath (vals: number[], n: number, max: number): string {
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${lx(i, n).toFixed(1)},${ly(v, max).toFixed(1)}`).join(' ')
  }
  const linkItems = (): Array<{ label: string, url: string }> =>
    String(params.items ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((l) => {
        const [label, url] = l.split('|').map((s) => s.trim())
        return { label: label ?? l, url: url ?? label ?? '' }
      })
</script>

<div class="w" class:w--wall={wall}>
  {#if busy && rows.length === 0 && groups.length === 0 && series === undefined && table === undefined}
    <p class="muted">…</p>
  {/if}
  {#if errors.length > 0}<ul class="errs">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}
  {#if params.filter}<span class="filt">filter: {params.filter}</span>{/if}
  {#if kpi !== undefined}<div class="kpi"><span class="kpi__v">{kpi.value}</span><span class="kpi__s">{kpi.sub}</span></div>{/if}

  {#if ['mine', 'workload', 'hours', 'labels', 'csat', 'heatmap'].includes(type)}
    <div class="bars">
      {#each groups as g (g.label)}
        <div class="bar-row"><span class="bar-row__label" class:bar-row__label--wide={['workload', 'hours', 'labels'].includes(type)}>{g.label}</span><span class="track"><span class="fill" class:fill--blue={type === 'workload' || type === 'heatmap'} style="width: {(g.n / maxN) * 100}%" /></span><span class="bar-row__n">{g.n}{type === 'hours' ? 'h' : ''}</span></div>
      {/each}
      {#if groups.length === 0 && !busy}<p class="muted">Nothing here.</p>{/if}
    </div>
  {/if}

  {#if ['mine', 'due', 'stale', 'query', 'sla', 'recent'].includes(type)}
    {#each rows as i, idx (i._id)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { open(i) }}>
        <span class="row__id">{i.identifier}</span>
        <span class="row__title">{i.title}</span>
        {#if type === 'due'}<span class="row__meta" class:row__meta--late={(i.dueDate ?? 0) < Date.now()}>{due(i.dueDate)}</span>
        {:else if type === 'stale'}<span class="row__meta">{ago(i.modifiedOn)}</span>
        {:else if type === 'recent'}<span class="row__meta">{ago(i.createdOn ?? i.modifiedOn)} · {i.assignee != null ? names.get(i.assignee) ?? '' : 'unassigned'}</span>
        {:else if type === 'sla'}<span class="row__meta" class:row__meta--late={(i.slaDue ?? 0) < Date.now()}>{hoursLeft(i.slaDue)}</span>
        {:else}<span class="row__meta">{statusName.get(i.status) ?? ''}</span>{/if}
      </button>
    {/each}
    {#if rows.length === 0 && !busy && errors.length === 0}<p class="muted">Nothing here.</p>{/if}
  {/if}

  {#if type === 'sprints'}
    {#each progress as p (p.label)}
      <div class="sprint"><div class="sprint__head"><span class="sprint__name">{p.label}</span><span class="sprint__meta">{p.sub}</span></div><span class="track track--wide"><span class="fill" style="width: {p.total === 0 ? 0 : (p.done / p.total) * 100}%" /></span><span class="sprint__n">{p.done} / {p.total}</span></div>
    {/each}
    {#if progress.length === 0 && !busy}<p class="muted">No active sprint.</p>{/if}
  {/if}

  {#if type === 'decisions'}
    {#each decisions as d, idx (d._id)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { showPanel(view.component.EditDoc, d._id, d._class, 'content') }}><span class="row__title">{d.title}</span><span class="row__meta">{ago(d.modifiedOn)}</span></button>
    {/each}
    {#if decisions.length === 0 && !busy}<p class="muted">No decisions yet.</p>{/if}
  {/if}

  {#if type === 'pie'}
    <div class="pie">
      <svg viewBox="0 0 100 100" class="pie__svg" role="img">
        {#each groups as g, k}
          {@const s = groups.slice(0, k).reduce((a, x) => a + x.n, 0) / Math.max(1, total)}
          <path d={arc(s, s + g.n / Math.max(1, total))} fill={g.color}><title>{g.label}: {g.n}</title></path>
        {/each}
        <text x="50" y="54" text-anchor="middle" class="pie__n">{total}</text>
      </svg>
      <ul class="pie__legend">{#each groups.slice(0, 8) as g}<li><i class="sw" style="background: {g.color}" />{g.label}<span class="muted">{g.n}</span></li>{/each}</ul>
    </div>
  {/if}

  {#if type === 'two-dim' && table !== undefined}
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th class="th"></th>{#each table.x as x}<th class="th">{x}</th>{/each}<th class="th">Σ</th></tr></thead>
        <tbody>
          {#each table.y as y, yi}
            <tr><td class="td td--name">{y}</td>{#each table.cells[yi] as n}<td class="td td--num" class:td--hot={n > 0}>{n === 0 ? '' : n}</td>{/each}<td class="td td--num td--sum">{table.cells[yi].reduce((a, b) => a + b, 0)}</td></tr>
          {/each}
          <tr><td class="td td--name td--sum">Σ</td>{#each table.x as _, xi}<td class="td td--num td--sum">{table.cells.reduce((a, r) => a + r[xi], 0)}</td>{/each}<td class="td td--num td--sum">{table.cells.flat().reduce((a, b) => a + b, 0)}</td></tr>
        </tbody>
      </table>
    </div>
  {/if}

  {#if (type === 'cvr' || type === 'avg-age') && series !== undefined}
    {@const n = series.days.length}
    {@const max = Math.max(1, ...series.a, ...(series.b ?? []))}
    <svg viewBox="0 0 300 100" class="line-chart" role="img">
      <path d={linePath(series.a, n, max)} class="ln" class:ln--red={type === 'cvr'} class:ln--lime={type === 'avg-age'} />
      {#if series.b !== undefined}<path d={linePath(series.b, n, max)} class="ln ln--lime" />{/if}
    </svg>
    {#if type === 'cvr'}<div class="legend"><span><i class="sw sw--red" />created {series.a.reduce((a, b) => a + b, 0)}</span><span><i class="sw sw--lime" />resolved {(series.b ?? []).reduce((a, b) => a + b, 0)}</span></div>{/if}
  {/if}

  {#if type === 'burndown'}
    {#if burn === undefined}
      {#if !busy}<p class="muted">No active sprint.</p>{/if}
    {:else}
      {@const n = burn.ideal.length}
      {@const max = Math.max(1, burn.total)}
      <svg viewBox="0 0 300 100" class="line-chart" role="img">
        <path d={linePath(burn.ideal, n, max)} class="ln ln--grey" />
        <path d={linePath(burn.remaining, n, max)} class="ln ln--lime" />
      </svg>
    {/if}
  {/if}

  {#if type === 'countdown'}
    {#each countdown as c (c.label + c.sub)}
      <div class="cd"><span class="cd__n" class:cd__n--late={c.days < 0}>{c.days < 0 ? `${-c.days}d over` : `${c.days}d`}</span><div class="cd__t"><span class="cd__l">{c.label}</span><span class="cd__s">{c.sub}</span></div></div>
    {/each}
    {#if countdown.length === 0 && !busy}<p class="muted">Nothing scheduled.</p>{/if}
  {/if}

  {#if type === 'activity'}
    {#each feed as f, idx (f.when + f.text)}
      <button class="row motion-rise" style="--i: {idx}" on:click={() => { showPanel(view.component.EditDoc, f.id, tracker.class.Issue, 'content') }}><span class="row__title">{f.text}</span><span class="row__meta">{ago(f.when)}</span></button>
    {/each}
  {/if}

  {#if type === 'text'}
    <p class="text">{params.text ?? ''}</p>
  {/if}
  {#if type === 'links'}
    {#each linkItems() as l (l.url)}<a class="link" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>{/each}
  {/if}
</div>

<style lang="scss">
  .w { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; &--wall { font-size: 1.1rem; } }
  .muted { margin: 0.25rem 0 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .errs { margin: 0; padding-left: 1.2rem; font-size: 0.75rem; color: var(--negative-button-default); }
  .filt { font-size: 0.7rem; font-family: var(--mono-font, ui-monospace, Menlo, monospace); color: var(--theme-trans-color); }
  .kpi { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; }
  .kpi__v { font-size: 1.5rem; font-weight: 700; color: var(--theme-caption-color); }
  .kpi__s { font-size: 0.75rem; color: var(--theme-trans-color); }
  .bars { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.4rem; }
  .bar-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--theme-dark-color); }
  .bar-row__label { width: 4rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &--wide { width: 8rem; } }
  .bar-row__n { width: 2rem; text-align: right; color: var(--theme-caption-color); }
  .track { flex: 1; height: 0.4rem; border-radius: 999px; background: var(--theme-button-pressed); overflow: hidden; &--wide { height: 0.5rem; } }
  .fill { display: block; height: 100%; border-radius: inherit; background: var(--accent-brand); transition: width var(--motion-slow) var(--ease-enter); &--blue { background: var(--primary-button-default); } }
  .row { display: flex; align-items: baseline; gap: 0.5rem; width: 100%; padding: 0.3rem 0.4rem; border: none; border-radius: 0.375rem; background: transparent; color: var(--theme-content-color); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); } }
  .row__id { flex-shrink: 0; font-size: 0.7rem; color: var(--theme-trans-color); }
  .row__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row__meta { flex-shrink: 0; font-size: 0.7rem; color: var(--theme-trans-color); &--late { color: var(--negative-button-default); font-weight: 600; } }
  .sprint { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.25rem 0.6rem; padding: 0.3rem 0; }
  .sprint__head { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.8125rem; }
  .sprint__name { font-weight: 500; color: var(--theme-caption-color); }
  .sprint__meta, .sprint__n { font-size: 0.7rem; color: var(--theme-trans-color); }
  .pie { display: flex; align-items: center; gap: 1rem; }
  .pie__svg { width: 7rem; height: 7rem; flex-shrink: 0; }
  .pie__n { fill: var(--theme-caption-color); font-size: 14px; font-weight: 700; }
  .pie__legend { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.75rem; color: var(--theme-content-color); li { display: flex; align-items: center; gap: 0.4rem; } .muted { margin: 0 0 0 auto; } }
  .sw { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 2px; flex-shrink: 0; &--red { background: #e0475b; } &--lime { background: var(--accent-brand); } }
  .line-chart { width: 100%; height: auto; }
  .ln { fill: none; stroke-width: 2; stroke-linejoin: round; stroke: var(--theme-content-color); &--red { stroke: #e0475b; } &--lime { stroke: var(--accent-brand); } &--grey { stroke: var(--theme-trans-color); stroke-dasharray: 4 4; } }
  .legend { display: flex; gap: 1rem; font-size: 0.75rem; color: var(--theme-dark-color); span { display: inline-flex; align-items: center; gap: 0.3rem; } }
  .tbl-wrap { overflow-x: auto; }
  .tbl { border-collapse: collapse; font-size: 0.75rem; }
  .th, .td { padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--theme-divider-color); white-space: nowrap; }
  .th { font-weight: 600; color: var(--theme-dark-color); text-align: right; }
  .td { text-align: right; color: var(--theme-content-color); &--name { text-align: left; color: var(--theme-caption-color); } &--num { font-variant-numeric: tabular-nums; } &--hot { background: var(--accent-brand-soft); } &--sum { font-weight: 600; color: var(--theme-caption-color); } }
  .cd { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; }
  .cd__n { min-width: 4rem; font-size: 1.1rem; font-weight: 700; color: var(--theme-caption-color); &--late { color: var(--negative-button-default); } }
  .cd__t { display: flex; flex-direction: column; min-width: 0; }
  .cd__l { font-size: 0.8125rem; color: var(--theme-caption-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cd__s { font-size: 0.7rem; color: var(--theme-trans-color); }
  .text { margin: 0; white-space: pre-wrap; font-size: 0.875rem; color: var(--theme-content-color); line-height: 1.5; }
  .link { display: block; padding: 0.25rem 0; color: var(--primary-button-default); font-size: 0.875rem; &:hover { text-decoration: underline; } }
</style>
