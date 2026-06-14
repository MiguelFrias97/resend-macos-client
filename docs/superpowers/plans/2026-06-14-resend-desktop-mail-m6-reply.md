# Resend Desktop Mail — M6 Reply Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reply to a received email end-to-end: hit Reply on a message, write in the rich-text editor, and send through Resend with correct threading (`In-Reply-To`/`References`), the original quoted in a collapsible block, inline images as `cid:` attachment parts, and a local **outbox** that retries on failure. This delivers the app's core purpose.

**Architecture:** Pure-JS reply assembly (subject/headers/addresses/quote/payload) + a `Sender` over the existing `resendClient` + an **outbox** in `LocalStore` (enqueue → sending → sent/failed with retry) + an outbox processor. The UI adds an inline reply surface reusing the M5 `Composer`. Sent replies are recorded with `direction='sent'` (kept out of the inbox list, surfaced in a future thread view). Almost all logic is unit-testable; no new native code.

**Tech Stack:** plain JavaScript, Jest, the existing `resendClient`/`mailSource`/`localStore`/`Composer`/`docModelToHtml`.

**Reference spec:** `docs/superpowers/specs/2026-06-12-resend-desktop-mail-design.md` (§6 outbox, §9 reply pipeline).

**Branch:** `build/m6-reply` (off `main`, contains merged M0–M3, M5).

**Resend send API (verified):** `POST https://api.resend.com/emails` with `from`, `to`, `subject`, `html`, `headers` (object — for `In-Reply-To`/`References`), `attachments:[{filename, content (base64), content_type, content_id}]`. `content_id` makes an attachment an inline `cid:` image. Returns `{id}`.

---

## File structure (this milestone)

```
src/reply/assembleReply.js     # NEW — pure-JS: subject, headers, addresses, quote, payload
src/net/sender.js              # NEW — createSender({apiKey,fetchImpl}).send(payload) → {id}
src/data/localStore.js         # outbox table + CRUD; messages.direction; listInbox received-only
src/core/outbox.js             # NEW — enqueueAndSend / processOutbox (retry/backoff)
src/ui/ReplyComposer.js        # NEW — inline reply surface (reuses Composer) + status
src/ui/InboxScreen.js          # Reply button in reading pane → ReplyComposer wiring
__tests__/reply/*, __tests__/net/sender.test.js, __tests__/core/outbox.test.js,
__tests__/data/localStore.test.js (extend), __tests__/ui/ReplyComposer.test.js
```

---

### Task 1: Reply assembly (pure JS)

