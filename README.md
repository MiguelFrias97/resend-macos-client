# Resend Desktop Mail

A native **macOS** desktop email client for reading and replying to mail received via
[Resend Inbound](https://resend.com/docs/dashboard/receiving/introduction). Built with
`react-native-macos` using true AppKit/WebKit components, in an Apple/Jobs visual idiom.
No backend — the app talks directly to the Resend API and caches everything locally.

> Receive → triage (read/unread, star, archive, search, folders) → read full conversations →
> reply, compose, and forward — with rich formatting, inline images, attachments, threading,
> and a reliable retrying outbox.

## What it does

- **Inbox & sync** — polls `GET /emails/receiving` (~25s + manual refresh), caches messages,
  attachments, and bodies in SQLite (works offline; survives Resend's 30-day retention).
- **Reading** — full HTML rendered in a native `WKWebView` with JavaScript disabled and remote
  content blocked behind a "Load images" toggle (CSP-enforced), inline `cid:` images resolved
  from cache, attachments saved with macOS quarantine + filename hygiene + dangerous-type warnings.
- **Rich editor** — a native `NSTextView` editor (bold/italic/underline, lists, links, drag-drop
  inline images) producing email-safe HTML.
- **Reply / compose / forward** — threaded replies (`In-Reply-To`/`References`), a focused compose
  sheet, forward with the original's files re-attached, all sent through a local outbox that retries
  failures (idempotent, so a retry never double-sends).
- **Triage** — sidebar (Inbox/Unread/Starred/Archive), local search (sender/subject/cached body),
  and a grouped conversation view including your sent replies.
- **Polish** — auto light/dark following macOS, the system accent color, native new-mail
  notifications, and friendly empty/error states.

## Architecture

Single process, no server. Plain JavaScript app core with isolated modules; native modules only
where macOS does something JS can't.

```
UI (react-native-macos / AppKit) ── Sidebar · MessageList · ThreadView · Composer · ComposeSheet
  │
App core (plain JS) ──────────────── sync loop · threading · outbox · reply/compose assembly · theme
  │
  ├── MailSource   (Resend polling/retrieve over fetch)
  ├── LocalStore   (op-sqlite: messages, attachments, outbox, settings)
  └── Sender       (Resend POST /emails, idempotency key)
  │
Native modules (Swift) ──────────── Keychain · MessageBodyView (WKWebView) · RichEditorView
  (NSTextView) · AttachmentFile (quarantine/save/readBase64) · SystemAccent · Notifications
```

The full design spec and per-milestone plans live in `docs/superpowers/specs/` and
`docs/superpowers/plans/`.

## Prerequisites

- **macOS** with **Xcode** (built/verified on Xcode 26.5).
- **Node ≥ 20.12** — the macOS build uses `util.styleText`, which is missing on 20.11. An `.nvmrc`
  pins **22**: `nvm use`.
- **CocoaPods** (`brew install cocoapods`).
- A **Resend account** with:
  - a domain set up for **Inbound** (catch-all receiving) — see Resend → Receiving,
  - the **same domain verified for sending** (replies send `From` the address that received the mail),
  - an **API key**.

## Setup

```bash
nvm use                        # Node 22
npm install
( cd macos && pod install )    # PATH must include /opt/homebrew/bin
```

> The macOS Podfile contains a `post_install` hook patching `fmt` for Xcode 26 (Apple clang rejects
> fmt's `consteval` format-string constructor); it re-applies on every `pod install`.

## Run

Two workflows depending on what you're doing:

**Develop** — fast iteration with live reload (needs Metro running):

```bash
npm run macos                  # builds Debug + launches, JS hot-reloads on save
```

**Install as a real app** — a standalone Release build (JS bundle embedded, no Metro)
copied into `/Applications`, so you can launch it from Launchpad/Spotlight like any app:

```bash
npm run install:macos          # build Release + install to /Applications
```

Re-run `npm run install:macos` whenever you change the code to **update** the installed
app (it replaces the prior copy — `/Applications` never accumulates extra copies). The app
is ad-hoc signed and runs on this machine only — this is the local equivalent of a release;
a signed/notarized distributable is a deferred follow-up.

The installed app is ~36 MB. The build keeps a local cache (`macos/build`, several GB) that
makes incremental rebuilds fast. Reclaim it anytime with `npm run clean:macos` (the next
build is then a slower full rebuild; the installed app is untouched).

On first launch, paste your Resend API key (stored in the macOS Keychain). The app verifies it,
then starts syncing your received mail.

## Develop

```bash
npm test                       # Jest unit tests
npx eslint .                   # lint
# native build only:
xcodebuild -workspace macos/ResendMail.xcworkspace -scheme ResendMail-macOS -configuration Debug build
```

## CI

`.github/workflows/ci.yml` runs ESLint + Jest on every push/PR. There's no native
build job — hosted runners ship an older Xcode than react-native-macos requires.
Builds are local (`npm run macos` to develop, `npm run install:macos` to install);
a signed/notarized release path is a deferred follow-up.

## API reconciliation

The Resend received-email / attachment responses use **snake_case** (`message_id`, `created_at`,
`content_type`, `content_disposition`, `download_url`); the payload validators
(`src/data/validators.js`) map these to camelCase and have been reconciled against the documented
shapes — see `docs/API-VERIFICATION.md`.

## Known limitations

- **Threading** uses a subject + participants heuristic. The list endpoint exposes only `message_id`
  (not `in_reply_to`/`references`), so RFC-header threading would require parsing the retrieve
  endpoint's `headers` and a re-threading pass.
- **Native runtime**: the Swift modules and the send/render paths are compile- and unit-verified but
  not yet exercised against a live account end-to-end — run `docs/SMOKE-CHECKLIST.md` before relying on it.
- No Drafts/Sent view, recipient autocomplete, Settings screen, or arbitrary-file attach on compose
  (all deferred follow-ups).

## License

Private project.
