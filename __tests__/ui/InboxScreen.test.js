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

test('selecting a message marks it read and loads its thread', async () => {
  const setSeen = jest.fn(async () => {});
  const listThread = jest.fn(async () => []);
  const store = {
    listMessages: async () => [
      {id: 'm1', threadId: 't1', from: 'Marcus Lee <marcus@acme.com>', subject: 'Re: contract', receivedAt: '2026-06-12T14:14:00Z', seen: false, starred: false},
    ],
    searchMessages: async () => [],
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
