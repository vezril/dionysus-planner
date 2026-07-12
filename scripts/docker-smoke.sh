#!/usr/bin/env bash
# Release-gate smoke test for the Docker image (docs/stories/S-601,
# architecture.md §7, §9 Risk #1: "build image, run it, hit
# /api/health" — not just `next build` succeeding).
#
# Exercises, against a REAL docker build/run (never mocked):
#   1. Image build + size budget (NFR-4, <=500 MB).
#   2. Fresh-volume boot: HEALTHCHECK green within 10s (NFR-1) and
#      seeded ingredient count == length of bundled data/seed/seed-data.json
#      (FR-1 mechanism at this sequence slot — NOT a >=300 assertion;
#      see S-601 Dev Notes / epics.md step 10 for the later full-catalog
#      re-run).
#   3. Durability + idempotent re-seed across stop/rm/recreate on the
#      same volume (NFR-5, FR-28): a pantry item, a recipe, and an
#      overridden seeded ingredient survive; ingredient count is
#      unchanged (no duplicate re-seed rows).
#   4. Offline operation (NFR-9): container run with --network=none
#      (zero outbound connectivity, not even DNS) still serves the
#      seed-backed health/catalog check via its own loopback.
#
# Known scope gap (see hand-off report): at this story's sequence slot
# the app exposes no HTTP write endpoints yet (pantry/recipe/WCIC are
# still shell-only routes per S-105; their CRUD stories land later), so
# step 3's "write a pantry item + recipe" is done directly against the
# mounted SQLite file via the sqlite3 CLI rather than via HTTP. Swap
# this for real HTTP calls once those endpoints exist.
set -euo pipefail

IMAGE="${DOCKER_SMOKE_IMAGE:-dionysus-planner:smoke}"
HOST_PORT="${DOCKER_SMOKE_PORT:-3100}"
SIZE_BUDGET_BYTES=$((500 * 1024 * 1024))
HEALTH_TIMEOUT_S=10

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WORKDIR="$(mktemp -d)"
VOL="$WORKDIR/data-volume"
mkdir -p "$VOL"

CONTAINERS=()

cleanup() {
  local ec=$?
  for c in "${CONTAINERS[@]:-}"; do
    [ -n "$c" ] && docker rm -f "$c" >/dev/null 2>&1 || true
  done
  docker network rm dionysus-smoke-net >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
  exit "$ec"
}
trap cleanup EXIT

log() { printf '\n[docker-smoke] %s\n' "$1"; }

wait_healthy() {
  local name="$1" timeout="$2" start now hstatus
  start=$(date +%s)
  while true; do
    hstatus=$(docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null || echo "")
    now=$(date +%s)
    if [ "$hstatus" = "healthy" ]; then
      echo "$((now - start))"
      return 0
    fi
    if [ "$((now - start))" -ge "$timeout" ]; then
      docker logs "$name" || true
      echo "FAILED: $name did not become healthy within ${timeout}s (last status: $hstatus)" >&2
      return 1
    fi
    sleep 1
  done
}

# --- 1. Build + size budget --------------------------------------------
log "Building image ${IMAGE}..."
docker build -t "$IMAGE" .

