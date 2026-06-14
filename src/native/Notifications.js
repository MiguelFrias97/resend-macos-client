import {NativeModules} from 'react-native';

const {Notifications} = NativeModules || {};

export const notify = (title, body) => {
  if (Notifications && Notifications.notify) Notifications.notify(title, body);
};
