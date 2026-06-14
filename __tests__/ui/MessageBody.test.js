import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import MessageBody from '../../src/ui/MessageBody';

jest.mock('../../src/native/MessageBodyView', () => 'MessageBodyView');

test('fetches body once and passes sanitized html to the native view', async () => {
  const deps = {
    getMessage: jest.fn(async () => ({id: 'm1', bodyFetched: false})),
    fetchBody: jest.fn(async () => ({
      html: '<p onclick="x">Hi</p>',
      text: 'Hi',
      attachments: [],
    })),
    saveBody: jest.fn(async () => {}),
    saveAttachments: jest.fn(async () => {}),
    cacheCidImages: jest.fn(async () => '/cache/m1'),
  };
  const {UNSAFE_getByType} = render(<MessageBody messageId="m1" deps={deps} />);
  await waitFor(() => expect(deps.fetchBody).toHaveBeenCalledWith('m1'));
  const view = UNSAFE_getByType('MessageBodyView');
  expect(view.props.html).not.toMatch(/onclick/i);
  expect(view.props.cacheDir).toBe('/cache/m1');
});

test('uses the cached body without refetching, and still caches inline images', async () => {
  const deps = {
    getMessage: jest.fn(async () => ({id: 'm1', bodyFetched: true, html: '<p>cached</p>'})),
    fetchBody: jest.fn(),
    saveBody: jest.fn(),
    saveAttachments: jest.fn(),
    cacheCidImages: jest.fn(async () => '/cache/m1'),
  };
  const {UNSAFE_getByType} = render(<MessageBody messageId="m1" deps={deps} />);
  await waitFor(() => expect(deps.cacheCidImages).toHaveBeenCalledWith('m1'));
  expect(deps.fetchBody).not.toHaveBeenCalled();
  expect(UNSAFE_getByType('MessageBodyView').props.html).toContain('cached');
});

test('shows an error message when loading the body fails', async () => {
  const deps = {
    getMessage: jest.fn(async () => ({id: 'm1', bodyFetched: false})),
    fetchBody: jest.fn(async () => {
      throw new Error('network down');
    }),
    saveBody: jest.fn(),
    saveAttachments: jest.fn(),
  };
  const {findByText} = render(<MessageBody messageId="m1" deps={deps} />);
  expect(await findByText(/network down/)).toBeTruthy();
});
