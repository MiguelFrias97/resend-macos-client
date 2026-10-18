# resend-client

ResendMail: a native macOS email client for mail received through Resend Inbound. One user
(Miguel), one Resend account. It is `react-native-macos` with a plain-JavaScript app core and Swift
native modules. There is no backend of ours, and there never will be: the app calls
`https://api.resend.com` directly and keeps an encrypted local cache. Keeping the mail off any
infrastructure we own is the product's whole point (`../../docs/product.md`).

The workspace root `../../../CLAUDE.md` and `ARCHITECTURE.md` cover the cross-project picture.
`README.md` covers features, setup and the architecture diagram. This file covers the rules.

## Frontend profile

```yaml
# frontend-profile — read by the mfrias-frontend plugin. Keep it true; the code wins over it.
platform: desktop
framework: react-native-macos
dev: npm run macos
test: npm test -- --ci
lint: npm run lint
build: xcodebuild -workspace macos/ResendMail.xcworkspace -scheme ResendMail-macOS -configuration Debug build
test_framework: jest
data_layer: custom
api:
  base_path: https://api.resend.com
  client: src/net/resendClient.js
  envelope: external
auth:
  transport: api-key
  guard: App.js
ownership: single-user
styling:
  system: stylesheet
  tokens: [src/ui/designTokens.js, src/ui/theme.js]
  theme_switch: "follows macOS via useColorScheme; Settings can force light/dark (themeOverride setting in the local store)"
public_pages: false
billing: none
touch: false
offline: true
product_docs: [../../docs/product.md, ../../docs/brandbook.md]
specs_dir: docs/superpowers/specs
standards: ../../../shared/standards
conformance: non-conformant
```

**Conformance exceptions.** `shared/standards` lists this repo as non-conformant, and it stays so
by design:
- `react-native-macos`, not Electron. Native AppKit/WebKit views are the point; a rewrite is
  disproportionate.
- No TanStack Query. The data layer is a custom sync loop + outbox over a local SQLite store,
  because the store, not a request cache, is the source of truth offline.
- The standards HTTP contract (`{ok, status, data}` envelope, 401 refresh, `src/api/` layout,
  `X-Client-Type`) does not apply. The only server is Resend's, with its own responses and a
  static API key, no session to refresh.
- Jest, ESLint 8 (`.eslintrc.js`) and Prettier 2, from the react-native template, not Vitest and
  ESLint 9 flat config.
- No i18n. The app is English-only (brandbook: "Bilingual rule — does not apply").

## Commands

```sh
npm run macos           # Debug build + launch, Metro hot reload
npm test -- --ci        # Jest, what CI runs
npm run lint            # eslint . (same as `npx eslint .` in README/CONTRIBUTING)
npm run install:macos   # Release build, replaces /Applications/ResendMail.app
npm run clean:macos     # drop the multi-GB macos/build cache
npm run setup-signing   # one-time stable self-signed identity, stops Keychain re-prompts
```

- Node 22 (`.nvmrc`). The macOS build needs Node 20.12 or later (`util.styleText`).
- After a native dependency change: `( cd macos && pod install )`. The Podfile's `post_install`
  patches `fmt` for Xcode 26, and it re-applies on every install.
- CI (`.github/workflows/ci.yml`) runs lint + Jest on Linux only. Hosted runners' Xcode is too old
  for react-native-macos, so **nothing checks the native build except you**. Build locally after
  touching Swift, the Podfile or native-module wrappers.

## Architecture

| Path | What lives there |
|---|---|
| `src/core/` | Sync loop (`sync.js`, polls every 25 s), outbox (`outbox.js`), threading heuristic |
| `src/net/` | `resendClient.js` (the one fetch wrapper), `mailSource.js`, `sender.js`, `verifyApiKey.js` |
| `src/data/` | `db.js` (op-sqlite + SQLCipher), `localStore.js` (all SQL), `validators.js` (Resend payloads → camelCase) |
| `src/native/` | JS wrappers over the Swift modules: Keychain, AttachmentFile, MessageBodyView, RichEditorView, Symbol, MenuEvents, MenuBar, Notifications, LoginItem, SystemAccent |
| `src/html/` | `sanitizeEmailHtml.js`, the inbound HTML sanitizer |
| `src/reply/`, `src/compose/` | Outbound message and header assembly |
| `src/editor/` | Rich-editor doc model → email-safe HTML |
| `src/files/` | `attachmentSafety.js`, filename hygiene and dangerous-type checks |
| `src/ui/` | Screens and components, plus `designTokens.js`, `theme.js`, `useTheme.js` |
| `macos/ResendMail-macOS/` | Swift native modules and their `.m` bridges |

