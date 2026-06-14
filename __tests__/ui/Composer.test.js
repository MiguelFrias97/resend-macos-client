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

test('tapping Bold dispatches the bold command', () => {
  const {getByLabelText} = render(<Composer onChange={() => {}} />);
  fireEvent.press(getByLabelText('Bold'));
  expect(commands.bold).toHaveBeenCalled();
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
