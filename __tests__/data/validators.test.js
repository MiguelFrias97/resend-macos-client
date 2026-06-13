import {validateReceivedEmail} from '../../src/data/validators';
import {receivedListPage} from '../../__mocks__/resendFixtures';

test('accepts a well-formed received email and normalizes it', () => {
  const out = validateReceivedEmail(receivedListPage.data[0]);
  expect(out.id).toBe('recv_1');
  expect(out.to).toEqual(['hi@you.com']);
  expect(out.hasAttachments).toBe(true);
});

test('throws on a payload missing id', () => {
  expect(() => validateReceivedEmail({subject: 'x'})).toThrow(/id/);
});
