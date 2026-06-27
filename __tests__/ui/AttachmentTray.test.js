import React from 'react';
import {render} from '@testing-library/react-native';
import AttachmentTray from '../../src/ui/AttachmentTray';

test('renders a chip per attachment and warns on dangerous types', () => {
  const atts = [
    {id: 'a1', filename: 'report.pdf', contentType: 'application/pdf', size: 1200},
    {id: 'a2', filename: 'setup.app', contentType: 'application/octet-stream', size: 50},
  ];
  const {getByText, UNSAFE_getAllByType} = render(
    <AttachmentTray attachments={atts} onSave={() => {}} />,
  );
  expect(getByText('report.pdf')).toBeTruthy();
  expect(getByText(/setup\.app/)).toBeTruthy();
  // The dangerous .app chip shows the warning symbol (exclamationmark.triangle.fill).
  const symbols = UNSAFE_getAllByType('SymbolView');
  expect(
    symbols.some(s => s.props.name === 'exclamationmark.triangle.fill'),
  ).toBe(true);
});

test('renders nothing when there are no attachments', () => {
  const {toJSON} = render(<AttachmentTray attachments={[]} onSave={() => {}} />);
  expect(toJSON()).toBeNull();
});
