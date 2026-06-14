jest.mock('react-native', () => ({
  requireNativeComponent: name => name,
  NativeModules: {
    RichEditor: {
      toggleBold: jest.fn(),
      toggleItalic: jest.fn(),
      toggleUnderline: jest.fn(),
      insertList: jest.fn(),
      setLink: jest.fn(),
    },
  },
}));

import RichEditorView, {commands} from '../../src/native/RichEditorView';

test('exports the native component and command helpers', () => {
  expect(RichEditorView).toBe('RichEditorView');
  commands.bold();
  commands.bulletList();
  commands.link('https://x.com');
  const {RichEditor} = require('react-native').NativeModules;
  expect(RichEditor.toggleBold).toHaveBeenCalled();
  expect(RichEditor.insertList).toHaveBeenCalledWith(false);
  expect(RichEditor.setLink).toHaveBeenCalledWith('https://x.com');
});
