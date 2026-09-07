#!/usr/bin/env bash
#
# Runs SpeakRight integration/E2E tests inside the Electron main process.
#
# Why Electron? The integration tests exercise better-sqlite3, which must be
# compiled for Electron's ABI (see `pnpm rebuild`). Node's ABI is
# incompatible, so vitest-only tests cannot load it.
#
# Usage:
#   scripts/run-integration.sh            # DB + queue round-trip
#   scripts/run-integration.sh e2e        # real whisper-cli + ollama chain
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET="${1:-db}"
ESBUILD="$REPO_ROOT/node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/bin/esbuild"
OUT_DIR="apps/desktop/out/int-test"

case "$TARGET" in
  db)   ENTRY="tests/integration/main.ts" ;;
  e2e)  ENTRY="tests/e2e/providers.ts" ;;
  *)    echo "Unknown target: $TARGET (use 'db' or 'e2e')" >&2; exit 2 ;;
esac

mkdir -p "$OUT_DIR"

"$ESBUILD" "$ENTRY" \
  --bundle \
  --platform=node \
  --format=esm \
  --packages=external \
  --outfile="$OUT_DIR/main.mjs"

echo "Launching $TARGET tests under Electron..."

# --no-sandbox: required on dev machines where chrome-sandbox is not SUID.
ELECTRON_BIN="$(node -p "require('electron')" 2>/dev/null || echo "$REPO_ROOT/node_modules/.pnpm/electron@31.7.7_supports-color@7.2.0/node_modules/electron/dist/electron")"

exec "$ELECTRON_BIN" "$OUT_DIR/main.mjs" --no-sandbox