import {maybeInitLoginItem} from '../../src/core/loginItemInit';

test('enables the login item once on first run and records the flag', async () => {
  const store = {};
  const setEnabled = jest.fn(async () => true);
  const getSetting = jest.fn(async k => store[k]);
  const setSetting = jest.fn(async (k, v) => {
    store[k] = v;
  });
  const first = await maybeInitLoginItem({getSetting, setSetting, setEnabled});
  expect(first).toBe(true);
  expect(setEnabled).toHaveBeenCalledWith(true);
  expect(store.loginItemInitialized).toBe('1');
});

test('does not re-enable on later runs', async () => {
  const setEnabled = jest.fn(async () => true);
  const getSetting = jest.fn(async () => '1');
  const setSetting = jest.fn();
  const res = await maybeInitLoginItem({getSetting, setSetting, setEnabled});
  expect(res).toBe(false);
  expect(setEnabled).not.toHaveBeenCalled();
});

test('still records the flag when enabling throws (ad-hoc build)', async () => {
  const store = {};
  const setEnabled = jest.fn(async () => {
    throw new Error('ad-hoc');
  });
  const getSetting = jest.fn(async k => store[k]);
  const setSetting = jest.fn(async (k, v) => {
    store[k] = v;
  });
  const res = await maybeInitLoginItem({getSetting, setSetting, setEnabled});
  expect(res).toBe(true);
  expect(store.loginItemInitialized).toBe('1');
});
