import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

jest.mock('../../src/native/LoginItem', () => ({
  isEnabled: jest.fn(),
  setEnabled: jest.fn(),
}));
jest.mock('../../src/ui/useTheme', () => ({
  useTheme: () => ({
    text: '#000', textMuted: '#666', accent: '#07f', selectedBg: '#07f',
    surface2: '#eee', border: '#ccc', onAccent: '#fff',
  }),
}));

import {isEnabled, setEnabled} from '../../src/native/LoginItem';
import LaunchAtLoginToggle from '../../src/ui/LaunchAtLoginToggle';

test('reflects the current login-item state on mount', async () => {
  isEnabled.mockResolvedValue(true);
  const {getByText} = render(<LaunchAtLoginToggle />);
  await waitFor(() => getByText('On'));
});

test('toggling calls setEnabled with the new value and updates the label', async () => {
  isEnabled.mockResolvedValue(false);
  setEnabled.mockResolvedValue(true);
  const {getByText} = render(<LaunchAtLoginToggle />);
  await waitFor(() => getByText('Off'));
  fireEvent.press(getByText('Off'));
  await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  await waitFor(() => getByText('On'));
});

test('when setEnabled fails, the label re-reads the true state instead of getting stuck on', async () => {
  isEnabled.mockResolvedValueOnce(true);
  isEnabled.mockResolvedValue(false);
  setEnabled.mockRejectedValue(new Error('ad-hoc'));
  const {getByText} = render(<LaunchAtLoginToggle />);
  await waitFor(() => getByText('On'));
  fireEvent.press(getByText('On'));
  await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(false));
  await waitFor(() => getByText('Off'));
});
