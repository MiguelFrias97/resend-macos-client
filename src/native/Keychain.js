import {NativeModules} from 'react-native';

const {Keychain} = NativeModules;
const SERVICE = 'com.resendmail.apikey';
const DB_KEY_SERVICE = 'com.resendmail.dbkey';

export function setApiKey(key) {
  return Keychain.setApiKey(SERVICE, key);
}
export function getApiKey() {
  return Keychain.getApiKey(SERVICE);
}
export function clearApiKey() {
  return Keychain.clearApiKey(SERVICE);
}

// Thrown when the Keychain item exists but can't be read (access denied, e.g.
// the user clicked "Deny" on the prompt an ad-hoc-signed build triggers, or the
// keychain is locked). Distinct from "absent", which is a normal first run.
export class KeychainAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'KeychainAccessError';
    this.code = 'KEYCHAIN_DENIED';
  }
}

// Return the at-rest DB encryption key, creating and persisting a random one
// (CSPRNG, 32 bytes) on first use. Stored in its own Keychain item with the same
// ThisDeviceOnly accessibility as the API key (no iCloud sync).
//
// getApiKey resolves null when the item is absent (first run) but rejects when
// the read itself fails — we surface that as KeychainAccessError so the caller
// can show a clear "couldn't unlock your cache" message and offer Retry, rather
// than silently minting a second key that orphans the existing encrypted DB.
export async function getOrCreateDbKey() {
  let key;
  try {
    key = await Keychain.getApiKey(DB_KEY_SERVICE);
  } catch (e) {
    throw new KeychainAccessError(
      'Could not read the local-cache key from the Keychain',
    );
  }
  if (!key) {
    key = await Keychain.randomKey(32);
    await Keychain.setApiKey(DB_KEY_SERVICE, key);
  }
  return key;
}
