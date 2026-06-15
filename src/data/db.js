// Real database handle backed by the native op-sqlite module.
//
// The native module is lazy-required inside openDb so that importing this
// file (e.g. to use the openTestDb seam below) does not force the native
// binding to load. That keeps the test seam runnable under plain Node/Jest
// without a simulator.
export function openDb({name = 'resendmail.sqlite', location} = {}) {
  const {open} = require('@op-engineering/op-sqlite');
  return open({name, location});
}

// Open the local cache encrypted at rest (SQLCipher). The encryption key is a
// CSPRNG value kept in the Keychain (ThisDeviceOnly), never on disk. The cache
// holds received message bodies/subjects/senders; the API key is never in it.
//
// Migration: a pre-encryption plaintext DB can't be opened with a key, so if the
// first probe query fails we drop and recreate the file — the cache is
// disposable (it's rebuilt from Resend on the next sync).
export async function openEncryptedDb({name = 'resendmail.sqlite', location} = {}) {
  const op = require('@op-engineering/op-sqlite');
  const {getOrCreateDbKey} = require('../native/Keychain');
  const encryptionKey = await getOrCreateDbKey();
  if (op.isSQLCipher && !op.isSQLCipher()) {
    // The native build didn't link SQLCipher — fail loud rather than silently
    // writing plaintext while claiming encryption.
    throw new Error('SQLCipher not enabled in the native build; refusing to open an unencrypted cache');
  }
  let db = op.open({name, location, encryptionKey});
  try {
    await db.execute('SELECT count(*) FROM sqlite_master');
  } catch (e) {
    try {
      db.delete();
    } catch (e2) {
      // best-effort; recreate below regardless
    }
    db = op.open({name, location, encryptionKey});
  }
  return db;
}

// Test seam: a tiny in-memory fake honoring the subset of the API we use.
export function openTestDb() {
  const tables = {};
  return {
    async execute(sql, params = []) {
      if (/SELECT 1 \+ 1 AS two/i.test(sql)) {
        return {rows: [{two: 2}]};
      }
      return {rows: [], rowsAffected: 0, tables, params};
    },
  };
}
