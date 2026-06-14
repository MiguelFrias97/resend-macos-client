# Resend Desktop Mail — M7 Compose & Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a brand-new email and forward a received one. A focused compose sheet (To / From / Subject + the rich editor) sends via the existing outbox. From is a remembered, editable identity. Forward carries the original quoted plus its file attachments re-attached.

**Architecture:** All JavaScript, reusing M5's `Composer`, M6's `Sender`/outbox/`quoteOriginal`/`extractEmail`. New: a tiny identity setting in `LocalStore`, pure-JS compose/forward payload assembly, and a `ComposeSheet` UI. Forwarded attachments are re-sent via Resend's `attachments[].path` (the original's presigned `download_url`), so no byte download is needed.

**Tech Stack:** plain JavaScript, Jest, existing `Composer`/`Sender`/`outbox`/`assembleReply`.

**Reference spec:** `docs/superpowers/specs/2026-06-12-resend-desktop-mail-design.md` (§9 compose/forward as a focused sheet).

**Branch:** `build/m7-compose` (off `main`, contains merged M0–M6).

**Resend facts:** `attachments[].path` = a URL Resend fetches server-side at send time → used to re-attach forwarded files without downloading bytes. `content_id` = inline cid image (already used for editor images).

---

## File structure (this milestone)

```
src/data/localStore.js          # + settings table: getSetting/setSetting (for the From identity)
src/compose/assembleCompose.js  # NEW — parseRecipients, forwardSubject, assembleComposePayload, assembleForwardPayload
src/ui/ComposeSheet.js          # NEW — To/From/Subject + Composer + Send (compose & forward)
src/ui/InboxScreen.js           # Compose button + Forward button wiring
__tests__/...                   # localStore (extend), assembleCompose, ComposeSheet
```

---

### Task 1: LocalStore settings (From identity)

**Files:** Modify `src/data/localStore.js`, `__tests__/data/localStore.test.js`.

- [ ] **Step 1: Failing test**

```javascript
// add to __tests__/data/localStore.test.js
test('settings round-trip (from identity)', async () => {
  const store = await createLocalStore(makeFakeDb());
  expect(await store.getSetting('fromIdentity')).toBe(null);
  await store.setSetting('fromIdentity', 'me@you.com');
  expect(await store.getSetting('fromIdentity')).toBe('me@you.com');
  await store.setSetting('fromIdentity', 'other@you.com');
  expect(await store.getSetting('fromIdentity')).toBe('other@you.com');
});
```

Extend `makeFakeDb()` with a `settings` object: handle `INSERT INTO settings ... ON CONFLICT(key) DO UPDATE` (params [key, value]) and `SELECT value FROM settings WHERE key=?`. Run → FAIL.

- [ ] **Step 2: Run → FAIL**  Run: `npx jest data/localStore -i`  Expected: FAIL.

- [ ] **Step 3: Implement** — add to `SCHEMA`: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);` and methods:

```javascript
async function setSetting(key, value) {
  await db.execute(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, value],
  );
}
async function getSetting(key) {
  const res = await db.execute(`SELECT value FROM settings WHERE key=?`, [key]);
  return res.rows[0] ? res.rows[0].value : null;
}
```

Return both. Run → PASS. Commit: `git add -A && git commit -m "feat: settings store (From identity)"`

---

### Task 2: Compose & forward assembly

**Files:** Create `src/compose/assembleCompose.js`, `__tests__/compose/assembleCompose.test.js`.

- [ ] **Step 1: Failing tests**

```javascript
// __tests__/compose/assembleCompose.test.js
import {
  parseRecipients, forwardSubject, assembleComposePayload, assembleForwardPayload,
} from '../../src/compose/assembleCompose';

test('parseRecipients splits and unwraps addresses', () => {
  expect(parseRecipients('a@x')).toEqual(['a@x']);
  expect(parseRecipients('A <a@x>, b@y')).toEqual(['a@x', 'b@y']);
  expect(parseRecipients('')).toEqual([]);
});

test('forwardSubject prefixes Fwd: once', () => {
  expect(forwardSubject('Deal')).toBe('Fwd: Deal');
  expect(forwardSubject('Fwd: Deal')).toBe('Fwd: Deal');
  expect(forwardSubject(null)).toBe('Fwd:');
});

