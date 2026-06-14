# Resend Desktop Mail — M3 Reading View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a received email and read it safely — full HTML body rendered in a native WKWebView (JavaScript off, remote content blocked behind a "Load images" toggle, inline `cid:` images resolved from cache), plus a list of attachments you can save to disk with macOS quarantine + filename hygiene.

**Architecture:** Builds on the M0–M2 foundation (no backend; SQLite cache; `MailSource`/`LocalStore`). Adds: body/attachment retrieval to `MailSource`, body+attachment storage to `LocalStore`, a pure-JS HTML sanitizer and attachment-safety util, a **custom native WKWebView Fabric component** (`MessageBodyView`) with a `cidcache://` scheme handler, and a native attachment-write/save module. The UI reading pane lazily fetches + renders the selected message.

**Tech Stack:** react-native-macos 0.81 (New Architecture), plain JavaScript, op-sqlite, `sanitize-html`, Swift (WKWebView + file/quarantine + NSSavePanel), Jest + XCTest.

**Reference spec:** `docs/superpowers/specs/2026-06-12-resend-desktop-mail-design.md` (§8, §9, §10)

**Branch:** `build/m3-reading-view` (off `main`, which contains merged M0–M2).

**Resend endpoints used (verify exact shapes against live API in Task 3 smoke):**
- `GET /emails/receiving/{id}` → `{ id, from, to, cc, bcc, subject, html, text, headers, in_reply_to, references, attachments:[{id, filename, content_type, size, content_id, content_disposition}] }`
- `GET /emails/receiving/{id}/attachments/{attId}` → `{ id, filename, content_type, size, content_id, download_url, expires_at }` (bytes come from `download_url`, NOT inline base64)

---

## File structure (this milestone)

```
src/data/validators.js          # + validateReceivedEmailContent, validateAttachmentMeta
src/data/localStore.js          # + body columns, attachments table, body/attachment methods
src/net/mailSource.js           # + getReceivedEmail(id), getAttachment(id, attId), downloadBytes(url)
src/html/sanitizeEmailHtml.js   # NEW — allowlist sanitize + cid rewrite + remote handling
src/files/attachmentSafety.js   # NEW — filename sanitize, dangerous-type, type mismatch
src/native/MessageBodyView.js   # NEW — JS wrapper for the native WKWebView component
src/native/AttachmentFile.js    # NEW — JS wrapper for native write-to-cache + save panel
src/ui/MessageBody.js           # NEW — fetch+sanitize+render a message body, Load-images toggle
src/ui/AttachmentTray.js        # NEW — attachment chips + Save + warnings
src/ui/InboxScreen.js           # reading pane renders MessageBody + AttachmentTray for selection
macos/ResendMail-macOS/MessageBodyView.swift / .m   # native WKWebView component
macos/ResendMail-macOS/AttachmentFile.swift / .m    # native file write (quarantine) + NSSavePanel
__tests__/...                   # mirrors
```

---

### Task 1: Body + attachment validators

**Files:** Modify `src/data/validators.js`; Test `__tests__/data/validators.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// add to __tests__/data/validators.test.js
import {validateReceivedEmailContent, validateAttachmentMeta} from '../../src/data/validators';

test('validateReceivedEmailContent normalizes body + headers + attachments', () => {
  const out = validateReceivedEmailContent({
    id: 'recv_1',
    html: '<p>Hi</p>',
    text: 'Hi',
    headers: {'in-reply-to': '<a@x>'},
    attachments: [{id: 'att_1', filename: 'a.pdf', content_type: 'application/pdf', size: 9, content_id: 'cid1'}],
  });
  expect(out.html).toBe('<p>Hi</p>');
  expect(out.text).toBe('Hi');
  expect(out.attachments[0].contentId).toBe('cid1');
});

test('validateAttachmentMeta requires id and download_url when present', () => {
  const a = validateAttachmentMeta({id: 'att_1', filename: 'a.pdf', content_type: 'application/pdf', size: 9, download_url: 'https://d/x'});
  expect(a.downloadUrl).toBe('https://d/x');
  expect(a.filename).toBe('a.pdf');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx jest data/validators -i`  Expected: FAIL (exports missing).

