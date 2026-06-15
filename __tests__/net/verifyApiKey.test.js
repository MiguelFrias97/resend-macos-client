import {verifyApiKey} from '../../src/net/verifyApiKey';

function fakeFetch(status, body = {}) {
  return async () => ({status, json: async () => body});
}

test('returns ok on 200', async () => {
  expect(await verifyApiKey('re_ok', {fetchImpl: fakeFetch(200)})).toEqual({ok: true});
});

test('reports the status on a 401 (invalid/forbidden key)', async () => {
  const r = await verifyApiKey('re_bad', {fetchImpl: fakeFetch(401, {message: 'invalid'})});
  expect(r.ok).toBe(false);
  expect(r.status).toBe(401);
  expect(r.reason).toBe('invalid');
});

test('reports 404 distinctly (inbound not enabled)', async () => {
  const r = await verifyApiKey('re_x', {fetchImpl: fakeFetch(404)});
  expect(r).toMatchObject({ok: false, status: 404});
});

test('reports a network failure as status 0', async () => {
  const fetchImpl = async () => {
    throw new Error('Network request failed');
  };
  const r = await verifyApiKey('re_x', {fetchImpl});
  expect(r.ok).toBe(false);
  expect(r.status).toBe(0);
  expect(r.reason).toMatch(/Network/);
});
