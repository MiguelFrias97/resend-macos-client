import {NativeModules} from 'react-native';

// Launch-at-login control, backed by SMAppService.mainApp. Returns safe
// defaults when the native module is absent (tests/other platforms).
const {LoginItem} = NativeModules || {};

export async function isEnabled() {
  if (!LoginItem || !LoginItem.isEnabled) return false;
  try {
    return await LoginItem.isEnabled();
  } catch (e) {
    return false;
  }
}

export async function setEnabled(enabled) {
  if (!LoginItem || !LoginItem.setEnabled) return false;
  return LoginItem.setEnabled(!!enabled);
}