- [ ] **Step 3: Implement (append to `src/data/validators.js`)**

```javascript
export function validateAttachmentMeta(raw) {
  const id = req(raw, 'id');
  return {
    id,
    filename: raw.filename || 'attachment',
    contentType: raw.content_type || 'application/octet-stream',
    size: typeof raw.size === 'number' ? raw.size : 0,
    contentId: raw.content_id || null,
    disposition: raw.content_disposition || null,
    downloadUrl: raw.download_url || null,
  };
}

export function validateReceivedEmailContent(raw) {
  const id = req(raw, 'id');
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map(validateAttachmentMeta)
    : [];
  return {
    id,
    html: typeof raw.html === 'string' ? raw.html : null,
    text: typeof raw.text === 'string' ? raw.text : null,
    headers: raw.headers && typeof raw.headers === 'object' ? raw.headers : {},
    attachments,
  };
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest data/validators -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: body + attachment metadata validators"`

---

### Task 2: LocalStore body + attachments

**Files:** Modify `src/data/localStore.js`; Test `__tests__/data/localStore.test.js`.

- [ ] **Step 1: Write failing test**

```javascript
// add to __tests__/data/localStore.test.js
test('saveBody persists html/text and marks body fetched; attachments round-trip', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'm1', threadId: 't1', from: 'A', subject: 'Hi', receivedAt: '2026-06-12T10:00:00Z'});
  await store.saveBody('m1', {html: '<p>x</p>', text: 'x'});
  await store.saveAttachments('m1', [{id: 'a1', filename: 'a.pdf', contentType: 'application/pdf', size: 9, contentId: 'cid1', downloadUrl: 'https://d/x'}]);
  const msg = await store.getMessage('m1');
  expect(msg.html).toBe('<p>x</p>');
  expect(msg.bodyFetched).toBe(true);
  const atts = await store.listAttachments('m1');
  expect(atts[0].filename).toBe('a.pdf');
});
```

Extend `makeFakeDb()` in that test file so it stores `html/text/body_fetched` on the message row and supports an `attachments` array (mirror the existing messages emulation: handle `UPDATE messages SET`, `INSERT INTO attachments`, `SELECT ... FROM attachments WHERE message_id=?`, and `SELECT ... FROM messages WHERE id=?`). Keep it minimal but faithful.

- [ ] **Step 2: Run → FAIL**  Run: `npx jest data/localStore -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/data/localStore.js`, extend the schema and add methods. Update `SCHEMA` to add columns + a table (use `CREATE TABLE IF NOT EXISTS` and additive `ALTER`-safe columns; since the messages table is created here, add the columns directly):

```javascript
const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  sender TEXT,
  subject TEXT,
  received_at TEXT,
  seen INTEGER DEFAULT 0,
  html TEXT,
  text TEXT,
  body_fetched INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  content_id TEXT,
  disposition TEXT,
  download_url TEXT,
  local_path TEXT,
  downloaded INTEGER DEFAULT 0
);`;
```

> Note: op-sqlite's `execute` runs a single statement. Split `SCHEMA` on `;` and run each non-empty statement, OR call `db.execute` once per statement. Implement a small `await runSchema(db)` that splits and runs each `CREATE TABLE`. Update the fake db in the test to accept multiple CREATE statements (it already no-ops `^CREATE TABLE`).

Add methods inside `createLocalStore`:

```javascript
async function saveBody(id, {html, text}) {
  await db.execute(
    `UPDATE messages SET html=?, text=?, body_fetched=1 WHERE id=?`,
    [html ?? null, text ?? null, id],
  );
}

async function getMessage(id) {
  const res = await db.execute(
    `SELECT id, thread_id, sender, subject, received_at, seen, html, text, body_fetched FROM messages WHERE id=?`,
    [id],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id, threadId: r.thread_id, from: r.sender, subject: r.subject,
    receivedAt: r.received_at, seen: Boolean(r.seen),
    html: r.html ?? null, text: r.text ?? null, bodyFetched: Boolean(r.body_fetched),
  };
}

