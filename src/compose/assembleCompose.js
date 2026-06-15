import {extractEmail, quoteOriginal, inlineAttachmentParts} from '../reply/assembleReply';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared so the recipient chips and the send-time validation never disagree.
export function isEmail(addr) {
  return EMAIL.test(addr || '');
}

export function parseRecipients(value) {
  // Accept an array (from the recipient token field) or a string (split on
  // comma/semicolon — pasted lists often use ';').
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;]/);
  return list.map(s => extractEmail(s)).filter(Boolean);
}

export function forwardSubject(subject) {
  const s = (subject || '').trim();
  if (!s) return 'Fwd:';
  return /^fwd:/i.test(s) ? s : `Fwd: ${s}`;
}

export function assembleComposePayload({from, to, cc, bcc, subject, html, inlineImages = [], attachments = []}) {
  const payload = {
    from: extractEmail(from),
    to: parseRecipients(to),
    subject: (subject || '').trim() || '(no subject)',
    html: html || '',
    attachments: [...inlineAttachmentParts(inlineImages), ...attachments],
  };
  const ccList = parseRecipients(cc);
  if (ccList.length) payload.cc = ccList;
  const bccList = parseRecipients(bcc);
  if (bccList.length) payload.bcc = bccList;
  return payload;
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
