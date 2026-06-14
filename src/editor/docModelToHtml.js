function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}

function safeHref(href) {
  return /^(https?:|mailto:)/i.test(href || '') ? href : null;
}

function spanToHtml(span) {
  let inner = escapeText(span.text);
  if (span.bold) inner = `<b>${inner}</b>`;
  if (span.italic) inner = `<i>${inner}</i>`;
  if (span.underline) inner = `<u>${inner}</u>`;
  const href = safeHref(span.href);
  if (href) inner = `<a href="${escapeAttr(href)}">${inner}</a>`;
  return inner;
}

function spansToHtml(spans) {
  return (spans || []).map(spanToHtml).join('');
}

function blockToHtml(block) {
  switch (block.type) {
    case 'paragraph':
      return `<p>${spansToHtml(block.spans)}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = (block.items || [])
        .map(item => `<li>${spansToHtml(item)}</li>`)
        .join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'image':
      return `<p><img src="cid:${escapeAttr(block.contentId)}"></p>`;
    default:
      return '';
  }
}

export function docModelToHtml(model) {
  if (!model || !Array.isArray(model.blocks)) return '';
  return model.blocks.map(blockToHtml).join('');
}
