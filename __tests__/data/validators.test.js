import {
  validateReceivedEmail,
  validateReceivedEmailContent,
  validateAttachmentMeta,
} from '../../src/data/validators';
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

test('validateReceivedEmailContent extracts in-reply-to/references from headers (case-insensitive)', () => {
  const out = validateReceivedEmailContent({
    id: 'm',
    html: '<p>x</p>',
    text: 'x',
    headers: {'In-Reply-To': '<a@x>', References: '<root@x> <a@x>'},
    attachments: [],
  });
  expect(out.inReplyTo).toBe('<a@x>');
  expect(out.references).toEqual(['<root@x>', '<a@x>']);
});

test('validateReceivedEmailContent normalizes body + headers + attachments', () => {
  const out = validateReceivedEmailContent({
    id: 'recv_1',
    html: '<p>Hi</p>',
    text: 'Hi',
    headers: {'in-reply-to': '<a@x>'},
    attachments: [{id: 'att_1', filename: 'a.pdf', content_type: 'application/pdf', size: 9, content_id: 'cid1'}],
  });
  expect(out.html).toBe('<p>Hi</p>');
  expect(out.text).toBe('Hi');
  expect(out.attachments[0].contentId).toBe('cid1');
});

test('validateAttachmentMeta requires id and maps download_url', () => {
  const a = validateAttachmentMeta({id: 'att_1', filename: 'a.pdf', content_type: 'application/pdf', size: 9, download_url: 'https://d/x'});
  expect(a.downloadUrl).toBe('https://d/x');
  expect(a.filename).toBe('a.pdf');
});