`android/`, `ios/` and the `android`/`ios` npm scripts are react-native template leftovers. The app
targets macOS only. Don't build features for them.

## Data and API

- Every Resend request goes through `createResendClient` in `src/net/resendClient.js`. It sets
  `Authorization: Bearer <key>` after the caller's headers, so nothing can overwrite it, and it
  sends `Content-Type` only when there is a body. A bodyless GET with a JSON content type gets a 400.
- Resend answers in snake_case. Map it in `src/data/validators.js` and nowhere else; the rest
  of the app reads camelCase.
- The store is the source of truth. Lists, threads and search read from `localStore`. Anything
  fetched from Resend (sync, a body opened for the first time) is saved to the store first. That
  is why the app works offline and keeps mail past Resend's 30-day retention.
- Sending goes through the outbox. The outbox row id is the Resend idempotency key, so a retry
  never double-sends. Never call `sender.send` around the outbox.
- Inject `fetchImpl` and the store (`openTestDb`) in tests rather than mocking globals.

## Auth and secrets

- The Resend API key lives in the macOS Keychain (`src/native/Keychain.js`), device-only. `App.js`
  is the guard: no key, it shows `Onboarding`. With a key, it shows `InboxScreen`.
- The SQLCipher key is a separate random Keychain item (`getOrCreateDbKey`). A failed Keychain
  read throws `KeychainAccessError`. Don't mint a new key, which would orphan the encrypted cache.
- `openEncryptedDb` refuses to open if SQLCipher isn't linked (`"op-sqlite": {"sqlcipher": true}`
  in `package.json`). Never fall back to plaintext.
- The API key never goes to any host but Resend, and never into logs, URLs or the cache.
- Sign-out clears the cache, so a different key can't read the previous account's mail.

## Security-sensitive paths

From `CONTRIBUTING.md` and `SECURITY.md`. Changes here need tests and care:
- **HTML sanitizer and CSP** (`src/html/`, `macos/.../MessageBodyView.swift`): the `WKWebView` runs
  with JavaScript disabled and remote content blocked unless the user clicks "Load images". Keep
  the CSP intact.
- **SQL** (`src/data/`): parameterized only. Where a fragment must be interpolated (list filters),
  it comes from a hardcoded allowlist.
- **Outbound headers and addresses** (`src/reply/`, `src/compose/`): strip CR/LF from anything that
  becomes a header.
- **Attachments** (`src/files/attachmentSafety.js`, `AttachmentFile.swift`): quarantine, filename
  hygiene and dangerous-type warnings.
- **Message-IDs are attacker-controlled.** Look them up with `hasOwnProperty`, as
  `threading.js` does, so a `__proto__` ref can't match.

## Design context

| What | Where |
|---|---|
| Product, audience, jobs | `../../docs/product.md` |
| Voice, colour, type, components | `../../docs/brandbook.md` |
| Tokens | `src/ui/designTokens.js` (spacing `SP`, `RADIUS`, `ELEV`, `TYPE`) and `src/ui/theme.js` (light/dark palettes) |
| Theme switch | `useTheme()` follows the macOS appearance. Settings can force `light`/`dark`, saved as the `themeOverride` setting |

- No hard-coded colours or off-grid spacing. Use `theme.*` and `SP()`.
- Never hard-code the accent. It is the user's macOS accent, read live from `SystemAccent`. Put
  text on an accent fill in `theme.onAccent`.
- Respect the native components. The body is a `WKWebView`, the editor is an `NSTextView`, icons
  are SF Symbols via `SymbolView`. Style around them; don't swap in web widgets.
- Copy says exactly where data lives (brandbook "microcopy honesty"). Never imply a server step.

## Testing

- Jest with the `react-native` preset; tests live in `__tests__/` and mirror `src/`. Fixtures are
  in `__mocks__/resendFixtures.js`.
- Native modules are tested by contract: `__tests__/native/*.contract.test.js` mock
  `NativeModules` and check the JS wrapper's calls. The Swift side has no automated tests, so
  verify it by running the app.
- `testTimeout` is 15 s because cold screen suites can exceed 5 s on CI. Leave it.

## Git

- Commit and push freely on feature branches (`type(scope): subject`, plus a prose body saying why).
  Never commit to `main`. Merging needs Miguel's approval.
- Run `npm test -- --ci` and `npm run lint` before calling work done. For native changes, also run
  a local build.
- Before merging frontend work, run `frontend-review` from the mfrias-frontend plugin.