async function saveAttachments(messageId, atts) {
  for (const a of atts) {
    await db.execute(
      `INSERT INTO attachments (id, message_id, filename, content_type, size, content_id, disposition, download_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         filename=excluded.filename, content_type=excluded.content_type, size=excluded.size,
         content_id=excluded.content_id, disposition=excluded.disposition, download_url=excluded.download_url`,
      [a.id, messageId, a.filename, a.contentType, a.size, a.contentId ?? null, a.disposition ?? null, a.downloadUrl ?? null],
    );
  }
}

async function listAttachments(messageId) {
  const res = await db.execute(
    `SELECT id, filename, content_type, size, content_id, disposition, download_url, local_path, downloaded
     FROM attachments WHERE message_id=?`,
    [messageId],
  );
  return res.rows.map(r => ({
    id: r.id, filename: r.filename, contentType: r.content_type, size: r.size,
    contentId: r.content_id, disposition: r.disposition, downloadUrl: r.download_url,
    localPath: r.local_path, downloaded: Boolean(r.downloaded),
  }));
}

async function markAttachmentDownloaded(id, localPath) {
  await db.execute(`UPDATE attachments SET local_path=?, downloaded=1 WHERE id=?`, [localPath, id]);
}
```

Return them alongside the existing methods: `return {upsertMessage, listInbox, saveBody, getMessage, saveAttachments, listAttachments, markAttachmentDownloaded};`

- [ ] **Step 4: Run → PASS**  Run: `npx jest data/localStore -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: LocalStore body + attachments storage"`

---

### Task 3: MailSource body + attachment retrieval

**Files:** Modify `src/net/mailSource.js`; Test `__tests__/net/mailSource.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// add to __tests__/net/mailSource.test.js
test('getReceivedEmail returns normalized body content', async () => {
  const fetchImpl = async url => ({
    status: 200,
    json: async () => ({id: 'recv_1', html: '<p>Hi</p>', text: 'Hi', headers: {}, attachments: []}),
  });
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const body = await source.getReceivedEmail('recv_1');
  expect(body.html).toBe('<p>Hi</p>');
});

test('getAttachment returns metadata with downloadUrl', async () => {
  const fetchImpl = async () => ({status: 200, json: async () => ({id: 'a1', filename: 'a.pdf', content_type: 'application/pdf', size: 9, download_url: 'https://d/x'})});
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const a = await source.getAttachment('recv_1', 'a1');
  expect(a.downloadUrl).toBe('https://d/x');
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest net/mailSource -i`  Expected: FAIL.

- [ ] **Step 3: Implement (add to `createMailSource`)**

```javascript
import {validateReceivedEmail, validateReceivedEmailContent, validateAttachmentMeta} from '../data/validators';
// (extend the existing import line)

async function getReceivedEmail(id) {
  const res = await client.request(`/emails/receiving/${encodeURIComponent(id)}`);
  if (res.status !== 200) throw new Error(`getReceivedEmail failed: ${res.status}`);
  return validateReceivedEmailContent(await res.json());
}

async function getAttachment(emailId, attId) {
  const res = await client.request(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attId)}`,
  );
  if (res.status !== 200) throw new Error(`getAttachment failed: ${res.status}`);
  return validateAttachmentMeta(await res.json());
}

