#!/bin/bash
set -euo pipefail

# Deploy to https://gaming.bobbby.online as a static sidecar of the bobbby.online stack.
#   site files              -> /opt/gaming   (served by the blog's Caddy at /srv/gaming)
#   blog Caddyfile+compose  -> /opt/blog     (the gaming site block + volume mount live there)
# Usage: ./scripts/deploy.sh [user@host]

cd "$(dirname "$0")/.."
HOST="${1:-${DEPLOY_HOST:-root@5.161.181.91}}"
BLOG_SRC="${BLOG_SRC:-$HOME/code/blog}"

grep -q 'gaming.bobbby.online' "$BLOG_SRC/Caddyfile" || { echo "no gaming block in $BLOG_SRC/Caddyfile"; exit 1; }
grep -q '/opt/gaming:/srv/gaming' "$BLOG_SRC/docker-compose.yml" || { echo "no /opt/gaming mount in $BLOG_SRC/docker-compose.yml"; exit 1; }

echo "==> Staging site (no build step: ship the modules and the two three.js files they import)"
# Cloudflare forces a 4h browser TTL on .js whatever the origin says, so a returning
# player would keep last deploy's modules. Each deploy's modules therefore live under
# v/<rev>/ and the HTML (which Cloudflare does not cache) points there: new deploy,
# new URLs, nothing stale. The unversioned copy stays for tools/ pages.
REV="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- engine game vendor index.html editor.html || echo "-$(date +%s)")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
stage_tree() {
  mkdir -p "$1/node_modules/three/build" "$1/node_modules/three/examples/jsm/geometries"
  cp -R engine game vendor "$1/"
  cp node_modules/three/build/three.module.js "$1/node_modules/three/build/"
  cp node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js "$1/node_modules/three/examples/jsm/geometries/"
}
stage_tree "$STAGE"
stage_tree "$STAGE/v/$REV"
mkdir -p "$STAGE/tools"
cp tools/models.html "$STAGE/tools/"
cp og.png favicon.svg apple-touch-icon.png "$STAGE/"
for page in index.html editor.html; do
  sed -e "s#\./node_modules/#./v/$REV/node_modules/#g" \
      -e "s#\./game/main\.js#./v/$REV/game/main.js#" \
      -e "s#from '\./game/level\.js'#from './v/$REV/game/level.js'#" \
      "$page" > "$STAGE/$page"
done
grep -q "v/$REV/game/main.js" "$STAGE/index.html" || { echo "index.html rewrite failed"; exit 1; }
grep -q "v/$REV/game/level.js" "$STAGE/editor.html" || { echo "editor.html rewrite failed"; exit 1; }
echo "    rev $REV"

echo "==> Shipping site to $HOST:/opt/gaming"
ssh "$HOST" 'mkdir -p /opt/gaming'
rsync -az --delete "$STAGE/" "$HOST:/opt/gaming/"

echo "==> Shipping blog config (Caddyfile + docker-compose.yml)"
# --inplace: the Caddyfile is bind-mounted as a single file; replacing the inode would
# leave the container reading the old one.
rsync -az --inplace "$BLOG_SRC/Caddyfile" "$BLOG_SRC/docker-compose.yml" "$HOST:/opt/blog/"

ssh "$HOST" bash -s <<'REMOTE'
  set -euo pipefail
  cd /opt/blog
  docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile </dev/null >/dev/null
  if ! docker compose exec -T caddy test -d /srv/gaming </dev/null; then
    echo "==> First deploy: recreating caddy to add the /srv/gaming mount"
    docker compose up -d caddy
  else
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile </dev/null
  fi
REMOTE

echo "==> Checking"
sleep 3
curl -sS -o /dev/null -w 'index %{http_code}\n' https://gaming.bobbby.online/
curl -sS -o /dev/null -w 'three %{http_code}\n' "https://gaming.bobbby.online/v/$REV/node_modules/three/build/three.module.js"
curl -sS -o /dev/null -w 'main %{http_code}\n' "https://gaming.bobbby.online/v/$REV/game/main.js"
