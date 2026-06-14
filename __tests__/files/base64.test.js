import {arrayBufferToBase64} from '../../src/files/base64';

function bufOf(bytes) {
  return new Uint8Array(bytes).buffer;
}

test('encodes "Hi" (2 bytes) with one pad', () => {
  expect(arrayBufferToBase64(bufOf([72, 105]))).toBe('SGk=');
});

test('encodes a single byte with two pads', () => {
  expect(arrayBufferToBase64(bufOf([72]))).toBe('SA==');
});

test('encodes a 3-byte group with no pad', () => {
  expect(arrayBufferToBase64(bufOf([77, 97, 110]))).toBe('TWFu');
});

test('empty buffer is empty string', () => {
  expect(arrayBufferToBase64(bufOf([]))).toBe('');
});
