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

## Residual / accepted

- With "Load images" enabled, remote `https:` images load (the intended opt-in) —
  this exposes tracking-pixel / read-receipt beacons to the sender. Documented;
  off by default.
- Response bodies are not size-capped before `res.json()` (memory-DoS from a
  malicious server). Low impact given the trusted Resend host over TLS.
- `verifyApiKey` returns `false` for both a bad key and a network failure (a UX
  nicety, not a security issue).
