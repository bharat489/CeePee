# Deploying CeePee

One VM (8 GB RAM minimum, 16 GB comfortable, 100 GB disk, Ubuntu 24.04), two DNS names pointing at it, Docker
installed. Caddy terminates HTTPS and fetches certificates itself. Everything else stays on the internal network.

## 1. Server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
sudo mkdir -p /opt/ceepee && sudo chown $USER /opt/ceepee
```

Open ports 22, 80 and 443 in the provider's firewall and `ufw`:

```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 2. DNS

Two A records to the server's IP:

| Name | Serves |
|---|---|
| `ceepee.example.com` | the app (front, sign-in, transactor, files, collaboration) |
| `api.ceepee.example.com` | the integrations service: public portal, share links, collector, webhooks, SCIM, bots |

## 3. Settings

```bash
cp deploy/.env.example deploy/.env    # on your machine
```

Fill `DOMAIN`, `API_DOMAIN`, every `change-me` (`openssl rand -hex 32`), `PUSH_*` from `npx web-push
generate-vapid-keys`, and optionally SMTP. `IMAGE_PREFIX` is where images are pushed; GitHub Container Registry
works with `docker login ghcr.io -u <user>` and a token with `write:packages`. Add `SERVER=user@host` for the
deploy script. Copy `deploy/.env` to `/opt/ceepee/.env` on the server (never commit it).

## 4. Release

```bash
deploy/deploy.sh build     # images on your machine (rush docker:min)
deploy/deploy.sh push      # tag + push to the registry
deploy/deploy.sh server    # pull + restart on the server
```

First time only, on the server, create the first workspace from the sign-in page, then make a workspace member for
the bots (a Maintainer, e.g. `bots@yourdomain`) and put its credentials in `.env` as `INTEGRATIONS_*`.

After a release that changes the data model, upgrade workspaces:

```bash
docker compose -f docker-compose.prod.yaml --profile tool run --rm tool upgrade-workspace <workspace> -f
```

## 5. Email (recommended)

Fill `SMTP_*`, set `MAIL_URL=http://mail:8097` in `.env`, and start with the mail profile:

```bash
docker compose -f docker-compose.prod.yaml --profile mail up -d
```

Without it invites still work (owners hand out links), password recovery works through Settings → Team, and the
app tells people clearly when something needs email.

## 6. Backups

The `backup` service writes a CockroachDB backup every night into the database volume (`extern/ceepee-<date>`) and keeps seven days. Copy
them off the box; Google Drive needs no card:

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config                      # add a "gdrive" remote
(crontab -l; echo '30 3 * * * rclone sync /var/lib/docker/volumes/ceepee_cockroach_data/_data/extern gdrive:ceepee-backups') | crontab -
```

Test a restore once: `cockroach sql --insecure -e "RESTORE DATABASE defaultdb FROM LATEST IN 'nodelocal://1/<name>'"`.

## 7. Monitoring

UptimeRobot (free) pinging `https://ceepee.example.com/` every five minutes emails you when it is down. Container
logs rotate at 20 MB × 5 files each; `docker compose logs -f transactor_cockroach` shows the live log.

## Free AI for "Ask CeePee"

The assistant answers from workspace data with no model and no key. For free-form questions
("write an update about my week", "summarise this issue") point it at any OpenAI-compatible chat
endpoint. The free, private option is Ollama on the same server:

```sh
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2            # ~2 GB; llama3.2:1b fits a 4 GB VPS
# in .env
AI_CHAT_URL=http://172.17.0.1:11434
AI_CHAT_MODEL=llama3.2
docker compose -f docker-compose.prod.yaml up -d front
```

The browser calls the endpoint directly, so it must be reachable from users' machines when it is not
on the same host as Caddy; add a `handle_path /_ai/*` block in the Caddyfile that reverse-proxies to
`localhost:11434` and set `AI_CHAT_URL=https://<domain>/_ai`. Every answer that used the model is
badged "AI · verify results" in the panel.

## What is not in this stack

Full-text search (Elastic), link previews, thumbnails, print/sign, the AI service, GitHub app. Each is one more
service in `dev/docker-compose.yaml`; add it when a team asks for it.
