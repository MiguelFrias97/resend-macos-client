import {threadIdFor} from '../../src/core/threading';

test('messages in the same reference chain share a thread id', () => {
  const root = {rfcMessageId: '<a@x>', references: [], inReplyTo: null, subject: 'Deal', from: 'a@x', to: ['b@y']};
  const reply = {rfcMessageId: '<b@y>', references: ['<a@x>'], inReplyTo: '<a@x>', subject: 'Re: Deal', from: 'b@y', to: ['a@x']};
  expect(threadIdFor(reply, {'<a@x>': threadIdFor(root, {})})).toBe(threadIdFor(root, {}));
});

test('falls back to normalized subject + participants when no headers', () => {
  const a = {rfcMessageId: null, references: [], inReplyTo: null, subject: 'Lunch', from: 'a@x', to: ['b@y']};
  const b = {rfcMessageId: null, references: [], inReplyTo: null, subject: 'RE: Lunch', from: 'b@y', to: ['a@x']};
  expect(threadIdFor(a, {})).toBe(threadIdFor(b, {}));
});