test('assembleComposePayload builds a payload with inline images', () => {
  const p = assembleComposePayload({
    from: 'Me <me@you.com>',
    to: 'a@x, b@y',
    subject: 'Hello',
    html: '<p>hi</p>',
    inlineImages: [{contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'}],
  });
  expect(p.from).toBe('me@you.com');
  expect(p.to).toEqual(['a@x', 'b@y']);
  expect(p.subject).toBe('Hello');
  expect(p.html).toBe('<p>hi</p>');
  expect(p.attachments).toEqual([
    {filename: 'p.png', content: 'AAAA', content_type: 'image/png', content_id: 'img_1'},
  ]);
});

test('assembleForwardPayload quotes the original and re-attaches files via path', () => {
  const original = {from: 'Marcus <marcus@acme.com>', subject: 'Deal', receivedAt: 'now'};
  const p = assembleForwardPayload({
    from: 'me@you.com',
    to: 'c@z',
    original,
    originalHtml: '<p>the deal</p>',
    replyHtml: '<p>see below</p>',
    originalAttachments: [{filename: 'doc.pdf', downloadUrl: 'https://d/x', contentType: 'application/pdf'}],
  });
  expect(p.from).toBe('me@you.com');
  expect(p.to).toEqual(['c@z']);
  expect(p.subject).toBe('Fwd: Deal');
  expect(p.html).toContain('see below');
  expect(p.html).toContain('gmail_quote');
  expect(p.attachments).toEqual([
    {filename: 'doc.pdf', path: 'https://d/x', content_type: 'application/pdf'},
  ]);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest compose/assembleCompose -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/compose/assembleCompose.js
import {extractEmail, quoteOriginal} from '../reply/assembleReply';

export function parseRecipients(value) {
  return String(value || '')
    .split(',')
    .map(s => extractEmail(s))
    .filter(Boolean);
}

export function forwardSubject(subject) {
  const s = (subject || '').trim();
  if (!s) return 'Fwd:';
  return /^fwd:/i.test(s) ? s : `Fwd: ${s}`;
}

function inlineParts(inlineImages) {
  return (inlineImages || []).map(img => ({
    filename: img.filename,
    content: img.base64,
    content_type: img.contentType,
    content_id: img.contentId,
  }));
}

export function assembleComposePayload({from, to, subject, html, inlineImages = [], attachments = []}) {
  return {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: (subject || '').trim() || '(no subject)',
    html: html || '',
    attachments: [...inlineParts(inlineImages), ...attachments],
  };
}

export function assembleForwardPayload({from, to, original, originalHtml, replyHtml, inlineImages = [], originalAttachments = []}) {
  const forwarded = originalAttachments.map(a => ({
    filename: a.filename,
    path: a.downloadUrl,
    content_type: a.contentType,
  }));
  return {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: forwardSubject(original.subject),
    html: `${replyHtml || ''}${quoteOriginal(original, originalHtml)}`,
    attachments: [...inlineParts(inlineImages), ...forwarded],
  };
}
```

> Note: `quoteOriginal` sanitizes the forwarded body (strips scripts/remote images), so inline images embedded in the original body are NOT carried in the quote — only the original's file attachments are re-attached. Document this as a known v1 limitation.

- [ ] **Step 4: Run → PASS**  Run: `npx jest compose/assembleCompose -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: compose + forward payload assembly"`

---

### Task 3: `ComposeSheet` UI

**Files:** Create `src/ui/ComposeSheet.js`, `__tests__/ui/ComposeSheet.test.js`.

- [ ] **Step 1: Failing test** (mock `Composer`)

```javascript
// __tests__/ui/ComposeSheet.test.js
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

jest.mock('../../src/ui/Composer', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({onChange}) =>
      React.createElement('MockComposer', {onPressEmit: () => onChange({html: '<p>body</p>', inlineImages: []})}),
  };
});

import ComposeSheet from '../../src/ui/ComposeSheet';

test('compose: fills fields and sends an assembled payload', async () => {
  const onSend = jest.fn(async () => ({ok: true}));
  const {getByPlaceholderText, getByText, UNSAFE_getByType} = render(
    <ComposeSheet defaultFrom="me@you.com" onSend={onSend} onClose={() => {}} />,
  );
  fireEvent.changeText(getByPlaceholderText('To'), 'a@x');
  fireEvent.changeText(getByPlaceholderText('Subject'), 'Hello');
  UNSAFE_getByType('MockComposer').props.onPressEmit();
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(onSend).toHaveBeenCalled());
  const payload = onSend.mock.calls[0][0];
  expect(payload.from).toBe('me@you.com');
  expect(payload.to).toEqual(['a@x']);
  expect(payload.subject).toBe('Hello');
  expect(payload.html).toContain('body');
  await waitFor(() => expect(getByText('Sent')).toBeTruthy());
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/ComposeSheet -i`  Expected: FAIL.

- [ ] **Step 3: Implement** — `src/ui/ComposeSheet.js`. Props: `defaultFrom`, `mode` ('compose' | 'forward', default 'compose'), `forward` (for forward mode: `{original, originalHtml, originalAttachments}`), `onSend(payload)`, `onClose`. Render To / From (prefilled `defaultFrom`) / Subject (prefilled `forwardSubject(original.subject)` in forward mode) `TextInput`s, the `Composer` (capture `{html, inlineImages}` in a ref), a Send button with status (idle/sending/sent/failed+Retry, like `ReplyComposer`), and a Close. On Send: build the payload with `assembleComposePayload` (compose) or `assembleForwardPayload` (forward, passing the `forward` props + the editor html as `replyHtml`), call `onSend`, set status. Use `accessibilityLabel`/`placeholder` `To`, `From`, `Subject` for testability.

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/ComposeSheet -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: ComposeSheet (new message + forward)"`

---

### Task 4: Wire compose & forward into `InboxScreen`

**Files:** Modify `src/ui/InboxScreen.js`.

- [ ] **Step 1: Identity.** On mount, load `store.getSetting('fromIdentity')` into state (`fromIdentity`); if null, derive a fallback from the most recent received message's `to` if available, else empty. Persist it via `store.setSetting('fromIdentity', value)` when the user edits From in the sheet (pass an `onChangeFrom` to `ComposeSheet` that saves it).
- [ ] **Step 2: Compose.** Add a Compose button (e.g. in the sidebar column header or toolbar). It opens `<ComposeSheet mode="compose" defaultFrom={fromIdentity} onSend={onSendMail} onClose={...} />` as a full-screen overlay (absolute fill). `onSendMail(payload)` → `sendReply({store, sender, id: out_<rand>, payload, sentMessage: null})` (reuse the outbox; no thread). On `{ok}` close the sheet.
- [ ] **Step 3: Forward.** Add a Forward button in the reading-pane header (next to Reply). On press: ensure the original body is loaded (like `startReply`), resolve the original's attachments to `{filename, downloadUrl, contentType}` by calling `source.getAttachment(selected.id, att.id)` for each non-inline attachment in `store.listAttachments(selected.id)`, then open `<ComposeSheet mode="forward" defaultFrom={fromIdentity} forward={{original: selected, originalHtml, originalAttachments}} onSend={onSendMail} onClose={...} />`.
- [ ] **Step 4: Full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS Debug build SUCCEEDED.
- [ ] **Step 5: Manual smoke.** Compose a new email (set From, To, subject, formatted body, optional inline image), Send → recipient receives it. Forward a received email with a file attachment → recipient receives the quoted original + the attachment. A failed send shows Retry.
- [ ] **Step 6: Commit**  `git add -A && git commit -m "feat: wire compose + forward into the inbox"`

---

## Self-review notes (addressed)

- **Spec coverage (M7):** new-message compose via a focused sheet ✓, forward (quoted original + re-attached files) ✓, remembered editable From identity ✓, inline images in compose ✓, send via the existing outbox (retry) ✓.
- **Testability:** settings, compose/forward assembly, and the ComposeSheet send flow are unit-tested; only the InboxScreen wiring + real send is manual smoke.
- **Placeholders:** none — JS steps have complete code; the ComposeSheet implementation mirrors the documented ReplyComposer status pattern.
- **Naming consistency:** `getSetting`/`setSetting`, `parseRecipients`/`forwardSubject`/`assembleComposePayload`/`assembleForwardPayload`, `ComposeSheet`, `onSendMail`, `fromIdentity` — consistent across tasks; reuses `extractEmail`/`quoteOriginal`/`sendReply`.
- **Known follow-ups:** forwarding does not carry inline images embedded in the original body (only file attachments); a real recipient token field with validation/autocomplete; a Drafts/Sent view; From validation against verified domains; attachment picker (attach arbitrary local files) on compose.
```
