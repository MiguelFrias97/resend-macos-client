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

// Return the at-rest DB encryption key, creating and persisting a random one
// (CSPRNG, 32 bytes) on first use. Stored in its own Keychain item with the same
// ThisDeviceOnly accessibility as the API key (no iCloud sync).
export async function getOrCreateDbKey() {
  let key = await Keychain.getApiKey(DB_KEY_SERVICE);
  if (!key) {
    key = await Keychain.randomKey(32);
    await Keychain.setApiKey(DB_KEY_SERVICE, key);
  }
  return key;
}
