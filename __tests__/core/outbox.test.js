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
