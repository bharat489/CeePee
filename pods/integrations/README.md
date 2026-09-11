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

## SCIM

Base URL `https://<host>/scim/v2`, bearer `SCIM_TOKEN`. Supported: `ServiceProviderConfig`, `ResourceTypes`, `Schemas`, `Users` (GET with `filter=userName eq "..."`, POST, GET/PATCH/PUT/DELETE by id). Creating a user issues an auto-join invite with the mapped role; the invite link is returned under `urn:ceepee:params:scim:schemas:extension:Invite`. Deactivation demotes to read-only guest (history is kept); re-activation restores the previous role. Groups are read for the role mapping only.

SAML: the account service speaks OpenID Connect (`OPENID_*` variables). Put a SAML identity provider behind an OIDC broker (Keycloak, Dex, Authentik) and point `OPENID_ISSUER` at the broker.
