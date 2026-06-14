import {createLocalStore} from '../../src/data/localStore';

function makeFakeDb() {
  const rows = [];
  return {
    async execute(sql, params = []) {
      if (/^CREATE TABLE/i.test(sql)) return {rows: []};
      if (/^INSERT INTO messages/i.test(sql)) {
        const [id, thread_id, sender, subject, received_at] = params;
        const existing = rows.find(r => r.id === id);
        if (existing) Object.assign(existing, {thread_id, sender, subject, received_at});
        else rows.push({id, thread_id, sender, subject, received_at, seen: 0});
        return {rows: [], rowsAffected: 1};
      }
      if (/^SELECT .* FROM messages/i.test(sql)) {
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
