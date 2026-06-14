import React from 'react';
import {render} from '@testing-library/react-native';

jest.mock('../../src/ui/MessageBody', () => {
  const React = require('react');
  return {__esModule: true, default: ({messageId}) => React.createElement('MockBody', {messageId})};
});

import ThreadView from '../../src/ui/ThreadView';

test('renders a header per message, marking sent vs received', () => {
  const messages = [
    {id: 'r', from: 'A <a@x>', direction: 'received', receivedAt: '2026-06-12T10:00:00Z'},
    {id: 's', from: 'me', direction: 'sent', receivedAt: '2026-06-12T11:00:00Z'},
  ];
  const {getByText} = render(<ThreadView messages={messages} bodyDeps={{}} allowRemote={false} />);
  expect(getByText(/A <a@x>/)).toBeTruthy();
  expect(getByText('You')).toBeTruthy();
});
