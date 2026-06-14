import {requireNativeComponent, NativeModules} from 'react-native';

// Native NSTextView editor. Props: onChange (event {nativeEvent:{model}}).
const RichEditorView = requireNativeComponent('RichEditorView');

const {RichEditor} = NativeModules || {};

// Formatting commands act on the active editor's current selection.
export const commands = {
  bold: () => RichEditor.toggleBold(),
  italic: () => RichEditor.toggleItalic(),
  underline: () => RichEditor.toggleUnderline(),
  bulletList: () => RichEditor.insertList(false),
  numberList: () => RichEditor.insertList(true),
  link: url => RichEditor.setLink(url),
};

export default RichEditorView;
