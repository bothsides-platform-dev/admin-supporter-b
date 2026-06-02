#!/usr/bin/env bash
# Build + release the admin console on the SAME AWS Lightsail box as the main
# app (bidit). This is a second PM2 process behind the same Caddy, sharing the
# main app's Postgres. Run from the repo root.
#
#   bash scripts/deploy/lightsail-deploy.sh
#
# Re-runnable: pulls latest, installs deps, rebuilds, reloads PM2.
#
# This repo owns NEITHER the database nor the reverse proxy:
#   - Postgres (docker compose) is supervised by the bidit deploy. Admin only
#     connects to it via DATABASE_URL — no container start, no migrations here
#     (the admin schema is migrated by the bidit repo).
#   - Caddy is supervised by systemd and configured from the bidit repo's
#     deploy/Caddyfile (admin.<domain> -> 127.0.0.1:4242). Config changes:
#     edit /etc/caddy/Caddyfile in the bidit checkout and `sudo systemctl reload caddy`.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production missing. cp .env.example .env.production and fill it." >&2
  exit 1
fi

# Export prod env so the build sees NEXT_PUBLIC_* values (NEXT_PUBLIC_BASE_URL
# is inlined at build time). Next also auto-loads .env.production; belt-and-suspenders.
log "Loading .env.production"
set -a; . ./.env.production; set +a

log "Pulling latest"
git pull --ff-only

log "Installing dependencies (frozen lockfile, pnpm 9)"
pnpm install --frozen-lockfile

# Cap V8 heap below total RAM so the build hits GC before the OOM-killer. On the
# shared 2GB box (+swap) 1024MB leaves headroom for the main app, Postgres and OS.
log "Building (NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_HEAP_MB:-1024})"
NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_HEAP_MB:-1024}" pnpm build

log "Reloading PM2"
if pm2 describe admin-supporter-b >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

log "Deploy complete. Admin on 127.0.0.1:4242 (Caddy serves it on admin.<domain>:443)."
