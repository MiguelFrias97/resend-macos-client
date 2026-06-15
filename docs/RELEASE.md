# Releasing Resend Mail (macOS)

How to produce a signed, notarized `.dmg` you can distribute outside the App Store.

## Prerequisites (one-time)

1. An **Apple Developer account** (paid — required for Developer ID + notarization).
2. A **Developer ID Application** certificate installed in your login keychain
   (Xcode → Settings → Accounts → Manage Certificates → +).
3. Put your **Team ID** into `macos/ExportOptions.plist` (replace `YOUR_TEAM_ID`;
   find it at developer.apple.com → Membership → Team ID).
4. A **notarytool keychain profile** so you don't paste credentials each time:
   ```bash
   xcrun notarytool store-credentials "resend-mail-notary" \
     --apple-id "you@example.com" \
     --team-id "YOUR_TEAM_ID" \
     --password "APP_SPECIFIC_PASSWORD"   # appleid.apple.com → App-Specific Passwords
   ```

## Build

```bash
nvm use                 # Node 22
scripts/build-release.sh
```

This archives Release, exports a Developer ID-signed `.app`, and packages
`macos/build/release/ResendMail.dmg`.

## Notarize + staple

```bash
xcrun notarytool submit macos/build/release/ResendMail.dmg \
  --keychain-profile "resend-mail-notary" --wait

xcrun stapler staple macos/build/release/ResendMail.dmg
```

`--wait` blocks until Apple finishes (usually a few minutes). On `Accepted`,
stapling embeds the ticket so the DMG opens without a network check.

## Verify

```bash
spctl -a -t open --context context:primary-signature -v macos/build/release/ResendMail.dmg
# → "accepted" / "source=Notarized Developer ID"
```

Then distribute the `.dmg`.

## Notes

- **App Sandbox + entitlements** are already wired (`macos/ResendMail-macOS/ResendMail.entitlements`:
  app-sandbox, network.client, user-selected.read-write). Notarization respects them.
- The Release build runs the same `fmt`/Xcode-26 Podfile patch as Debug.
- CI (`.github/workflows/ci.yml`) runs lint + unit tests on every PR; the macOS
  build job is best-effort (runners may lag the project's Xcode).
- Bump the app version/build in the Xcode target (or `Info.plist`) before each release.
