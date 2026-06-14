import {extractEmail, quoteOriginal} from '../reply/assembleReply';

export function parseRecipients(value) {
  return String(value || '')
    .split(',')
    .map(s => extractEmail(s))
    .filter(Boolean);
}

export function forwardSubject(subject) {
  const s = (subject || '').trim();
  if (!s) return 'Fwd:';
  return /^fwd:/i.test(s) ? s : `Fwd: ${s}`;
}

function inlineParts(inlineImages) {
  return (inlineImages || []).map(img => ({
    filename: img.filename,
    content: img.base64,
    content_type: img.contentType,
    content_id: img.contentId,
  }));
}

export function assembleComposePayload({from, to, subject, html, inlineImages = [], attachments = []}) {
  return {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: (subject || '').trim() || '(no subject)',
    html: html || '',
    attachments: [...inlineParts(inlineImages), ...attachments],
  };
}

export function assembleForwardPayload({from, to, original, originalHtml, replyHtml, inlineImages = [], originalAttachments = []}) {
  const forwarded = originalAttachments.map(a => ({
    filename: a.filename,
    path: a.downloadUrl,
    content_type: a.contentType,
  }));
  return {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: forwardSubject(original.subject),
    html: `${replyHtml || ''}${quoteOriginal(original, originalHtml)}`,
    attachments: [...inlineParts(inlineImages), ...forwarded],
  };
}
