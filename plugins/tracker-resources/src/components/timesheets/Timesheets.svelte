<!--
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
-->
<!--
  Timesheets: hours per person per day for one week, from the time reports
  people log on issues, with a submit → approve/reject flow per person and
  week, billing rates (cost = hours × rate) and CSV export. A summary of
  work people chose to record, not a measure of presence.
-->
<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import core, { AccountRole, getCurrentAccount, hasAccountRole, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type BillingRate, type Project, type TimeSpendReport, type TimesheetApproval } from '@hcengineering/tracker'
  import { Button, IconBack, IconForward, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const client = getClient()
  const me = getCurrentEmployee()
  const canApprove = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const query = createQuery()
  const approvalsQ = createQuery()
  const ratesQ = createQuery()
  const prevQ = createQuery()
  const prevApprovalQ = createQuery()
  const projQ = createQuery()
  const DAY = 86_400_000

  function startOfWeek (t: number): number {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    const dow = (d.getDay() + 6) % 7
    return d.getTime() - dow * DAY
  }
  let weekStart = startOfWeek(Date.now())
  $: days = Array.from({ length: 7 }, (_, i) => weekStart + i * DAY)

  let reports: TimeSpendReport[] = []
  let approvals: TimesheetApproval[] = []
  let rates: BillingRate[] = []
  $: query.query(tracker.class.TimeSpendReport, { date: { $gte: weekStart, $lt: weekStart + 7 * DAY } }, (r) => { reports = r }, { limit: 5000 })
  $: approvalsQ.query(tracker.class.TimesheetApproval, { weekStart }, (r) => { approvals = r })
  ratesQ.query(tracker.class.BillingRate, {}, (r) => { rates = r })
  $: rateOf = new Map(rates.map((r) => [r.employee, r]))

  let names = new Map<string, string>()
  async function resolveNames (list: TimeSpendReport[]): Promise<void> {
    const ids = Array.from(new Set(list.map((r) => r.employee).filter((e): e is Ref<Employee> => e != null)))
    const missing = ids.filter((id) => !names.has(id))
    if (missing.length === 0) return
    const people = await client.findAll(contact.class.Person, { _id: { $in: missing as unknown as Ref<Person>[] } })
    const next = new Map(names)
    for (const p of people) next.set(p._id, formatName(p.name))
    names = next
  }
  $: void resolveNames(reports)

  interface Row {
    key: string
    employee: Ref<Employee> | undefined
    name: string
    cells: number[]
    total: number
    rate?: BillingRate
    cost: number
    approval?: TimesheetApproval
  }
  $: rows = ((): Row[] => {
    const by = new Map<string, number[]>()
    for (const r of reports) {
      const key = r.employee ?? 'none'
      const cells = by.get(key) ?? Array.from({ length: 7 }, () => 0)
      const idx = r.date != null ? Math.floor((r.date - weekStart) / DAY) : -1
      if (idx >= 0 && idx < 7) cells[idx] += r.value
      by.set(key, cells)
    }
    return Array.from(by.entries())
      .map(([key, cells]) => {
        const employee = key === 'none' ? undefined : (key as Ref<Employee>)
        const total = cells.reduce((a, b) => a + b, 0)
        const rate = employee !== undefined ? rateOf.get(employee) : undefined
        return { key, employee, name: key === 'none' ? '—' : names.get(key) ?? '…', cells, total, rate, cost: rate !== undefined ? total * rate.rate : 0, approval: employee !== undefined ? approvals.find((a) => a.employee === employee) : undefined }
      })
      .sort((a, b) => b.total - a.total)
  })()
  $: dayTotals = days.map((_, i) => rows.reduce((a, r) => a + r.cells[i], 0))
  $: grand = dayTotals.reduce((a, b) => a + b, 0)
  $: grandCost = rows.reduce((a, r) => a + r.cost, 0)
  $: currency = rates[0]?.currency ?? ''

  // ---- reminder: last week has my hours but no submitted timesheet ---------------
  const prevWeek = startOfWeek(Date.now()) - 7 * DAY
  let prevReports: TimeSpendReport[] = []
  let prevApproval: TimesheetApproval | undefined
  let projects: Project[] = []
  prevQ.query(tracker.class.TimeSpendReport, { employee: me as any, date: { $gte: prevWeek, $lt: prevWeek + 7 * DAY } }, (r) => { prevReports = r }, { limit: 1000 })
  prevApprovalQ.query(tracker.class.TimesheetApproval, { employee: me as any, weekStart: prevWeek }, (r) => { prevApproval = r[0] })
  projQ.query(tracker.class.Project, {}, (r) => { projects = r })
  $: prevHours = prevReports.reduce((a, r) => a + r.value, 0)
  $: needsSubmit = prevHours > 0 && (prevApproval === undefined || prevApproval.state === 'rejected')
  $: unsubmitted = canApprove ? rows.filter((r) => r.employee !== undefined && r.total > 0 && r.approval === undefined) : []
  async function submitLastWeek (): Promise<void> {
    if (prevApproval !== undefined) await client.update(prevApproval, { state: 'submitted', approver: undefined, note: undefined, decidedOn: undefined })
    else await client.createDoc(tracker.class.TimesheetApproval, core.space.Workspace, { employee: me as any, weekStart: prevWeek, state: 'submitted' })
  }

  // ---- invoicing export: hours × rate, grouped by project then person ------------
  interface InvoiceLine {
    project: string
    person: string
    hours: number
    rate: number
    currency: string
    amount: number
  }
  function linesFor (list: TimeSpendReport[]): InvoiceLine[] {
    const projectName = new Map(projects.map((p) => [p._id, `${p.name} (${p.identifier})`]))
    const m = new Map<string, InvoiceLine>()
    for (const r of list) {
      const project = projectName.get(r.space as any) ?? String(r.space)
      const person = r.employee != null ? names.get(r.employee) ?? '…' : '—'
      const rate = r.employee != null ? rateOf.get(r.employee) : undefined
      const k = project + '|' + person
      const line = m.get(k) ?? { project, person, hours: 0, rate: rate?.rate ?? 0, currency: rate?.currency ?? currency, amount: 0 }
      line.hours += r.value
      line.amount = line.hours * line.rate
      m.set(k, line)
    }
    return Array.from(m.values()).sort((a, b) => a.project.localeCompare(b.project) || b.amount - a.amount)
  }
  async function exportInvoice (scope: 'week' | 'month'): Promise<void> {
    let start = weekStart
    let end = weekStart + 7 * DAY
    if (scope === 'month') {
      const d = new Date(weekStart)
      start = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
    }
    const list = scope === 'week' ? reports : await client.findAll(tracker.class.TimeSpendReport, { date: { $gte: start, $lt: end } }, { limit: 20000 })
    await resolveNames(list)
    const lines = linesFor(list)
    const total = lines.reduce((a, l) => a + l.amount, 0)
    const hours = lines.reduce((a, l) => a + l.hours, 0)
    const cur = lines.find((l) => l.currency !== '')?.currency ?? currency
    const fmtN = (n: number): string => (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const period = `${new Date(start).toLocaleDateString()} – ${new Date(end - 1).toLocaleDateString()}`
    const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)
    let project = ''
    const rowsHtml = lines.map((l) => {
      const head = l.project !== project ? `<tr class="g"><td colspan="5">${esc(l.project)}</td></tr>` : ''
      project = l.project
      return head + `<tr><td></td><td>${esc(l.person)}</td><td class="n">${fmtN(l.hours)}</td><td class="n">${l.rate > 0 ? fmtN(l.rate) + ' ' + esc(l.currency) : '—'}</td><td class="n">${l.rate > 0 ? fmtN(l.amount) + ' ' + esc(l.currency) : '—'}</td></tr>`
    }).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(period)}</title><style>body{font:14px/1.5 system-ui,sans-serif;color:#15171c;margin:2rem;max-width:56rem}h1{font-size:1.4rem;margin:0}p.m{color:#6b7280;margin:.2rem 0 1.2rem}table{width:100%;border-collapse:collapse}th,td{padding:.45rem .5rem;border-bottom:1px solid #e5e7eb;text-align:left}th{font-size:.7rem;letter-spacing:.05em;text-transform:uppercase;color:#6b7280}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.g td{font-weight:700;background:#f6f7f9}tfoot td{font-weight:700;border-top:2px solid #15171c}.bar{display:flex;gap:.5rem;margin-bottom:1rem}button{padding:.45rem .9rem;border:1px solid #d1d5db;border-radius:.4rem;background:#fff;cursor:pointer}@media print{.bar{display:none}}  .remind { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0; padding: 0.6rem 0.9rem; border: 1px solid var(--accent-brand); border-radius: 0.6rem; background: var(--accent-brand-soft); font-size: 0.875rem; color: var(--theme-caption-color); &--soft { border-style: dashed; background: transparent; color: var(--theme-dark-color); font-size: 0.8125rem; } i { color: var(--theme-dark-color); } }
</style></head><body><div class="bar"><button onclick="window.print()">Print / save as PDF</button></div><h1>Timesheet invoice</h1><p class="m">Period ${esc(period)} · generated ${esc(new Date().toLocaleString())}</p><table><thead><tr><th>Project</th><th>Person</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">${fmtN(hours)}</td><td></td><td class="n">${fmtN(total)} ${esc(cur)}</td></tr></tfoot></table></body></html>`
    const w = window.open('', '_blank')
    if (w !== null) {
      w.document.open()
      w.document.write(html)
      w.document.close()
    }
    const csvEsc = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [['Project', 'Person', 'Hours', 'Rate', 'Currency', 'Amount'].map(csvEsc).join(','), ...lines.map((l) => [l.project, l.person, Math.round(l.hours * 100) / 100, l.rate, l.currency, Math.round(l.amount * 100) / 100].map(csvEsc).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `invoice-${scope}-${new Date(start).toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---- approvals ----------------------------------------------------------
  async function setState (row: Row, state: TimesheetApproval['state'], note?: string): Promise<void> {
    if (row.employee === undefined) return
    if (row.approval !== undefined) {
      await client.update(row.approval, { state, approver: state === 'submitted' ? undefined : me, note, decidedOn: state === 'submitted' ? undefined : Date.now() })
    } else {
      await client.createDoc(tracker.class.TimesheetApproval, core.space.Workspace, { employee: row.employee, weekStart, state, approver: state === 'submitted' ? undefined : me, note, decidedOn: state === 'submitted' ? undefined : Date.now() })
    }
  }
  async function reject (row: Row): Promise<void> {
    const note = prompt('Reason (shown to the person)', '')
    if (note === null) return
    await setState(row, 'rejected', note)
  }
  async function setRate (row: Row): Promise<void> {
    if (row.employee === undefined) return
    const v = prompt(`Hourly rate for ${row.name}${currency !== '' ? ` (${currency})` : ''}`, String(row.rate?.rate ?? ''))
    if (v === null) return
    const n = Number(v)
    if (Number.isNaN(n) || n < 0) return
    const cur = prompt('Currency', row.rate?.currency ?? currency ?? 'USD') ?? 'USD'
    if (row.rate !== undefined) await client.update(row.rate, { rate: n, currency: cur })
    else await client.createDoc(tracker.class.BillingRate, core.space.Workspace, { employee: row.employee, rate: n, currency: cur })
  }

  // ---- export -------------------------------------------------------------
  function exportCsv (): void {
    const esc = (s: unknown): string => `"${String(s ?? '').replace(/"/g, '""')}"`
    const head = ['Person', ...days.map((d) => new Date(d).toISOString().slice(0, 10)), 'Total', 'Rate', 'Cost', 'State'].map(esc).join(',')
    const body = rows.map((r) => [r.name, ...r.cells.map((c) => Math.round(c * 100) / 100), Math.round(r.total * 100) / 100, r.rate?.rate ?? '', Math.round(r.cost * 100) / 100, r.approval?.state ?? ''].map(esc).join(','))
    const blob = new Blob([[head, ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `timesheet-${new Date(weekStart).toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function fmt (h: number): string {
    return h === 0 ? '' : String(Math.round(h * 10) / 10)
  }
  function fmtDay (t: number): string {
    return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
  }
  function fmtRange (): string {
    const a = new Date(weekStart)
    const b = new Date(weekStart + 6 * DAY)
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }
  const isToday = (t: number): boolean => Math.floor((Date.now() - t) / DAY) === 0 && Date.now() >= t
</script>

<div class="sheet">
  <header class="sheet__head">
    <span class="sheet__title"><Label label={tracker.string.Timesheets} /></span>
    <div class="sheet__nav">
      <Button icon={IconBack} kind={'ghost'} on:click={() => { weekStart -= 7 * DAY }} />
      <span class="sheet__range">{fmtRange()}</span>
      <Button icon={IconForward} kind={'ghost'} on:click={() => { weekStart += 7 * DAY }} />
      <Button kind={'ghost'} label={tracker.string.ThisWeek} on:click={() => { weekStart = startOfWeek(Date.now()) }} />
      <Button kind={'ghost'} label={tracker.string.ExportCsv} disabled={rows.length === 0} on:click={exportCsv} />
      <Button kind={'ghost'} label={tracker.string.InvoiceWeek} disabled={rows.length === 0} on:click={() => { void exportInvoice('week') }} />
      <Button kind={'ghost'} label={tracker.string.InvoiceMonth} on:click={() => { void exportInvoice('month') }} />
    </div>
  </header>

  {#if needsSubmit}
    <div class="remind motion-pop">
      <span>You logged <b>{Math.round(prevHours * 10) / 10}h</b> last week{prevApproval?.state === 'rejected' ? ' and the timesheet was returned' : ' but the timesheet is not submitted'}.{#if prevApproval?.note} <i>{prevApproval.note}</i>{/if}</span>
      <Button kind={'primary'} label={tracker.string.SubmitTimesheet} on:click={() => { void submitLastWeek() }} />
    </div>
  {/if}
  {#if unsubmitted.length > 0}
    <p class="remind remind--soft">Not yet submitted this week: {unsubmitted.map((r) => r.name).join(', ')}. The daily digest reminds people once the week has ended.</p>
  {/if}

  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th class="th th--name"><Label label={tracker.string.Person} /></th>
          {#each days as d}<th class="th" class:th--today={isToday(d)}>{fmtDay(d)}</th>{/each}
          <th class="th th--total"><Label label={tracker.string.Total} /></th>
          <th class="th">Rate</th>
          <th class="th">Cost</th>
          <th class="th th--name">State</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r, idx (r.key)}
          <tr class="tr motion-rise" style="--i: {idx}">
            <td class="td td--name">{r.name}</td>
            {#each r.cells as c, i}<td class="td td--num" class:td--today={isToday(days[i])}>{fmt(c)}</td>{/each}
            <td class="td td--num td--total">{fmt(r.total)}</td>
            <td class="td td--num">
              {#if canApprove}<button class="lnk" on:click={() => { void setRate(r) }}>{r.rate !== undefined ? `${r.rate.rate} ${r.rate.currency}` : 'set'}</button>{:else}{r.rate !== undefined ? `${r.rate.rate} ${r.rate.currency}` : ''}{/if}
            </td>
            <td class="td td--num">{r.cost > 0 ? `${Math.round(r.cost * 100) / 100} ${r.rate?.currency ?? ''}` : ''}</td>
            <td class="td td--state">
              {#if r.employee !== undefined}
                {#if r.approval !== undefined}<span class="pill pill--{r.approval.state}" title={r.approval.note ?? ''}>{r.approval.state}</span>{/if}
                {#if r.employee === me && (r.approval === undefined || r.approval.state === 'rejected')}
                  <button class="lnk" on:click={() => { void setState(r, 'submitted') }}>submit</button>
                {/if}
                {#if canApprove && r.approval?.state === 'submitted'}
                  <button class="lnk lnk--ok" on:click={() => { void setState(r, 'approved') }}>approve</button>
                  <button class="lnk lnk--bad" on:click={() => { void reject(r) }}>reject</button>
                {/if}
              {/if}
            </td>
          </tr>
        {/each}
        {#if rows.length === 0}<tr><td class="td td--empty" colspan="12"><Label label={tracker.string.NoTimeReported} /></td></tr>{/if}
      </tbody>
      {#if rows.length > 0}
        <tfoot>
          <tr>
            <td class="td td--name td--foot"><Label label={tracker.string.Total} /></td>
            {#each dayTotals as t}<td class="td td--num td--foot">{fmt(t)}</td>{/each}
            <td class="td td--num td--foot td--total">{fmt(grand)}</td>
            <td class="td td--foot" />
            <td class="td td--num td--foot">{grandCost > 0 ? `${Math.round(grandCost * 100) / 100} ${currency}` : ''}</td>
            <td class="td td--foot" />
          </tr>
        </tfoot>
      {/if}
    </table>
  </div>
</div>

<style lang="scss">
  .sheet { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; overflow: auto; }
  .sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .sheet__title { font-size: 1.125rem; font-weight: 600; color: var(--theme-caption-color); }
  .sheet__nav { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
  .sheet__range { min-width: 9rem; text-align: center; font-size: 0.875rem; color: var(--theme-caption-color); }
  .table-wrap { overflow-x: auto; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .th, .td { padding: 0.5rem 0.65rem; border-bottom: 1px solid var(--theme-divider-color); white-space: nowrap; }
  .th { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; text-align: right; color: var(--theme-dark-color); background: var(--theme-comp-header-color); &--name { text-align: left; } &--today { color: var(--accent-brand-ink); background: var(--accent-brand-soft); } }
  .td { color: var(--theme-content-color); &--name { color: var(--theme-caption-color); font-weight: 500; } &--num { text-align: right; font-variant-numeric: tabular-nums; } &--today { background: var(--accent-brand-soft); } &--total { font-weight: 600; color: var(--theme-caption-color); } &--foot { border-bottom: none; background: var(--theme-comp-header-color); font-weight: 600; } &--empty { text-align: center; color: var(--theme-trans-color); border-bottom: none; } &--state { display: flex; align-items: center; gap: 0.4rem; } }
  .tr:hover .td { background: var(--theme-button-hovered); }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.75rem; cursor: pointer; &:hover { text-decoration: underline; } &--ok { color: var(--accent-brand-ink); } &--bad { color: var(--negative-button-default); } }
  .pill { padding: 0.05rem 0.45rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; background: var(--theme-button-pressed); color: var(--theme-caption-color); &--approved { background: var(--accent-brand-soft); color: var(--accent-brand-ink); } &--rejected { background: rgba(203, 75, 66, 0.15); color: var(--negative-button-default); } }
</style>
