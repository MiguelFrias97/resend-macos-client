import {createLocalStore} from '../../src/data/localStore';

function makeFakeDb() {
  const rows = [];
  const attachments = [];
  const outbox = [];
  return {
    async execute(sql, params = []) {
      if (/^CREATE TABLE/i.test(sql)) return {rows: []};
      if (/^INSERT INTO outbox/i.test(sql)) {
        const [id, thread_id, payload, sent_message, created_at] = params;
        outbox.push({id, thread_id, payload, sent_message, status: 'pending', resend_send_id: null, attempt_count: 0, last_error: null, created_at});
        return {rows: [], rowsAffected: 1};
      }
      if (/^UPDATE outbox SET status=/i.test(sql)) {
        const [status, resend_send_id, last_error, attempt_count, id] = params;
        const existing = outbox.find(o => o.id === id);
        if (existing) {
          existing.status = status;
          existing.resend_send_id = resend_send_id;
          existing.last_error = last_error;
          if (attempt_count !== null && attempt_count !== undefined) existing.attempt_count = attempt_count;
        }
        return {rows: [], rowsAffected: existing ? 1 : 0};
      }
      if (/FROM outbox WHERE status IN/i.test(sql)) {
        const pending = outbox
          .filter(o => ['pending', 'failed', 'sending'].includes(o.status))
          .sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1));
        return {rows: pending};
      }
      if (/^INSERT INTO messages/i.test(sql) && /direction/i.test(sql) && /'sent'/i.test(sql)) {
        const [id, thread_id, sender, subject, received_at, html] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) Object.assign(existing, {direction: 'sent', html, body_fetched: 1});
        else rows.push({id, thread_id, sender, subject, received_at, seen: 0, starred: 0, archived: 0, html, text: null, body_fetched: 1, direction: 'sent'});
        return {rows: [], rowsAffected: 1};
      }
      if (/^INSERT INTO messages/i.test(sql)) {
        const [id, thread_id, sender, subject, received_at] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) Object.assign(existing, {thread_id, sender, subject, received_at});
        else rows.push({id, thread_id, sender, subject, received_at, seen: 0, starred: 0, archived: 0, html: null, text: null, body_fetched: 0, direction: 'received'});
        return {rows: [], rowsAffected: 1};
      }
      if (/^UPDATE messages SET html=/i.test(sql)) {
        const [html, text, id] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) Object.assign(existing, {html, text, body_fetched: 1});
        return {rows: [], rowsAffected: existing ? 1 : 0};
      }
      if (/^UPDATE messages SET seen=/i.test(sql)) {
        const [value, id] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) existing.seen = value;
        return {rows: [], rowsAffected: existing ? 1 : 0};
      }
      if (/^UPDATE messages SET starred=/i.test(sql)) {
        const [value, id] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) existing.starred = value;
        return {rows: [], rowsAffected: existing ? 1 : 0};
      }
      if (/^UPDATE messages SET archived=/i.test(sql)) {
        const [value, id] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) existing.archived = value;
        return {rows: [], rowsAffected: existing ? 1 : 0};
      }
      if (/FROM messages WHERE thread_id=/i.test(sql)) {
        const [thread_id] = params;
        return {
          rows: rows
            .filter(r => r.thread_id === thread_id)
            .sort((a, b) => (a.received_at < b.received_at ? -1 : 1)),
        };
      }
      if (/FROM messages WHERE direction='received' AND \(sender LIKE/i.test(sql)) {
        const like = String(params[0]).replace(/%/g, '').toLowerCase();
        return {
          rows: rows
            .filter(r => r.direction === 'received')
            .filter(
              r =>
                String(r.sender ?? '').toLowerCase().includes(like) ||
                String(r.subject ?? '').toLowerCase().includes(like) ||
                String(r.text ?? '').toLowerCase().includes(like),
            )
            .sort((a, b) => (a.received_at < b.received_at ? 1 : -1)),
        };
      }
      if (/^INSERT INTO attachments/i.test(sql)) {
        const [id, message_id, filename, content_type, size, content_id, disposition, download_url] = params;
        const existing = attachments.find(a => a.id === id);
        const next = {id, message_id, filename, content_type, size, content_id, disposition, download_url, local_path: null, downloaded: 0};
        if (existing) Object.assign(existing, next);
        else attachments.push(next);
        return {rows: [], rowsAffected: 1};
      }
      if (/^UPDATE attachments SET/i.test(sql)) {
        const [local_path, id] = params;
        const existing = attachments.find(a => a.id === id);
        if (existing) Object.assign(existing, {local_path, downloaded: 1});
        return {rows: [], rowsAffected: existing ? 1 : 0};
      }
      if (/FROM attachments WHERE message_id=/i.test(sql)) {
        const [message_id] = params;
        return {rows: attachments.filter(a => a.message_id === message_id)};
      }
      if (/FROM messages WHERE id=/i.test(sql)) {
        const [id] = params;
        const r = rows.find(x => x.id === id);
        return {rows: r ? [r] : []};
      }
      if (/FROM messages WHERE direction='received'/i.test(sql)) {
        let filtered;
        if (/archived=0 AND seen=0/i.test(sql)) {
          filtered = rows.filter(r => r.direction === 'received' && !r.archived && !r.seen);
        } else if (/starred=1/i.test(sql)) {
          filtered = rows.filter(r => r.direction === 'received' && r.starred && !r.archived);
        } else if (/archived=1/i.test(sql)) {
          filtered = rows.filter(r => r.direction === 'received' && r.archived);
        } else {
          filtered = rows.filter(r => r.direction === 'received' && !r.archived);
        }
        return {rows: filtered.sort((a, b) => (a.received_at < b.received_at ? 1 : -1))};
      }
      if (/FROM messages/i.test(sql)) {
        return {rows: rows.filter(r => r.direction === 'received').sort((a, b) => (a.received_at < b.received_at ? 1 : -1))};
      }
      return {rows: []};
    },
  };
}

