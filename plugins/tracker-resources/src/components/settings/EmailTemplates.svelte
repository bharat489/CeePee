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
  Email templates. Subject and body for each kind of email CeePee sends on the
  workspace's behalf: the note to a customer when their request is created,
  the note when the team replies, the daily digest, and the default for the
  automation "send email" action. Placeholders in braces. Switch a kind off
  to stop sending it.
-->
<script lang="ts">
  import core, { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type EmailTemplate, type EmailTemplateKind } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'

  import tracker from '../../plugin'

  const client = getClient()
  const q = createQuery()
  const canEdit = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  let docs: EmailTemplate[] = []
  q.query(tracker.class.EmailTemplate, {}, (r) => { docs = r })

  interface Kind {
    kind: EmailTemplateKind
    label: string
    when: string
    vars: string[]
    subject: string
    body: string
    sample: Record<string, string>
  }
  const KINDS: Kind[] = [
    {
      kind: 'portal-created',
      label: 'Request received',
      when: 'To the requester when a request arrives from the portal, a form or email-to-ticket.',
      vars: ['key', 'title', 'statusUrl', 'portal', 'name'],
      subject: '[{key}] We received your request: {title}',
      body: 'Hi{name},\n\nThanks for getting in touch. Your request {key} "{title}" is with the team.\n\nFollow progress and reply to us here:\n{statusUrl}\n\n{portal}',
      sample: { key: 'SUP-42', title: 'Cannot export the report', statusUrl: 'https://help.example.com/portal/status?key=SUP-42', portal: 'https://help.example.com/portal', name: '' }
    },
    {
      kind: 'portal-reply',
      label: 'Team replied',
      when: 'To the requester when someone on the team writes a customer-visible reply.',
      vars: ['key', 'title', 'author', 'text', 'statusUrl'],
      subject: '[{key}] New reply from {author}',
      body: '{author} wrote on {key} "{title}":\n\n{text}\n\nReply or check progress here:\n{statusUrl}',
      sample: { key: 'SUP-42', title: 'Cannot export the report', author: 'Priya', text: 'Fixed in today\'s release, please try again.', statusUrl: 'https://help.example.com/portal/status?key=SUP-42' }
    },
    {
      kind: 'digest',
      label: 'Daily digest',
      when: 'Every morning to each person with open work. The body is the opening line; the lists follow.',
      vars: ['count', 'due', 'workspace'],
      subject: 'Your day in {workspace}: {count} open, {due} due soon',
      body: 'Good morning. {count} open issue(s) assigned to you.',
      sample: { count: '7', due: '2', workspace: 'CeePee' }
    },
    {
      kind: 'rule',
      label: 'Automation email',
      when: 'Default text for the "send email" action when a rule leaves it empty. First line is the subject.',
      vars: ['identifier', 'title', 'status', 'priority', 'assignee', 'url'],
      subject: '{identifier} {title}',
      body: '{identifier} {title}\n{status} · {priority}\n{url}',
      sample: { identifier: 'ENG-108', title: 'Login page redesign', status: 'In progress', priority: 'High', assignee: 'Aarav', url: 'https://ceepee.example.com/ENG-108' }
    }
  ]
  let drafts: Record<string, { subject: string, body: string, enabled: boolean }> = {}
  function sync (list: EmailTemplate[]): void {
    for (const k of KINDS) {
      const d = list.find((x) => x.kind === k.kind)
      if (drafts[k.kind] === undefined) drafts[k.kind] = { subject: d?.subject ?? k.subject, body: d?.body ?? k.body, enabled: d?.enabled ?? true }
    }
    drafts = drafts
  }
  $: sync(docs)
  const fill = (s: string, vars: Record<string, string>): string => s.replace(/\{([a-zA-Z]+)\}/g, (m, k: string) => vars[k] ?? m)
  let saved = ''
  async function save (k: Kind): Promise<void> {
    const d = drafts[k.kind]
    const existing = docs.find((x) => x.kind === k.kind)
    if (existing !== undefined) await client.update(existing, { subject: d.subject, body: d.body, enabled: d.enabled })
    else await client.createDoc(tracker.class.EmailTemplate, core.space.Workspace, { kind: k.kind, subject: d.subject, body: d.body, enabled: d.enabled })
    saved = k.kind
    setTimeout(() => { saved = '' }, 1500)
  }
  function reset (k: Kind): void {
    drafts[k.kind] = { subject: k.subject, body: k.body, enabled: true }
  }
  const dirty = (k: Kind): boolean => {
    const d = drafts[k.kind]
    const e = docs.find((x) => x.kind === k.kind)
    if (d === undefined) return false
    return e === undefined ? d.subject !== k.subject || d.body !== k.body || !d.enabled : d.subject !== e.subject || d.body !== e.body || d.enabled !== e.enabled
  }
