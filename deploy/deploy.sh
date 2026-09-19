#!/usr/bin/env bash
# CeePee release: build images on this machine, push them to a registry, pull and restart on the server.
#
#   deploy/deploy.sh build     # rush docker:min (all images, ~30 min)
#   deploy/deploy.sh push      # tag + push to $IMAGE_PREFIX:$IMAGE_TAG (needs: docker login ghcr.io)
#   deploy/deploy.sh server    # ssh to $SERVER: pull, up -d, upgrade the workspaces in $WORKSPACES
#   deploy/deploy.sh all       # the three in a row
#
# Reads deploy/.env for IMAGE_PREFIX, IMAGE_TAG, SERVER (user@host), SERVER_DIR (default /opt/ceepee)
# and WORKSPACES (comma-separated workspace urls to upgrade after each release).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
if [ -f "$here/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$here/.env"
  set +a
fi
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/bharat489/ceepee}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SERVER="${SERVER:-}"
SERVER_DIR="${SERVER_DIR:-/opt/ceepee}"
WORKSPACES="${WORKSPACES:-}"
IMAGES=(front account transactor workspace collaborator datalake integrations tool notification)

build () {
  (cd "$root" && node common/scripts/install-run-rush.js docker:min)
}

push () {
  for i in "${IMAGES[@]}"; do
    docker tag "hardcoreeng/$i" "$IMAGE_PREFIX/$i:$IMAGE_TAG"
    docker push "$IMAGE_PREFIX/$i:$IMAGE_TAG"
  done
}

server () {
  if [ -z "$SERVER" ]; then
    echo "set SERVER=user@host in deploy/.env"
    exit 1
  fi
  scp "$here/docker-compose.prod.yaml" "$here/Caddyfile" "$SERVER:$SERVER_DIR/"
  ssh "$SERVER" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yaml pull && docker compose -f docker-compose.prod.yaml up -d --remove-orphans"
  if [ -n "$WORKSPACES" ]; then
    for ws in ${WORKSPACES//,/ }; do
      ssh "$SERVER" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yaml --profile tool run --rm tool upgrade-workspace $ws -f"
    done
  else
    echo "Set WORKSPACES=ws1,ws2 in deploy/.env to upgrade workspaces automatically after each release."
  fi
}

case "${1:-all}" in
  build) build ;;
  push) push ;;
  server) server ;;
  all) build; push; server ;;
  *) echo "usage: $0 build|push|server|all"; exit 1 ;;
esac
