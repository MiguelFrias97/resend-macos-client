import {NativeModules} from 'react-native';

const {SystemAccent} = NativeModules || {};

export const getAccentColor = () =>
  SystemAccent && SystemAccent.getAccentColor
    ? SystemAccent.getAccentColor()
    : Promise.resolve(null);
