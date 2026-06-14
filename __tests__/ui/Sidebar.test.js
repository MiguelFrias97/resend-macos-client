import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import Sidebar from '../../src/ui/Sidebar';

test('renders filters and reports selection', () => {
  const onSelect = jest.fn();
  const {getByText} = render(<Sidebar selected="inbox" onSelect={onSelect} />);
  expect(getByText('Inbox')).toBeTruthy();
  expect(getByText('Starred')).toBeTruthy();
  fireEvent.press(getByText('Archive'));
  expect(onSelect).toHaveBeenCalledWith('archive');
});
