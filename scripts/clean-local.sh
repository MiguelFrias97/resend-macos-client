#!/usr/bin/env bash
#
# Remove the local macOS build cache (DerivedData/intermediates) to reclaim disk.
# The next `npm run install:macos` / `npm run macos` will be a slow full rebuild.
# Does NOT touch the installed /Applications/ResendMail.app.
set -euo pipefail

cd "$(dirname "$0")/.."

BUILD_DIR="macos/build"

if [ ! -d "$BUILD_DIR" ]; then
  echo "Nothing to clean — $BUILD_DIR does not exist."
  exit 0
fi

SIZE="$(du -sh "$BUILD_DIR" 2>/dev/null | cut -f1)"
echo "==> Removing $BUILD_DIR (${SIZE:-unknown})"
rm -rf "$BUILD_DIR"
echo "==> Freed ${SIZE:-?}. Next build will be a full rebuild."
