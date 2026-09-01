#!/usr/bin/env bash
# Pull latest code, rebuild changed images, and recreate only services whose
# image or config actually changed. Run from anywhere; resolves to repo root.

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose)

# Read one variable without sourcing .env: it may contain arbitrary operator
# values that are data for Compose, not shell code. The last assignment wins,
# matching the usual dotenv behavior.
dotenv_value() {
  local key="$1" line value="" found=0
  [ -f .env ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*${key}[[:space:]]*=(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
      found=1
    fi
  done < .env
  [ "$found" -eq 1 ] || return 1
  value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ "$value" == \"*\" ]]; then
    value="${value:1}"
    value="${value%%\"*}"
  elif [[ "$value" == \'*\' ]]; then
    value="${value:1}"
    value="${value%%\'*}"
  else
    value="$(printf '%s' "$value" | sed -e 's/[[:space:]]#.*$//')"
    value="$(printf '%s' "$value" | sed -e 's/[[:space:]]*$//')"
  fi
  printf '%s' "$value"
}

# --- Guard against wrong-compose-file orphan wipes ---------------------------
# `up -d --remove-orphans` below removes any project container that isn't
# defined in the selected Compose stack. But the base compose files (yml/byo/dev)
# share one project name, so targeting the wrong primary file would treat the
# other stack's services (web/caddy vs. just broadcast+controller, etc.) as
# orphans and delete them.
#
# Normal commands deliberately use plain `docker compose`, allowing Compose to
# read COMPOSE_FILE from the root .env. For this guard only, determine the
# effective stack's primary file without sourcing .env, then compare it with the
# first config file recorded on the running containers. If nothing is running,
# there's nothing to protect.
if [ -n "${COMPOSE_FILE:-}" ]; then
  EFFECTIVE_COMPOSE_FILE="$COMPOSE_FILE"
else
  EFFECTIVE_COMPOSE_FILE="$(dotenv_value COMPOSE_FILE || true)"
  EFFECTIVE_COMPOSE_FILE="${EFFECTIVE_COMPOSE_FILE:-docker-compose.yml}"
fi
if [ -n "${COMPOSE_PATH_SEPARATOR:-}" ]; then
  EFFECTIVE_PATH_SEPARATOR="$COMPOSE_PATH_SEPARATOR"
else
  EFFECTIVE_PATH_SEPARATOR="$(dotenv_value COMPOSE_PATH_SEPARATOR || true)"
  EFFECTIVE_PATH_SEPARATOR="${EFFECTIVE_PATH_SEPARATOR:-:}"
fi
PRIMARY_COMPOSE_FILE="${EFFECTIVE_COMPOSE_FILE%%"$EFFECTIVE_PATH_SEPARATOR"*}"
SELECTED_ABS="$(cd "$(dirname "$PRIMARY_COMPOSE_FILE")" && pwd)/$(basename "$PRIMARY_COMPOSE_FILE")"
RUNNING_IDS="$("${COMPOSE[@]}" ps -q 2>/dev/null || true)"
if [ -n "$RUNNING_IDS" ]; then
  ACTIVE_CFG=""
  for id in $RUNNING_IDS; do
    # config_files is comma-separated when overlays are active; the first entry
    # is the primary file and is the only part relevant to this safety check.
    ACTIVE_CFG="$(docker inspect \
      --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' \
      "$id" 2>/dev/null | cut -d, -f1)"
    [ -n "$ACTIVE_CFG" ] && break
  done
  if [ -n "$ACTIVE_CFG" ] && [ "$ACTIVE_CFG" != "$SELECTED_ABS" ]; then
    echo "✗ Running containers were launched from:" >&2
    echo "    $ACTIVE_CFG" >&2
    echo "  but this update targets:" >&2
    echo "    $SELECTED_ABS" >&2
    echo "  Running --remove-orphans against the wrong file would delete the" >&2
    echo "  other stack's services. Re-run with COMPOSE_FILE set to match, e.g.:" >&2
    echo "    COMPOSE_FILE=$(basename "$ACTIVE_CFG") $0" >&2
    exit 1
  fi
fi

echo "→ Pulling latest from origin"
git pull --ff-only

echo "→ Pulling base images"
"${COMPOSE[@]}" pull --ignore-buildable

# Stamp the build with the real version (latest tag + commits since), so the
# admin console footer and controller report the deployed version instead of the
# package.json number — which only bumps on `main` and so trails `develop` by a
# release. Empty if git/tags are unavailable; the builds then fall back to
# package.json. Exported so compose's build.args interpolation picks it up.
export SUBWAVE_BUILD_VERSION="${SUBWAVE_BUILD_VERSION:-$(git describe --tags --always --dirty 2>/dev/null || true)}"
echo "→ Building local images (version: ${SUBWAVE_BUILD_VERSION:-package.json})"
"${COMPOSE[@]}" build --pull

echo "→ Recreating changed services"
"${COMPOSE[@]}" up -d --remove-orphans

echo "→ Pruning dangling images"
docker image prune -f >/dev/null

echo
echo "✓ Update complete"
"${COMPOSE[@]}" ps
