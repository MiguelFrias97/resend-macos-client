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
