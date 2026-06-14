import {NativeModules} from 'react-native';

const {AttachmentFile} = NativeModules;

export const cacheDir = messageId => AttachmentFile.cacheDir(messageId);
export const writeToCache = (messageId, name, base64) =>
  AttachmentFile.writeToCache(messageId, name, base64);
export const saveAs = (srcPath, suggestedName) =>
  AttachmentFile.saveAs(srcPath, suggestedName);
