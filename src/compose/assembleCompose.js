import {extractEmail, quoteOriginal, inlineAttachmentParts} from '../reply/assembleReply';

export function parseRecipients(value) {
  // Split on comma or semicolon (pasted lists often use ';').
  return String(value || '')
    .split(/[,;]/)
    .map(s => extractEmail(s))
    .filter(Boolean);
}

export function forwardSubject(subject) {
  const s = (subject || '').trim();
  if (!s) return 'Fwd:';
  return /^fwd:/i.test(s) ? s : `Fwd: ${s}`;
}

export function assembleComposePayload({from, to, subject, html, inlineImages = [], attachments = []}) {
  return {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: (subject || '').trim() || '(no subject)',
    html: html || '',
    attachments: [...inlineAttachmentParts(inlineImages), ...attachments],
  };
}

export function assembleForwardPayload({from, to, original, originalHtml, replyHtml, inlineImages = [], originalAttachments = []}) {
  // Forwarded files carry their bytes as base64 `content` so the attachment
  // survives an outbox retry (a presigned URL would expire).
  const forwarded = originalAttachments.map(a => ({
    filename: a.filename,
    content: a.content,
    content_type: a.contentType,
  }));
  return {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: forwardSubject(original.subject),
    html: `${replyHtml || ''}${quoteOriginal(original, originalHtml)}`,
    attachments: [...inlineAttachmentParts(inlineImages), ...forwarded],
  };
}
