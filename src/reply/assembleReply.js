export function replySubject(subject) {
  const s = (subject || '').trim();
  if (!s) return 'Re:';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function extractEmail(addr) {
  const m = /<([^>]+)>/.exec(addr || '');
  return (m ? m[1] : String(addr || '')).trim();
}

export function replyHeaders(original) {
  const id = original.rfcMessageId;
  if (!id) return {};
  const refs = [...(original.references || []), id].filter(Boolean);
  return {'In-Reply-To': id, References: refs.join(' ')};
}

function formatDate(iso) {
  return iso || '';
}

export function quoteOriginal(original, originalHtml) {
  const attribution = `On ${formatDate(original.receivedAt)}, ${original.from} wrote:`;
  return (
    '<br><blockquote class="gmail_quote" ' +
    'style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
    `${attribution}<br>${originalHtml || ''}</blockquote>`
  );
}

export function assembleReplyPayload({original, replyHtml, originalHtml, inlineImages = [], attachments = []}) {
  const inlineParts = inlineImages.map(img => ({
    filename: img.filename,
    content: img.base64,
    content_type: img.contentType,
    content_id: img.contentId,
  }));
  return {
    from: extractEmail((original.to && original.to[0]) || ''),
    to: extractEmail(original.from),
    subject: replySubject(original.subject),
    headers: replyHeaders(original),
    html: `${replyHtml || ''}${quoteOriginal(original, originalHtml)}`,
    attachments: [...inlineParts, ...attachments],
  };
}
