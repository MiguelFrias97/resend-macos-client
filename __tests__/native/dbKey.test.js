// Unit tests for getOrCreateDbKey: absent (first run) mints a key, present
// returns it, and a denied read surfaces KeychainAccessError (not a silent new
// key that would orphan the existing encrypted DB).

jest.mock('react-native', () => ({
  NativeModules: {
    Keychain: {
      getApiKey: jest.fn(),
      setApiKey: jest.fn(async () => true),
      randomKey: jest.fn(async () => 'newkey'),
    },
  },
}));

const {NativeModules} = require('react-native');
const {getOrCreateDbKey, KeychainAccessError} = require('../../src/native/Keychain');

beforeEach(() => {
  jest.clearAllMocks();
});

test('returns the existing key when present', async () => {
  NativeModules.Keychain.getApiKey.mockResolvedValue('existing-key');
  await expect(getOrCreateDbKey()).resolves.toBe('existing-key');
  expect(NativeModules.Keychain.randomKey).not.toHaveBeenCalled();
});

test('mints and persists a new key when absent (first run)', async () => {
  NativeModules.Keychain.getApiKey.mockResolvedValue(null);
  await expect(getOrCreateDbKey()).resolves.toBe('newkey');
  expect(NativeModules.Keychain.setApiKey).toHaveBeenCalledWith(
    'com.resendmail.dbkey',
    'newkey',
  );
});

test('raises KeychainAccessError on a denied read (does not mint a new key)', async () => {
  NativeModules.Keychain.getApiKey.mockRejectedValue(new Error('status -25293'));
  await expect(getOrCreateDbKey()).rejects.toBeInstanceOf(KeychainAccessError);
  await expect(getOrCreateDbKey()).rejects.toHaveProperty('code', 'KEYCHAIN_DENIED');
  expect(NativeModules.Keychain.randomKey).not.toHaveBeenCalled();
});