**Files:** Create `src/reply/assembleReply.js`, `__tests__/reply/assembleReply.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// __tests__/reply/assembleReply.test.js
import {
  replySubject, extractEmail, replyHeaders, quoteOriginal, assembleReplyPayload,
} from '../../src/reply/assembleReply';

test('replySubject adds Re: once', () => {
  expect(replySubject('Hello')).toBe('Re: Hello');
  expect(replySubject('Re: Hello')).toBe('Re: Hello');
  expect(replySubject('RE: Hello')).toBe('RE: Hello');
  expect(replySubject(null)).toBe('Re:');
});

test('extractEmail pulls the address out of a formatted from', () => {
  expect(extractEmail('Marcus Lee <marcus@acme.com>')).toBe('marcus@acme.com');
  expect(extractEmail('plain@x.com')).toBe('plain@x.com');
});

test('replyHeaders sets In-Reply-To and threads References', () => {
  expect(replyHeaders({rfcMessageId: '<b@y>', references: ['<a@x>']})).toEqual({
    'In-Reply-To': '<b@y>',
    References: '<a@x> <b@y>',
  });
  expect(replyHeaders({rfcMessageId: null, references: []})).toEqual({});
});

test('quoteOriginal wraps the original in a gmail_quote block', () => {
  const q = quoteOriginal({from: 'A <a@x>', receivedAt: '2026-06-12T14:00:00Z'}, '<p>hi</p>');
  expect(q).toContain('gmail_quote');
  expect(q).toContain('<p>hi</p>');
  expect(q).toMatch(/wrote:/);
});

test('assembleReplyPayload builds a complete Resend send payload', () => {
  const original = {
    from: 'Marcus <marcus@acme.com>',
    to: ['hi@you.com'],
    subject: 'Deal',
    rfcMessageId: '<m1@acme.com>',
    references: [],
    receivedAt: '2026-06-12T14:00:00Z',
  };
  const payload = assembleReplyPayload({
    original,
    replyHtml: '<p>Sounds good</p>',
    originalHtml: '<p>the deal</p>',
    inlineImages: [{contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'}],
    attachments: [{filename: 'doc.pdf', content: 'BBBB', content_type: 'application/pdf'}],
  });
  expect(payload.from).toBe('hi@you.com');
  expect(payload.to).toBe('marcus@acme.com');
  expect(payload.subject).toBe('Re: Deal');
  expect(payload.headers).toEqual({'In-Reply-To': '<m1@acme.com>', References: '<m1@acme.com>'});
  expect(payload.html).toContain('Sounds good');
  expect(payload.html).toContain('gmail_quote');
  expect(payload.attachments).toEqual([
    {filename: 'p.png', content: 'AAAA', content_type: 'image/png', content_id: 'img_1'},
    {filename: 'doc.pdf', content: 'BBBB', content_type: 'application/pdf'},
  ]);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest reply/assembleReply -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/reply/assembleReply.js
export function replySubject(subject) {
  const s = (subject || '').trim();
  if (!s) return 'Re:';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function extractEmail(addr) {
  const m = /<([^>]+)>/.exec(addr || '');
  return (m ? m[1] : String(addr || '')).trim();
}

export function replyHeaders(original) {
  const id = original.rfcMessageId;
  if (!id) return {};
  const refs = [...(original.references || []), id].filter(Boolean);
  return {'In-Reply-To': id, References: refs.join(' ')};
}

function formatDate(iso) {
  // Keep it simple and stable: the ISO date is acceptable for the quote header.
  return iso || '';
}

export function quoteOriginal(original, originalHtml) {
  const attribution = `On ${formatDate(original.receivedAt)}, ${original.from} wrote:`;
  return (
    '<br><blockquote class="gmail_quote" ' +
    'style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
    `${attribution}<br>${originalHtml || ''}</blockquote>`
  );
}

export function assembleReplyPayload({original, replyHtml, originalHtml, inlineImages = [], attachments = []}) {
  const inlineParts = inlineImages.map(img => ({
    filename: img.filename,
    content: img.base64,
    content_type: img.contentType,
    content_id: img.contentId,
  }));
  return {
    from: extractEmail((original.to && original.to[0]) || ''),
    to: extractEmail(original.from),
    subject: replySubject(original.subject),
    headers: replyHeaders(original),
    html: `${replyHtml || ''}${quoteOriginal(original, originalHtml)}`,
    attachments: [...inlineParts, ...attachments],
  };
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest reply/assembleReply -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: reply assembly (subject/headers/addresses/quote/payload)"`

---

### Task 2: `Sender`

**Files:** Create `src/net/sender.js`, `__tests__/net/sender.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// __tests__/net/sender.test.js
import {createSender} from '../../src/net/sender';

test('send POSTs the payload and returns the id', async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = {url, opts};
    return {status: 200, json: async () => ({id: 'eml_1'})};
  };
  const sender = createSender({apiKey: 're_x', fetchImpl});
  const res = await sender.send({from: 'a@x', to: 'b@y', subject: 'Re: hi', html: '<p>x</p>'});
  expect(res.id).toBe('eml_1');
  expect(captured.url).toBe('https://api.resend.com/emails');
  expect(captured.opts.method).toBe('POST');
  expect(JSON.parse(captured.opts.body).subject).toBe('Re: hi');
});

test('send throws on a non-2xx response', async () => {
  const fetchImpl = async () => ({status: 422, json: async () => ({message: 'bad'})});
  const sender = createSender({apiKey: 're_x', fetchImpl});
  await expect(sender.send({})).rejects.toThrow(/422/);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest net/sender -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/net/sender.js
import {createResendClient} from './resendClient';

export function createSender({apiKey, fetchImpl} = {}) {
  const client = createResendClient({apiKey, fetchImpl});
  async function send(payload) {
    const res = await client.request('/emails', {method: 'POST', body: payload});
    if (res.status < 200 || res.status >= 300) {
      let detail = '';
      try {
        detail = (await res.json()).message || '';
      } catch (e) {
        detail = '';
      }
      throw new Error(`send failed: ${res.status} ${detail}`.trim());
    }
    return res.json();
  }
  return {send};
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest net/sender -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: Resend Sender (POST /emails)"`

---

### Task 3: LocalStore outbox + sent messages

**Files:** Modify `src/data/localStore.js`, `__tests__/data/localStore.test.js`.

- [ ] **Step 1: Write failing test**

