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
});
