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

## 0. If you do not have a VPS or a custom domain yet

You cannot run this application on Vercel alone: Vercel functions have an
ephemeral filesystem, so SQLite, uploaded documents and backups would be lost.
You need **one small Linux host with a persistent disk** for the API. The
frontend can stay on Vercel, but the API still needs that host.

**Minimum host:** any Linux server (Ubuntu 24.04 is a good default) with a
public IPv4 address, a persistent disk and Docker.

| Resource | Floor | Recommended |
| --- | --- | --- |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB (+2 GB swap) | 2 GB |
| Disk | 20 GB | 25 GB |
| Network | inbound TCP 80/443, UDP 443 | same |

The image build is the memory peak (it compiles `better-sqlite3` and bundles the
SPA). On a 1 GB host add swap first, or build on a bigger machine and copy the
images.

**No custom domain?** Use a free wildcard-DNS hostname derived from the server's
public IP, for example `sslip.io`:

```text
Public IP 203.0.113.10  ->  APP_DOMAIN=203.0.113.10.sslip.io
                            PUBLIC_APP_URL=https://203.0.113.10.sslip.io
                            TRUSTED_ORIGINS=https://203.0.113.10.sslip.io
```

Check that DNS resolves before starting Caddy:

```bash
dig +short 203.0.113.10.sslip.io   # must print 203.0.113.10
```

With ports 80/443 open, Caddy obtains a real Let's Encrypt certificate for that
name, so HTTPS, secure cookies and CSRF origin checks work unchanged. This is a
**temporary** hostname owned by a third party; move to a domain you control
before storing real applicant data long-term. To migrate later, change
`APP_DOMAIN`, `PUBLIC_APP_URL` and `TRUSTED_ORIGINS`, then
`docker compose up -d web`; the data volume is untouched.

Two supported layouts:

- **All-in-one (simplest):** Caddy serves the frontend and API from this host.
  Use `https://<hostname>` everywhere and skip Vercel.
- **Vercel frontend + host API:** keep Vercel for the SPA, point its `/api/*`
  rewrite at `https://<hostname>` (see `deploy/vercel/vercel.json.template`),
  set `PUBLIC_APP_URL` to the Vercel production origin, and add every browser
  origin you use to `TRUSTED_ORIGINS` (comma-separated, e.g.
  `https://my-app.vercel.app,https://<hostname>`). The frontend must call the
  API through the relative `/api/v1` base so the session cookie stays
  first-party.

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
from an earlier experiment and are not part of this deployment path. The
frontend project's own `apps/web/vercel.json` now ships with the placeholder
`https://REPLACE-WITH-YOUR-API-HOST`; replace it with your API origin before
expecting `/api/*` calls to work.

## 9. Copy/paste checklist

Work top to bottom; each line is a real check, not a formality.

- [ ] **Host** — public IPv4, persistent disk, Ubuntu 24.04, Docker 27+ with
      Compose v2: `docker compose version`.
- [ ] **Ports** — `sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp`.
- [ ] **Hostname** — real domain or temporary `<server-ip>.sslip.io`;
      `dig +short <hostname>` returns the server IP.
- [ ] **Clone** — `git clone https://github.com/Temsah1/Recrutment.git`,
      then `cd Recrutment/deploy`.
- [ ] **Secrets file** — `cp .env.example .env && chmod 600 .env`; set
      `APP_DOMAIN`, `PUBLIC_APP_URL`, `TRUSTED_ORIGINS`; generate
      `SESSION_SECRET` (≥32 chars) and `ADMIN_BOOTSTRAP_TOKEN` (≥24 chars).
      Store both in a password manager, never in git.
- [ ] **Build** — `docker compose build` (expect several minutes; watch for
      `better-sqlite3` compile errors if build tools or RAM are missing).
- [ ] **Start** — `docker compose up -d`, then `docker compose ps` shows `api`
      as `healthy`. Never run `docker compose down -v`.
- [ ] **Health** — `curl -fsS https://<hostname>/api/v1/health` returns
      `{"status":"ok",...}`.
- [ ] **Admin route** — opening `https://<hostname>/admin` returns the SPA
      (HTTP 200) and the browser lands on `/admin/login`; a hard refresh still
      works.
- [ ] **First administrator** — run the bootstrap command in §5, then create the
      day-to-day account with role **Admin** (not Super Admin) in the UI, with a
      ≥12-character password.
- [ ] **Application flow** — submit one test application; confirm it appears in
      the admin list; confirm an anonymous request to a document URL returns
      **401**, not the file.
- [ ] **Backup** — run the backup CLI, verify storage, copy the archive
      off-server, and prove a restore into a scratch directory (or a throwaway
      server) before trusting it.
- [ ] **Vercel (optional)** — replace the placeholder in the frontend rewrite
      with `https://<hostname>`, add the Vercel origin to `TRUSTED_ORIGINS`,
      redeploy, then repeat the login, upload and document-download checks
      through the Vercel domain.

Until the host actually exists, these remain **unverified**: the container image
build, TLS issuance for your hostname, public-host login/session/CSRF behavior,
and backup restoration on that host. The repository-side configuration is
validated; the deployment is not.

