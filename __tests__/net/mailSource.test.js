import {createMailSource} from '../../src/net/mailSource';
import {receivedListPage} from '../../__mocks__/resendFixtures';

test('listReceived returns validated, normalized messages', async () => {
  const fetchImpl = async () => ({status: 200, json: async () => receivedListPage});
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const msgs = await source.listReceived({limit: 20});
  expect(msgs[0].id).toBe('recv_1');
  expect(msgs[0].subject).toBe('Re: contract');
});

test('skips a malformed item but keeps the valid ones and calls onSkip', async () => {
  const body = {
    data: [
      {id: 'recv_1', from: 'a@x', subject: 'ok'},
      {id: 'recv_2', subject: 'broken'}, // missing from
      {id: 'recv_3', from: 'c@x', subject: 'ok2'},
    ],
  };
  const fetchImpl = async () => ({status: 200, json: async () => body});
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const skipped = [];
  const msgs = await source.listReceived({onSkip: raw => skipped.push(raw)});
  expect(msgs.map(m => m.id)).toEqual(['recv_1', 'recv_3']);
  expect(skipped).toHaveLength(1);
  expect(skipped[0].id).toBe('recv_2');
});

test('listAllReceived pages through via the after cursor and stops on a partial page', async () => {
  const page1 = {
    data: Array.from({length: 2}, (_, i) => ({
      id: `p1_${i}`,
      from: 'a@x',
      subject: 's',
    })),
  };
  const page2 = {data: [{id: 'p2_0', from: 'b@x', subject: 's'}]};
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const u = new URL(url);
    const body = u.searchParams.get('after') ? page2 : page1;
    return {status: 200, json: async () => body};
  };
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const msgs = await source.listAllReceived({pageSize: 2});
  expect(msgs.map(m => m.id)).toEqual(['p1_0', 'p1_1', 'p2_0']);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain('after=p1_1');
});

test('getReceivedEmail returns normalized body content', async () => {
  const fetchImpl = async () => ({status: 200, json: async () => ({id: 'recv_1', html: '<p>Hi</p>', text: 'Hi', headers: {}, attachments: []})});
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const body = await source.getReceivedEmail('recv_1');
  expect(body.html).toBe('<p>Hi</p>');
});

test('getAttachment returns metadata with downloadUrl', async () => {
  const fetchImpl = async () => ({status: 200, json: async () => ({id: 'a1', filename: 'a.pdf', content_type: 'application/pdf', size: 9, download_url: 'https://d/x'})});
  const source = createMailSource({apiKey: 're_x', fetchImpl});
  const a = await source.getAttachment('recv_1', 'a1');
  expect(a.downloadUrl).toBe('https://d/x');
});
