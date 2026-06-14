import {makeTheme} from '../../src/ui/theme';

test('light is the default; dark switches the palette', () => {
  expect(makeTheme('light').scheme).toBe('light');
  expect(makeTheme('dark').scheme).toBe('dark');
  expect(makeTheme('light').bg).not.toBe(makeTheme('dark').bg);
  expect(makeTheme('weird').scheme).toBe('light');
});

test('accent is injected and defaults when absent', () => {
  expect(makeTheme('light', '#aabbcc').accent).toBe('#aabbcc');
  expect(typeof makeTheme('light').accent).toBe('string');
});