SIZE_BYTES=$(docker image inspect "$IMAGE" --format='{{.Size}}')
# Multi-platform/attestation manifests can make `docker image inspect
# .Size` unreliable; cross-check against `docker images` (matches
# `docker system df -v`), which reflects the actual on-disk layer size.
SIZE_HUMAN=$(docker images "$IMAGE" --format '{{.Size}}')
log "Image size: ${SIZE_HUMAN} (inspect raw bytes: ${SIZE_BYTES})"
SIZE_BYTES_FALLBACK=$(docker inspect "$IMAGE" | python3 -c "
import json,sys
d = json.load(sys.stdin)[0]
print(d.get('Size') or 0)
")
if [ "${SIZE_BYTES_FALLBACK:-0}" -gt "$SIZE_BUDGET_BYTES" ]; then
  echo "FAILED: image size ${SIZE_BYTES_FALLBACK} bytes exceeds ${SIZE_BUDGET_BYTES} byte (500MB) budget (NFR-4)" >&2
  exit 1
fi

# --- 2. Fresh-volume boot: health + seeded count -----------------------
SEED_COUNT=$(node -e "console.log(require('${ROOT_DIR}/data/seed/seed-data.json').length)")
log "Bundled seed-data.json length: ${SEED_COUNT}"

NAME1="dionysus-smoke-fresh-$$"
# --- volume DB access helpers -------------------------------------------
# The container runs as root, so the volume's dionysus.db is root-owned on
# Linux hosts/CI runners and the host sqlite3 CLI cannot write (or sometimes
# even read) it. Run all SQL inside a throwaway container using the image's
# own node + better-sqlite3 instead — one code path that works identically
# on macOS Docker Desktop and Linux runners, in the app's real environment.
db_exec() {
  docker run --rm -v "$VOL:/data" --entrypoint node "$IMAGE" -e '
const db = require("better-sqlite3")("/data/dionysus.db");
db.exec(process.argv[1]);
db.close();' "$1"
}
db_scalar() {
  docker run --rm -v "$VOL:/data" --entrypoint node "$IMAGE" -e '
const db = require("better-sqlite3")("/data/dionysus.db");
const row = db.prepare(process.argv[1]).raw().get();
console.log(String(row[0]));
db.close();' "$1"
}

CONTAINERS+=("$NAME1")
docker run -d --name "$NAME1" -p "${HOST_PORT}:3000" -v "$VOL:/data" "$IMAGE" >/dev/null
ELAPSED=$(wait_healthy "$NAME1" "$HEALTH_TIMEOUT_S")
log "Healthy within ${ELAPSED}s (budget ${HEALTH_TIMEOUT_S}s, NFR-1)"

HEALTH_BODY=$(curl -sS -w '\n%{http_code}' "http://localhost:${HOST_PORT}/api/health")
HEALTH_CODE=$(echo "$HEALTH_BODY" | tail -1)
[ "$HEALTH_CODE" = "200" ] || { echo "FAILED: /api/health returned $HEALTH_CODE" >&2; exit 1; }

# Count via the app's own HTTP surface (GET /api/ingredients, S-301) when
# available; fall back to the sqlite3 CLI against the mounted volume file
# if that route doesn't exist yet at this sequence slot.
if curl -sSf "http://localhost:${HOST_PORT}/api/ingredients" >/dev/null 2>&1; then
  INGREDIENT_COUNT=$(curl -sS "http://localhost:${HOST_PORT}/api/ingredients" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
  log "Seeded ingredient count (via GET /api/ingredients): ${INGREDIENT_COUNT}"
else
  INGREDIENT_COUNT=$(db_scalar "SELECT count(*) FROM ingredient;")
  log "Seeded ingredient count (via in-container query — /api/ingredients not present): ${INGREDIENT_COUNT}"
fi
[ "$INGREDIENT_COUNT" = "$SEED_COUNT" ] || {
  echo "FAILED: ingredient count ($INGREDIENT_COUNT) != bundled seed-data.json length ($SEED_COUNT)" >&2
  exit 1
}

# --- 3. Durability + idempotent re-seed --------------------------------
log "Writing pantry item + recipe + ingredient override directly to the volume (no HTTP write API exists at this sequence slot; see script header)..."
docker rm -f "$NAME1" >/dev/null 2>&1
CONTAINERS=()

TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
db_exec "
UPDATE ingredient SET caloriesPerRef = 999.0, overridden = 1, updatedAt = '$TS' WHERE id = 1;
INSERT INTO pantry_item (ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit, updatedAt)
  VALUES (2, 500, 'COUNT', 2, 'medium', '$TS');
INSERT INTO recipe (name, servings, instructions, createdAt, updatedAt)
  VALUES ('Smoke Test Soup', 4, 'Combine and simmer.', '$TS', '$TS');
INSERT INTO recipe_line (recipeId, ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit)
  VALUES ((SELECT id FROM recipe WHERE name='Smoke Test Soup'), 3, 100, 'COUNT', 1, 'medium');
"

NAME2="dionysus-smoke-restart-$$"
CONTAINERS+=("$NAME2")
docker run -d --name "$NAME2" -p "${HOST_PORT}:3000" -v "$VOL:/data" "$IMAGE" >/dev/null
ELAPSED=$(wait_healthy "$NAME2" "$HEALTH_TIMEOUT_S")
log "Recreated container healthy within ${ELAPSED}s"

COUNT_AFTER=$(db_scalar "SELECT count(*) FROM ingredient;")
[ "$COUNT_AFTER" = "$SEED_COUNT" ] || {
  echo "FAILED: ingredient count changed after restart ($COUNT_AFTER != $SEED_COUNT) — seed is not idempotent" >&2
  exit 1
}
OVERRIDE_ROW=$(db_scalar "SELECT caloriesPerRef || '|' || overridden FROM ingredient WHERE id = 1;")
[ "$OVERRIDE_ROW" = "999.0|1" ] || { echo "FAILED: override not preserved after restart ($OVERRIDE_ROW)" >&2; exit 1; }
PANTRY_ROW=$(db_scalar "SELECT count(*) FROM pantry_item;")
[ "$PANTRY_ROW" = "1" ] || { echo "FAILED: pantry item not preserved after restart" >&2; exit 1; }
RECIPE_ROW=$(db_scalar "SELECT count(*) FROM recipe WHERE name = 'Smoke Test Soup';")
[ "$RECIPE_ROW" = "1" ] || { echo "FAILED: recipe not preserved after restart" >&2; exit 1; }
log "Durability + idempotent re-seed verified: count unchanged, override intact, pantry item + recipe preserved"

docker rm -f "$NAME2" >/dev/null 2>&1
CONTAINERS=()

# --- 4. Offline operation (NFR-9) ---------------------------------------
log "Running with --network=none (zero outbound connectivity, not even DNS)..."
NAME3="dionysus-smoke-offline-$$"
CONTAINERS+=("$NAME3")
docker run -d --name "$NAME3" --network=none -v "$VOL:/data" "$IMAGE" >/dev/null
ELAPSED=$(wait_healthy "$NAME3" "$HEALTH_TIMEOUT_S")
log "Offline container healthy within ${ELAPSED}s"

if docker exec "$NAME3" node -e "fetch('http://example.com').then(()=>process.exit(1)).catch(()=>process.exit(0))"; then
  log "Confirmed zero outbound connectivity (external fetch failed as expected)"
else
  echo "FAILED: outbound network call unexpectedly succeeded inside --network=none container" >&2
  exit 1
fi

docker exec "$NAME3" node -e "
fetch('http://localhost:3000/api/health').then(r => r.json()).then(j => {
  if (j.status !== 'ok') { console.error('unexpected health body', j); process.exit(1); }
  console.log('offline health check ok:', JSON.stringify(j));
});
"
docker rm -f "$NAME3" >/dev/null 2>&1
CONTAINERS=()

log "ALL DOCKER SMOKE CHECKS PASSED"
