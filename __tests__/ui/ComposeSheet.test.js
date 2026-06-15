import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

jest.mock('../../src/ui/Composer', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({onChange}) =>
      React.createElement('MockComposer', {onPressEmit: () => onChange({html: '<p>body</p>', inlineImages: []})}),
  };
});

import ComposeSheet from '../../src/ui/ComposeSheet';

test('compose: fills fields and sends an assembled payload', async () => {
  const onSend = jest.fn(async () => ({ok: true}));
  const {getByPlaceholderText, getByText, UNSAFE_getByType} = render(
    <ComposeSheet defaultFrom="me@you.com" onSend={onSend} onClose={() => {}} />,
  );
  fireEvent.changeText(getByPlaceholderText('To'), 'a@x.com,'); // comma commits the chip
  fireEvent.changeText(getByPlaceholderText('Subject'), 'Hello');
  UNSAFE_getByType('MockComposer').props.onPressEmit();
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(onSend).toHaveBeenCalled());
  const payload = onSend.mock.calls[0][0];
  expect(payload.from).toBe('me@you.com');
  expect(payload.to).toEqual(['a@x.com']);
  expect(payload.subject).toBe('Hello');
  expect(payload.html).toContain('body');
  await waitFor(() => expect(getByText('Sent')).toBeTruthy());
});

test('forward: prefills Fwd subject and assembles a forward payload', async () => {
  const onSend = jest.fn(async () => ({ok: true}));
  const forward = {
    original: {from: 'Marcus <marcus@acme.com>', subject: 'Deal', receivedAt: 'now'},
    originalHtml: '<p>the deal</p>',
    originalAttachments: [{filename: 'doc.pdf', content: 'BBBB', contentType: 'application/pdf'}],
  };
  const {getByPlaceholderText, getByText} = render(
    <ComposeSheet mode="forward" defaultFrom="me@you.com" forward={forward} onSend={onSend} onClose={() => {}} />,
  );
  expect(getByPlaceholderText('Subject').props.value).toBe('Fwd: Deal');
  fireEvent.changeText(getByPlaceholderText('To'), 'c@z.com,'); // comma commits the chip
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(onSend).toHaveBeenCalled());
  const payload = onSend.mock.calls[0][0];
  expect(payload.subject).toBe('Fwd: Deal');
  expect(payload.attachments).toEqual([{filename: 'doc.pdf', content: 'BBBB', content_type: 'application/pdf'}]);
});
