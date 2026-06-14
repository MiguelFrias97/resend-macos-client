function req(obj, field) {
  if (obj[field] === undefined || obj[field] === null) {
    throw new Error(`Resend payload missing required field: ${field}`);
  }
  return obj[field];
}

function toRefArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return v.trim().split(/\s+/);
  return [];
}

export function validateReceivedEmail(raw) {
  const id = req(raw, 'id');
  const from = req(raw, 'from');
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  return {
    id,
    from,
    to: Array.isArray(raw.to) ? raw.to : [],
    cc: Array.isArray(raw.cc) ? raw.cc : [],
    bcc: Array.isArray(raw.bcc) ? raw.bcc : [],
    replyTo: raw.reply_to || null,
    subject: raw.subject || '(no subject)',
    rfcMessageId: raw.message_id || null,
    inReplyTo: raw.in_reply_to || null,
    references: toRefArray(raw.references),
    receivedAt: raw.created_at || null,
    hasAttachments: attachments.length > 0,
    attachments,
  };
}

export function validateAttachmentMeta(raw) {
  const id = req(raw, 'id');
  return {
    id,
    filename: raw.filename || 'attachment',
    contentType: raw.content_type || 'application/octet-stream',
    size: typeof raw.size === 'number' ? raw.size : 0,
    contentId: raw.content_id || null,
    disposition: raw.content_disposition || null,
    downloadUrl: raw.download_url || null,
  };
}

export function validateReceivedEmailContent(raw) {
  const id = req(raw, 'id');
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map(validateAttachmentMeta)
    : [];
  return {
    id,
    html: typeof raw.html === 'string' ? raw.html : null,
    text: typeof raw.text === 'string' ? raw.text : null,
    headers: raw.headers && typeof raw.headers === 'object' ? raw.headers : {},
    attachments,
  };
}
