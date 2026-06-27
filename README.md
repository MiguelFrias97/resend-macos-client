# Resend Mail

A native **macOS** desktop email client for reading and replying to mail received via
[Resend Inbound](https://resend.com/docs/dashboard/receiving/introduction). Built with
`react-native-macos` using true AppKit/WebKit components, in an Apple/Jobs visual idiom.
No backend — the app talks directly to the Resend API and caches everything locally in an
encrypted (SQLCipher) database.

> Receive → triage (read/unread, star, archive, search, folders) → read full conversations →
> reply, compose, and forward — with rich formatting, inline images, attachments, threading,
> and a reliable retrying outbox.

## What it does

- **Inbox & sync** — polls `GET /emails/receiving` (~25s + a manual Refresh button), caching
  messages, attachments, and bodies in a **SQLCipher-encrypted** SQLite database (works offline;
  survives Resend's 30-day retention; the key lives in the macOS Keychain).
- **Reading** — full HTML rendered in a native `WKWebView` with JavaScript disabled and remote
  content blocked behind a "Load images" toggle (CSP-enforced), inline `cid:` images resolved
  from cache, attachments saved with macOS quarantine + filename hygiene + dangerous-type warnings.
- **Rich editor** — a native `NSTextView` editor (bold/italic/underline, lists, links, drag-drop
  inline images) producing email-safe HTML; grows with its content.
- **Reply / compose / forward** — threaded replies (`In-Reply-To`/`References`), a focused compose
  screen, **attach files** (images/documents) or forward with the original's files re-attached, all
  sent through a local outbox that retries failures (idempotent, so a retry never double-sends).
- **Triage** — sidebar (Inbox/Unread/Starred/Archive) with unread badges, local search
  (sender/subject/cached body), and a grouped conversation view including your sent replies.
- **Settings & account** — pick your send identity with a **verified-domain picker** (warns before
  you send from a domain Resend will reject), override light/dark, and **sign out** (wipes the
  encrypted cache so a different key can't see the previous account's mail).
- **Keyboard** — a native menu with **⌘N** compose, **⌘R** reply, **⌘⇧F** forward, and **⌘↵** to send.
- **Polish** — real SF Symbols throughout, auto light/dark following macOS, the system accent color,
  native new-mail notifications, and friendly empty/error states.

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
  (NSTextView) · AttachmentFile (pick/quarantine/save/readBase64) · SymbolView (SF Symbols) ·
  MenuEvents (menu-bar shortcuts) · SystemAccent · Notifications
```

Each layer is an isolated module with a focused responsibility, unit-tested in `__tests__/`.

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

### Stop the repeated Keychain password prompts (optional)

Because the local build is **ad-hoc signed**, its signature changes on every build, so macOS
can't remember "Always Allow" and re-prompts for your login password each launch. To fix it
without weakening security, give the app a stable self-signed identity **once**:

```bash
npm run setup-signing          # creates a local code-signing cert (one password prompt)
npm run install:macos          # re-signs the app with it
```

Then click **"Always Allow"** on the next Keychain prompts and they won't return. Your key stays
in the Keychain (device-only); only the app's signature becomes stable.

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
shapes.

## Known limitations

- **Threading** uses a subject + participants heuristic. The list endpoint exposes only `message_id`
  (not `in_reply_to`/`references`), so RFC-header threading would require parsing the retrieve
  endpoint's `headers` and a re-threading pass.
- **Sending** requires the domain to be verified for **sending** in Resend (separate from inbound
  receiving). The From field surfaces your verified domains; an unverified From is rejected by Resend.
- **Distribution**: the local build is **ad-hoc / self-signed** (`npm run install:macos`). A
  signed + notarized release path is a deferred follow-up, so non-developers can't yet install a
  prebuilt download.
- **No Drafts view** or recipient autocomplete yet.

## Contributing

Issues and PRs welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). For security
reports, follow [`SECURITY.md`](SECURITY.md) (please don't open a public issue).

## License

[MIT](LICENSE) © 2026 Miguel Frias
