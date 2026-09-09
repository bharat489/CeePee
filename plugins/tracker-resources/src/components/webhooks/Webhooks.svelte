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
  Webhooks settings. Workspace-wide: a hook receives events for issues in
  every project. Every delivery leaves its result on the row, so a dead
  endpoint is visible here rather than discovered weeks later.
-->
<script lang="ts">
  import core, { SortingOrder } from '@hcengineering/core'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { type Webhook, type WebhookEvent } from '@hcengineering/tracker'
  import { Button, EditBox, IconAdd, IconDelete, Label, Toggle } from '@hcengineering/ui'

  import tracker from '../../plugin'
  import { recordAudit } from '../../audit'

  const client = getClient()
  const query = createQuery()
  let hooks: Webhook[] = []
  query.query(
    tracker.class.Webhook,
    {},
    (r) => {
      hooks = r
    },
    { sort: { createdOn: SortingOrder.Ascending } }
  )

  const EVENTS: Array<{ id: WebhookEvent, label: string }> = [
    { id: 'issue.created', label: 'Issue created' },
    { id: 'issue.updated', label: 'Issue updated (includes status)' },
    { id: 'issue.status', label: 'Status changed' },
    { id: 'issue.deleted', label: 'Issue deleted' }
  ]

  let adding = false
  let name = ''
  let url = ''
  let secret = ''
  let events: WebhookEvent[] = ['issue.created', 'issue.updated']
  let format: 'json' | 'slack' = 'json'
  $: canAdd = name.trim() !== '' && /^https?:\/\/\S+$/i.test(url.trim()) && events.length > 0

  function toggleEvent (id: WebhookEvent): void {
    events = events.includes(id) ? events.filter((e) => e !== id) : [...events, id]
  }

  async function add (): Promise<void> {
    if (!canAdd) return
    await client.createDoc(tracker.class.Webhook, core.space.Workspace, {
      name: name.trim(),
      url: url.trim(),
      secret: secret.trim() === '' ? undefined : secret.trim(),
      events,
      enabled: true,
      format
    })
    void recordAudit('webhook.created', name.trim(), url.trim())
    name = ''
    url = ''
    secret = ''
    events = ['issue.created', 'issue.updated']
    adding = false
  }

  function when (ts: number | undefined): string {
    if (ts === undefined) return ''
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
</script>

<div class="hulyComponent">
  <div class="wh">
    <header class="wh__head">
      <div>
        <span class="wh__title"><Label label={tracker.string.Webhooks} /></span>
        <span class="wh__sub"><Label label={tracker.string.WebhooksHint} /></span>
      </div>
      <Button
        icon={IconAdd}
        kind={'primary'}
        label={tracker.string.AddWebhook}
        on:click={() => {
          adding = !adding
        }}
      />
    </header>

    {#if adding}
      <section class="card motion-pop">
        <div class="form">
          <EditBox bind:value={name} placeholder={tracker.string.Name} kind={'default'} autoFocus fullSize />
          <EditBox bind:value={url} placeholder={tracker.string.WebhookUrl} kind={'default'} fullSize />
          <EditBox bind:value={secret} placeholder={tracker.string.WebhookSecret} kind={'default'} fullSize />
          <select class="fmt" bind:value={format}><option value="json">JSON payload</option><option value="slack">Slack message</option></select>
        </div>
        <div class="events">
          {#each EVENTS as e (e.id)}
            <label class="event">
              <input type="checkbox" checked={events.includes(e.id)} on:change={() => { toggleEvent(e.id) }} />
              <span>{e.label}</span>
              <code>{e.id}</code>
            </label>
          {/each}
        </div>
        <p class="hint"><Label label={tracker.string.WebhookSignatureHint} /></p>
        <div class="actions">
          <Button
            kind={'ghost'}
            label={presentation.string.Cancel}
            on:click={() => {
              adding = false
            }}
          />
          <Button kind={'primary'} label={tracker.string.AddWebhook} disabled={!canAdd} on:click={add} />
        </div>
      </section>
    {/if}

    {#if hooks.length === 0 && !adding}
      <p class="hint"><Label label={tracker.string.NoWebhooks} /></p>
    {/if}

    {#each hooks as h, idx (h._id)}
      <section class="card row motion-rise" style="--i: {idx}" class:row--off={!h.enabled}>
        <div class="row__main">
          <span class="row__name">{h.name}</span>
          <span class="row__url">{h.url}</span>
          <span class="row__events">{h.events.join(' · ')}{h.format === 'slack' ? ' · Slack' : ''}</span>
          <span class="row__status" class:row__status--bad={h.lastError != null} class:row__status--ok={h.lastError == null && h.lastStatus !== undefined}>
            {#if h.lastDeliveredOn !== undefined}
              {h.lastError ?? `HTTP ${h.lastStatus}`} · {when(h.lastDeliveredOn)}
            {:else}
              <Label label={tracker.string.NoDeliveriesYet} />
            {/if}
          </span>
        </div>
        <div class="row__tools">
          <Toggle
            on={h.enabled}
            on:change={(e) => {
              void client.update(h, { enabled: e.detail })
            }}
          />
          <Button
            icon={IconDelete}
            kind={'ghost'}
            on:click={() => {
              void client.remove(h)
              void recordAudit('webhook.deleted', h.name, h.url)
            }}
          />
        </div>
      </section>
    {/each}
  </div>
</div>

<style lang="scss">
  .wh {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem 2rem;
    max-width: 60rem;
    overflow: auto;
  }
  .wh__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    > div {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
  }
  .wh__title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .wh__sub,
  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    background: var(--theme-panel-color);
  }
  .fmt { font: inherit; font-size: 0.8125rem; color: var(--theme-caption-color); background: var(--theme-bg-color); }
  .form {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr auto;
    gap: 0.5rem;
    > :global(*) {
      padding: 0.3rem 0.6rem;
      border: 1px solid var(--theme-divider-color);
      border-radius: 0.4rem;
    }
  }
  .events {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.4rem;
  }
  .event {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--theme-content-color);
    cursor: pointer;
    code {
      font-size: 0.7rem;
      color: var(--theme-trans-color);
    }
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    &--off {
      opacity: 0.55;
    }
  }
  .row__main {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .row__name {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .row__url {
    font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.8125rem;
    color: var(--theme-content-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row__events {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .row__status {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
    &--ok {
      color: var(--accent-brand-ink);
    }
    &--bad {
      color: var(--negative-button-default);
    }
  }
  .row__tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
</style>
