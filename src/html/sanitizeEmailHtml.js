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

export function sanitizeEmailHtml(html, {allowRemote = false} = {}) {
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
        let src = attribs.src || '';
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
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `</head><body>${body}</body></html>`
  );
}
