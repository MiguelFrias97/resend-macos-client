import {createResendClient} from '../../src/net/resendClient';

function capture() {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({url, opts});
    return {status: 200, json: async () => ({})};
  };
  return {calls, fetchImpl};
}

test('GET sends no Content-Type (bodyless requests must not declare a JSON body)', async () => {
  const {calls, fetchImpl} = capture();
  const client = createResendClient({apiKey: 're_x', fetchImpl});
  await client.request('/emails/receiving?limit=1');
  const h = calls[0].opts.headers;
  expect(h.Authorization).toBe('Bearer re_x');
  expect(h['Content-Type']).toBeUndefined();
  expect(calls[0].opts.body).toBeUndefined();
});

test('POST with a body sends Content-Type and a JSON-stringified body', async () => {
  const {calls, fetchImpl} = capture();
  const client = createResendClient({apiKey: 're_x', fetchImpl});
  await client.request('/emails', {method: 'POST', body: {to: 'a@b.com'}});
  const {opts} = calls[0];
  expect(opts.headers['Content-Type']).toBe('application/json');
  expect(opts.headers.Authorization).toBe('Bearer re_x');
  expect(opts.body).toBe(JSON.stringify({to: 'a@b.com'}));
});

test('trims whitespace/newlines from the API key (pasted-key 400 fix)', async () => {
  const {calls, fetchImpl} = capture();
  const client = createResendClient({apiKey: '  re_paste\n', fetchImpl});
  await client.request('/emails/receiving?limit=1');
  expect(calls[0].opts.headers.Authorization).toBe('Bearer re_paste');
});

test('caller headers cannot clobber the Authorization credential', async () => {
  const {calls, fetchImpl} = capture();
  const client = createResendClient({apiKey: 're_real', fetchImpl});
  await client.request('/emails', {
    method: 'POST',
    body: {x: 1},
    headers: {Authorization: 'Bearer attacker', 'Idempotency-Key': 'k1'},
  });
  const h = calls[0].opts.headers;
  expect(h.Authorization).toBe('Bearer re_real');
  expect(h['Idempotency-Key']).toBe('k1');
});
