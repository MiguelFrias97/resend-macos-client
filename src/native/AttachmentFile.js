import {NativeModules} from 'react-native';

const {AttachmentFile} = NativeModules;

export const cacheDir = messageId => AttachmentFile.cacheDir(messageId);
// Download a presigned URL straight into the per-message cache (native, no
// base64 across the bridge). quarantine=false for inline cid images.
export const downloadToCache = (messageId, name, url, quarantine = true) =>
  AttachmentFile.downloadToCache(messageId, name, url, quarantine);
export const exists = path => AttachmentFile.exists(path);
export const readBase64 = path => AttachmentFile.readBase64(path);
export const saveAs = (srcPath, suggestedName, dangerous = false) =>
  AttachmentFile.saveAs(srcPath, suggestedName, dangerous);

// Open a native file picker and return chosen files as Resend attachment parts:
// {filename, content (base64), contentType, size} (or {filename, contentType,
// size, tooLarge:true} for files over the size cap).
export const pickAttachments = () => AttachmentFile.pickAttachments();
