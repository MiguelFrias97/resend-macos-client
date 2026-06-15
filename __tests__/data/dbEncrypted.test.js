// Verifies the at-rest encryption open path + legacy-plaintext migration.
// op-sqlite and the native Keychain are mocked (lazy-required inside db.js).
// jest hoists jest.mock above declarations, so shared state must be `mock`-prefixed.

let mockSqlcipher = true;
let mockOpenCalls = [];
let mockDeleteCalls = [];
let mockProbeShouldFail = false;

jest.mock('@op-engineering/op-sqlite', () => ({
  isSQLCipher: () => mockSqlcipher,
  open: jest.fn(params => {
    mockOpenCalls.push(params);
    let firstProbe = true;
    return {
      execute: jest.fn(async () => {
        if (mockProbeShouldFail && firstProbe) {
          firstProbe = false;
          throw new Error('file is not a database');
        }
        return {rows: [{c: 0}]};
      }),
      delete: jest.fn(() => mockDeleteCalls.push(true)),
    };
  }),
}));

jest.mock('../../src/native/Keychain', () => ({
  getOrCreateDbKey: jest.fn(async () => 'deadbeef'),
}));

const {openEncryptedDb} = require('../../src/data/db');

beforeEach(() => {
  mockSqlcipher = true;
  mockOpenCalls = [];
  mockDeleteCalls = [];
  mockProbeShouldFail = false;
});

test('opens with the Keychain encryption key', async () => {
  await openEncryptedDb({name: 'x.sqlite'});
  expect(mockOpenCalls).toHaveLength(1);
  expect(mockOpenCalls[0].encryptionKey).toBe('deadbeef');
});

test('migrates a legacy plaintext cache: drop + reopen', async () => {
  mockProbeShouldFail = true;
  await openEncryptedDb({name: 'x.sqlite'});
  expect(mockDeleteCalls).toHaveLength(1); // old plaintext file removed
  expect(mockOpenCalls).toHaveLength(2); // reopened encrypted
});

test('refuses to open if the native build lacks SQLCipher (no silent plaintext)', async () => {
  mockSqlcipher = false;
  await expect(openEncryptedDb({name: 'x.sqlite'})).rejects.toThrow(/SQLCipher/);
  expect(mockOpenCalls).toHaveLength(0);
});
