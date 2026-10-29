# VPS deployment (Docker Compose + Caddy)

This is the supported production topology: one long-running API process backed by
a persistent volume, and Caddy serving the built SPA and proxying `/api/*` to it
over the same origin.

```
Internet --HTTPS--> Caddy (80/443)
                     /        -> /srv (apps/web/dist, SPA fallback)
                     /api/*   -> api:4000 (Fastify + SQLite)
                                      |
                                 app_data volume
                                 db/ uploads/ backups/
```

Nothing here has been deployed to a host. A VPS, DNS record and secrets must be
provided by the operator. Docker is required; this repository was verified
without Docker, so the container build itself is unverified on this machine.

## 1. Prerequisites

- A VPS with a persistent disk (2 vCPU / 2 GB RAM / 20 GB disk is enough to start).
- Docker Engine 27+ with the Compose v2 plugin.
- A DNS `A`/`AAAA` record for `APP_DOMAIN` pointing at the server.
- Inbound TCP 80 and 443 (and UDP 443 for HTTP/3) open.
- No other service using ports 80/443.

Ubuntu example:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # log out and back in
docker compose version
```

## 2. Configure

```bash
git clone https://github.com/Temsah1/Recrutment.git
cd Recrutment/deploy
cp .env.example .env
chmod 600 .env
```

Edit `deploy/.env`:

- `APP_DOMAIN` — hostname only, e.g. `apply.example.org`.
- `PUBLIC_APP_URL` and `TRUSTED_ORIGINS` — the same HTTPS origin, e.g.
  `https://apply.example.org`.
- `SESSION_SECRET` — at least 32 characters. Generate one:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

- `ADMIN_BOOTSTRAP_TOKEN` — at least 24 characters (same command works).
- Keep `TRUST_PROXY=true` and `COOKIE_SAME_SITE=lax`.

Never commit `deploy/.env`. The repository ignores it.

## 3. Build and start

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f api
```

The API applies pending migrations at startup, then listens on `0.0.0.0:4000`.
Caddy obtains the TLS certificate on first request and serves the SPA.

Verify:

```bash
curl -fsS https://apply.example.org/api/v1/health
# {"status":"ok","database":"ok","storage":"ok","time":"..."}

curl -fsS -o /dev/null -w '%{http_code}\n' https://apply.example.org/admin
# 200 (SPA shell; the browser redirects to /admin/login when unauthenticated)
```

If DNS or ports are wrong, Caddy cannot issue a certificate and the site fails.
Check `docker compose logs web`.

## 4. Persistent data

`app_data` is a named volume mounted at `/data`:

- `/data/db/esme-recruitment.sqlite` (plus WAL/SHM files)
- `/data/uploads/` (private applicant documents, never served by Caddy)
- `/data/backups/`

The volume survives `docker compose down`, image rebuilds and host restarts.
`docker compose down -v` **deletes it** — never use `-v` in production.

If you replace the named volume with a bind mount, make it owned by uid/gid 1000
(the container's `node` user) and mode `750`:

```bash
sudo install -d -o 1000 -g 1000 -m 750 /srv/esme-data
# then mount /srv/esme-data:/data in deploy/docker-compose.yml
```

Run exactly **one** API replica. SQLite and the upload directory assume a single
writer; never use `--scale api=2` or cluster mode.

## 5. First administrator

The bootstrap command reads `ADMIN_BOOTSTRAP_TOKEN` from the container
environment and prompts for the password (minimum 12 characters):

```bash
docker compose exec api node apps/api/dist/cli/bootstrap-admin.js \
  --email owner@example.org --name "Owner"
```

This creates the initial account with the `super_admin` role. That is the
existing bootstrap design: the first account can manage other administrators.
Do not grant `super_admin` to someone who only needs day-to-day access.

To create the intended Admin (`recruitment_admin`) account:

1. Sign in as the Super Admin at `https://apply.example.org/admin`.
2. Open **Administrators**, create the account with role **Admin**, and set a
   password of at least 12 characters.

The requested password for `kareemeltemsah7@gmail.com` is 9 characters, so the
existing policy rejects it. Choose a compliant password; the policy was not
weakened. Never put credentials in git, the image, logs or chat.

Reset a password:

```bash
docker compose exec api node apps/api/dist/cli/bootstrap-admin.js \
  --reset kareemeltemsah7@gmail.com --email kareemeltemsah7@gmail.com
```

## 6. Backup and restore

Create and verify a backup (safe while the API is running; SQLite's online
backup API is used):

```bash
docker compose exec -T api node apps/api/dist/cli/backup.js
docker compose exec -T api node apps/api/dist/cli/verify-storage.js
docker compose cp api:/data/backups/<timestamp> ./backups/
```

Copy backups off the server on a schedule; a backup on the same disk is not a
disaster-recovery plan.

Restore (stop the API first; restore replaces the current database and uploads):

```bash
docker compose stop api
docker compose run --rm --no-deps \
  -v "$PWD/backups:/backup:ro" \
  api node apps/api/dist/cli/restore.js \
  --from /backup/<timestamp> --yes --force
docker compose start api
```

`--force` is destructive. Only use a backup you have verified.

## 7. Upgrades

```bash
docker compose exec -T api node apps/api/dist/cli/backup.js
git pull
docker compose build
docker compose up -d
docker compose ps
curl -fsS https://apply.example.org/api/v1/health
```

Migrations are forward-only and run at startup. Take and copy a backup before
every upgrade.

## 8. Vercel

Do not deploy `apps/api` to Vercel functions. Its `/tmp` filesystem is ephemeral
and instances do not share SQLite or uploads. Vercel may host only the frontend;
in that case point its proxy at this stack's HTTPS origin (see
`deploy/vercel/vercel.json.template`) and set `TRUSTED_ORIGINS` here to the
Vercel production origin.

The existing `apps/api/vercel.json` and `apps/api/api/index.js` are leftovers
from an earlier experiment and are not part of this deployment path.
