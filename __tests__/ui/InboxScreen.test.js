import React from 'react';
import {render, waitFor, fireEvent} from '@testing-library/react-native';
import InboxScreen from '../../src/ui/InboxScreen';

jest.mock('../../src/ui/ThreadView', () => ({__esModule: true, default: () => null}));

test('renders rows from the store', async () => {
  const store = {
    listMessages: async () => [
      {id: 'm1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false, starred: false},
    ],
    searchMessages: async () => [],
    getSetting: async () => null,
    upsertMessage: async () => {},
  };
  const makeStore = async () => store;
  // Source whose initial tick resolves with nothing, so no extra refresh churn.
  const makeSource = () => ({listReceived: async () => []});
  const {getByText} = render(
    <InboxScreen apiKey="re_x" makeStore={makeStore} makeSource={makeSource} />,
  );
  await waitFor(() => expect(getByText('Re: contract')).toBeTruthy());
});

test('shows a sync error banner when the source throws', async () => {
  const store = {
    listMessages: async () => [],
    searchMessages: async () => [],
    getSetting: async () => null,
    upsertMessage: async () => {},
  };
  const makeStore = async () => store;
  const makeSource = () => ({
    listReceived: async () => {
      throw new Error('boom');
    },
  });
  const {getByText} = render(
    <InboxScreen apiKey="re_x" makeStore={makeStore} makeSource={makeSource} />,
  );
  await waitFor(() => expect(getByText(/Sync error: boom/)).toBeTruthy());
});

test('shows a Retry screen (not a hang) when opening the cache fails', async () => {
  const err = new Error('Could not read the local-cache key from the Keychain');
  err.code = 'KEYCHAIN_DENIED';
  let attempts = 0;
  const makeStore = async () => {
    attempts += 1;
    if (attempts === 1) throw err; // first boot fails (denied)
    return {
      listMessages: async () => [],
      searchMessages: async () => [],
      getSetting: async () => null,
      upsertMessage: async () => {},
    };
  };
  const makeSource = () => ({listReceived: async () => []});
  const {getByText, queryByText} = render(
    <InboxScreen apiKey="re_x" makeStore={makeStore} makeSource={makeSource} />,
  );
  await waitFor(() => expect(getByText(/denied Keychain access/i)).toBeTruthy());
  fireEvent.press(getByText('Retry'));
  await waitFor(() => expect(queryByText(/denied Keychain access/i)).toBeNull());
  expect(attempts).toBe(2);
});

test('selecting a message marks it read and loads its thread', async () => {
  const setSeen = jest.fn(async () => {});
  const listThread = jest.fn(async () => []);
  const store = {
    listMessages: async () => [
      {id: 'm1', threadId: 't1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false, starred: false},
    ],
    searchMessages: async () => [],
    getSetting: async () => null,
    setSeen,
    listThread,
    upsertMessage: async () => {},
  };
  const makeStore = async () => store;
  const makeSource = () => ({listReceived: async () => []});
  const {getByText} = render(
    <InboxScreen apiKey="re_x" makeStore={makeStore} makeSource={makeSource} />,
  );
  await waitFor(() => expect(getByText('Re: contract')).toBeTruthy());
  fireEvent.press(getByText('Re: contract'));
  await waitFor(() => expect(setSeen).toHaveBeenCalledWith('m1', true));
  expect(listThread).toHaveBeenCalledWith('t1');
});

test('the Compose button opens the compose sheet', async () => {
  const store = {
    listMessages: async () => [],
    searchMessages: async () => [],
    getSetting: async () => 'me@you.com',
    upsertMessage: async () => {},
  };
  const makeStore = async () => store;
  const makeSource = () => ({listReceived: async () => []});
  const {getByText, queryByPlaceholderText, getByPlaceholderText} = render(
    <InboxScreen apiKey="re_x" makeStore={makeStore} makeSource={makeSource} />,
  );
  await waitFor(() => expect(getByText('+ Compose')).toBeTruthy());
  expect(queryByPlaceholderText('To')).toBeNull();
  fireEvent.press(getByText('+ Compose'));
  expect(getByPlaceholderText('name@example.com')).toBeTruthy();
  expect(getByPlaceholderText('From').props.value).toBe('me@you.com');
});
