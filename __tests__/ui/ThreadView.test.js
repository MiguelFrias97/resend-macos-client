import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';

jest.mock('../../src/ui/MessageBody', () => {
  const React = require('react');
  return {__esModule: true, default: ({messageId}) => React.createElement('MockBody', {messageId})};
});

import ThreadView from '../../src/ui/ThreadView';

const messages = [
  {id: 'r', from: 'A <a@x>', direction: 'received', receivedAt: '2026-06-12T10:00:00Z'},
  {id: 's', from: 'me', direction: 'sent', receivedAt: '2026-06-12T11:00:00Z'},
];

test('renders a header per message, marking sent vs received', () => {
  const {getByText} = render(<ThreadView messages={messages} bodyDeps={{}} allowRemote={false} />);
  expect(getByText(/A <a@x>/)).toBeTruthy();
  expect(getByText('You')).toBeTruthy();
});

test('only the most recent message mounts a body by default; tapping expands others', () => {
  const {UNSAFE_getAllByType, UNSAFE_queryAllByType, getByText} = render(
    <ThreadView messages={messages} bodyDeps={{}} allowRemote={false} />,
  );
  // Only the last message ('s') is expanded → one body mounted.
  expect(UNSAFE_getAllByType('MockBody')).toHaveLength(1);
  // Expand the first message by tapping its header.
  fireEvent.press(getByText(/A <a@x>/));
  expect(UNSAFE_queryAllByType('MockBody')).toHaveLength(2);
});