// Fetch raw bytes from a presigned download_url (NOT an api.resend.com path → use fetchImpl directly, no auth header).
async function downloadBytes(downloadUrl) {
  const res = await (fetchImpl || fetch)(downloadUrl);
  if (res.status !== 200) throw new Error(`downloadBytes failed: ${res.status}`);
  return res; // caller reads arrayBuffer()/base64 as needed
}
```

Add `getReceivedEmail, getAttachment, downloadBytes` to the returned object. (Keep `fetchImpl` captured at the top of `createMailSource`.)

- [ ] **Step 4: Run → PASS**  Run: `npx jest net/mailSource -i`  Expected: PASS.
- [ ] **Step 5: Manual API smoke (record real shapes):** with a real key, log `getReceivedEmail(id)` for a known received id and confirm field names (`html`/`text`/`headers`/`attachments[].content_id`) and that attachment retrieval returns `download_url`. Adjust validators if Resend differs. Document findings in the commit message.
- [ ] **Step 6: Commit**  `git add -A && git commit -m "feat: MailSource body + attachment retrieval"`

---

### Task 4: HTML sanitizer (pure JS)

**Files:** Create `src/html/sanitizeEmailHtml.js`, `__tests__/html/sanitizeEmailHtml.test.js`.

- [ ] **Step 1: Add dependency**  Run: `npm install sanitize-html`  Expected: installs.

- [ ] **Step 2: Write failing tests**

```javascript
// __tests__/html/sanitizeEmailHtml.test.js
import {sanitizeEmailHtml} from '../../src/html/sanitizeEmailHtml';

test('strips script and event handlers', () => {
  const out = sanitizeEmailHtml('<p onclick="x()">hi</p><script>evil()</script>', {allowRemote: false});
  expect(out).not.toMatch(/script/i);
  expect(out).not.toMatch(/onclick/i);
});

test('rewrites cid: image refs to the cidcache scheme', () => {
  const out = sanitizeEmailHtml('<img src="cid:logo123">', {allowRemote: false});
  expect(out).toContain('cidcache://logo123');
});

test('blocks remote images when allowRemote is false but keeps them when true', () => {
  const blocked = sanitizeEmailHtml('<img src="https://tracker/x.gif">', {allowRemote: false});
  expect(blocked).not.toContain('https://tracker/x.gif');
  const allowed = sanitizeEmailHtml('<img src="https://tracker/x.gif">', {allowRemote: true});
  expect(allowed).toContain('https://tracker/x.gif');
});
```

- [ ] **Step 3: Run → FAIL**  Run: `npx jest sanitizeEmailHtml -i`  Expected: FAIL.

- [ ] **Step 4: Implement**

```javascript
// src/html/sanitizeEmailHtml.js
import sanitizeHtml from 'sanitize-html';

// Rewrite cid: references to a custom scheme the native WKWebView serves from cache.
function rewriteCid(value) {
  return value.replace(/^cid:(.+)$/i, (_, id) => `cidcache://${id}`);
}

export function sanitizeEmailHtml(html, {allowRemote = false} = {}) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'style', 'table', 'thead', 'tbody', 'tr', 'td', 'th']),
    allowedAttributes: {
      '*': ['style', 'align', 'width', 'height', 'colspan', 'rowspan'],
      a: ['href', 'name', 'target'],
      img: ['src', 'alt', 'width', 'height'],
    },
    allowedSchemes: ['https', 'mailto', 'cidcache'],
    transformTags: {
      img: (tagName, attribs) => {
        let src = attribs.src || '';
        if (/^cid:/i.test(src)) {
          src = rewriteCid(src);
        } else if (/^https?:/i.test(src) && !allowRemote) {
          src = ''; // blocked until user loads remote content
        }
        return {tagName: 'img', attribs: {...attribs, src}};
      },
    },
    // Drop remote-loading CSS and scripts entirely.
    exclusiveFilter: frame => frame.tag === 'script',
  });
}
```

> `sanitize-html` strips `on*` handlers and unknown schemes by default; the explicit allowlist + `transformTags` gives the cid rewrite and remote gating. If `sanitize-html` pulls a Node-only dependency that breaks under React Native at runtime, note it as a concern — it works under Jest (Node); a runtime check happens in Task 7's render. If RN runtime rejects it, fall back to a small regex-based sanitizer with the same test contract (report this as DONE_WITH_CONCERNS).

- [ ] **Step 5: Run → PASS**  Run: `npx jest sanitizeEmailHtml -i`  Expected: PASS.
- [ ] **Step 6: Commit**  `git add -A && git commit -m "feat: email HTML sanitizer with cid rewrite + remote gating"`

---

### Task 5: Attachment safety util (pure JS)

**Files:** Create `src/files/attachmentSafety.js`, `__tests__/files/attachmentSafety.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// __tests__/files/attachmentSafety.test.js
import {sanitizeFilename, isDangerousFilename, typeMismatch} from '../../src/files/attachmentSafety';

