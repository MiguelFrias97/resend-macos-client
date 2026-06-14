import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

jest.mock('../../src/ui/Composer', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({onChange}) =>
      React.createElement('MockComposer', {
        onPressEmit: () => onChange({html: '<p>hello</p>', inlineImages: []}),
      }),
  };
});

import ReplyComposer from '../../src/ui/ReplyComposer';

test('Send builds a reply payload and calls onSend, showing Sent', async () => {
  const onSend = jest.fn(async () => ({ok: true}));
  const original = {from: 'A <a@x>', to: ['hi@you.com'], subject: 'Hi', rfcMessageId: '<m@x>', references: [], receivedAt: 'now'};
  const {getByText, UNSAFE_getByType} = render(
    <ReplyComposer original={original} originalHtml="<p>orig</p>" onSend={onSend} />,
  );
  UNSAFE_getByType('MockComposer').props.onPressEmit(); // simulate editing
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(onSend).toHaveBeenCalled());
  const payload = onSend.mock.calls[0][0];
  expect(payload.subject).toBe('Re: Hi');
  expect(payload.html).toContain('hello');
  expect(payload.html).toContain('gmail_quote');
  await waitFor(() => expect(getByText('Sent')).toBeTruthy());
});

test('a failed send shows Retry', async () => {
  const onSend = jest.fn(async () => ({ok: false}));
  const original = {from: 'A <a@x>', to: ['hi@you.com'], subject: 'Hi', rfcMessageId: '<m@x>', references: [], receivedAt: 'now'};
  const {getByText} = render(<ReplyComposer original={original} originalHtml="" onSend={onSend} />);
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(getByText(/Retry/)).toBeTruthy());
});
