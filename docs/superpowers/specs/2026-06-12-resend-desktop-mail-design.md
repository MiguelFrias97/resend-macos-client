# Resend Desktop Mail — Design

**Date:** 2026-06-12
**Status:** Approved design, pre-implementation
**Author:** Miguel Frias (with Claude)

## 1. Summary

A **native macOS desktop email client** for reading and replying to email **received via
Resend Inbound**. Built with `react-native-macos` using as many true native (AppKit / WebKit)
components as possible, in an Apple/Jobs visual idiom. The app talks **directly to the Resend
API** — there is **no backend service**. It polls for received mail, caches everything in a
local SQLite store, and sends rich-text (HTML) replies, forwards, and new messages — with
attachments and inline images — through Resend's send API.

Primary purpose: **reply to email I receive via Resend**, with attachments and images.

## 2. Goals & non-goals

**Goals**
- Read received email (HTML body, inline images, attachments) safely and natively.
- Reply in-thread with a rich-text WYSIWYG editor, attachments, and inline images.
- Compose new email and forward received email.
- Triage: read/unread, star, archive, search.
- Feel like a first-class Mac app: native toolbar, sidebar, vibrancy, light/dark, system accent.
- Work offline from a local cache; retain history beyond Resend's 30-day window.

**Non-goals (v1)**
- No backend / server component, no push when the app is closed.
- No multi-user / multi-tenant; single user, single Resend account.
- No bundled antivirus engine (rely on macOS defenses + hygiene; scanner seam left open).
- No Windows/Linux; macOS only.
- No calendar, contacts sync, rules/filters engine, or signatures manager (later).

## 3. Key decisions (locked)

| Topic | Decision |
|---|---|
| Platform | macOS only, `react-native-macos`, New Architecture (Fabric) |
| Backend | **None.** App talks directly to Resend; local SQLite cache |
| Ingress | Poll `GET /emails/receiving` (~25s + focus + ⌘R); no webhooks |
| Language | **Plain JavaScript** (ESLint + Prettier); runtime validation at the network boundary |
| Layout | Focused **2-pane** (message list + reading pane); collapsible sidebar |
| Reply UX | **Inline expanding** editor in the reading pane |
| Compose/Forward UX | Same editor presented as a **focused sheet** |
| Editor build | **Native `NSTextView` Fabric component** + `NSAttributedString ⇄ HTML` bridge |
| HTML rendering | **`WKWebView`** (sanitized, JS off, remote content blocked, `cid:` resolved) |
| Appearance | **Auto** (follow macOS), both light & dark |
| Accent | **macOS system accent** (no invented brand color) |
| Secrets | Resend API key in **Keychain** only |
| Attachment safety | OS defenses (quarantine → XProtect/Gatekeeper) + app hygiene; opt-in scanner deferred |

## 4. Resend API facts this design depends on

- **Inbound is webhook-first**, but a polling REST API exists:
  `GET https://api.resend.com/emails/receiving` lists received emails (metadata + cursor
  pagination via `after`/`before`, `limit` ≤ 100). Returns `id`, `from`, `to`, `cc`, `bcc`,
  `reply_to`, `subject`, `message_id`, `created_at`, and an `attachments` array (metadata).
- **Body** (HTML/text) is fetched per-message via the Retrieve Received Email endpoint by `id`.
- **Attachment bytes** come from the received-attachments API (list + retrieve by id).
- Received email + attachments are **retained ~30 days** by Resend → local cache is the
  durable archive.
- **Sending** (replies/forwards/new) uses the Resend send email API; threading is achieved by
  setting `In-Reply-To` / `References` headers to the source message's `message_id`.

> Because there is no "list" guarantee of ordering stability beyond cursors, sync is built on
> cursor paging + a newest-seen id, with idempotent upserts keyed by Resend `id`.

## 5. Architecture

Single process, no server.

```
┌─────────────────────────────────────────────┐
│  UI  (React, react-native-macos / AppKit)     │  2-pane, NSToolbar, sidebar, vibrancy
├─────────────────────────────────────────────┤
│  App core  (plain JS)                          │  view-models, thread grouping, flags, outbox SM
├──────────────┬───────────────┬───────────────┤
│  MailSource  │   LocalStore   │    Sender      │
│  (Resend     │   (SQLite +    │  (Resend send/ │
│   polling)   │    file cache) │   reply API)   │
├──────────────┴───────────────┴───────────────┤
│  Native modules:  Keychain · MessageBody       │
│  (WKWebView) · RichEditor (NSTextView) ·       │
│  Notifications · File pickers / Quick Look     │
└─────────────────────────────────────────────┘
```

