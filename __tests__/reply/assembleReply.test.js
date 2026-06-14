import {
  replySubject, extractEmail, replyHeaders, quoteOriginal, assembleReplyPayload,
} from '../../src/reply/assembleReply';

test('replySubject adds Re: once', () => {
  expect(replySubject('Hello')).toBe('Re: Hello');
  expect(replySubject('Re: Hello')).toBe('Re: Hello');
  expect(replySubject('RE: Hello')).toBe('RE: Hello');
  expect(replySubject(null)).toBe('Re:');
});

test('extractEmail pulls the address out of a formatted from', () => {
  expect(extractEmail('Marcus Lee <marcus@acme.com>')).toBe('marcus@acme.com');
  expect(extractEmail('plain@x.com')).toBe('plain@x.com');
});

test('replyHeaders sets In-Reply-To and threads References', () => {
  expect(replyHeaders({rfcMessageId: '<b@y>', references: ['<a@x>']})).toEqual({
    'In-Reply-To': '<b@y>',
    References: '<a@x> <b@y>',
  });
  expect(replyHeaders({rfcMessageId: null, references: []})).toEqual({});
});

test('quoteOriginal wraps the original in a gmail_quote block', () => {
  const q = quoteOriginal({from: 'A <a@x>', receivedAt: '2026-06-12T14:00:00Z'}, '<p>hi</p>');
  expect(q).toContain('gmail_quote');
  expect(q).toContain('<p>hi</p>');
  expect(q).toMatch(/wrote:/);
});

test('assembleReplyPayload builds a complete Resend send payload', () => {
  const original = {
    from: 'Marcus <marcus@acme.com>',
    to: ['hi@you.com'],
    subject: 'Deal',
    rfcMessageId: '<m1@acme.com>',
    references: [],
    receivedAt: '2026-06-12T14:00:00Z',
  };
  const payload = assembleReplyPayload({
    original,
    replyHtml: '<p>Sounds good</p>',
    originalHtml: '<p>the deal</p>',
    inlineImages: [{contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'}],
    attachments: [{filename: 'doc.pdf', content: 'BBBB', content_type: 'application/pdf'}],
  });
  expect(payload.from).toBe('hi@you.com');
  expect(payload.to).toBe('marcus@acme.com');
  expect(payload.subject).toBe('Re: Deal');
  expect(payload.headers).toEqual({'In-Reply-To': '<m1@acme.com>', References: '<m1@acme.com>'});
  expect(payload.html).toContain('Sounds good');
  expect(payload.html).toContain('gmail_quote');
  expect(payload.attachments).toEqual([
    {filename: 'p.png', content: 'AAAA', content_type: 'image/png', content_id: 'img_1'},
    {filename: 'doc.pdf', content: 'BBBB', content_type: 'application/pdf'},
  ]);
});
