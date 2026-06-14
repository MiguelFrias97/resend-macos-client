import React from 'react';
import {render} from '@testing-library/react-native';
import MessageList from '../../src/ui/MessageList';

test('renders a row per message with sender and subject', () => {
  const messages = [
    {id: 'm1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false},
  ];
  const {getByText} = render(<MessageList messages={messages} onSelect={() => {}} selectedId={null} />);
  expect(getByText('Re: contract')).toBeTruthy();
  expect(getByText(/Marcus Lee/)).toBeTruthy();
});
