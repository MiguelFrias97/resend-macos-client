import React from 'react';
import {render} from '@testing-library/react-native';
import AttachmentTray from '../../src/ui/AttachmentTray';

test('renders a chip per attachment and warns on dangerous types', () => {
  const atts = [
    {id: 'a1', filename: 'report.pdf', contentType: 'application/pdf', size: 1200},
    {id: 'a2', filename: 'setup.app', contentType: 'application/octet-stream', size: 50},
  ];
  const {getByText} = render(<AttachmentTray attachments={atts} onSave={() => {}} />);
  expect(getByText('report.pdf')).toBeTruthy();
  expect(getByText(/setup\.app/)).toBeTruthy();
  expect(getByText(/⚠|warning/i)).toBeTruthy();
});

test('renders nothing when there are no attachments', () => {
  const {toJSON} = render(<AttachmentTray attachments={[]} onSave={() => {}} />);
  expect(toJSON()).toBeNull();
});
