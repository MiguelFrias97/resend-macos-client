jest.mock('react-native', () => ({
  NativeModules: {
    LoginItem: {
      isEnabled: jest.fn(async () => true),
      setEnabled: jest.fn(async () => false),
    },
  },
}));

import {NativeModules} from 'react-native';
import {isEnabled, setEnabled} from '../../src/native/LoginItem';

test('isEnabled delegates to the native module', async () => {
  expect(await isEnabled()).toBe(true);
});

test('setEnabled coerces to a boolean and delegates', async () => {
  await setEnabled(1);
  expect(NativeModules.LoginItem.setEnabled).toHaveBeenCalledWith(true);
});

test('isEnabled resolves false when the native call rejects', async () => {
  NativeModules.LoginItem.isEnabled.mockRejectedValueOnce(new Error('nope'));
  expect(await isEnabled()).toBe(false);
});
