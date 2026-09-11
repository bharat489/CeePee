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

## SCIM

Base URL `https://<host>/scim/v2`, bearer `SCIM_TOKEN`. Supported: `ServiceProviderConfig`, `ResourceTypes`, `Schemas`, `Users` (GET with `filter=userName eq "..."`, POST, GET/PATCH/PUT/DELETE by id). Creating a user issues an auto-join invite with the mapped role; the invite link is returned under `urn:ceepee:params:scim:schemas:extension:Invite`. Deactivation demotes to read-only guest (history is kept); re-activation restores the previous role. Groups are read for the role mapping only.

SAML: the account service speaks OpenID Connect (`OPENID_*` variables). Put a SAML identity provider behind an OIDC broker (Keycloak, Dex, Authentik) and point `OPENID_ISSUER` at the broker.
