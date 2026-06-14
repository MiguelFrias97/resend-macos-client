import {createLocalStore} from '../../src/data/localStore';

function makeFakeDb() {
  const rows = [];
  const attachments = [];
  return {
    async execute(sql, params = []) {
      if (/^CREATE TABLE/i.test(sql)) return {rows: []};
      if (/^INSERT INTO messages/i.test(sql)) {
        const [id, thread_id, sender, subject, received_at] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) Object.assign(existing, {thread_id, sender, subject, received_at});
        else rows.push({id, thread_id, sender, subject, received_at, seen: 0, html: null, text: null, body_fetched: 0});
        return {rows: [], rowsAffected: 1};
      }
      if (/^UPDATE messages SET html=/i.test(sql)) {
        const [html, text, id] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) Object.assign(existing, {html, text, body_fetched: 1});
        return {rows: [], rowsAffected: existing ? 1 : 0};
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
      if (/FROM messages/i.test(sql)) {
        return {rows: [...rows].sort((a, b) => (a.received_at < b.received_at ? 1 : -1))};
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
});