test('upsertMessage inserts then updates idempotently', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'm1', threadId: 't1', from: 'A', subject: 'Hi', receivedAt: '2026-06-12T10:00:00Z'});
  await store.upsertMessage({id: 'm1', threadId: 't1', from: 'A', subject: 'Hi (edited)', receivedAt: '2026-06-12T10:00:00Z'});
  const list = await store.listInbox();
  expect(list).toHaveLength(1);
  expect(list[0].subject).toBe('Hi (edited)');
});

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
  expect(atts[0].contentId).toBe('cid1');
  expect(atts[0].downloadUrl).toBe('https://d/x');
  expect(atts[0].downloaded).toBe(false);
  expect(atts[0].localPath).toBe(null);
});

test('markAttachmentDownloaded records the local path and downloaded flag', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'm1', threadId: 't1', from: 'A', subject: 'Hi', receivedAt: '2026-06-12T10:00:00Z'});
  await store.saveAttachments('m1', [{id: 'a1', filename: 'a.pdf', contentType: 'application/pdf', size: 9}]);
  await store.markAttachmentDownloaded('a1', '/cache/m1/a.pdf');
  const atts = await store.listAttachments('m1');
  expect(atts[0].downloaded).toBe(true);
  expect(atts[0].localPath).toBe('/cache/m1/a.pdf');
});

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

test('outbox persists the sentMessage so a retry can still record it', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.enqueueOutbox({
    id: 'o1',
    threadId: 't1',
    payload: {to: 'b@y', subject: 'Re: hi'},
    sentMessage: {id: 's1', threadId: 't1', from: 'me', subject: 'Re: hi', receivedAt: 'now'},
  });
  const [item] = await store.listPendingOutbox();
  expect(item.sentMessage).toEqual({id: 's1', threadId: 't1', from: 'me', subject: 'Re: hi', receivedAt: 'now'});
});

test('listInbox excludes sent messages', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'r1', threadId: 't1', from: 'A', subject: 'Hi', receivedAt: '2026-06-12T10:00:00Z'});
  await store.insertSentMessage({id: 's1', threadId: 't1', from: 'me', subject: 'Re: Hi', receivedAt: '2026-06-12T11:00:00Z'});
  const inbox = await store.listInbox();
  expect(inbox.map(m => m.id)).toEqual(['r1']);
});

test('flags: setSeen/setStarred/setArchived and filtered listing', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'a', threadId: 't1', from: 'A', subject: 'one', receivedAt: '2026-06-12T10:00:00Z'});
  await store.upsertMessage({id: 'b', threadId: 't2', from: 'B', subject: 'two', receivedAt: '2026-06-12T11:00:00Z'});
  await store.setSeen('a', true);
  await store.setStarred('b', true);
  await store.setArchived('a', true);

  expect((await store.listMessages('inbox')).map(m => m.id)).toEqual(['b']);
  expect((await store.listMessages('unread')).map(m => m.id)).toEqual(['b']);
  expect((await store.listMessages('starred')).map(m => m.id)).toEqual(['b']);
  expect((await store.listMessages('archive')).map(m => m.id)).toEqual(['a']);
  const b = (await store.listMessages('inbox'))[0];
  expect(b.starred).toBe(true);
  expect(b.seen).toBe(false);

  // Archiving a starred message removes it from Starred too.
  await store.setArchived('b', true);
  expect((await store.listMessages('starred')).map(m => m.id)).toEqual([]);
  expect((await store.listMessages('inbox')).map(m => m.id)).toEqual([]);
});

test('searchMessages matches sender, subject, and cached body', async () => {
  const store = await createLocalStore(makeFakeDb());
  await store.upsertMessage({id: 'a', threadId: 't1', from: 'Marcus', subject: 'Deal', receivedAt: '2026-06-12T10:00:00Z'});
  await store.saveBody('a', {html: '<p>contract terms</p>', text: 'contract terms'});
  await store.upsertMessage({id: 'b', threadId: 't2', from: 'Ana', subject: 'Lunch', receivedAt: '2026-06-12T11:00:00Z'});
  expect((await store.searchMessages('marc')).map(m => m.id)).toEqual(['a']);
  expect((await store.searchMessages('lunch')).map(m => m.id)).toEqual(['b']);
  expect((await store.searchMessages('contract')).map(m => m.id)).toEqual(['a']);
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
