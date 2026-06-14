import {verifyApiKey} from '../../src/net/verifyApiKey';

function fakeFetch(status) {
  return async () => ({status, json: async () => ({})});
}

test('returns true on 200', async () => {
  expect(await verifyApiKey('re_ok', {fetchImpl: fakeFetch(200)})).toBe(true);
});

test('returns false on 401', async () => {
  expect(await verifyApiKey('re_bad', {fetchImpl: fakeFetch(401)})).toBe(false);
});
