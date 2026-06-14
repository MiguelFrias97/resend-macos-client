import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import MessageList from '../../src/ui/MessageList';

test('renders a row per message with sender and subject', () => {
  const messages = [
    {id: 'm1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false},
  ];
  const {getByText} = render(<MessageList messages={messages} onSelect={() => {}} selectedId={null} />);
  expect(getByText('Re: contract')).toBeTruthy();
  expect(getByText(/Marcus Lee/)).toBeTruthy();
});

test('shows unread dot, star state, and fires star/archive callbacks', () => {
  const onToggleStar = jest.fn();
  const onArchive = jest.fn();
  const messages = [
    {id: 'm1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false, starred: false},
  ];
  const onSelect = jest.fn();
  const {getByLabelText, getByTestId} = render(
    <MessageList messages={messages} onSelect={onSelect} selectedId={null}
      onToggleStar={onToggleStar} onArchive={onArchive} />,
  );
  expect(getByTestId('unread-dot')).toBeTruthy();
  fireEvent.press(getByLabelText('Star Re: contract'));
  expect(onToggleStar).toHaveBeenCalledWith(messages[0]);
  // Tapping star/archive must NOT also select the row.
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.press(getByLabelText('Archive Re: contract'));
  expect(onArchive).toHaveBeenCalledWith(messages[0]);
  expect(onSelect).not.toHaveBeenCalled();
});
