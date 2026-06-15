#!/usr/bin/env bash
#
# Build a standalone Release app (JS bundle embedded — no Metro needed) and
# install it into /Applications. Re-run this any time you change the code to
# update the installed app.
#
# Local/unsigned: the app is signed ad-hoc and runs on this machine only.
# This is NOT the distributable signed+notarized path.
set -euo pipefail

cd "$(dirname "$0")/.."

WORKSPACE="macos/ResendMail.xcworkspace"
SCHEME="ResendMail-macOS"
DERIVED="macos/build/install"
PRODUCTS="$DERIVED/Build/Products/Release"
APP_NAME="ResendMail.app"
DEST="/Applications"

command -v xcodebuild >/dev/null 2>&1 || { echo "xcodebuild not found — install Xcode" >&2; exit 1; }

# Xcode's Release "Bundle React Native code" phase runs metro with a bare `node`
# from the inherited PATH (it ignores .xcode.env / NODE_BINARY). metro needs
# util.styleText, added in Node 20.12 — nvm's default is often older. Activate
# the version in .nvmrc (22), verify styleText exists, and put it first on PATH
# so both `node` and $NODE_BINARY resolve to it.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
if command -v nvm >/dev/null 2>&1; then
  nvm use >/dev/null 2>&1 || nvm use 22 >/dev/null 2>&1 || true
fi
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "node not found on PATH" >&2; exit 1; }
if ! "$NODE_BIN" -e 'process.exit(typeof require("util").styleText==="function"?0:1)'; then
  echo "Node at $NODE_BIN ($("$NODE_BIN" -v)) lacks util.styleText (need >= 20.12)." >&2
  echo "Install/activate Node 22, e.g.:  nvm install 22 && nvm use 22" >&2
  echo "(or set it as default:  nvm alias default 22)" >&2
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"
export NODE_BINARY="$NODE_BIN"
echo "==> Using node $("$NODE_BIN" -v) at $NODE_BIN"

# Pods must exist (and be current) before an xcodebuild on the workspace.
if [ ! -d "macos/Pods" ]; then
  echo "==> Installing pods (first run)"
  ( cd macos && pod install )
fi

echo "==> Building Release (this embeds the JS bundle; first build is slow)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP="$PRODUCTS/$APP_NAME"
if [ ! -d "$APP" ]; then
  APP="$(/usr/bin/find "$PRODUCTS" -maxdepth 1 -name '*.app' | head -1)"
fi
[ -n "$APP" ] && [ -d "$APP" ] || { echo "Build succeeded but no .app found in $PRODUCTS" >&2; exit 1; }

echo "==> Installing to $DEST (replacing any existing copy)"
rm -rf "$DEST/$(basename "$APP")"
cp -R "$APP" "$DEST/"

echo "==> Done: $DEST/$(basename "$APP")"
echo "    Launch it from Launchpad/Spotlight, or: open '$DEST/$(basename "$APP")'"
