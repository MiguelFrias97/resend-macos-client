/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/native/Keychain', () => ({
  getApiKey: async () => null,
  setApiKey: async () => true,
  clearApiKey: async () => true,
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});
