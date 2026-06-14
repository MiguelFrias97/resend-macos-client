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

test('maps threading headers in_reply_to and references (array)', () => {
  const out = validateReceivedEmail({
    id: 'recv_2',
    from: 'a@x',
    in_reply_to: '<root@x>',
    references: ['<root@x>', '<mid@x>'],
  });
  expect(out.inReplyTo).toBe('<root@x>');
  expect(out.references).toEqual(['<root@x>', '<mid@x>']);
});

test('normalizes whitespace-separated references string to an array', () => {
  const out = validateReceivedEmail({
    id: 'recv_3',
    from: 'a@x',
    references: '<root@x>   <mid@x>\n<last@x>',
  });
  expect(out.references).toEqual(['<root@x>', '<mid@x>', '<last@x>']);
});