**Module boundaries (each independently testable):**
- `MailSource` — knows Resend's receive/retrieve endpoints; emits normalized message + attachment
  records. Validates payloads at the boundary. No DB or UI knowledge.
- `LocalStore` — SQLite + attachment file cache; pure CRUD + migrations. No network knowledge.
- `Sender` — builds and posts send/reply/forward requests; owns threading headers and the outbox
  retry contract. No UI knowledge.
- `App core` — orchestrates sync loop, thread grouping, flag state, outbox state machine; exposes
  view-models to the UI.
- **Native modules** expose thin JS-facing contracts (documented interfaces) so JS code is
  testable against mocks.

## 6. Data model (SQLite — source of truth for the UI)

- `messages` — `id` (Resend received-email id), `rfc_message_id`, `thread_id`,
  `direction` (`received` | `sent`), `from`, `to/cc/bcc` (json), `reply_to`, `subject`,
  `snippet`, `received_at`, `in_reply_to`, `references` (json), `html`, `text`,
  `body_fetched` (bool), `has_attachments`, `seen`, `starred`, `archived`.
- `attachments` — `id`, `message_id`, `filename`, `content_type`, `size`, `content_id`
  (inline `cid:`), `disposition`, `local_path`, `downloaded`.
- `outbox` — `id`, `thread_id`, `in_reply_to`, recipients (to/cc/bcc json), `subject`, `html`,
  `status` (`draft` | `sending` | `sent` | `failed`), `resend_send_id`, `created_at`,
  `attempt_count`, `last_error`.
- `sync_state` — `cursor`, `last_polled_at`, `newest_seen_id`.

**Threading:** group by RFC `References` / `In-Reply-To` chain; fall back to normalized subject
+ participant set. `thread_id` computed on ingest. Sent replies set `In-Reply-To` / `References`
so both Resend and the local thread stay coherent.

**Flags** (`seen`, `starred`, `archived`) are **local-only** (Resend has no per-message state),
applied instantly in SQLite.

## 7. Sync loop

1. Poll `GET /emails/receiving` every **~25s** while the app is active, plus on window focus and
   ⌘R. Page with `after`/`before`; track `newest_seen_id`.
2. New received email → upsert metadata row immediately (idempotent on Resend `id`).
3. **Lazily** fetch body (Retrieve Received Email) + attachment bytes on open; prefetch newest few.
4. Sent messages inserted as `direction = sent`.
5. Offline → keep working from cache; resume on reconnect; sends queue in `outbox`.
6. New mail while unfocused → native macOS notification.

## 8. UI surfaces & components

- **Window shell** — native `NSToolbar` (search, refresh, compose, reply/forward, archive, star),
  collapsible sidebar (Inbox · Unread · Starred · Archive · per-address filters), vibrancy bg,
  2-pane split (list | reading).
- **`MessageList`** — virtualized rows (sender, subject, snippet, time, unread dot, star,
  attachment glyph); newest-first; threads collapse to latest message + count; keyboard + swipe
  for archive/star.
- **`ThreadView`** — header (subject, participants); messages stacked oldest→newest.
- **`MessageBody`** — `WKWebView` wrapper: sanitized HTML, JS off, remote images blocked behind a
  "Load images" bar, inline `cid:` resolved from cache.
- **`AttachmentTray`** / chips — Quick Look preview + Save; dangerous-type and type-mismatch
  warnings.
- **`Composer`** — native `NSTextView` rich editor (bold/italic/underline, lists, links,
  drag-drop inline images, attachment tray). **Inline** for replies; **focused sheet** for
  new-compose & forward.
- **`RecipientField`** — To/Cc/Bcc token fields; From-address selector (verified addresses).
- **Onboarding** — first run: paste Resend API key → verify via test call → store in Keychain;
  confirm sending/receiving domain.

Components talk to the core through props/view-models — never directly to network or DB.

## 9. Reply / compose / send pipeline

- **Composition → HTML:** `NSTextView` attributed string → HTML via the AppKit bridge, then
  **sanitized & normalized** to email-safe HTML (inline-friendly styles, junk stripped).
- **Inline images:** dropped images become attachments with generated `content_id`; HTML
  references them as `cid:`; sent as Resend attachments.
- **Attachments:** regular files added to the send `attachments` array (size-capped).
- **Reply (threaded):** From = address that received it; To = original sender; set `In-Reply-To`
  + `References`; POST to Resend send. Optimistically insert `direction=sent` (`sending` →
  `sent`/`failed`); retry from `outbox` with backoff.
