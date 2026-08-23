#!/usr/bin/env bash
# openspec: backup-export — pull the Dionysus backup into the Obsidian
# vault. LAN first, Tailscale fallback. The Recipes/ and Products/
# subfolders are REPLACED each run (they are generated); Backup.json is
# the lossless bundle.
set -euo pipefail

VAULT_DIR="${DIONYSUS_VAULT_DIR:-$HOME/Mindmap/Dionysus}"
LAN_URL="${DIONYSUS_LAN_URL:-http://dionysus.lan:61642}"
TS_URL="${DIONYSUS_TS_URL:-http://mimir.tail783b49.ts.net:61642}"

base=""
for candidate in "$LAN_URL" "$TS_URL"; do
  if curl -sf -o /dev/null --max-time 5 "$candidate/api/health"; then
    base="$candidate"
    break
  fi
done
if [ -z "$base" ]; then
  echo "Dionysus unreachable over LAN or Tailscale." >&2
  exit 1
fi
echo "Backing up from $base"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -sf --max-time 120 "$base/api/backup" -o "$tmp/Backup.json"
curl -sf --max-time 120 "$base/api/backup/markdown" -o "$tmp/markdown.json"

mkdir -p "$VAULT_DIR"
rm -rf "$VAULT_DIR/Recipes" "$VAULT_DIR/Products"
python3 - "$tmp/markdown.json" "$VAULT_DIR" <<'PY'
import json, os, sys
payload = json.load(open(sys.argv[1]))
vault = sys.argv[2]
for entry in payload["files"]:
    path = os.path.join(vault, entry["path"])
    if not os.path.realpath(path).startswith(os.path.realpath(vault)):
        raise SystemExit(f"refusing path escape: {entry['path']}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as handle:
        handle.write(entry["content"])
print(f"wrote {len(payload['files'])} notes")
PY
cp "$tmp/Backup.json" "$VAULT_DIR/Backup.json"
echo "Backup complete → $VAULT_DIR"
