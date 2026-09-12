# CeePee integrations service

One small process, three jobs:

1. **Inbound webhooks** — other systems post, issues come out.
2. **SCIM 2.0 provisioning** — your identity provider creates and deactivates people.
3. **Daily digest** — one email per person with what is theirs, due, and stalled.

It signs in to one workspace as a service account and authorises callers with static bearer tokens.

## Configuration

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port (default `8095`) |
| `FRONT_URL` | Front service URL the API client connects through (in compose: `http://front:8080`) |
| `ACCOUNTS_URL` | Account service (in compose: `http://account:3000`) |
| `WORKSPACE` | Workspace URL name, e.g. `cready` |
| `INTEGRATIONS_EMAIL` / `INTEGRATIONS_PASSWORD` | A workspace member the service acts as (create a user called "Integrations", role User or Maintainer) |
| `INBOUND_TOKEN` | Bearer token callers must present on `/inbound/*` (empty = inbound disabled) |
| `INBOUND_PROJECT` | Default project identifier for new issues/requests, e.g. `CEE` |
| `SCIM_TOKEN` | Bearer token for `/scim/v2/*` (empty = SCIM disabled) |
| `SCIM_ROLE_MAP` | Group → role, e.g. `Admins=OWNER,Leads=MAINTAINER,Everyone=USER` |
| `SCIM_DEFAULT_ROLE` | Role when no group matches (default `USER`) |
| `MAIL_URL` / `MAIL_API_KEY` | Mail service for the digest (empty = digest disabled) |
| `DIGEST_HOUR` | Local hour to send the digest (default `8`) |
| `PUBLIC_FRONT_URL` | URL used in emails, e.g. `http://huly.local:8087` |
| `PUBLIC_INTEGRATIONS_URL` | Where this service is reachable from the outside, e.g. `http://huly.local:8095` (portal links, rule webhook URLs) |
| `PORTAL_ENABLED` / `PORTAL_PROJECT` | Public help centre at `/portal`; requests land in this project key. Empty project = portal off |
| `PORTAL_NAME` / `PORTAL_COLOR` / `PORTAL_LOGO_URL` | Branding for the help centre |
| `HEARTBEAT_MINUTES` | How often the automation heartbeat is written (scheduled rules are evaluated server-side on each beat; default 5) |

## Inbound endpoints

All `POST`, authorised with `Authorization: Bearer $INBOUND_TOKEN` or `?token=`.
Bodies may be JSON, form-encoded, or multipart (text parts only).

| Path | Use |
| --- | --- |
| `/inbound/generic` | `{project, title, description, priority, assignee (email), url, source, request:"true"}` |
| `/inbound/email` | Point your mail provider's inbound-parse webhook here (Mailgun, Postmark, SendGrid JSON mode, Zapier/Make). Subject with an issue key → comment; otherwise a new service-desk request in `INBOUND_PROJECT` (or `?project=KEY`). |
| `/inbound/sentry` | Sentry "issue alert" webhook. Repeat alerts for the same Sentry issue become comments. |
| `/inbound/github`, `/inbound/gitlab`, `/inbound/bitbucket` | Push and pull/merge-request events. Issue keys in commit messages, branch names or PR titles get a comment and a link. |
| `/inbound/deploy` | `{environment, version, status, url, issues:["CEE-12"]}` from CI → comment + link on each issue. |

Email-to-ticket therefore needs no mail server of its own: any provider that can POST received mail as a webhook works.

## Customer portal (public, no login)

- `GET /portal` — help centre: search the knowledge base (documents), pick a request type, submit a request, check a request by key + email.
- `GET /portal/kb?q=` · `GET /portal/article/<id>` — knowledge base search and article view.
- `POST /portal/submit` (form or JSON: `type, summary, description, email, priority`) → request key + status URL.
- `GET|POST /portal/status?key=&email=` — status of one request, gated on the email it was raised with.
- `POST /portal/rate` (`key, email, rating, comment`) — satisfaction rating once resolved.

Rate-limited per address. Requests are ordinary issues with `portalEmail` set and the chosen request type.

## Per-rule webhooks and scheduled rules

- `POST /inbound/rule/<ruleId>?token=<rule token>` — fires an automation rule whose trigger is "incoming webhook". The token is generated in the rule builder; the JSON body is available to actions as `{payload.field}` and can target one issue with `issue` or `identifier`.
- Every `HEARTBEAT_MINUTES` the service writes a heartbeat document; the server trigger then runs every scheduled rule that is due.

## Jira Cloud import (REST API)

- `POST /inbound/jira-import` (bearer `INBOUND_TOKEN`; JSON `baseUrl, email, token, jql, project, attachments, history, comments, worklogs`) → job id.
- `GET /inbound/jira-import/<id>` → progress. Attachments are downloaded with the Jira credentials and stored; change history becomes a dated comment per issue.

