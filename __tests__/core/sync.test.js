import {syncOnce, startSyncLoop} from '../../src/core/sync';

test('syncOnce pulls from source and upserts with thread ids', async () => {
  const source = {
    listReceived: async () => [
      {id: 'recv_1', from: 'a@x', to: ['b@y'], subject: 'Re: Deal', rfcMessageId: '<b@y>', references: ['<a@x>'], inReplyTo: '<a@x>', receivedAt: '2026-06-12T14:14:00Z'},
    ],
  };
  const upserts = [];
  const store = {
    upsertMessage: async m => upserts.push(m),
    listInbox: async () => upserts,
  };
  const count = await syncOnce({source, store});
  expect(count).toBe(1);
  expect(upserts[0].threadId).toBeTruthy();
});

test('processes oldest-first so a reply threads onto its root in one pass', async () => {
  const root = {
    id: 'recv_root',
    from: 'a@x',
    to: ['b@y'],
    subject: 'Deal',
    rfcMessageId: '<root@x>',
    references: [],
    inReplyTo: null,
    receivedAt: '2026-06-12T10:00:00Z',
  };
  const reply = {
    id: 'recv_reply',
    from: 'b@y',
    to: ['a@x'],
    subject: 'Re: Deal',
    rfcMessageId: '<reply@y>',
    references: ['<root@x>'],
    inReplyTo: '<root@x>',
    receivedAt: '2026-06-12T11:00:00Z',
  };
  // Source returns reply (newer) BEFORE root (older).
  const source = {listReceived: async () => [reply, root]};
  const upserts = [];
  const store = {upsertMessage: async m => upserts.push(m)};
  await syncOnce({source, store});
  const byId = Object.fromEntries(upserts.map(m => [m.id, m]));
  expect(byId.recv_reply.threadId).toBe(byId.recv_root.threadId);
});

test('syncOnce reports only not-yet-seen messages via onNewMessages', async () => {
  const source = {
    listReceived: async () => [
      {id: 'a', from: 'x', to: ['y'], subject: 's', rfcMessageId: null, references: [], inReplyTo: null, receivedAt: '2026-06-12T10:00:00Z'},
    ],
  };
  const store = {upsertMessage: async () => {}};
  const knownIds = new Set();
  const fresh = [];
  await syncOnce({source, store, knownIds, onNewMessages: ms => fresh.push(...ms)});
  expect(fresh.map(m => m.id)).toEqual(['a']);
  fresh.length = 0;
  await syncOnce({source, store, knownIds, onNewMessages: ms => fresh.push(...ms)});
  expect(fresh).toEqual([]);
});

test('startSyncLoop calls onError when syncOnce throws', async () => {
  const source = {
    listReceived: async () => {
      throw new Error('boom');
    },
  };
  const store = {upsertMessage: async () => {}};
  const errors = [];
  const stop = startSyncLoop({
    source,
    store,
    schedule: () => 0,
    onError: e => errors.push(e),
  });
  // Let the initial tick's promise settle.
  await Promise.resolve();
  await Promise.resolve();
  stop();
  expect(errors).toHaveLength(1);
  expect(errors[0].message).toBe('boom');
});
