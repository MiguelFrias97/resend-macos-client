import {NativeModules} from 'react-native';

const {AttachmentFile} = NativeModules;

export const cacheDir = messageId => AttachmentFile.cacheDir(messageId);
export const writeToCache = (messageId, name, base64, quarantine = true) =>
  AttachmentFile.writeToCache(messageId, name, base64, quarantine);
export const saveAs = (srcPath, suggestedName) =>
  AttachmentFile.saveAs(srcPath, suggestedName);
