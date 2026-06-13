import {NativeModules} from 'react-native';

const {Keychain} = NativeModules;
const SERVICE = 'com.resendmail.apikey';

export function setApiKey(key) {
  return Keychain.setApiKey(SERVICE, key);
}
export function getApiKey() {
  return Keychain.getApiKey(SERVICE);
}
export function clearApiKey() {
  return Keychain.clearApiKey(SERVICE);
}