## Slack and Teams bots

Slack (create an app at api.slack.com/apps, add the bot scopes `commands`, `chat:write`, `links:read`, `links:write`, `app_mentions:read`, `users:read`, `users:read.email`; set `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`):
- Slash command `/ceepee` → Request URL `<PUBLIC_INTEGRATIONS_URL>/slack/commands`
- Event subscriptions → `<PUBLIC_INTEGRATIONS_URL>/slack/events`, events `link_shared` (add your CeePee domain under app unfurl domains) and `app_mention`
- Interactivity → `<PUBLIC_INTEGRATIONS_URL>/slack/interactions`

Teams (Team → Manage team → Apps → Create an outgoing webhook, callback `<PUBLIC_INTEGRATIONS_URL>/teams/webhook`; put the generated security token in `TEAMS_WEBHOOK_SECRET`).

Commands, the same in both (`/ceepee …` in Slack, `@CeePee …` in Teams):
- `KEY-12` — show the issue (Slack also unfurls pasted issue links, with Assign to me and status buttons)
- `create KEY the title` — create an issue in project KEY
- `assign KEY-12 me` / `assign KEY-12 name@company.com`
- `status KEY-12 In progress`
- `search assignee = me AND status != done` — the query language, first 10 results
- `help`

## Development panel

GitHub, GitLab and Bitbucket webhooks (`/inbound/github` etc.) now record branches, pull requests, commits and deployments on every issue whose key appears in the branch name, PR title or body, or commit message; the issue's Development panel lists them with their state. Project → Automation → Development flow can move the issue when a branch appears, a PR opens, or a PR merges.

## Forms and the status page

- Forms (project → Forms) create issues from a fixed set of fields, in the app or publicly at `/portal[/<slug>]/form/<form slug>`.
- The incident status page is served at `/status/<portal slug>` (JSON at `/status/<portal slug>.json`): components are the project's assets of kind Service, their state comes from open incidents linked to them, and timeline entries marked public are the updates.

## Per-project portals, replies, organisations

- Every project can switch on its own help centre under Service desk → Portal: it is served at `/portal/<slug>` with the project's name, colour, logo and welcome text; `/portal` stays the environment default (`PORTAL_PROJECT`).
- `POST /portal[/<slug>]/reply` (`key, email, text`) — the customer writes into the request. The message becomes a CustomerReply (the issue's "Customer conversation" panel) and a comment for the team. Only replies written in that panel are shown back to the customer; ordinary comments stay internal.
- `GET /portal[/<slug>]/org?email=` — every request raised from the same email domain (or the matching customer organisation), so a customer company sees its own queue.
- New requests are linked to a customer organisation when the email domain matches one configured under Service desk → Organisations.

## Idea board

`GET /portal/<slug>/ideas` lists the project's public ideas (those with **Public** ticked in Ideas), most voted first, as a page
or as JSON. Visitors enter an email once; `POST /portal/<slug>/ideas/vote` (`id`, `email`) toggles their vote and
`POST /portal/<slug>/ideas/suggest` (`title`, `details`, `email`) files a new public idea tagged `portal` with the
suggestion recorded as its first insight. Votes are one per email; the addresses are kept on the idea and never shown publicly.

## Reminders and notifications

The transactor's heartbeat (every `HEARTBEAT_MINUTES`, see scheduled rules) also runs the reminder sweep once an hour:
explicit "Remind me…" reminders, issues due within each person's *due soon* window and SLAs breaching within their *SLA risk*
window land in the inbox as notifications. Per-person thresholds, quiet hours and muted projects live in
Settings → Notifications & reminders. Web push while the tab is closed needs the `notification` service and the `PUSH_*`
keys in `dev/.env` (both included in the min stack); the transactor reaches it through `WEB_PUSH_URL`.

## Scheduled emails

Query and dashboard subscriptions (Query page → "Email on a schedule…", Dashboard → same button) are checked every five minutes and sent at the chosen hour through `MAIL_URL`. Query emails carry the matching issues as a table; dashboard emails carry each widget's headline number.

## SCIM

Base URL `https://<host>/scim/v2`, bearer `SCIM_TOKEN`. Supported: `ServiceProviderConfig`, `ResourceTypes`, `Schemas`, `Users` (GET with `filter=userName eq "..."`, POST, GET/PATCH/PUT/DELETE by id). Creating a user issues an auto-join invite with the mapped role; the invite link is returned under `urn:ceepee:params:scim:schemas:extension:Invite`. Deactivation demotes to read-only guest (history is kept); re-activation restores the previous role. Groups are read for the role mapping only.

SAML: the account service speaks OpenID Connect (`OPENID_*` variables). Put a SAML identity provider behind an OIDC broker (Keycloak, Dex, Authentik) and point `OPENID_ISSUER` at the broker.
