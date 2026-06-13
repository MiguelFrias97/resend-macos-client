import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import Onboarding from '../../src/ui/Onboarding';

test('calls onComplete after a valid key is saved', async () => {
  const onComplete = jest.fn();
  const deps = {
    verify: jest.fn(async () => true),
    save: jest.fn(async () => true),
  };
  const {getByPlaceholderText, getByText} = render(
    <Onboarding onComplete={onComplete} deps={deps} />,
  );
  fireEvent.changeText(getByPlaceholderText('re_...'), 're_valid');
  fireEvent.press(getByText('Connect'));
  await waitFor(() => expect(onComplete).toHaveBeenCalled());
  expect(deps.save).toHaveBeenCalledWith('re_valid');
});
