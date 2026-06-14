import sanitizeHtml from 'sanitize-html';

function rewriteCid(value) {
  return value.replace(/^cid:(.+)$/i, (_, id) => `cidcache://${id}`);
}

export function sanitizeEmailHtml(html, {allowRemote = false} = {}) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'style',
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
    allowedSchemes: ['https', 'mailto', 'cidcache'],
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
    exclusiveFilter: frame => frame.tag === 'script',
  });
}
