import React from 'react';
import {render} from '@testing-library/react-native';

jest.mock('react-native', () => ({
  useColorScheme: () => 'dark',
  NativeModules: {},
}));

import {useTheme} from '../../src/ui/useTheme';

test('useTheme returns the dark palette when the OS is dark', () => {
  let captured;
  function P() {
    captured = useTheme();
    return null;
  }
  render(<P />);
  expect(captured.scheme).toBe('dark');
});
