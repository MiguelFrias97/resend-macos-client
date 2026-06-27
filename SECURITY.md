# Security Policy

Resend Mail is a desktop email client: it stores a Resend API key, renders
untrusted inbound email, and caches mail locally. Security reports are taken
seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/MiguelFrias97/resend-client/security/advisories/new)
(Security → Report a vulnerability). Include:

- what you found and where (file / flow),
- a concrete reproduction or proof of concept,
- the impact you believe it has.

You can expect an initial response within a few days. Please give a reasonable
window to fix before any public disclosure.

## Scope

In scope (the things this app is responsible for):

- **Untrusted email rendering** — the `WKWebView` body (JavaScript disabled,
  remote content blocked by default, CSP-enforced) and the HTML sanitizer
  (`src/html/sanitizeEmailHtml.js`).
- **Outbound message assembly** — header/address injection on reply/compose/
  forward (`src/reply/`, `src/compose/`).
- **Local data** — the SQLCipher-encrypted cache and parameterized SQL
  (`src/data/`), attachment handling and quarantine (`macos/.../AttachmentFile.swift`,
  `src/files/attachmentSafety.js`).
- **Credential storage** — the macOS Keychain integration (`src/native/Keychain.js`,
  `macos/.../Keychain.swift`).
- **Network** — the Resend client (`src/net/`): the API key must never leave the
  Resend host or appear in logs/URLs.

Out of scope:

- Issues in the Resend API itself (report to Resend).
- The **local development build is ad-hoc / self-signed**; lack of notarization
  and the repeated Keychain prompts that come with an unsigned build are known
  and documented (`docs/SECURITY-AUDIT.md`), not vulnerabilities.
- Denial of service / resource exhaustion.

## Hardening notes

This project has been through several security reviews; see
[`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md) for the threat model, the
findings, and the compensating controls.
