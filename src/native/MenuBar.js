import {NativeModules} from 'react-native';

// Native menu-bar (NSStatusItem) control. setUnread pushes the inbox unread
// count to the badge. No-ops when the native module is absent (tests/other
// platforms), matching Notifications.js.
const {MenuBar} = NativeModules || {};

export function setUnread(count) {
  if (MenuBar && MenuBar.setUnread) {
    MenuBar.setUnread(Number(count) || 0);
  }
}

// Show/hide the menu-bar item (hidden while signed out). No-ops when the native
// module is absent.
export function setVisible(visible) {
  if (MenuBar && MenuBar.setVisible) {
    MenuBar.setVisible(!!visible);
  }
}
