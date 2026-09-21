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
  Workspace notification defaults (Settings → Notification defaults, also in
  the Admin Center): for every event and delivery channel, what people get
  unless they changed it themselves, with optional per-role overrides. The
  server applies these when a person has no setting of their own.
-->
<script lang="ts">
  import core, { AccountRole, type Ref } from '@hcengineering/core'
  import notification, { type NotificationDefault, type NotificationGroup, type NotificationProvider, type NotificationType } from '@hcengineering/notification'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { themeStore } from '@hcengineering/ui'

  import { icon } from '../projects/icons'

  const client = getClient()
  const model = client.getModel()
  const types: NotificationType[] = model.findAllSync(notification.class.NotificationType, { hidden: false }).filter((t) => !t.generated)
  const groups: NotificationGroup[] = model.findAllSync(notification.class.NotificationGroup, {})
  const providers: NotificationProvider[] = model.findAllSync(notification.class.NotificationProvider, {}).sort((a, b) => a.order - b.order)

  const dq = createQuery()
  let defaults: NotificationDefault[] = []
  dq.query(notification.class.NotificationDefault, {}, (r) => { defaults = r })

  type RoleKey = 'all' | AccountRole
  const ROLES: Array<{ id: RoleKey, label: string }> = [
    { id: 'all', label: 'Everyone' },
    { id: AccountRole.Owner, label: 'Owners' },
    { id: AccountRole.Maintainer, label: 'Maintainers' },
    { id: AccountRole.User, label: 'Members' },
    { id: AccountRole.Guest, label: 'Guests' }
  ]
  let role: RoleKey = 'all'

  // labels are intl strings; translate once per language
  let labels = new Map<string, string>()
  async function loadLabels (lang: string): Promise<void> {
    const m = new Map<string, string>()
    for (const t of types) m.set(t._id, await translate(t.label, {}, lang))
    for (const g of groups) m.set(g._id, await translate(g.label, {}, lang))
    for (const p of providers) m.set(p._id, await translate(p.label, {}, lang))
    labels = m
  }
  $: void loadLabels($themeStore.language)
  $: name = (id: string): string => labels.get(id) ?? id

  const key = (t: Ref<NotificationType>, p: Ref<NotificationProvider>, r: RoleKey): string => `${t}|${p}|${r}`
  $: byKey = new Map(defaults.map((d) => [key(d.type, d.provider, (d.role ?? 'all') as RoleKey), d]))
  // reactive declarations: the table re-renders when the stored defaults or the role change
  $: current = (t: NotificationType, p: NotificationProvider): NotificationDefault | undefined => byKey.get(key(t._id, p._id, role))
  $: inherited = (t: NotificationType, p: NotificationProvider): boolean => {
    if (role !== 'all') {
      const all = byKey.get(key(t._id, p._id, 'all'))
      if (all !== undefined) return all.enabled
    }
    return t.defaultEnabled && p.defaultEnabled
  }

  async function set (t: NotificationType, p: NotificationProvider, value: 'inherit' | 'on' | 'off'): Promise<void> {
    const existing = current(t, p)
    if (value === 'inherit') {
      if (existing !== undefined) await client.remove(existing)
      return
    }
    const data = { type: t._id, provider: p._id, enabled: value === 'on', ...(role !== 'all' ? { role } : {}) }
    if (existing === undefined) await client.createDoc(notification.class.NotificationDefault, core.space.Workspace, data)
    else await client.update(existing, { enabled: value === 'on' })
  }
  async function setAll (p: NotificationProvider, value: 'inherit' | 'on' | 'off'): Promise<void> {
    for (const t of types) await set(t, p, value)
  }
  const grouped = (): Array<{ group: NotificationGroup | undefined, types: NotificationType[] }> => {
    const out: Array<{ group: NotificationGroup | undefined, types: NotificationType[] }> = []
    for (const g of groups) {
      const list = types.filter((t) => t.group === g._id)
      if (list.length > 0) out.push({ group: g, types: list })
    }
    const rest = types.filter((t) => !groups.some((g) => g._id === t.group))
    if (rest.length > 0) out.push({ group: undefined, types: rest })
    return out
  }
  $: sections = grouped()
  $: overrides = defaults.filter((d) => (role === 'all' ? d.role === undefined : d.role === role)).length
