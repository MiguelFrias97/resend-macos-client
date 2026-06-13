import {syncOnce} from '../../src/core/sync';

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
