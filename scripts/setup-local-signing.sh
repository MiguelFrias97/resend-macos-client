#!/usr/bin/env bash
#
# One-time setup: create a STABLE self-signed code-signing identity so the local
# app has a fixed cryptographic identity. Once the app is signed with this,
# macOS can remember "Always Allow" for the Keychain, and the repeated
# password prompts on every launch stop — with NO loss of security (the API key
# and DB key stay in the Keychain, ThisDeviceOnly).
#
# Run this ONCE: `npm run setup-signing` (you'll be asked for your login
# password once, to add the certificate to your keychain). After that,
# `npm run install:macos` re-signs the app with this identity automatically.
set -euo pipefail

IDENTITY="ResendMail Local"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -p codesigning "$KEYCHAIN" 2>/dev/null | grep -q "$IDENTITY"; then
  echo "Signing identity '$IDENTITY' already exists — nothing to do."
  echo "Run: npm run install:macos"
  exit 0
fi

# Prefer macOS's system openssl (LibreSSL) so the PKCS#12 is in a format the
# `security` tool can import; fall back to whatever's on PATH.
OPENSSL="/usr/bin/openssl"
[ -x "$OPENSSL" ] || OPENSSL="$(command -v openssl || true)"
[ -n "$OPENSSL" ] || { echo "openssl not found" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Generating a self-signed code-signing certificate ($IDENTITY)"
cat > "$TMP/cs.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $IDENTITY
[v3]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF

"$OPENSSL" req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -config "$TMP/cs.cnf" >/dev/null 2>&1
# Legacy PBE so macOS's Security framework can read the .p12 (OpenSSL 3 defaults
# to AES, which `security import` can't open).
"$OPENSSL" pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -name "$IDENTITY" -out "$TMP/id.p12" -passout pass:resendmail \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 >/dev/null 2>&1

echo "==> Adding it to your login keychain (you may be asked for your login password)"
# -T authorizes codesign to use the key without prompting on every sign.
security import "$TMP/id.p12" -k "$KEYCHAIN" -P resendmail -T /usr/bin/codesign

echo
echo "Done. Signing identity '$IDENTITY' is installed."
echo "Next: npm run install:macos   (it will re-sign the app with this identity)"
echo "Then launch the app and click \"Always Allow\" on the Keychain prompts —"
echo "they will not come back."
