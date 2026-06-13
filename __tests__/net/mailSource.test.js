import {createMailSource} from '../../src/net/mailSource';
import {receivedListPage} from '../../__mocks__/resendFixtures';

test('listReceived returns validated, normalized messages', async () => {
  const fetchImpl = async () => ({status: 200, json: async () => receivedListPage});
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const msgs = await source.listReceived({limit: 20});
  expect(msgs[0].id).toBe('recv_1');
  expect(msgs[0].subject).toBe('Re: contract');
});
