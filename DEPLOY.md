# Deploying Garden View to a VPS

Everything runs from one Docker Compose stack:

| Service | What it is |
|---|---|
| `app` | The website and the API in one Node process (same address, `/api` for the API) |
| `db` | PostgreSQL 16, reachable only from `app` |
| `caddy` | HTTPS with automatic Let's Encrypt certificates, compression, HTTP → HTTPS |

Data lives in Docker volumes: `db-data` (the database) and `uploads` (owners' listing photos).

## On a server with Coolify (e.g. Hostinger's "Coolify" VPS image)

Coolify already runs its own proxy on ports 80/443 with automatic HTTPS, so use
`docker-compose.coolify.yml` (no Caddy) instead of the steps below.

1. **DNS**: point your domain's A record at the VPS IP.
2. **Code**: push this repository to a private GitHub repository (the films travel with Git LFS).
3. **Coolify** (Manage panel): *Projects -> New -> Resource -> Private Repository (GitHub App)*,
   pick the repository and branch `main`, Build Pack **Docker Compose**, Docker Compose Location
   **`/docker-compose.coolify.yml`**.
4. **Domain**: on the `app` service set Domains to `https://<your domain>:4000`
   (`:4000` tells the proxy which container port to use; visitors still use plain https).
5. **Environment variables** (Coolify lists them): `DOMAIN` (e.g. `gardenview.com`, no https),
   `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `JWT_SECRET` (`openssl rand -hex 48`), and
   optionally `GOOGLE_MAPS_API_KEY`.
6. **Deploy.** Migrations run on start. If the build stops with "is a Git LFS pointer", the films
   were not fetched: enable Git LFS for the resource in Coolify (or deploy with the plain steps below).
7. **Units, first admin, backups**: open a terminal on the server (Coolify -> the resource ->
   *Terminal*, or SSH) and run, in the `app` container, `npm run create-admin`; load the units
   into the `db` container with `psql` as in step 5 of the plain setup. For backups, enable
   the VPS provider's daily snapshots and/or a Coolify *Scheduled Task* on `db`.

## Plain VPS (without Coolify)

## What you need

- A VPS with Ubuntu 22.04/24.04 (or similar), **2 GB RAM or more**, ~10 GB free disk.
- A domain whose **DNS A record points at the VPS's IP** (and AAAA if it has IPv6).
- Ports **80 and 443** open in the VPS firewall.

## 1. Install Docker and Git LFS (once)

```sh
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y git git-lfs
git lfs install
```

## 2. Get the code

The films are stored with Git LFS, so pull them explicitly (the build refuses to continue
without them):

```sh
sudo mkdir -p /opt/garden-view && sudo chown $USER /opt/garden-view
git clone <your repository URL> /opt/garden-view
cd /opt/garden-view
git lfs pull
```

## 3. Configure

```sh
cp .env.example .env
nano .env
```

Fill in `DOMAIN`, and generate the two secrets:

```sh
openssl rand -hex 24   # -> POSTGRES_PASSWORD
openssl rand -hex 48   # -> JWT_SECRET
```

`.env` holds secrets: never commit it or share it.

## 4. Start

```sh
docker compose up -d --build
docker compose ps          # all three should be "Up", app "(healthy)"
docker compose logs -f app # ctrl-c to stop following
```

Database migrations run automatically every time the app starts. Caddy fetches the HTTPS
certificate on first start, which can take a minute. Then open `https://<your domain>`.

## 5. Load the units and owner directory (once)

The 41 units, with the owner directory already imported, are copied from the local development
database. On **your own computer**, in the project folder, with the local dev database running:

```sh
sh deploy/export-units.sh                                 # writes garden-view-units.sql
scp garden-view-units.sql <user>@<server>:/opt/garden-view/
```

On the **server**:

```sh
cd /opt/garden-view
docker compose exec -T db psql -q -U garden_view -d garden_view < garden-view-units.sql
rm garden-view-units.sql
```

Then delete `garden-view-units.sql` from your computer too: it contains owners' personal data.

## 6. Create the first admin (once)

```sh
docker compose exec app npm run create-admin
```

It asks for email, name and password (at least 12 characters, not shown as you type). Sign in
at `https://<your domain>/login`, then create resident accounts from **Admin → Residents**.
For an accountant: `docker compose exec app npm run create-admin -- --role ACCOUNTANT`.

## 7. Backups (set up once)

```sh
sh deploy/backup.sh        # writes backups/<date>/database.dump and uploads.tar.gz
crontab -e                 # add the line below: every night at 03:15
15 3 * * *  cd /opt/garden-view && sh deploy/backup.sh >> backups/backup.log 2>&1
```

Backups older than 14 days are removed. **Copy `backups/` off the server regularly** (for
example with `rsync` to another machine): a backup on the same disk does not survive the disk.
Restore commands are at the bottom of `deploy/backup.sh`.

## Updating the site

```sh
cd /opt/garden-view
git pull && git lfs pull
docker compose up -d --build
```

The database and uploaded photos are kept. Visitors see the new version immediately.

## Changing content that lives in the code

- **Contact details** (phone, email, WhatsApp, office): `web/src/data/contact.ts`. Each one
  appears on the site once filled in. Then update as above.
- **Google Maps**: set `GOOGLE_MAPS_API_KEY` in `.env` (restrict the key to your domain in the
  Google Cloud console), then `docker compose up -d --build`.

## Useful commands

```sh
docker compose logs -f app caddy                 # live logs
docker compose restart app                       # restart the site
docker compose exec db psql -U garden_view       # database shell
docker compose down                              # stop (data is kept)
```

Never run `docker compose down -v`: `-v` deletes the database and the uploaded photos.

## Optional: www

To serve `www.<domain>` too, add an A record for `www` and add this block to `deploy/Caddyfile`,
then `docker compose restart caddy`:

```
www.{$DOMAIN} {
	redir https://{$DOMAIN}{uri} permanent
}
```
