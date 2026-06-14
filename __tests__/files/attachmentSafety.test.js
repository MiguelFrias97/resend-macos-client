import {sanitizeFilename, isDangerousFilename, typeMismatch} from '../../src/files/attachmentSafety';

test('sanitizeFilename strips path traversal, control chars, and RTL override', () => {
  expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  expect(sanitizeFilename('a b.txt')).toBe('ab.txt');
  expect(sanitizeFilename('invoice‮gpj.exe')).toBe('invoicegpj.exe');
});

test('isDangerousFilename flags executables and double extensions', () => {
  expect(isDangerousFilename('setup.app')).toBe(true);
  expect(isDangerousFilename('invoice.pdf.command')).toBe(true);
  expect(isDangerousFilename('photo.png')).toBe(false);
});

test('typeMismatch flags declared-type vs extension disagreement', () => {
  expect(typeMismatch('application/pdf', 'thing.exe')).toBe(true);
  expect(typeMismatch('application/pdf', 'thing.pdf')).toBe(false);
});

test('typeMismatch does not flag a file that has no extension', () => {
  expect(typeMismatch('image/png', 'screenshot')).toBe(false);
});
