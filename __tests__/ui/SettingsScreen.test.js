import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import SettingsScreen from '../../src/ui/SettingsScreen';

test('changes theme, persists From on blur, and signs out', () => {
  const onChangeTheme = jest.fn();
  const onChangeFrom = jest.fn();
  const onSignOut = jest.fn();
  const {getByText, getByLabelText, getByPlaceholderText} = render(
    <SettingsScreen
      defaultFrom="me@you.com"
      themeOverride="auto"
      onChangeTheme={onChangeTheme}
      onChangeFrom={onChangeFrom}
      onSignOut={onSignOut}
      onClose={() => {}}
    />,
  );
  fireEvent.press(getByLabelText('Theme Dark'));
  expect(onChangeTheme).toHaveBeenCalledWith('dark');

  const input = getByPlaceholderText('you@yourdomain.com');
  fireEvent.changeText(input, 'other@you.com');
  fireEvent(input, 'blur');
  expect(onChangeFrom).toHaveBeenCalledWith('other@you.com');

  // Sign out is a two-step confirm: first press reveals the confirmation, the
  // second (the danger button) actually signs out.
  fireEvent.press(getByText('Sign out'));
  expect(onSignOut).not.toHaveBeenCalled();
  fireEvent.press(getByText('Sign out'));
  expect(onSignOut).toHaveBeenCalled();
});
