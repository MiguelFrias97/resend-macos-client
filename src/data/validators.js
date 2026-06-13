function req(obj, field) {
  if (obj[field] === undefined || obj[field] === null) {
    throw new Error(`Resend payload missing required field: ${field}`);
  }
  return obj[field];
}

export function validateReceivedEmail(raw) {
  const id = req(raw, 'id');
  const from = req(raw, 'from');
  const to = Array.isArray(raw.to) ? raw.to : [];
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  return {
    id,
    from,
    to,
    cc: Array.isArray(raw.cc) ? raw.cc : [],
    bcc: Array.isArray(raw.bcc) ? raw.bcc : [],
    replyTo: raw.reply_to || null,
    subject: raw.subject || '(no subject)',
    rfcMessageId: raw.message_id || null,
    receivedAt: raw.created_at || null,
    hasAttachments: attachments.length > 0,
    attachments,
  };
}
