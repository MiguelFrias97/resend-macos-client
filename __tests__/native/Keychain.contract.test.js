jest.mock('react-native', () => ({
  NativeModules: {
    Keychain: {
      setApiKey: jest.fn(async () => true),
      getApiKey: jest.fn(async () => 're_test_123'),
      clearApiKey: jest.fn(async () => true),
    },
  },
}));

import {setApiKey, getApiKey, clearApiKey} from '../../src/native/Keychain';

test('wrapper delegates to the native module', async () => {
  await setApiKey('re_abc');
  expect(await getApiKey()).toBe('re_test_123');
  await clearApiKey();
});
