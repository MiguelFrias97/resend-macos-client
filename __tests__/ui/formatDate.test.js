import {formatTime, formatDateTime} from '../../src/ui/formatDate';

test('formatTime returns empty for missing/invalid input', () => {
  expect(formatTime(null)).toBe('');
  expect(formatTime('not-a-date')).toBe('');
});

test('formatTime shows a clock time for today and never the raw ISO', () => {
  const iso = new Date().toISOString();
  const out = formatTime(iso);
  expect(out).not.toMatch(/T\d\d:\d\d/); // not the raw ISO
  expect(out.length).toBeGreaterThan(0);
});

test('formatDateTime renders a human date+time, not the ISO string', () => {
  const out = formatDateTime('2026-06-11T03:07:15.158Z');
  expect(out).not.toContain('2026-06-11T03:07:15.158Z');
  expect(out).toMatch(/\d/);
});
