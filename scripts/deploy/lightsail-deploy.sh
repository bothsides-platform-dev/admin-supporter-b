#!/usr/bin/env bash
# Build + release the admin console on the SAME AWS Lightsail box as the main
# app (bidit). This is a second PM2 process behind the same Caddy, sharing the
# main app's Postgres. Run from the repo root.
#
#   bash scripts/deploy/lightsail-deploy.sh
#
# Re-runnable: pulls latest, installs deps, rebuilds, restarts PM2, then verifies
# no runtime env got baked into the process.
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
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

APP_NAME=admin-supporter-b
APP_PORT=4242

# ── Runtime env: `.env.production` is the single source of truth ─────────────
# This script deliberately does NOT export .env.production into the shell.
# PM2 snapshots the shell env of whatever started the process, reuses it on
# restart/reload, and persists it to dump.pm2 via `pm2 save`. A process's env
# also outranks the file, because Next's dotenv loader never overwrites a key
# already present in process.env. So a global export bakes the values in, and
# every later edit to .env.production is silently shadowed — that is exactly
# how retired-domain links kept shipping from a box whose file read correct.
# bidit hit the same failure with AUTH_URL and fixed it the same way.
# Env is exposed only to the step that genuinely needs it: the build, which
# inlines NEXT_PUBLIC_* into the bundle. That happens in a subshell.

# Must be present, and must not carry a retired domain.
REQUIRED_VARS=(DATABASE_URL AUTH_SECRET PUBLIC_APP_URL NEXT_PUBLIC_BASE_URL)

# Must be read from the file at boot, never inherited from the process env.
# Verified against the live process after start.
UNBAKED_VARS=(PUBLIC_APP_URL RESEND_FROM AUTH_URL DATABASE_URL AUTH_SECRET)

# Domains we have migrated off. A deploy that would ship one of these is a bug:
# outbox templates render absolute links at enqueue time, so a stale value is
# baked into stored HTML and cannot be fixed by a later restart.
RETIRED_DOMAINS=(supporter-b.store supporter-b.com)

# Failure messages below quote env values, and deploy output gets pasted into
# issues and chat. Only non-secret vars are echoed; everything else is masked.
PRINTABLE_VARS=(PUBLIC_APP_URL NEXT_PUBLIC_BASE_URL RESEND_FROM)
show() {  # $1=var name, $2=value
  local v
  for v in "${PRINTABLE_VARS[@]}"; do
    [ "$v" = "$1" ] && { printf '%s' "${2:-<unset>}"; return; }
  done
  printf '<redacted>'
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$APP_PORT" 2>/dev/null | grep -q LISTEN
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti ":$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1   # cannot tell — don't block the deploy on a missing tool
  fi
}

if [ ! -f .env.production ]; then
  die ".env.production missing. cp .env.example .env.production and fill it."
fi

# Subshell so the values never reach this script's env — see the note above.
log "Validating .env.production"
(
  set -a; . ./.env.production; set +a
  for var in "${REQUIRED_VARS[@]}"; do
    [ -n "${!var:-}" ] || die "$var is empty in .env.production."
  done
  # Scan values, not the raw file — a retired domain left in a comment is harmless.
  for var in "${REQUIRED_VARS[@]}" RESEND_FROM; do
    for domain in "${RETIRED_DOMAINS[@]}"; do
      case "${!var:-}" in
        *"$domain"*) die "$var still points at the retired domain $domain: $(show "$var" "${!var}")" ;;
      esac
    done
  done
) || exit 1

log "Pulling latest"
git pull --ff-only

log "Installing dependencies (frozen lockfile, pnpm 9)"
pnpm install --frozen-lockfile

# Subshell: the build is the one step that needs env, to inline NEXT_PUBLIC_*.
# Cap V8 heap below total RAM so the build hits GC before the OOM-killer. On the
# shared 2GB box (+swap) 1024MB leaves headroom for the main app, Postgres and OS.
log "Building"
(
  set -a; . ./.env.production; set +a
  NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_HEAP_MB:-1024}" pnpm build
)

# NEXT_PUBLIC_* is inlined at build time, so a correct env var does NOT prove a
# correct build — a cached or partial build can still ship an old value that no
# runtime check would ever see. Scan what actually ships. (.next/cache holds
# artifacts from previous builds; it would false-positive.)
log "Scanning build output for retired domains"
for domain in "${RETIRED_DOMAINS[@]}"; do
  if hits="$(grep -rlF "$domain" .next/static .next/server 2>/dev/null)" && [ -n "$hits" ]; then
    die "Build output still contains the retired domain $domain:
$(printf '%s\n' "$hits" | head -5)
Clear the cache and rebuild:  rm -rf .next && pnpm build"
  fi
done

# `pm2 reload` without --update-env reuses PM2's *stored* env, so values baked in
# by an earlier deploy would survive forever. Deleting purges that store, and the
# following start inherits this script's clean shell — nothing to bake.
log "Restarting PM2 process (delete + start, not reload)"
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true

# `pm2 delete` returns before the process has finished exiting, so poll instead
# of failing on a port that is merely a moment away from being released.
for _ in $(seq 1 15); do
  port_in_use || break
  sleep 1
done

if port_in_use; then
  die "Port $APP_PORT is still held 15s after deleting $APP_NAME.
An unmanaged process is serving traffic, so PM2 changes never reach it.
Find and stop it, then re-run:
  sudo lsof -i :$APP_PORT -sTCP:LISTEN"
fi

pm2 start ecosystem.config.cjs
pm2 save   # refresh dump.pm2 — otherwise `pm2 resurrect` restores an old env on reboot

# The check that would have caught the incident. Runtime env must be ABSENT from
# the process: present means something exported it, which re-arms the shadowing
# bug even if today's value happens to be right.
log "Verifying no runtime env was baked into the process"
pid=""
for _ in $(seq 1 30); do
  pid_raw="$(pm2 pid "$APP_NAME" 2>/dev/null || true)"
  pid="${pid_raw%%$'\n'*}"
  pid="${pid//[!0-9]/}"
  if [ -n "$pid" ] && [ -r "/proc/$pid/environ" ]; then break; fi
  pid=""
  sleep 1
done
[ -n "$pid" ] || die "Could not read the live env of $APP_NAME. Check: pm2 logs $APP_NAME"

# Plain read loop rather than `mapfile` — that is bash 4+, and this needs to stay
# runnable under the bash 3.2 a developer may have locally.
env_lines=()
while IFS= read -r line; do env_lines+=("$line"); done \
  < <(tr '\0' '\n' < "/proc/$pid/environ")
baked=()
for var in "${UNBAKED_VARS[@]}"; do
  for line in "${env_lines[@]}"; do
    if [ "${line#"$var="}" != "$line" ]; then baked+=("$var"); break; fi
  done
done
if [ ${#baked[@]} -gt 0 ]; then
  die "These vars are baked into the running process (pid $pid): ${baked[*]}
.env.production edits will be silently ignored for them, because Next's dotenv
loader never overwrites a key already in process.env.
Something exported them before PM2 started the app — check for a global
\`set -a; . ./.env.production\` here, in your shell profile, or in the PM2
systemd unit. Then: pm2 delete $APP_NAME && pm2 start ecosystem.config.cjs"
fi
log "Clean: ${UNBAKED_VARS[*]} all resolve from .env.production at boot"

log "Deploy complete. Admin on 127.0.0.1:$APP_PORT (Caddy serves it on admin.<domain>:443)."
