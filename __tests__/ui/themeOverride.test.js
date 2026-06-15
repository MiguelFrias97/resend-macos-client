import {getOverride, setOverride, subscribeOverride} from '../../src/ui/themeOverride';

test('override get/set with validation and subscriber notification', () => {
  setOverride('auto');
  let notified = 0;
  const unsub = subscribeOverride(() => {
    notified += 1;
  });
  setOverride('dark');
  expect(getOverride()).toBe('dark');
  setOverride('light');
  expect(getOverride()).toBe('light');
  setOverride('garbage'); // invalid → auto
  expect(getOverride()).toBe('auto');
  expect(notified).toBe(3);
  unsub();
  setOverride('dark');
  expect(notified).toBe(3); // no longer notified after unsubscribe
  setOverride('auto');
});
