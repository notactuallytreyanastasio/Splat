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
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/node_modules/three/build" "$STAGE/node_modules/three/examples/jsm/geometries" "$STAGE/tools"
cp index.html editor.html "$STAGE/"
cp -R engine game vendor "$STAGE/"
cp tools/models.html "$STAGE/tools/"
cp node_modules/three/build/three.module.js "$STAGE/node_modules/three/build/"
cp node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js "$STAGE/node_modules/three/examples/jsm/geometries/"

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
curl -sS -o /dev/null -w 'three %{http_code}\n' https://gaming.bobbby.online/node_modules/three/build/three.module.js
