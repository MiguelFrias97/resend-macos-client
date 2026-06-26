import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';

jest.mock('../../src/native/RichEditorView', () => ({
  __esModule: true,
  default: 'RichEditorView',
  commands: {
    bold: jest.fn(),
    italic: jest.fn(),
    underline: jest.fn(),
    bulletList: jest.fn(),
    numberList: jest.fn(),
    link: jest.fn(),
  },
}));

import Composer from '../../src/ui/Composer';
import {commands} from '../../src/native/RichEditorView';

test('each toolbar button dispatches its command', () => {
  const {getByLabelText} = render(<Composer onChange={() => {}} />);
  fireEvent.press(getByLabelText('Bold'));
  fireEvent.press(getByLabelText('Italic'));
  fireEvent.press(getByLabelText('Underline'));
  fireEvent.press(getByLabelText('Bulleted list'));
  fireEvent.press(getByLabelText('Numbered list'));
  expect(commands.bold).toHaveBeenCalled();
  expect(commands.italic).toHaveBeenCalled();
  expect(commands.underline).toHaveBeenCalled();
  expect(commands.bulletList).toHaveBeenCalled();
  expect(commands.numberList).toHaveBeenCalled();
});

test('a malformed change event degrades to empty html', () => {
  const onChange = jest.fn();
  const {UNSAFE_getByType} = render(<Composer onChange={onChange} />);
  UNSAFE_getByType('RichEditorView').props.onChange({});
  expect(onChange).toHaveBeenCalledWith({html: '', inlineImages: []});
});

test('native onChange surfaces email html + inline images', () => {
  const onChange = jest.fn();
  const {UNSAFE_getByType} = render(<Composer onChange={onChange} />);
  const view = UNSAFE_getByType('RichEditorView');
  view.props.onChange({
    nativeEvent: {
      model: {
        blocks: [
          {type: 'paragraph', spans: [{text: 'hi', bold: true}]},
          {
            type: 'image',
            contentId: 'img_1',
            filename: 'p.png',
            contentType: 'image/png',
            base64: 'AAAA',
          },
        ],
      },
    },
  });
  expect(onChange).toHaveBeenCalledWith({
    html: '<p><b>hi</b></p><p><img src="cid:img_1"></p>',
    inlineImages: [
      {contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'},
    ],
  });
});

test('forwards the native editor submit (Cmd+Return) to onSubmit', () => {
  const onSubmit = jest.fn();
  const {UNSAFE_getByType} = render(
    <Composer onChange={() => {}} onSubmit={onSubmit} />,
  );
  // The mocked RichEditorView renders as a host element named 'RichEditorView';
  // fire its onSubmit prop to simulate the native ⌘↵ event.
  UNSAFE_getByType('RichEditorView').props.onSubmit();
  expect(onSubmit).toHaveBeenCalled();
});