</script>

<div class="hulyComponent">
  <div class="et">
    <header class="et__head">
      <span class="et__title ceepee-gradient-text"><Label label={tracker.string.EmailTemplates} /></span>
      <span class="muted">What CeePee writes when it emails people on your behalf. Needs an outgoing mail server (MAIL_URL) to actually send.</span>
    </header>
    {#each KINDS as k, idx (k.kind)}
      {@const d = drafts[k.kind]}
      {#if d !== undefined}
        <section class="card motion-rise" class:card--off={!d.enabled} style="--i: {idx}">
          <div class="card__head">
            <div><span class="card__title">{k.label}</span><span class="muted">{k.when}</span></div>
            <label class="check"><input type="checkbox" bind:checked={drafts[k.kind].enabled} disabled={!canEdit} /> enabled</label>
          </div>
          <label class="fld"><span>Subject</span><input class="input" bind:value={drafts[k.kind].subject} disabled={!canEdit} /></label>
          <label class="fld"><span>Body</span><textarea class="input" rows="5" bind:value={drafts[k.kind].body} disabled={!canEdit} /></label>
          <span class="muted">Placeholders: {k.vars.map((v) => `{${v}}`).join(' ')}</span>
          <div class="preview"><b>{fill(d.subject, k.sample)}</b><pre>{fill(d.body, k.sample)}</pre></div>
          {#if canEdit}
            <div class="row"><Button kind={'primary'} label={tracker.string.Save} disabled={!dirty(k) && saved !== k.kind} on:click={() => { void save(k) }} /><button class="lnk" on:click={() => { reset(k) }}>reset to default</button>{#if saved === k.kind}<span class="muted">saved</span>{/if}</div>
          {/if}
        </section>
      {/if}
    {/each}
  </div>
</div>

<style lang="scss">
  .et { display: flex; flex-direction: column; gap: 0.9rem; padding: 1rem 1.25rem; overflow: auto; }
  .et__head { display: flex; flex-direction: column; gap: 0.2rem; }
  .et__title { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em; }
  .muted { margin: 0; font-size: 0.8125rem; color: var(--theme-trans-color); }
  .card { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--theme-divider-color); border-radius: 0.9rem; background: var(--theme-panel-color); &--off { opacity: 0.65; } }
  .card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; div { display: flex; flex-direction: column; gap: 0.15rem; } }
  .card__title { font-weight: 600; color: var(--theme-caption-color); }
  .check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--theme-content-color); }
  .fld { display: flex; flex-direction: column; gap: 0.2rem; span { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--theme-dark-color); } }
  .input { padding: 0.4rem 0.55rem; border: 1px solid var(--theme-divider-color); border-radius: 0.5rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; resize: vertical; }
  .preview { padding: 0.6rem 0.75rem; border-radius: 0.6rem; background: var(--theme-bg-color); font-size: 0.8125rem; color: var(--theme-content-color); b { display: block; color: var(--theme-caption-color); margin-bottom: 0.3rem; } pre { margin: 0; font: inherit; white-space: pre-wrap; } }
  .row { display: flex; align-items: center; gap: 0.6rem; }
  .lnk { border: none; background: transparent; padding: 0; color: var(--primary-button-default); font: inherit; font-size: 0.8125rem; cursor: pointer; &:hover { text-decoration: underline; } }
</style>
