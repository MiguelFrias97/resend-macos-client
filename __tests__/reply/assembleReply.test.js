import {
  replySubject, extractEmail, replyHeaders, quoteOriginal, assembleReplyPayload,
  replyPayloadError,
} from '../../src/reply/assembleReply';

test('extractEmail takes the first address from a comma list', () => {
  expect(extractEmail('a@x, b@y')).toBe('a@x');
  expect(extractEmail('A <a@x>, B <b@y>')).toBe('a@x');
});

test('quoteOriginal strips scripts and remote images from the quoted body', () => {
  const q = quoteOriginal(
    {from: 'A <a@x>', receivedAt: 'now'},
    '<p>hi</p><script>evil()</script><img src="https://tracker/x.gif">',
  );
  expect(q).not.toMatch(/<script/i);
  expect(q).not.toContain('tracker/x.gif');
  expect(q).not.toMatch(/<img/i);
  expect(q).toContain('<p>hi</p>');
});

test('quoteOriginal escapes the sender in the attribution', () => {
  const q = quoteOriginal({from: 'Evil <a@x> <b>', receivedAt: 'now'}, '');
  expect(q).toContain('&lt;b&gt;');
});

test('replyPayloadError flags a missing or malformed From or To', () => {
  expect(replyPayloadError({from: '', to: 'b@y.com'})).toMatch(/from/i);
  expect(replyPayloadError({from: 'a@x.com', to: ''})).toMatch(/recipient/i);
  expect(replyPayloadError({from: 'a@x.com', to: 'b@y.com'})).toBe(null);
  // Malformed / header-injecting addresses derived from the received email are
  // rejected at the reply send-time gate (not just empty ones).
  expect(replyPayloadError({from: 'a@x.com\r\nBcc: e@v.com', to: 'b@y.com'})).toMatch(/From/);
  expect(replyPayloadError({from: 'a@x.com', to: 'not-an-email'})).toMatch(/recipient/i);
});

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

test('replyHeaders rejects header injection in Message-ID and References', () => {
  // A received Message-ID carrying a CRLF + extra header must not produce a
  // usable In-Reply-To (it would otherwise inject a Bcc on the outbound side).
  expect(replyHeaders({rfcMessageId: '<b@y>\r\nBcc: victim@evil.com'})).toEqual({});
  // A reference entry with a newline is dropped; the clean id still threads.
  expect(
    replyHeaders({rfcMessageId: '<b@y>', references: ['<a@x>', '<evil@x>\r\nX: y']}),
  ).toEqual({'In-Reply-To': '<b@y>', References: '<a@x> <b@y>'});
});

test('replySubject and extractEmail strip CR/LF (no header smuggling)', () => {
  expect(replySubject('Deal\r\nBcc: x@y.com')).toBe('Re: DealBcc: x@y.com');
  expect(replySubject('Deal\r\nBcc: x@y.com')).not.toMatch(/[\r\n]/);
  expect(extractEmail('a@x.com\r\nBcc: victim@evil.com')).not.toMatch(/[\r\n]/);
});

test('sanitizeMessageId rejects unicode line/space separators (NEL, U+2028)', () => {
  const {sanitizeMessageId} = require('../../src/reply/assembleReply');
  expect(sanitizeMessageId('<a@x>')).toBe('<a@x>');
  expect(sanitizeMessageId('<a@x\u0085b>')).toBe(null); // NEL
  expect(sanitizeMessageId('<a@x\u2028b>')).toBe(null); // line separator
  expect(sanitizeMessageId('<a,b@x>')).toBe(null); // comma
})

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

test('reply From uses the received-at address, falling back to a configured identity', () => {
  // Normal: From = the address the mail was received at (original.to[0]).
  const a = assembleReplyPayload({
    original: {from: 'Them <them@acme.com>', to: ['sender@example.com'], subject: 'Hi'},
    replyHtml: '<p>x</p>',
    originalHtml: '',
  });
  expect(a.from).toBe('sender@example.com');
  expect(a.to).toBe('them@acme.com');

  // Legacy message with no stored recipient: fall back to the passed identity.
  const b = assembleReplyPayload({
    original: {from: 'Them <them@acme.com>', to: [], subject: 'Hi'},
    replyHtml: '<p>x</p>',
    originalHtml: '',
    from: 'me@mydomain.com',
  });
  expect(b.from).toBe('me@mydomain.com');
});
