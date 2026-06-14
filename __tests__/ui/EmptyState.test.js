import React from 'react';
import {render} from '@testing-library/react-native';
import EmptyState from '../../src/ui/EmptyState';

test('shows a message', () => {
  const {getByText} = render(<EmptyState message="No starred messages" />);
  expect(getByText('No starred messages')).toBeTruthy();
});
