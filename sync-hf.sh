#!/usr/bin/env bash
# ──────────────────────────────────────────────
# sync-hf.sh — Mirror backend sources to hf-space
# Run before every Hugging Face Spaces push.
#
# Usage:
#   bash sync-hf.sh          (from vaultmcp/ root)
#   ./sync-hf.sh             (make sure it's executable)
# ──────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/backend"
DEST="$SCRIPT_DIR/backend/hf-space"

echo "═══════════════════════════════════════════"
echo "  VaultMCP — Syncing backend → hf-space"
echo "═══════════════════════════════════════════"

# Python source files
for f in main.py ai_processor.py drive_handler.py md_generator.py web_searcher.py; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$DEST/$f"
    echo "  ✓ $f"
  else
    echo "  ✗ $f — NOT FOUND (skipped)"
  fi
done

# requirements.txt
if [ -f "$SRC/requirements.txt" ]; then
  cp "$SRC/requirements.txt" "$DEST/requirements.txt"
  echo "  ✓ requirements.txt"
fi

# Dockerfile
if [ -f "$SRC/Dockerfile" ]; then
  cp "$SRC/Dockerfile" "$DEST/Dockerfile"
  echo "  ✓ Dockerfile"
fi

echo ""
echo "  Done. Files synced to: backend/hf-space/"
echo "  Now push hf-space/ to your HF Spaces repo."
echo "═══════════════════════════════════════════"