</script>

<div class="nd">
  <header class="nd__head">
    <span class="nd__ic">{@html icon('mail')}</span>
    <div>
      <h1>Notification defaults</h1>
      <p class="muted">What people receive unless they change it in their own settings. Pick a role to override the workspace default for that role only.</p>
    </div>
  </header>

  <div class="nd__bar">
    <div class="seg">
      {#each ROLES as r}<button class="seg__b" class:seg__b--on={role === r.id} on:click={() => { role = r.id }}>{r.label}</button>{/each}
    </div>
    <span class="muted">{overrides} override{overrides === 1 ? '' : 's'} for {ROLES.find((r) => r.id === role)?.label.toLowerCase()} · "Default" follows {role === 'all' ? 'the product default' : 'the Everyone row'}</span>
  </div>

  <div class="nd__scroll">
    <table class="tbl">
      <thead>
        <tr>
          <th>Event</th>
          {#each providers as p (p._id)}
            <th class="prov">
              <span>{name(p._id)}</span>
              <span class="prov__tools"><button class="lnk" on:click={() => { void setAll(p, 'on') }}>all on</button> · <button class="lnk" on:click={() => { void setAll(p, 'off') }}>all off</button> · <button class="lnk" on:click={() => { void setAll(p, 'inherit') }}>reset</button></span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sections as s}
          <tr class="grp"><td colspan={providers.length + 1}>{s.group !== undefined ? name(s.group._id) : 'Other'}</td></tr>
          {#each s.types as t (t._id)}
            <tr>
              <td class="ev">{name(t._id)}</td>
              {#each providers as p (p._id)}
                {@const d = current(t, p)}
                <td class="cell">
                  <select class="sel" class:sel--on={d?.enabled === true} class:sel--off={d?.enabled === false} value={d === undefined ? 'inherit' : d.enabled ? 'on' : 'off'} on:change={(e) => { void set(t, p, e.currentTarget.value === 'on' ? 'on' : e.currentTarget.value === 'off' ? 'off' : 'inherit') }}>
                    <option value="inherit">Default ({inherited(t, p) ? 'on' : 'off'})</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style lang="scss">
  .nd { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.25rem 1.5rem; height: 100%; overflow: hidden; }
  .nd__head { display: flex; gap: 0.75rem; align-items: flex-start; h1 { margin: 0; font-size: 1.35rem; color: var(--theme-caption-color); } p { margin: 0.2rem 0 0; max-width: 46rem; } }
  .nd__ic { display: inline-flex; margin-top: 0.3rem; color: var(--accent-brand); :global(svg) { width: 1.4rem; height: 1.4rem; } }
  .muted { color: var(--theme-dark-color); font-size: 0.8rem; }
  .nd__bar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; overflow: hidden; }
  .seg__b { border: none; background: transparent; padding: 0.35rem 0.7rem; font: inherit; font-size: 0.8rem; color: var(--theme-content-color); cursor: pointer; &--on { background: var(--theme-button-hovered); color: var(--theme-caption-color); font-weight: 600; } }
  .nd__scroll { overflow: auto; border: 1px solid var(--theme-divider-color); border-radius: 0.75rem; background: var(--theme-panel-color); flex: 1; }
  .tbl { width: 100%; border-collapse: separate; border-spacing: 0; th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--theme-divider-color); text-align: left; font-size: 0.82rem; } th { position: sticky; top: 0; background: var(--theme-panel-color); z-index: 1; font-size: 0.75rem; color: var(--theme-dark-color); } }
  .prov { min-width: 9rem; span { display: block; } }
  .prov__tools { font-weight: 400; font-size: 0.68rem; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.68rem; cursor: pointer; }
  .grp td { background: color-mix(in srgb, var(--theme-divider-color) 30%, transparent); font-weight: 700; color: var(--theme-caption-color); font-size: 0.75rem; }
  .ev { color: var(--theme-content-color); min-width: 16rem; }
  .sel { padding: 0.2rem 0.4rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-content-color); font: inherit; font-size: 0.78rem; &--on { border-color: #22c55e; } &--off { border-color: #f43f5e; } }
</style>
