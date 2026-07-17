jest.mock('react-native', () => ({
  NativeModules: {MenuBar: {setUnread: jest.fn()}},
}));

import {NativeModules} from 'react-native';
import {setUnread} from '../../src/native/MenuBar';

test('setUnread forwards a numeric count to the native module', () => {
  setUnread(3);
  expect(NativeModules.MenuBar.setUnread).toHaveBeenCalledWith(3);
});

test('setUnread coerces a non-number to 0', () => {
  setUnread(undefined);
  expect(NativeModules.MenuBar.setUnread).toHaveBeenLastCalledWith(0);
});