test('sanitizeFilename strips path traversal, control chars, and RTL override', () => {
  expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  expect(sanitizeFilename('a b.txt')).toBe('ab.txt');
  expect(sanitizeFilename('invoice‮gpj.exe')).toBe('invoicegpj.exe');
});

test('isDangerousFilename flags executables and double extensions', () => {
  expect(isDangerousFilename('setup.app')).toBe(true);
  expect(isDangerousFilename('invoice.pdf.command')).toBe(true);
  expect(isDangerousFilename('photo.png')).toBe(false);
});

test('typeMismatch flags declared-type vs extension disagreement', () => {
  expect(typeMismatch('application/pdf', 'thing.exe')).toBe(true);
  expect(typeMismatch('application/pdf', 'thing.pdf')).toBe(false);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest attachmentSafety -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/files/attachmentSafety.js
const DANGEROUS = new Set([
  'app', 'dmg', 'pkg', 'command', 'scpt', 'jar', 'exe', 'bat', 'sh',
  'js', 'scr', 'msi', 'vb', 'vbs', 'ps1', 'webloc', 'workflow',
]);

export function sanitizeFilename(name) {
  let n = String(name || 'attachment');
  // Strip directory components and traversal.
  n = n.split(/[/\\]/).pop();
  // Remove control chars and bidi/RTL override characters used to disguise extensions.
  n = n.replace(/[ -‎‏‪-‮⁦-⁩]/g, '');
  n = n.trim();
  return n || 'attachment';
}

function extOf(name) {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isDangerousFilename(name) {
  const clean = sanitizeFilename(name);
  const parts = clean.toLowerCase().split('.').slice(1); // all extensions after the first dot
  return parts.some(p => DANGEROUS.has(p));
}

const TYPE_EXT = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'text/plain': ['txt'],
};

export function typeMismatch(contentType, name) {
  const exts = TYPE_EXT[(contentType || '').toLowerCase()];
  if (!exts) return false; // unknown declared type → don't assert a mismatch
  return !exts.includes(extOf(sanitizeFilename(name)));
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest attachmentSafety -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: attachment safety util (filename + dangerous-type + mismatch)"`

---

### Task 6: Native WKWebView component (`MessageBodyView`)

**Files:** Create `macos/ResendMail-macOS/MessageBodyView.swift`, `MessageBodyView.m`, `src/native/MessageBodyView.js`. Modify pbxproj (xcodeproj gem). Test `__tests__/native/MessageBodyView.contract.test.js`.

- [ ] **Step 1: JS wrapper contract test (TDD)**

```javascript
// __tests__/native/MessageBodyView.contract.test.js
jest.mock('react-native', () => ({requireNativeComponent: name => name}));
import MessageBodyView from '../../src/native/MessageBodyView';
test('exports a native component reference', () => {
  expect(MessageBodyView).toBeDefined();
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest MessageBodyView.contract -i`  Expected: FAIL.

- [ ] **Step 3: JS wrapper**

```javascript
// src/native/MessageBodyView.js
import {requireNativeComponent} from 'react-native';
// Native view props: html: string, allowRemote: bool, cacheDir: string, onHeight: event({height})
export default requireNativeComponent('MessageBodyView');
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest MessageBodyView.contract -i`  Expected: PASS.

- [ ] **Step 5: Native Swift view manager**

Create `MessageBodyView.swift`: a `RCTViewManager` (legacy view, fine under New Arch interop) returning a custom `NSView` that hosts a `WKWebView` with:
- `WKWebViewConfiguration` with `preferences.javaScriptEnabled = false` (and `defaultWebpagePreferences.allowsContentJavaScript = false` on newer SDKs).
- A custom URL scheme handler registered for `cidcache` (`configuration.setURLSchemeHandler(_, forURLScheme: "cidcache")`) that, on `webView(_:start:)`, maps `cidcache://<contentId>` → a file in the per-message cache dir (passed via the `cacheDir` prop) named by content id, reads its bytes, and responds with the right MIME type. Deny anything not found.
- Remote blocking: when `allowRemote == false`, install a `WKContentRuleList` that blocks all loads except the `cidcache` scheme and the document itself; when `allowRemote == true`, remove the rule list. Reload HTML on prop change.
- Set `html` via `loadHTMLString(_, baseURL: nil)`.
- Report content height back via an injected message handler or `evaluateJavaScript("document.body.scrollHeight")` after load → send an `onHeight` event so RN can size the view.

Key prop setters (`@objc` exposed via the `.m`): `html` (NSString), `allowRemote` (BOOL), `cacheDir` (NSString), `onHeight` (RCTBubblingEventBlock).

```objc
// MessageBodyView.m
#import <React/RCTViewManager.h>
@interface RCT_EXTERN_MODULE(MessageBodyViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(html, NSString)
RCT_EXPORT_VIEW_PROPERTY(allowRemote, BOOL)
RCT_EXPORT_VIEW_PROPERTY(cacheDir, NSString)
RCT_EXPORT_VIEW_PROPERTY(onHeight, RCTBubblingEventBlock)
@end
```

(Write the Swift `@objc(MessageBodyViewManager) class MessageBodyViewManager: RCTViewManager { override func view() -> NSView { return MessageBodyNSView() } }` plus the `MessageBodyNSView` implementing the WKWebView + scheme handler + rule list as described. Name the `requireNativeComponent` string to match the manager's exported view name — use `MessageBodyView` and ensure the manager's `moduleName`/RCT_EXTERN_MODULE alias resolves to that component name; adjust the JS `requireNativeComponent('MessageBodyView')` to whatever RN registers the manager as.)

- [ ] **Step 6: Wire into pbxproj** via the `xcodeproj` gem (add both files to the `ResendMail-macOS` target Sources phase). Do not hand-edit UUIDs.

- [ ] **Step 7: Build**  Run (Node 22, PATH includes /opt/homebrew/bin): `xcodebuild -workspace macos/ResendMail.xcworkspace -scheme ResendMail-macOS -configuration Debug build`  Expected: `** BUILD SUCCEEDED **` with `MessageBodyView.swift` compiled.

- [ ] **Step 8: Commit**  `git add -A && git commit -m "feat: native WKWebView MessageBodyView (JS off, remote-blocked, cid scheme)"`

> If the custom scheme handler or content-rule-list API proves intricate under this RN-macOS/Xcode 26 toolchain, ship the JS-off + remote-blocked render first (still valuable + safe) and report the `cidcache` handler as DONE_WITH_CONCERNS so inline-image rendering can be finished in a follow-up. Do not leave the target non-building.

---

### Task 7: `MessageBody` UI — fetch, cache cid images, render

**Files:** Create `src/native/AttachmentFile.js` (stub used here for cache dir), `src/ui/MessageBody.js`; Modify `src/ui/InboxScreen.js`. Test `__tests__/ui/MessageBody.test.js`.

- [ ] **Step 1: Failing test (logic, with injected deps)**

```javascript
// __tests__/ui/MessageBody.test.js
import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import MessageBody from '../../src/ui/MessageBody';

jest.mock('../../src/native/MessageBodyView', () => 'MessageBodyView');

test('fetches body once and passes sanitized html to the native view', async () => {
  const deps = {
    getMessage: jest.fn(async () => ({id: 'm1', bodyFetched: false})),
    fetchBody: jest.fn(async () => ({html: '<p onclick="x">Hi</p>', text: 'Hi', attachments: []})),
    saveBody: jest.fn(async () => {}),
    saveAttachments: jest.fn(async () => {}),
    cacheCidImages: jest.fn(async () => '/cache/m1'),
  };
  const {UNSAFE_getByType} = render(<MessageBody messageId="m1" deps={deps} />);
  await waitFor(() => expect(deps.fetchBody).toHaveBeenCalledWith('m1'));
  const view = UNSAFE_getByType('MessageBodyView');
  expect(view.props.html).not.toMatch(/onclick/i);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/MessageBody -i`  Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/MessageBody.js`**

```javascript
import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator} from 'react-native';
import MessageBodyView from '../native/MessageBodyView';
import {sanitizeEmailHtml} from '../html/sanitizeEmailHtml';

// deps lets tests inject store/source/cache; defaults are wired in InboxScreen.
export default function MessageBody({messageId, allowRemote = false, deps}) {
  const [html, setHtml] = useState(null);
  const [cacheDir, setCacheDir] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const msg = await deps.getMessage(messageId);
      let body = msg;
      if (!msg || !msg.bodyFetched) {
        const fetched = await deps.fetchBody(messageId);
        await deps.saveBody(messageId, {html: fetched.html, text: fetched.text});
        if (fetched.attachments?.length) await deps.saveAttachments(messageId, fetched.attachments);
        body = {...msg, html: fetched.html};
        if (deps.cacheCidImages) {
          const dir = await deps.cacheCidImages(messageId, fetched.attachments || []);
          if (!cancelled) setCacheDir(dir || '');
        }
      }
      if (!cancelled) setHtml(body?.html ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId, deps]);

  if (html == null) {
    return (
      <View style={{padding: 16}}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <MessageBodyView
      style={{flex: 1}}
      html={sanitizeEmailHtml(html, {allowRemote})}
      allowRemote={allowRemote}
      cacheDir={cacheDir}
    />
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/MessageBody -i`  Expected: PASS.

- [ ] **Step 5: Wire into `InboxScreen.js` reading pane.** Build the default `deps` from the existing `store` + `source` (created in the effect): `getMessage: store.getMessage`, `fetchBody: source.getReceivedEmail`, `saveBody: store.saveBody`, `saveAttachments: store.saveAttachments`, and a `cacheCidImages(messageId, atts)` that, for each attachment with a `contentId`, fetches its `download_url` (via `source.getAttachment` then `source.downloadBytes`) and writes it through the native `AttachmentFile.writeToCache(messageId, contentId, bytes)` (Task 8), returning the cache dir. Add a "Load remote images" toggle in the reading-pane header that flips `allowRemote`. Replace the placeholder `selected.subject` text with `<MessageBody messageId={selected.id} allowRemote={allowRemote} deps={deps} />`.

- [ ] **Step 6: Run full suite + lint + build.** `npx jest` (green), `npx eslint .` (0 errors), macOS Debug build SUCCEEDED.
- [ ] **Step 7: Commit**  `git add -A && git commit -m "feat: reading pane renders sanitized body via native WKWebView"`

---

### Task 8: Native attachment write/save + `AttachmentTray`

**Files:** Create `macos/ResendMail-macOS/AttachmentFile.swift`, `AttachmentFile.m`, `src/native/AttachmentFile.js`, `src/ui/AttachmentTray.js`. Modify pbxproj. Test `__tests__/ui/AttachmentTray.test.js`.

- [ ] **Step 1: Native module** `AttachmentFile.swift` (`@objc(AttachmentFile)`), promise methods:
  - `cacheDir(messageId)` → returns `<AppSupport>/attachments/<messageId>/` (creating it).
  - `writeToCache(messageId, name, base64)` → writes bytes to the cache dir under a sanitized `name` (the JS passes a pre-sanitized filename or contentId), sets the `com.apple.security.quarantine` xattr via `setxattr`, returns the path.
  - `saveAs(srcPath, suggestedName)` → presents `NSSavePanel` (main queue) with `suggestedName`, copies the file to the chosen URL, returns the destination path (or rejects on cancel).
  Bridge via `RCT_EXTERN_MODULE`/`RCT_EXTERN_METHOD` (mirror the Keychain module pattern). Wire into pbxproj with the xcodeproj gem. Build → SUCCEEDED.

- [ ] **Step 2: JS wrapper** `src/native/AttachmentFile.js`:

```javascript
import {NativeModules} from 'react-native';
const {AttachmentFile} = NativeModules;
export const cacheDir = messageId => AttachmentFile.cacheDir(messageId);
export const writeToCache = (messageId, name, base64) => AttachmentFile.writeToCache(messageId, name, base64);
export const saveAs = (srcPath, suggestedName) => AttachmentFile.saveAs(srcPath, suggestedName);
```

- [ ] **Step 3: AttachmentTray test (TDD)**

```javascript
// __tests__/ui/AttachmentTray.test.js
import React from 'react';
import {render} from '@testing-library/react-native';
import AttachmentTray from '../../src/ui/AttachmentTray';

test('renders a chip per attachment and warns on dangerous types', () => {
  const atts = [
    {id: 'a1', filename: 'report.pdf', contentType: 'application/pdf', size: 1200},
    {id: 'a2', filename: 'setup.app', contentType: 'application/octet-stream', size: 50},
  ];
  const {getByText} = render(<AttachmentTray attachments={atts} onSave={() => {}} />);
  expect(getByText('report.pdf')).toBeTruthy();
  expect(getByText(/setup\.app/)).toBeTruthy();
  expect(getByText(/⚠|warning/i)).toBeTruthy();
});
```

- [ ] **Step 4: Run → FAIL**  Run: `npx jest ui/AttachmentTray -i`  Expected: FAIL.

- [ ] **Step 5: Implement `src/ui/AttachmentTray.js`** — render a chip per attachment (filename + human size), show a ⚠ badge when `isDangerousFilename(filename) || typeMismatch(contentType, filename)`, and a Save button calling `onSave(attachment)`.

```javascript
import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {isDangerousFilename, typeMismatch} from '../files/attachmentSafety';

function humanSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentTray({attachments, onSave}) {
  if (!attachments?.length) return null;
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8}}>
      {attachments.map(a => {
        const risky = isDangerousFilename(a.filename) || typeMismatch(a.contentType, a.filename);
        return (
          <Pressable
            key={a.id}
            onPress={() => onSave(a)}
            style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8}}>
            {risky ? <Text>⚠</Text> : null}
            <Text>{a.filename}</Text>
            <Text style={{color: '#999'}}>{humanSize(a.size)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 6: Run → PASS**  Run: `npx jest ui/AttachmentTray -i`  Expected: PASS.

- [ ] **Step 7: Wire `AttachmentTray` under `MessageBody` in the reading pane.** `onSave(att)` flow: ensure bytes are cached (download via `source.getAttachment`+`downloadBytes`, `AttachmentFile.writeToCache` with `sanitizeFilename(att.filename)`), then `AttachmentFile.saveAs(localPath, sanitizeFilename(att.filename))`. Load the attachment list from `store.listAttachments(selected.id)`.

- [ ] **Step 8: Full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS Debug build SUCCEEDED.
- [ ] **Step 9: Commit**  `git add -A && git commit -m "feat: attachment tray + native quarantined write/save"`

---

## Self-review notes (addressed)

- **Spec coverage (M3):** body retrieval ✓, sanitized HTML render in native WKWebView ✓ (JS off, remote blocked + toggle), inline `cid:` via scheme handler ✓, attachment list + Save ✓, quarantine xattr + filename hygiene + dangerous-type warnings ✓. Quick Look preview intentionally deferred.
- **Placeholders:** none — JS steps have complete code; native steps give the exact bridge surface + required behaviors with fallbacks flagged (scheme handler) so the target never lands non-building.
- **Naming consistency:** `getReceivedEmail`/`getAttachment`/`downloadBytes` (MailSource); `saveBody`/`getMessage`/`saveAttachments`/`listAttachments`/`markAttachmentDownloaded` (LocalStore); `sanitizeEmailHtml`; `sanitizeFilename`/`isDangerousFilename`/`typeMismatch`; `MessageBodyView`; `AttachmentFile.cacheDir`/`writeToCache`/`saveAs` — used consistently across tasks.
- **Known follow-ups:** Quick Look preview module (own milestone); distinguishing 401 vs network in `verifyApiKey` (carried from M2); a real-op-sqlite integration test for the new attachment SQL.
```
