#!/usr/bin/env bash
# Bootstrap the existing Lightsail admin account. The scheduler only polls the
# two CI-promoted refs; installing it does not restart the running console.
set -euo pipefail
umask 077
root="$HOME/admin-production"
public_key=${1:?Usage: bash install-auto-deploy.sh <CI-delivery-public-key-file>}
read -r type key comment < "$public_key"
[[ "$type" == ssh-ed25519 && "$key" =~ ^[A-Za-z0-9+/]+=*$ ]]
inbox="$root/incoming/marketing.git"
mkdir -p "$root/incoming" "$HOME/.ssh"
git init --quiet --bare "$inbox"
git -C "$inbox" config receive.denyDeletes true
git -C "$inbox" config receive.denyNonFastForwards true
git -C "$inbox" config receive.fsckObjects true
cat > "$inbox/hooks/pre-receive.new" <<'HOOK'
#!/bin/sh
while read -r old new ref; do
  test "$ref" = refs/heads/deploy/production && test "$(git cat-file -t "$new")" = commit || exit 1
done
HOOK
chmod 700 "$inbox/hooks/pre-receive.new"
mv "$inbox/hooks/pre-receive.new" "$inbox/hooks/pre-receive"

authorized="$HOME/.ssh/authorized_keys"
touch "$authorized"
line="restrict,command=\"/usr/bin/git-receive-pack '$inbox'\" $type $key admin-production-marketing-delivery"
if ! grep -Fxq "$line" "$authorized"; then
  if grep -Fq ' admin-production-marketing-delivery' "$authorized"; then
    echo 'A different delivery key is installed. Rotate that dedicated key before reinstalling.' >&2
    exit 1
  fi
  printf '\n%s\n' "$line" >> "$authorized"
fi

mkdir -p "$root/shared"
if [[ ! -L "$root/legacy" ]]; then
  active=$(pm2 jlist | node -e 'const apps = JSON.parse(require("node:fs").readFileSync(0, "utf8")).filter(p => p.name === "admin-supporter-b");
    if (apps.length !== 1 || apps[0].pm2_env.status !== "online") process.exit(1);
    process.stdout.write(apps[0].pm2_env.pm_cwd);')
  [[ -f "$active/.env.production" && -f "$active/ecosystem.config.cjs" ]]
  for name in .env .env.production .env.local .env.production.local; do
    if [[ -f "$active/$name" && ! -e "$root/shared/$name" ]]; then
      install -m 600 "$active/$name" "$root/shared/$name"
    fi
  done
  node --input-type=module - "$root" <<'NODE'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
const root = process.argv[2];
const dir = join(root, 'shared');
const files = ['.env', '.env.production', '.env.local', '.env.production.local'].map(f => join(dir, f));
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : '';
const config = Object.assign({}, ...files.map(f => parseEnv(read(f))));
const overrides = [];
const code = join(root, 'current/marketing');
if (config.MARKETING_TOOL_DIR !== code) overrides.push('MARKETING_TOOL_DIR=' + JSON.stringify(code));
if (!config.MARKETING_DATA_DIR) overrides.push('MARKETING_DATA_DIR=' + JSON.stringify(join(dir, 'marketing-data')));
if (overrides.length) {
  const local = files.at(-1);
  writeFileSync(local + '.new', read(local) + '\n' + overrides.join('\n') + '\n', { mode: 0o600 });
  renameSync(local + '.new', local);
}
NODE
  ln -s "$active" "$root/legacy"
fi

install -m 700 "$(dirname "$0")/auto_deploy.py" "$root/bootstrap.new"
mv "$root/bootstrap.new" "$root/bootstrap.py"
cron=$(mktemp)
trap 'rm -f "$cron" "$cron.err"' EXIT
if ! LC_ALL=C crontab -l > "$cron" 2>"$cron.err"; then
  grep -qi 'no crontab for' "$cron.err" || { cat "$cron.err" >&2; exit 1; }
fi
entry="*/3 * * * * PATH=/usr/local/bin:/usr/bin:/bin /usr/bin/python3 '$root/bootstrap.py' 2>&1 | /usr/bin/logger -t admin-autodeploy # admin-supporter-b:auto-deploy"
if ! grep -Fqx "$entry" "$cron"; then
  printf '\n%s\n' "$entry" >> "$cron"
  crontab "$cron"
fi
echo "Installed. CI-promoted main revisions are checked every three minutes."