- **Forward:** same editor; empty recipients; original body quoted + original attachments carried.
- **New compose:** focused sheet; no thread linkage; choose From among verified addresses.

## 10. Security, privacy & error handling

**Security / privacy**
- Resend API key **only in Keychain**; never logged or sent to error reporting.
- Incoming HTML **sanitized** before render; `WKWebView` runs **JS disabled** for bodies,
  **remote content blocked by default** (defeats tracking pixels) with explicit "Load images".
- Attachments stored in sandboxed Application Support; opened via Quick Look; never auto-executed.

**Attachment malware posture (v1)** — rely on OS + hygiene, no bundled AV:
- Write attachments with the `com.apple.quarantine` xattr → engages Gatekeeper + XProtect on open.
- **Never auto-open/auto-execute**; default action is Quick Look preview.
- Warn on dangerous types (`.app/.dmg/.pkg/.command/.scpt/.jar/.exe`) and **double extensions**
  (`invoice.pdf.app`).
- **Sanitize filenames**: strip path traversal, control chars, RTL-override Unicode; display the
  true type; warn when declared `content_type` ≠ extension.
- Don't render HTML attachments inline.
- Leave an `AttachmentScanner` seam so an opt-in hash-reputation check can be added later.

**Failure modes**
- Offline / network error → work from cache; quiet "offline" state; resume on reconnect.
- 401 / invalid key → re-auth prompt.
- 429 → exponential backoff; respect `Retry-After`.
- Body/attachment fetch fails → metadata still shown; inline retry.
- Send fails → stays in `outbox` as `failed`, visible in-thread with Retry; never silently dropped.
- Malformed/oversized email or attachment → size caps; "couldn't render — view source / download".
- Threading ambiguity → fall back to subject+participants; never merge aggressively.
- Idempotent upserts keyed by Resend `id` prevent duplicates across polls.

## 11. Testing strategy

- **Unit (Jest, plain JS):** threading algorithm, HTML sanitizer, attributed→email-HTML
  normalizer, `cid:` rewiring, outbox state machine, sync/cursor logic, payload validators.
- **MailSource / Sender** tested against a **mock Resend** with recorded fixtures (receive,
  retrieve, send) — no live network.
- **LocalStore:** in-memory SQLite; CRUD + migration tests.
- **Native bridges** (Keychain, NSTextView⇄HTML, WKWebView): mockable JS contracts; **XCTest**
  for the HTML conversion (highest risk).
- **Component tests** (React Native Testing Library) with fake view-models.
- **Manual smoke checklist** per milestone against a real Resend sandbox domain
  (receive → read → reply → verify threading in a real inbox).
- TDD: tests first for the pure logic (threading, HTML, sync) where complexity concentrates.

## 12. Milestones

| # | Milestone | Proves |
|---|---|---|
| M0 | Scaffold: RN-macOS New-Arch app, JS, ESLint/Prettier, Jest, SQLite wired, empty 2-pane shell | App launches; native window + split view |
| M1 | Keychain module + onboarding (paste → verify → store) | Secure auth foundation |
| M2 | MailSource polling + LocalStore + sync loop → inbox list of received metadata | Mail shows up |
| M3 | Reading: fetch body/attachments, WKWebView render (sanitized, remote-blocked, `cid:`), Quick Look + attachment quarantine/hygiene | Safe reading |
| M4 | Threading + thread view + flags (seen/star/archive) + local search | Triage feel |
| M5 | Native `NSTextView` rich editor + attributed⇄HTML bridge (highest risk; XCTest-first) | The hard part, isolated |
| M6 | Reply pipeline: inline editor, `In-Reply-To`/`References`, inline `cid:`, attachments, outbox + retry, sent insertion | Core purpose end-to-end |
| M7 | New-compose + forward (focused sheet), recipient token fields, From selector | Full send surface |
| M8 | Native notifications, light/dark + accent polish, error/empty states | Ship-quality |

M5 (risky bridge) is sequenced after read/reply plumbing is proven so it never blocks the rest.

## 13. Open items / assumptions

- Assumes a **verified Resend sending domain** matching the receiving domain (replies send From
  the address that received the mail).
- Exact field names/shapes of Resend receive/retrieve/attachment responses to be confirmed against
  live API during M2/M3 (validators make drift visible).
- SQLite driver: native-backed (e.g. `op-sqlite`) to be finalized at M0.
- Inline-image delivery (base64 vs hosted) to be confirmed against Resend send API limits at M6.
