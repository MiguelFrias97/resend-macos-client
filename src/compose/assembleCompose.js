import {
  extractEmail,
  quoteOriginal,
  inlineAttachmentParts,
  stripControlChars,
  isEmail,
} from '../reply/assembleReply';

// Re-export so existing imports (recipient chips, send-time validation) keep
// working; the canonical definition lives in assembleReply to avoid a cycle.
export {isEmail};

export function parseRecipients(value) {
  // Accept an array (from the recipient token field) or a string (split on
  // comma/semicolon — pasted lists often use ';'). Only well-formed addresses
  // are kept: this is the send-time gate, so a malformed or header-injecting
  // value (e.g. one with a smuggled newline) is dropped rather than sent.
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;]/);
  return list.map(s => extractEmail(s)).filter(isEmail);
}

export function forwardSubject(subject) {
  const s = stripControlChars(subject);
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
