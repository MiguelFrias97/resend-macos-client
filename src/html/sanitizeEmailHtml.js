import sanitizeHtml from 'sanitize-html';

function rewriteCid(value) {
  return value.replace(/^cid:(.+)$/i, (_, id) => `cidcache://${id}`);
}

// Inline-style properties that cannot pull remote content. Deliberately EXCLUDES
// background / background-image (which permit url()), so CSS can't smuggle in a
// tracker even before the CSP catches it.
const SAFE_STYLES = {
  '*': {
    color: [/.*/],
    'background-color': [/.*/],
    'text-align': [/.*/],
    'text-decoration': [/.*/],
    'font-size': [/.*/],
    'font-weight': [/.*/],
    'font-style': [/.*/],
    'font-family': [/.*/],
    'line-height': [/.*/],
    width: [/.*/],
    height: [/.*/],
    padding: [/.*/],
    margin: [/.*/],
    border: [/.*/],
  },
};

// Engine-level enforcement: even if some CSS slips past the allowlist, the
// WebKit CSP blocks remote image/font loads unless the user opts in.
function contentSecurityPolicy(allowRemote) {
  const img = allowRemote ? 'cidcache: data: https:' : 'cidcache: data:';
  // Remote fonts have no legitimate use in mail and are an exfil/fingerprint
  // vector, so font-src stays data:-only even when remote images are allowed.
  // base-uri/object-src/form-action are set explicitly rather than leaning on
  // the default-src 'none' fallback across WebKit versions.
  return (
    `default-src 'none'; script-src 'none'; img-src ${img}; ` +
    `style-src 'unsafe-inline'; font-src data:; ` +
    `object-src 'none'; base-uri 'none'; form-action 'none'`
  );
}

// Whether a message body references remote content that we block by default —
// used to show the "Load images" affordance ONLY when there's something to load.
export function hasRemoteContent(html) {
  if (!html) return false;
  return (
    /<img[^>]+src\s*=\s*["']?\s*https?:/i.test(html) ||
    /url\(\s*["']?\s*https?:/i.test(html)
  );
}

export function sanitizeEmailHtml(html, {allowRemote = false, accentColor} = {}) {
  if (!html) return '';
  const body = sanitizeHtml(html, {
    // Note: <style> is intentionally NOT allowed — embedded stylesheets can load
    // remote content via url()/@import.
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
    ]),
    allowedAttributes: {
      '*': ['style', 'align', 'width', 'height', 'colspan', 'rowspan'],
      a: ['href', 'name', 'target'],
      img: ['src', 'alt', 'width', 'height'],
    },
    allowedStyles: SAFE_STYLES,
    // http/https/mailto links are allowed (they open externally, not loaded);
    // cidcache serves inline images. javascript:/data: hrefs stay disallowed.
    allowedSchemes: ['http', 'https', 'mailto', 'cidcache'],
    transformTags: {
      img: (tagName, attribs) => {
        // Trim leading whitespace/control chars before the scheme test so
        // `<img src="  https://tracker">` is caught by the sanitizer itself,
        // not just the CSP backstop (browsers ignore leading whitespace in URLs).
        // eslint-disable-next-line no-control-regex
        let src = (attribs.src || '').replace(/^[\s\x00-\x1f]+/, '');
        if (/^cid:/i.test(src)) {
          src = rewriteCid(src);
        } else if (/^https?:/i.test(src) && !allowRemote) {
          src = '';
        }
        return {tagName: 'img', attribs: {...attribs, src}};
      },
    },
  });
  const csp = contentSecurityPolicy(allowRemote);
  // Presentational base CSS for the rendered mail body. The body is rendered on a
  // LIGHT "sheet of paper" surface on purpose: most HTML mail hardcodes dark text
  // with no background, so forcing a dark body would make that text invisible
  // (this is why Apple Mail keeps message bodies light unless the sender opts into
  // dark via color-scheme). The seam that read as "a bug" is fixed by framing this
  // as an intentional document surface in the RN container, not by inverting it.
  //
  // Only the link color is themed (to the system accent). `color-scheme: light
  // dark` lets well-behaved senders adapt themselves.
  //
  // NOTE: rules are inline on the trusted wrapper, not a <style> element —
  // embedded <style> is stripped from untrusted mail (and a test asserts no
  // <style> appears in the output).
  const link = accentColor || '#007aff';
  const bodyStyle = [
    'margin:0',
    "font:15px/1.55 -apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif",
    'color:#1d1d1f',
    'background:#ffffff',
    'word-wrap:break-word',
    '-webkit-text-size-adjust:100%',
  ].join(';');
  const contentStyle = `max-width:600px;padding:16px 20px;accent-color:${link}`;
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="color-scheme" content="light dark">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `</head><body style="${bodyStyle}">` +
    `<div class="mail-content" style="${contentStyle}">${body}</div>` +
    '</body></html>'
  );
}