```javascript
// add to __tests__/data/localStore.test.js
test('outbox enqueue/list/status round-trip', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.enqueueOutbox({id: 'o1', threadId: 't1', payload: {to: 'b@y', subject: 'Re: hi'}});
  let pending = await store.listPendingOutbox();
  expect(pending).toHaveLength(1);
  expect(pending[0].payload.subject).toBe('Re: hi');
  await store.setOutboxStatus('o1', 'sent', {resendSendId: 'eml_1'});
  pending = await store.listPendingOutbox();
  expect(pending).toHaveLength(0);
});

test('listInbox excludes sent messages', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'r1', threadId: 't1', from: 'A', subject: 'Hi', receivedAt: '2026-06-12T10:00:00Z'});
  await store.insertSentMessage({id: 's1', threadId: 't1', from: 'me', subject: 'Re: Hi', receivedAt: '2026-06-12T11:00:00Z'});
  const inbox = await store.listInbox();
  expect(inbox.map(m => m.id)).toEqual(['r1']);
});
```

Extend `makeFakeDb()` to model: an `outbox` array (handle `INSERT INTO outbox`, `UPDATE outbox SET status=`, `SELECT ... FROM outbox WHERE status`), a `direction` column on message rows (default 'received'; `insertSentMessage` sets 'sent'), and `listInbox`'s new `WHERE direction='received'` filter. Run → FAIL first.

- [ ] **Step 2: Run → FAIL**  Run: `npx jest data/localStore -i`  Expected: FAIL.

- [ ] **Step 3: Implement** — add to `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY, thread_id TEXT, payload TEXT, status TEXT DEFAULT 'pending',
  resend_send_id TEXT, attempt_count INTEGER DEFAULT 0, last_error TEXT, created_at TEXT
);
```

Add `direction TEXT DEFAULT 'received'` to the `messages` table. Add methods:

```javascript
async function enqueueOutbox(item) {
  await db.execute(
    `INSERT INTO outbox (id, thread_id, payload, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
    [item.id, item.threadId ?? null, JSON.stringify(item.payload), item.createdAt ?? null],
  );
}
async function setOutboxStatus(id, status, {resendSendId, lastError, attemptCount} = {}) {
  await db.execute(
    `UPDATE outbox SET status=?, resend_send_id=?, last_error=?, attempt_count=COALESCE(?, attempt_count) WHERE id=?`,
    [status, resendSendId ?? null, lastError ?? null, attemptCount ?? null, id],
  );
}
async function listPendingOutbox() {
  const res = await db.execute(
    `SELECT id, thread_id, payload, status, attempt_count FROM outbox
     WHERE status IN ('pending','failed') ORDER BY created_at ASC`,
  );
  return res.rows.map(r => ({
    id: r.id, threadId: r.thread_id, payload: JSON.parse(r.payload),
    status: r.status, attemptCount: r.attempt_count,
  }));
}
async function insertSentMessage(m) {
  await db.execute(
    `INSERT INTO messages (id, thread_id, sender, subject, received_at, direction)
     VALUES (?, ?, ?, ?, ?, 'sent')
     ON CONFLICT(id) DO UPDATE SET direction='sent'`,
    [m.id, m.threadId, m.from, m.subject, m.receivedAt],
  );
}
```

Update `listInbox`'s SELECT to `... FROM messages WHERE direction='received' ORDER BY received_at DESC`. Add the new methods (and `enqueueOutbox`, `setOutboxStatus`, `listPendingOutbox`, `insertSentMessage`) to the returned object.

- [ ] **Step 4: Run → PASS**  Run: `npx jest data/localStore -i`  Expected: PASS (all localStore tests).
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: outbox storage + sent-message direction"`

---

### Task 4: Outbox processor (retry/backoff)

