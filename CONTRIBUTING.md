# Contributing

Thanks for your interest in Resend Mail. It's a native **macOS** email client
built with `react-native-macos` (plain JavaScript app core + Swift native
modules), as a working reference for native-Mac RN apps.

## Getting set up

You'll need macOS with **Xcode** (built/verified on 26.x), **Node ≥ 20.12**
(`.nvmrc` pins 22), and **CocoaPods**.

```bash
nvm use
npm install
( cd macos && pod install )

npm test           # Jest unit tests
npx eslint .       # lint
npm run macos      # build + run via Metro (hot reload)
npm run install:macos   # build a standalone app into /Applications
```

See [`README.md`](README.md) for the architecture overview and `docs/` for the
design specs, API verification, and the security audit.

## Ground rules

- **Tests + lint must stay green.** Run `npm test` and `npx eslint .` before
  opening a PR; add tests for new behavior. CI runs both on every PR.
- **Match the surrounding code** — plain JS, the existing module boundaries, the
  design tokens in `src/ui/designTokens.js` / `theme.js` (no hardcoded colors or
  off-grid spacing).
- **Respect the native components.** The message body is a `WKWebView`, the
  editor is an `NSTextView`, icons are SF Symbols via the native `SymbolView` —
  style *around* them; don't replace them with web widgets.
- **Security-sensitive paths** (the HTML sanitizer/CSP, SQL, Keychain, outbound
  header/address assembly, attachment handling) need care — keep parameterized
  SQL, the CSP intact, and CR/LF stripped from anything that becomes a header.
  See `docs/SECURITY-AUDIT.md`.
- For anything non-trivial, **open an issue first** to align on the approach.

## Reporting security issues

Do **not** file public issues for vulnerabilities — see
[`SECURITY.md`](SECURITY.md).
