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

test('processOutbox does not retry permanent 4xx errors', async () => {
  const store = fakeStore();
  await store.enqueueOutbox({id: 'o1', payload: {}, sentMessage: {id: 's1'}});
  store.items[0].status = 'failed';
  let calls = 0;
  const sender = {
    send: async () => {
      calls += 1;
      const e = new Error('send failed: 422 invalid from');
      e.status = 422;
      throw e;
    },
  };
  // A 422 is terminal: the item is marked failed past the retry cap, so a second
  // processOutbox pass must NOT call the sender again.
  await processOutbox({store, sender});
  await processOutbox({store, sender});
  expect(calls).toBe(1);
  expect(store.items[0].status).toBe('failed');
});

test('processOutbox still retries transient 5xx errors', async () => {
  const store = fakeStore();
  await store.enqueueOutbox({id: 'o1', payload: {}, sentMessage: {id: 's1'}});
  store.items[0].status = 'failed';
  let calls = 0;
  const sender = {
    send: async () => {
      calls += 1;
      const e = new Error('send failed: 503');
      e.status = 503;
      throw e;
    },
  };
  await processOutbox({store, sender});
  await processOutbox({store, sender});
  expect(calls).toBe(2); // retried
});