**Files:** Create `src/core/outbox.js`, `__tests__/core/outbox.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// __tests__/core/outbox.test.js
import {sendReply, processOutbox} from '../../src/core/outbox';

function fakeStore() {
  const items = [];
  const sent = [];
  return {
    items, sent,
    enqueueOutbox: async i => items.push({...i, status: 'pending', attemptCount: 0}),
    setOutboxStatus: async (id, status, extra = {}) => {
      const it = items.find(x => x.id === id);
      Object.assign(it, {status, ...extra});
    },
    listPendingOutbox: async () => items.filter(i => i.status === 'pending' || i.status === 'failed'),
    insertSentMessage: async m => sent.push(m),
  };
}

test('sendReply enqueues, sends, marks sent, and records the sent message', async () => {
  const store = fakeStore();
  const sender = {send: async () => ({id: 'eml_1'})};
  await sendReply({store, sender, id: 'o1', threadId: 't1', payload: {subject: 'Re: hi', from: 'me', to: 'b@y'}, sentMessage: {id: 's1', threadId: 't1', from: 'me', subject: 'Re: hi', receivedAt: 'now'}});
  expect(store.items[0].status).toBe('sent');
  expect(store.items[0].resendSendId).toBe('eml_1');
  expect(store.sent).toHaveLength(1);
});

test('sendReply marks failed on send error', async () => {
  const store = fakeStore();
  const sender = {send: async () => { throw new Error('422'); }};
  await sendReply({store, sender, id: 'o1', payload: {}, sentMessage: {id: 's1'}}).catch(() => {});
  expect(store.items[0].status).toBe('failed');
  expect(store.items[0].lastError).toMatch(/422/);
});

test('processOutbox retries failed items', async () => {
  const store = fakeStore();
  await store.enqueueOutbox({id: 'o1', payload: {}, sentMessage: {id: 's1'}});
  store.items[0].status = 'failed';
  const sender = {send: async () => ({id: 'eml_2'})};
  await processOutbox({store, sender});
  expect(store.items[0].status).toBe('sent');
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest core/outbox -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/core/outbox.js
async function attemptSend({store, sender, item}) {
  await store.setOutboxStatus(item.id, 'sending');
  try {
    const res = await sender.send(item.payload);
    await store.setOutboxStatus(item.id, 'sent', {resendSendId: res.id});
    if (item.sentMessage) await store.insertSentMessage(item.sentMessage);
    return {ok: true, id: res.id};
  } catch (e) {
    await store.setOutboxStatus(item.id, 'failed', {
      lastError: e.message,
      attemptCount: (item.attemptCount || 0) + 1,
    });
    return {ok: false, error: e};
  }
}

// Enqueue a reply and attempt to send it immediately.
export async function sendReply({store, sender, id, threadId, payload, sentMessage}) {
  await store.enqueueOutbox({id, threadId, payload, sentMessage, createdAt: null});
  return attemptSend({store, sender, item: {id, payload, sentMessage, attemptCount: 0}});
}

// Retry everything still pending/failed (called on reconnect / periodically).
export async function processOutbox({store, sender, maxAttempts = 5}) {
  const pending = await store.listPendingOutbox();
  for (const item of pending) {
    if ((item.attemptCount || 0) >= maxAttempts) continue;
    await attemptSend({store, sender, item});
  }
}
```

> Note: `sendReply` carries `sentMessage` through to `attemptSend`; the fake store's `enqueueOutbox` keeps the extra fields. The real `enqueueOutbox` only persists `payload`; the `sentMessage` is reconstructed by the caller (Task 5) when retrying, or stored in the payload — for v1 the immediate send path covers it, and `processOutbox` retries the send (the sent-message insert on a later retry is acceptable to skip if absent).

- [ ] **Step 4: Run → PASS**  Run: `npx jest core/outbox -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: outbox processor (send + retry)"`

---

### Task 5: `ReplyComposer` UI

**Files:** Create `src/ui/ReplyComposer.js`, `__tests__/ui/ReplyComposer.test.js`.

- [ ] **Step 1: Failing component test**

```javascript
// __tests__/ui/ReplyComposer.test.js
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

jest.mock('../../src/ui/Composer', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({onChange}) =>
      React.createElement('MockComposer', {
        onPressEmit: () => onChange({html: '<p>hello</p>', inlineImages: []}),
      }),
  };
});

import ReplyComposer from '../../src/ui/ReplyComposer';

test('Send builds a reply payload and calls onSend, showing Sent', async () => {
  const onSend = jest.fn(async () => ({ok: true}));
  const original = {from: 'A <a@x>', to: ['hi@you.com'], subject: 'Hi', rfcMessageId: '<m@x>', references: [], receivedAt: 'now'};
  const {getByText, UNSAFE_getByType} = render(
    <ReplyComposer original={original} originalHtml="<p>orig</p>" onSend={onSend} />,
  );
  UNSAFE_getByType('MockComposer').props.onPressEmit(); // simulate editing
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(onSend).toHaveBeenCalled());
  const payload = onSend.mock.calls[0][0];
  expect(payload.subject).toBe('Re: Hi');
  expect(payload.html).toContain('hello');
  expect(payload.html).toContain('gmail_quote');
  await waitFor(() => expect(getByText('Sent')).toBeTruthy());
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/ReplyComposer -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/ui/ReplyComposer.js
import React, {useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import Composer from './Composer';
import {assembleReplyPayload} from '../reply/assembleReply';

// Inline reply surface. onSend(payload) performs the actual send (enqueue +
// Sender) and resolves {ok}. originalHtml is the body being replied to (quoted).
export default function ReplyComposer({original, originalHtml, onSend}) {
  const [content, setContent] = useState({html: '', inlineImages: []});
  const [status, setStatus] = useState('idle'); // idle | sending | sent | failed

  const send = async () => {
    setStatus('sending');
    const payload = assembleReplyPayload({
      original,
      replyHtml: content.html,
      originalHtml,
      inlineImages: content.inlineImages,
    });
    try {
      const res = await onSend(payload);
      setStatus(res && res.ok === false ? 'failed' : 'sent');
    } catch (e) {
      setStatus('failed');
    }
  };

  return (
    <View style={{borderTopWidth: 1, borderTopColor: '#eee'}}>
      <View style={{height: 180}}>
        <Composer onChange={setContent} />
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', padding: 8}}>
        <Pressable
          onPress={send}
          disabled={status === 'sending'}
          style={{backgroundColor: '#d9d4e6', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16}}>
          <Text style={{color: '#5b4aa6', fontWeight: '600'}}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
        {status === 'sent' ? <Text style={{marginLeft: 12, color: '#2a8a3e'}}>Sent</Text> : null}
        {status === 'failed' ? (
          <Pressable onPress={send} style={{marginLeft: 12}}>
            <Text style={{color: '#b00'}}>Failed — Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/ReplyComposer -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: inline ReplyComposer with send status"`

