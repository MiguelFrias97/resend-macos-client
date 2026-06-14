# Resend Desktop Mail — M4 Triage (flags, search, sidebar, conversation) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the inbox feel like a real mail client: read/unread + star + archive flags, a sidebar (Inbox · Unread · Starred · Archive), local search (sender + subject + cached body), and a **full conversation view** that groups a thread's messages — received and your sent replies — in order, with the inline reply at the bottom.

**Architecture:** All JavaScript. `LocalStore` gains flag columns + flag setters, filtered listing, search, thread listing, and stores the body of sent replies so they render in the conversation. New UI: `Sidebar`, `SearchBar`, `ThreadView` (renders a thread's messages via the existing `MessageBody`), and flag affordances on `MessageList`. `InboxScreen` orchestrates filter + search + selected-thread state. No new native code.

**Tech Stack:** plain JavaScript, Jest, the existing `localStore`/`MessageBody`/`ReplyComposer`/`MessageList`.

**Reference spec:** `docs/superpowers/specs/2026-06-12-resend-desktop-mail-design.md` (§6 flags, §8 sidebar/list/thread).

**Branch:** `build/m4-triage` (off `main`, which contains merged M0–M3, M5, M6).

---

## File structure (this milestone)

```
src/data/localStore.js        # flags columns + setters, listMessages(filter), searchMessages, listThread, insertSentMessage(html)
src/ui/Sidebar.js             # NEW — filter list (Inbox/Unread/Starred/Archive)
src/ui/SearchBar.js           # NEW — search input
src/ui/ThreadView.js          # NEW — renders a thread's messages (MessageBody per message)
src/ui/MessageList.js         # + unread dot / star toggle / archive affordance
src/ui/InboxScreen.js         # filter + search + thread state; mark-read-on-open; flag actions
__tests__/...                 # localStore (extend), Sidebar, SearchBar, ThreadView, MessageList
```

---

### Task 1: LocalStore — flags, filtered listing, search, thread

**Files:** Modify `src/data/localStore.js`, `__tests__/data/localStore.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// add to __tests__/data/localStore.test.js
test('flags: setSeen/setStarred/setArchived and filtered listing', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'a', threadId: 't1', from: 'A', subject: 'one', receivedAt: '2026-06-12T10:00:00Z'});
  await store.upsertMessage({id: 'b', threadId: 't2', from: 'B', subject: 'two', receivedAt: '2026-06-12T11:00:00Z'});
  await store.setSeen('a', true);
  await store.setStarred('b', true);
  await store.setArchived('a', true);

  expect((await store.listMessages('inbox')).map(m => m.id)).toEqual(['b']); // a archived
  expect((await store.listMessages('unread')).map(m => m.id)).toEqual(['b']); // a is seen
  expect((await store.listMessages('starred')).map(m => m.id)).toEqual(['b']);
  expect((await store.listMessages('archive')).map(m => m.id)).toEqual(['a']);
  const b = (await store.listMessages('inbox'))[0];
  expect(b.starred).toBe(true);
  expect(b.seen).toBe(false);
});

test('searchMessages matches sender, subject, and cached body', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'a', threadId: 't1', from: 'Marcus', subject: 'Deal', receivedAt: '2026-06-12T10:00:00Z'});
  await store.saveBody('a', {html: '<p>contract terms</p>', text: 'contract terms'});
  await store.upsertMessage({id: 'b', threadId: 't2', from: 'Ana', subject: 'Lunch', receivedAt: '2026-06-12T11:00:00Z'});
  expect((await store.searchMessages('marc')).map(m => m.id)).toEqual(['a']); // sender
  expect((await store.searchMessages('lunch')).map(m => m.id)).toEqual(['b']); // subject
  expect((await store.searchMessages('contract')).map(m => m.id)).toEqual(['a']); // body
});

test('listThread returns received + sent messages oldest-first', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'r', threadId: 't1', from: 'A', subject: 'Hi', receivedAt: '2026-06-12T10:00:00Z'});
  await store.insertSentMessage({id: 's', threadId: 't1', from: 'me', subject: 'Re: Hi', receivedAt: '2026-06-12T11:00:00Z', html: '<p>reply</p>'});
  const thread = await store.listThread('t1');
  expect(thread.map(m => m.id)).toEqual(['r', 's']);
  expect(thread[1].direction).toBe('sent');
  expect(thread[1].html).toBe('<p>reply</p>');
});
```

Extend `makeFakeDb()` to model: `starred`/`archived` columns (default 0) on message rows; `UPDATE messages SET seen=` / `SET starred=` / `SET archived=`; the filtered `SELECT ... FROM messages WHERE ...` for each filter; `searchMessages` LIKE matching on sender/subject/text; `listThread` selecting by thread_id (both directions) ordered ascending; and `insertSentMessage` now storing `html`, `body_fetched=1`, `direction='sent'`. Run → FAIL first.

- [ ] **Step 2: Run → FAIL**  Run: `npx jest data/localStore -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

Add `starred INTEGER DEFAULT 0, archived INTEGER DEFAULT 0` columns to the `messages` CREATE TABLE. Add methods:

```javascript
async function setFlag(column, id, value) {
  await db.execute(`UPDATE messages SET ${column}=? WHERE id=?`, [value ? 1 : 0, id]);
}
const setSeen = (id, v) => setFlag('seen', id, v);
const setStarred = (id, v) => setFlag('starred', id, v);
const setArchived = (id, v) => setFlag('archived', id, v);

function mapRow(r) {
  return {
    id: r.id, threadId: r.thread_id, from: r.sender, subject: r.subject,
    receivedAt: r.received_at, seen: Boolean(r.seen), starred: Boolean(r.starred),
    archived: Boolean(r.archived), direction: r.direction || 'received',
    html: r.html ?? null, text: r.text ?? null, bodyFetched: Boolean(r.body_fetched),
  };
}

const FILTERS = {
  inbox: `direction='received' AND archived=0`,
  unread: `direction='received' AND archived=0 AND seen=0`,
  starred: `direction='received' AND starred=1`,
  archive: `direction='received' AND archived=1`,
};

async function listMessages(filter = 'inbox') {
  const where = FILTERS[filter] || FILTERS.inbox;
  const res = await db.execute(
    `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction
     FROM messages WHERE ${where} ORDER BY received_at DESC`,
  );
  return res.rows.map(mapRow);
}

async function searchMessages(query) {
  const q = `%${query}%`;
  const res = await db.execute(
    `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction
     FROM messages
     WHERE direction='received' AND (sender LIKE ? OR subject LIKE ? OR text LIKE ?)
     ORDER BY received_at DESC`,
    [q, q, q],
  );
  return res.rows.map(mapRow);
}

async function listThread(threadId) {
  const res = await db.execute(
    `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction, html, text, body_fetched
     FROM messages WHERE thread_id=? ORDER BY received_at ASC`,
    [threadId],
  );
  return res.rows.map(mapRow);
}
```

Update `insertSentMessage` to store the reply html:

```javascript
async function insertSentMessage(m) {
  await db.execute(
    `INSERT INTO messages (id, thread_id, sender, subject, received_at, direction, html, body_fetched)
     VALUES (?, ?, ?, ?, ?, 'sent', ?, 1)
     ON CONFLICT(id) DO UPDATE SET direction='sent', html=excluded.html, body_fetched=1`,
    [m.id, m.threadId, m.from, m.subject, m.receivedAt, m.html ?? null],
  );
}
```

Keep `listInbox` (used elsewhere) as an alias of `listMessages('inbox')` for compatibility, or update callers. Return all new methods (`setSeen`, `setStarred`, `setArchived`, `listMessages`, `searchMessages`, `listThread`) plus existing.

- [ ] **Step 4: Run → PASS**  Run: `npx jest data/localStore -i`  Expected: PASS (all).
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: message flags, filtered listing, search, thread listing"`

> Update `src/ui/InboxScreen.js` and `src/core/outbox.js`/M6 sent path to pass the reply `html` into `insertSentMessage` (the M6 `onSendReply` builds `sentMessage`; add `html: payload.html`). Do this in Task 6 wiring.

---

### Task 2: `Sidebar`

**Files:** Create `src/ui/Sidebar.js`, `__tests__/ui/Sidebar.test.js`.

- [ ] **Step 1: Failing test**

```javascript
// __tests__/ui/Sidebar.test.js
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import Sidebar from '../../src/ui/Sidebar';

test('renders filters and reports selection', () => {
  const onSelect = jest.fn();
  const {getByText} = render(<Sidebar selected="inbox" onSelect={onSelect} />);
  expect(getByText('Inbox')).toBeTruthy();
  expect(getByText('Starred')).toBeTruthy();
  fireEvent.press(getByText('Archive'));
  expect(onSelect).toHaveBeenCalledWith('archive');
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/Sidebar -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/ui/Sidebar.js
import React from 'react';
import {View, Text, Pressable} from 'react-native';

const FILTERS = [
  {key: 'inbox', label: 'Inbox'},
  {key: 'unread', label: 'Unread'},
  {key: 'starred', label: 'Starred'},
  {key: 'archive', label: 'Archive'},
];

export default function Sidebar({selected, onSelect}) {
  return (
    <View style={{width: 160, paddingVertical: 8, backgroundColor: '#f2f0f5'}}>
      {FILTERS.map(f => (
        <Pressable
          key={f.key}
          onPress={() => onSelect(f.key)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            marginHorizontal: 6,
            borderRadius: 6,
            backgroundColor: selected === f.key ? '#d9d4e6' : 'transparent',
          }}>
          <Text style={{color: selected === f.key ? '#5b4aa6' : '#3a3a3a', fontWeight: selected === f.key ? '600' : '400'}}>
            {f.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/Sidebar -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: sidebar filter list"`

---

### Task 3: `SearchBar`

**Files:** Create `src/ui/SearchBar.js`, `__tests__/ui/SearchBar.test.js`.

- [ ] **Step 1: Failing test**

```javascript
// __tests__/ui/SearchBar.test.js
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import SearchBar from '../../src/ui/SearchBar';

test('reports query changes', () => {
  const onChange = jest.fn();
  const {getByPlaceholderText} = render(<SearchBar value="" onChange={onChange} />);
  fireEvent.changeText(getByPlaceholderText('Search'), 'deal');
  expect(onChange).toHaveBeenCalledWith('deal');
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/SearchBar -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/ui/SearchBar.js
import React from 'react';
import {TextInput} from 'react-native';

export default function SearchBar({value, onChange}) {
  return (
    <TextInput
      placeholder="Search"
      value={value}
      onChangeText={onChange}
      style={{
        margin: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
      }}
    />
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/SearchBar -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: search input"`

---

### Task 4: `MessageList` flag affordances

**Files:** Modify `src/ui/MessageList.js`, `__tests__/ui/MessageList.test.js`.

- [ ] **Step 1: Extend the test**

```javascript
// add to __tests__/ui/MessageList.test.js
test('shows unread dot, star state, and fires star/archive callbacks', () => {
  const onToggleStar = jest.fn();
  const onArchive = jest.fn();
  const messages = [
    {id: 'm1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false, starred: false},
  ];
  const {getByLabelText} = render(
    <MessageList messages={messages} onSelect={() => {}} selectedId={null}
      onToggleStar={onToggleStar} onArchive={onArchive} />,
  );
  fireEvent.press(getByLabelText('Star Re: contract'));
  expect(onToggleStar).toHaveBeenCalledWith(messages[0]);
  fireEvent.press(getByLabelText('Archive Re: contract'));
  expect(onArchive).toHaveBeenCalledWith(messages[0]);
});
```

(Keep the existing render test; import `fireEvent` if not already.)

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/MessageList -i`  Expected: FAIL.

- [ ] **Step 3: Implement** — extend each row in `MessageList.js`: an unread dot when `!seen`, a star button (filled when `starred`) calling `onToggleStar(item)`, and an archive button calling `onArchive(item)`. Use `accessibilityLabel={`Star ${item.subject}`}` and `Archive ${item.subject}` so they're testable. Keep the existing sender/subject layout and the `onSelect` press on the row body.

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/MessageList -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: message list flag affordances (unread/star/archive)"`

---

### Task 5: `ThreadView`

**Files:** Create `src/ui/ThreadView.js`, `__tests__/ui/ThreadView.test.js`.

- [ ] **Step 1: Failing test** (mock `MessageBody` so we don't pull native in)

```javascript
// __tests__/ui/ThreadView.test.js
import React from 'react';
import {render} from '@testing-library/react-native';

jest.mock('../../src/ui/MessageBody', () => {
  const React = require('react');
  return {__esModule: true, default: ({messageId}) => React.createElement('MockBody', {messageId})};
});

import ThreadView from '../../src/ui/ThreadView';

test('renders a header + body per message, marking sent vs received', () => {
  const messages = [
    {id: 'r', from: 'A <a@x>', direction: 'received', receivedAt: '2026-06-12T10:00:00Z'},
    {id: 's', from: 'me', direction: 'sent', receivedAt: '2026-06-12T11:00:00Z'},
  ];
  const {getByText, getAllByText} = render(
    <ThreadView messages={messages} bodyDeps={{}} allowRemote={false} />,
  );
  expect(getByText(/A <a@x>/)).toBeTruthy();
  expect(getByText('You')).toBeTruthy(); // sent messages labelled "You"
});
```

> Replace the mock element name with a valid identifier (e.g. `MockBody`) — the snippet above intentionally needs a clean ASCII name.

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/ThreadView -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/ui/ThreadView.js
import React from 'react';
import {ScrollView, View, Text} from 'react-native';
import MessageBody from './MessageBody';

export default function ThreadView({messages, bodyDeps, allowRemote}) {
  return (
    <ScrollView style={{flex: 1}}>
      {messages.map(m => (
        <View key={m.id} style={{borderBottomWidth: 1, borderBottomColor: '#eee'}}>
          <View style={{paddingHorizontal: 16, paddingVertical: 8, backgroundColor: m.direction === 'sent' ? '#f6f4fb' : '#fff'}}>
            <Text style={{fontWeight: '600'}}>{m.direction === 'sent' ? 'You' : m.from}</Text>
            <Text style={{color: '#999', fontSize: 12}}>{m.receivedAt}</Text>
          </View>
          <View style={{height: 240}}>
            <MessageBody messageId={m.id} allowRemote={allowRemote} deps={bodyDeps} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/ThreadView -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: conversation ThreadView"`

---

### Task 6: Wire triage into `InboxScreen`

**Files:** Modify `src/ui/InboxScreen.js`.

- [ ] **Step 1: State + data.** Add `filter` (default 'inbox'), `query` (search text), and `thread` (array of messages for the selected thread). The left pane gets a `Sidebar` (filter) + `SearchBar` above the `MessageList`. The list source is: if `query` non-empty → `store.searchMessages(query)`, else `store.listMessages(filter)`. Re-run on filter/query change and on each sync tick.
- [ ] **Step 2: Selecting a message opens its thread.** On select: `setSelected(msg)`, load `store.listThread(msg.threadId)` into `thread`, and `store.setSeen(msg.id, true)` (mark read), then refresh the list. Render `<ThreadView messages={thread} bodyDeps={bodyDeps} allowRemote={allowRemote} />` in the reading pane (replacing the single `MessageBody`), with the `ReplyComposer` below it (reply targets the latest received message in the thread).
- [ ] **Step 3: Flag actions.** Pass `onToggleStar={m => store.setStarred(m.id, !m.starred).then(refresh)}` and `onArchive={m => store.setArchived(m.id, true).then(refresh)}` to `MessageList`.
- [ ] **Step 4: Sent reply body.** In the M6 `onSendReply` path, add `html: payload.html` to the `sentMessage` object so the sent reply renders in the conversation (Task 1's `insertSentMessage` now stores it).
- [ ] **Step 5: Full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS Debug build SUCCEEDED.
- [ ] **Step 6: Manual smoke.** Run the app: switch sidebar filters; search; star/archive a message (it moves between filters); open a thread and see the original + your sent reply grouped; reply and watch it appear in the conversation. Document results.
- [ ] **Step 7: Commit**  `git add -A && git commit -m "feat: wire sidebar, search, flags, and conversation view into the inbox"`

---

## Self-review notes (addressed)

- **Spec coverage (M4):** read/unread + star + archive flags ✓, sidebar filters ✓, search (sender+subject+cached body) ✓, full conversation/thread view incl. sent replies ✓.
- **Testability:** flags/filter/search/thread (store), Sidebar, SearchBar, MessageList affordances, ThreadView are all unit-tested; only the InboxScreen orchestration + real interaction is manual smoke.
- **Placeholders:** none — every JS step has complete code; the ThreadView test's mock element name must be a clean ASCII identifier (noted inline).
- **Naming consistency:** `setSeen`/`setStarred`/`setArchived`, `listMessages(filter)`, `searchMessages`, `listThread`, `insertSentMessage({...html})`, `Sidebar`/`SearchBar`/`ThreadView`, `onToggleStar`/`onArchive` — consistent across tasks.
- **Known follow-ups:** thread-collapsing in the message list (show one row per thread with a count); per-address sidebar filters; debouncing search; persisting the seen/star state optimistically in the list before the store round-trips; marking a whole thread read.
```
