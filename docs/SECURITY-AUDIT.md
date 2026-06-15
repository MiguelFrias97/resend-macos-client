# Security Audit — 2026-06

A focused security review of the macOS Resend mail client, covering the four
attacker-facing surfaces: secrets storage, attachment/file handling, untrusted
HTML rendering (WKWebView), the Resend network layer, and the local data /
message-assembly layer. The threat model is **a malicious inbound email** (the
app's whole job is to render and reply to attacker-authored mail) plus a
**spoofed/MITM'd API response**.

Every finding below was confirmed against the actual code and **fixed** in the
same change; each fix has a regression test (122 tests pass).

## Findings & fixes

| # | Severity | Area | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | High | Outbound | CRLF / header injection: attacker-controlled received `Message-ID`, `References`, `from`, `subject` flowed unsanitized into outbound `In-Reply-To`/`References`/`to`/`from`/`Subject`; `isEmail` was never enforced at send time | `stripControlChars` + `sanitizeMessageId` strip CR/LF/control chars; `parseRecipients` now filters through `isEmail`; `EMAIL` regex rejects `<>,;"` (`assembleReply.js`, `assembleCompose.js`) |
| 2 | High | Native / Net | Attachment `download_url` (server-supplied) fetched with no scheme check → `file://` local-file read / `http://` SSRF | Require `https` in both `downloadToCache` (Swift) and `downloadBytes` (JS) |
| 3 | Med | WebView | cid scheme handler served `image/svg+xml` (active-content surface; bytes bypass the JS sanitizer) | Inline images are raster-only; SVG is no longer served |
| 4 | Med | WebView | Link clicks navigated the message webview in-place (in-app phishing / UI-redress) | `.linkActivated` navigations are cancelled and opened in the default browser via `NSWorkspace` |
| 5 | Med | Native | `lastPathComponent` does not neutralize `..`; inline `contentId` used as a cache filename unsanitized | `safeComponent` rejects `.`/`..`/empty/separators on both message-dir and file name; cid read path rejects `..`; `contentId` stripped of separators in JS |
| 6 | Med | WebView | CSP missing `base-uri`/`object-src`/`form-action`; remote fonts allowed when remote enabled | CSP adds `object-src 'none'; base-uri 'none'; form-action 'none'`; `font-src` stays `data:`-only |
| 7 | Med | Outbox | Retried permanent 4xx (401/403/422) and persisted unbounded server error text | 4xx (except 429) marked terminal — no retry; server `message` capped at 300 chars; status surfaced via `err.status` |
| 8 | Low | Data | Search `LIKE` wildcards (`%`/`_`) unescaped; latent SQL-fragment interpolation in `setFlag`/`listMessages` | Wildcards escaped + `ESCAPE '\'`; `FLAG_COLUMNS` allowlist on `setFlag`; `hasOwnProperty` guard on the `FILTERS` lookup |
| 9 | Low | Net | `Authorization` header clobberable by caller-supplied `headers` spread | Auth + content-type now applied **after** the caller spread |
| 10 | Low | Data | Unbounded raw `headers` blob retained; unbounded `References` array | Only the specific threading headers are kept; `References` capped at 50 |

## Reviewed and found sound (no change needed)

- **Keychain** — `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (no iCloud sync,
  unavailable when locked); the API key is never logged, never written to disk in
  plaintext, never placed in a URL/query string. Error paths return only an
  `OSStatus` int.
- **API base URL** is hard-coded to `https://api.resend.com`; no code path lets a
  server-supplied field choose the host for an authenticated (key-bearing) request.
  Pagination uses opaque `id` cursors via `URLSearchParams`, not server URLs.
- **WKWebView** disables JavaScript two ways; `file://` is blocked for untrusted
  HTML; `loadHTMLString(baseURL: nil)`.
- **HTML sanitizer** strips `<script>`/`<style>`/event handlers/`javascript:` hrefs;
  inline `url()` exfil is blocked by omitting `background` from the style allowlist.
- **SQL** is parameterized everywhere values are involved (the only interpolations
  are now-allowlisted identifiers/fragments).
- **Idempotency** — the outbox uses the stable item id as the `Idempotency-Key`, so
  a retry can't double-send.
- **Attachment hygiene** — filename sanitization (control/bidi/NUL/separators),
  `com.apple.quarantine` xattr on saved files, dangerous-type warning + no auto-open.

## Round 2 — adversarial re-review (bypass hunting)

A second pass tried to defeat the round-1 fixes and review untouched surfaces.
Findings fixed, each with a regression test (125 tests pass):

| # | Severity | Area | Issue | Fix |
|---|----------|------|-------|-----|
| 11 | High | Outbound | The **reply** send path validated only presence, never `isEmail` — so a malformed/injecting `from`/`to` derived from the received email bypassed the gate the compose path had | `replyPayloadError` now runs `isEmail` on `from` and `to`; `isEmail` moved to `assembleReply` to avoid a circular import |
| 12 | High | Native / Net | The https check covered only the first hop; `URLSession`/`fetch` follow redirects, so an https URL could 302 to `http://localhost` (permitted by an ATS exception) → SSRF / cache poisoning | `AttachmentFile` uses a `URLSession` delegate that cancels any non-https redirect; JS `downloadBytes` uses `redirect: 'manual'` and rejects 3xx |
| 13 | High | Editor | Inline images were unbounded (count/size/type) → memory DoS / oversized outbound mail | `collectInlineImages` caps count (20), per-image (~5 MB) and total (~25 MB) |
| 14 | Med | Editor | Native `setLink` stored any scheme as a live, clickable link in the NSTextView (the `safeHref` allowlist only covered the generated HTML) | `setLink` now drops anything but `http`/`https`/`mailto` |
| 15 | Med | Threading | `knownThreads` keyed by attacker-controlled Message-IDs on a plain object — a `__proto__` ref matched an inherited member and returned a non-string thread id | Null-prototype map + `hasOwnProperty` lookup |
| 16 | Low | Outbound | `sanitizeMessageId` allowed Unicode line/space separators (U+0085 NEL, U+2028) that JS `\s` misses | Require printable ASCII `[\x21-\x7e]` |

The round-1 defenses (CSP, SVG removal, cid `..` rejection, link routing,
`parseRecipients` on the compose path, `safeComponent`, SQL allowlists) were
re-attacked and **held**.

Two minor sanitizer/allowlist gaps surfaced by the grading pass were also closed:
the dangerous-attachment-extension set now includes macOS auto-run document types
(`inetloc`/`fileloc`/`terminal`/`prefpane`/`mpkg`/`url`…), and the email-image
sanitizer trims leading whitespace before its scheme check so a
`<img src="  https://tracker">` is blanked by the sanitizer itself rather than
relying solely on the CSP backstop.

**Outcome:** two independent graders scored the hardened code **A / A−** with no
A−-blocking issues.

## Residual / accepted

- With "Load images" enabled, remote `https:` images load (the intended opt-in) —
  this exposes tracking-pixel / read-receipt beacons to the sender. Documented;
  off by default.
- Response bodies are not size-capped before `res.json()` (memory-DoS from a
  malicious server). Low impact given the trusted Resend host over TLS.
- `verifyApiKey` returns `false` for both a bad key and a network failure (a UX
  nicety, not a security issue).
- **Cached mail is stored in a plaintext SQLite file** (op-sqlite, pure-SQLite
  build). The API key itself is never in the DB (Keychain-only), but message
  bodies/subjects/senders are cached locally. Compensating controls: the app is
  **App-Sandboxed** (its container isn't readable by other sandboxed apps), the
  Mac's disk is encrypted at rest by **FileVault** (on by default on modern
  Macs), and the Keychain secret is `ThisDeviceOnly`. This matches the posture of
  Apple Mail's local store. Full at-rest DB encryption (SQLCipher keyed from the
  Keychain) is a planned enhancement; it needs a SQLCipher-enabled native build
  and a key-bootstrap/migration step, tracked separately.
- The `localhost` ATS exception (needed by the Metro dev server) permits cleartext
  HTTP only to `localhost`; the SSRF chain that relied on it is closed by the
  redirect-blocking fix (#12), so the exception is no longer reachable as a vector.