---

### Task 6: Wire reply into the reading pane

**Files:** Modify `src/ui/InboxScreen.js`.

- [ ] **Step 1: Add a Reply affordance + inline composer.** In the reading-pane header (next to the subject) add a **Reply** button that toggles an inline `<ReplyComposer>` below the `MessageBody`. Build the reply dependencies from the existing `store` + `source`:
  - Create a `sender` once services are ready: `createSender({apiKey})`.
  - `onSend(payload)` → generate an outbox id and a `sentMessage` (`{id, threadId: selected.threadId, from: payload.from, subject: payload.subject, receivedAt: <now passed from JS>}`), call `sendReply({store, sender, id, threadId, payload, sentMessage})`, and return its result.
  - Pass `original={selected}` and `originalHtml` = the cached body (`await store.getMessage(selected.id)).html`) into `ReplyComposer`. (The reading pane already fetched/cached the body via `MessageBody`.)
  - On a successful send, collapse the reply composer.
  - Add a periodic/`onReconnect` `processOutbox({store, sender})` call (reuse the existing sync tick: after each sync, also call `processOutbox`).
- [ ] **Step 2: Timestamps.** `sentMessage.receivedAt` and the outbox id must come from JS (no `Date.now()` restriction here — this is app runtime, not a workflow script — but keep it simple: `new Date().toISOString()` for the timestamp and a random id like `out_${Math.random().toString(36).slice(2)}`).
- [ ] **Step 3: Full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS Debug build SUCCEEDED.
- [ ] **Step 4: Manual smoke (the real thing).** Run the app, select a received email, Reply, type a formatted message (optionally drop an image), Send. Confirm: the recipient receives a threaded reply (shows under the original in their client) with your formatting, the quoted original, and any inline image; a failed send shows Retry. Document results.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: inline reply wired into the reading pane (outbox send + retry)"`

---

## Self-review notes (addressed)

- **Spec coverage (M6):** reply assembly (subject/headers/addresses/quote) ✓, threading via `In-Reply-To`/`References` ✓, inline images as `content_id` parts ✓, send via Resend ✓, outbox with retry + optimistic sent insertion ✓, inline reply UX ✓, collapsible quoted original (gmail_quote) ✓.
- **Testability:** assembly, sender, outbox store, outbox processor, and ReplyComposer are all unit-tested; only the final InboxScreen wiring + real send is manual smoke.
- **Placeholders:** none — every JS step has complete code; the one native-free integration step lists exact wiring.
- **Naming consistency:** `replySubject`/`extractEmail`/`replyHeaders`/`quoteOriginal`/`assembleReplyPayload`, `createSender().send`, `enqueueOutbox`/`setOutboxStatus`/`listPendingOutbox`/`insertSentMessage`, `sendReply`/`processOutbox`, `ReplyComposer` — consistent across tasks.
- **Known follow-ups:** file attachments on replies (UI to attach files — inline images already flow); From-address picker when multiple verified addresses exist; surfacing sent replies in a thread view (M4); persisting `sentMessage` in the outbox row so `processOutbox` can insert it on a later retry; sanitizing the editor HTML through the M3 sanitizer before send (defense-in-depth).
```
