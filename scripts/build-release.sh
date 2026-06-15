#!/usr/bin/env bash
#
# Build a Release archive of the macOS app, export it for Developer ID
# distribution, and package it as a DMG.
#
# Prereqs:
#   - Xcode + CocoaPods, Node >= 20.12 (`nvm use`)
#   - A "Developer ID Application" certificate in your login keychain
#   - Your Team ID filled into macos/ExportOptions.plist
#
# Notarization is a separate step — see docs/RELEASE.md.
set -euo pipefail

WORKSPACE="macos/ResendMail.xcworkspace"
SCHEME="ResendMail-macOS"
BUILD_DIR="macos/build/release"
ARCHIVE="$BUILD_DIR/ResendMail.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"

command -v pod >/dev/null 2>&1 || { echo "CocoaPods not found — brew install cocoapods" >&2; exit 1; }

echo "==> Installing pods"
( cd macos && pod install )

echo "==> Archiving (Release)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  archive

echo "==> Exporting (Developer ID)"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist macos/ExportOptions.plist \
  -exportPath "$EXPORT_DIR"

APP="$(/usr/bin/find "$EXPORT_DIR" -maxdepth 1 -name '*.app' | head -1)"
if [ -z "$APP" ]; then
  echo "No .app found in $EXPORT_DIR" >&2
  exit 1
fi
echo "==> Exported app: $APP"

echo "==> Creating DMG"
DMG="$BUILD_DIR/ResendMail.dmg"
hdiutil create -volname "Resend Mail" -srcfolder "$APP" -ov -format UDZO "$DMG"
echo "==> DMG: $DMG"
echo
echo "Next: notarize + staple the DMG — see docs/RELEASE.md"
