const DANGEROUS = new Set([
  'app',
  'dmg',
  'pkg',
  'command',
  'scpt',
  'jar',
  'exe',
  'bat',
  'sh',
  'js',
  'scr',
  'msi',
  'vb',
  'vbs',
  'ps1',
  'webloc',
  'workflow',
  // macOS launch/auto-run document types that can execute or open a URL on
  // double-click even though they aren't classic "executables".
  'inetloc',
  'fileloc',
  'terminal',
  'prefpane',
  'mpkg',
  'action',
  'applescript',
  'osascript',
  'shortcut',
  'url',
]);

// Strip ASCII control chars (U+0000-U+001F), space (U+0020), and Unicode
// bidi/RTL-override chars (U+200E-U+200F, U+202A-U+202E, U+2066-U+2069) used to disguise extensions.
// eslint-disable-next-line no-control-regex -- intentionally strips control chars used to disguise filenames
const STRIP = /[\u0000-\u001F\u0020\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function sanitizeFilename(name) {
  let n = String(name || 'attachment');
  n = n.split(/[/\\]/).pop();
  n = n.replace(STRIP, '');
  n = n.trim();
  return n || 'attachment';
}

function extOf(name) {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isDangerousFilename(name) {
  const clean = sanitizeFilename(name);
  const parts = clean.toLowerCase().split('.').slice(1);
  return parts.some(p => DANGEROUS.has(p));
}

const TYPE_EXT = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'text/plain': ['txt'],
};

export function typeMismatch(contentType, name) {
  const exts = TYPE_EXT[(contentType || '').toLowerCase()];
  if (!exts) return false;
  const ext = extOf(sanitizeFilename(name));
  if (!ext) return false; // no extension → can't claim a mismatch
  return !exts.includes(ext);
}

// An inline image is referenced from the body via its content id. Only such
// parts are rendered inline (and therefore hidden from the saveable tray); an
// 'inline' part without a content id is unreferenced, so treat it as a normal
// attachment instead of losing it entirely.
export function isInlineImage(att) {
  return att.disposition === 'inline' && Boolean(att.contentId);
}
