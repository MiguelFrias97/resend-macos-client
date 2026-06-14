import {requireNativeComponent, NativeModules} from 'react-native';

// Native NSTextView editor. Props: onChange (event {nativeEvent:{model}}).
const RichEditorView = requireNativeComponent('RichEditorView');

const {RichEditor} = NativeModules || {};

// Dispatch a command if the native module is registered; never throw if it
// isn't (e.g. a partial bridge init), just no-op so the toolbar stays alive.
function dispatch(method, ...args) {
  if (RichEditor && typeof RichEditor[method] === 'function') {
    RichEditor[method](...args);
  }
}

// Formatting commands act on the active editor's current selection.
export const commands = {
  bold: () => dispatch('toggleBold'),
  italic: () => dispatch('toggleItalic'),
  underline: () => dispatch('toggleUnderline'),
  bulletList: () => dispatch('insertList', false),
  numberList: () => dispatch('insertList', true),
  link: url => dispatch('setLink', url),
};

export default RichEditorView;
