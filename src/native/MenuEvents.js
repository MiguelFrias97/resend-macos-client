import {NativeModules, NativeEventEmitter} from 'react-native';

// Native app-menu commands (⌘N compose, ⌘R reply, ⌘⇧F forward) relayed from the
// AppDelegate's Message menu. Subscribe with onMenuCommand(cb); cb receives the
// command string. No-ops gracefully if the native module isn't present (tests).
const {MenuEvents} = NativeModules || {};
const emitter = MenuEvents ? new NativeEventEmitter(MenuEvents) : null;

export function onMenuCommand(handler) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('menuCommand', e => handler(e && e.command));
  return () => sub.remove();
}
