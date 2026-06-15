import {
  parseRecipients, forwardSubject, assembleComposePayload, assembleForwardPayload, isEmail,
} from '../../src/compose/assembleCompose';

test('isEmail validates basic address shape', () => {
  expect(isEmail('a@x.com')).toBe(true);
  expect(isEmail('Name <a@x.com>')).toBe(false); // expects a bare address
  expect(isEmail('bob')).toBe(false);
  expect(isEmail('')).toBe(false);
});

test('parseRecipients splits and unwraps addresses', () => {
  expect(parseRecipients('a@x')).toEqual(['a@x']);
  expect(parseRecipients('A <a@x>, b@y')).toEqual(['a@x', 'b@y']);
  expect(parseRecipients('a@x; b@y')).toEqual(['a@x', 'b@y']);
  expect(parseRecipients(['A <a@x>', 'b@y'])).toEqual(['a@x', 'b@y']); // array input
  expect(parseRecipients('')).toEqual([]);
});

test('assembleComposePayload adds cc/bcc only when present', () => {
  const base = assembleComposePayload({from: 'me@you.com', to: ['a@x'], subject: 'Hi', html: '<p>x</p>'});
  expect(base.cc).toBeUndefined();
  expect(base.bcc).toBeUndefined();
  const full = assembleComposePayload({
    from: 'me@you.com', to: ['a@x'], cc: ['c@z'], bcc: 'd@w', subject: 'Hi', html: '<p>x</p>',
  });
  expect(full.cc).toEqual(['c@z']);
  expect(full.bcc).toEqual(['d@w']);
});

test('forwardSubject prefixes Fwd: once', () => {
  expect(forwardSubject('Deal')).toBe('Fwd: Deal');
  expect(forwardSubject('Fwd: Deal')).toBe('Fwd: Deal');
  expect(forwardSubject(null)).toBe('Fwd:');
});

test('assembleComposePayload builds a payload with inline images', () => {
  const p = assembleComposePayload({
    from: 'Me <me@you.com>',
    to: 'a@x, b@y',
    subject: 'Hello',
    html: '<p>hi</p>',
    inlineImages: [{contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'}],
  });
  expect(p.from).toBe('me@you.com');
  expect(p.to).toEqual(['a@x', 'b@y']);
  expect(p.subject).toBe('Hello');
  expect(p.html).toBe('<p>hi</p>');
  expect(p.attachments).toEqual([
    {filename: 'p.png', content: 'AAAA', content_type: 'image/png', content_id: 'img_1'},
  ]);
});

test('assembleForwardPayload quotes the original and re-attaches files as base64 content', () => {
  const original = {from: 'Marcus <marcus@acme.com>', subject: 'Deal', receivedAt: 'now'};
  const p = assembleForwardPayload({
    from: 'me@you.com',
    to: 'c@z',
    original,
    originalHtml: '<p>the deal</p>',
    replyHtml: '<p>see below</p>',
    originalAttachments: [{filename: 'doc.pdf', content: 'BBBB', contentType: 'application/pdf'}],
  });
  expect(p.from).toBe('me@you.com');
  expect(p.to).toEqual(['c@z']);
  expect(p.subject).toBe('Fwd: Deal');
  expect(p.html).toContain('see below');
  expect(p.html).toContain('gmail_quote');
  expect(p.attachments).toEqual([
    {filename: 'doc.pdf', content: 'BBBB', content_type: 'application/pdf'},
  ]);
});
