function req(obj, field) {
  if (obj[field] === undefined || obj[field] === null) {
    throw new Error(`Resend payload missing required field: ${field}`);
  }
  return obj[field];
}

// Cap the References list: it feeds a SQL IN(...) placeholder list downstream,
// and a maliciously long header shouldn't be able to bloat that query.
const MAX_REFS = 50;
function toRefArray(v) {
  if (Array.isArray(v)) return v.slice(0, MAX_REFS);
  if (typeof v === 'string' && v.trim()) return v.trim().split(/\s+/).slice(0, MAX_REFS);
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

// Look up a header value case-insensitively (Resend returns a headers object).
function header(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) return headers[k];
  }
  return null;
}

// In-Reply-To is a single Message-ID; coerce an array form to its first entry.
function firstHeaderValue(v) {
  return Array.isArray(v) ? v[0] || null : v || null;
}

export function validateReceivedEmailContent(raw) {
  const id = req(raw, 'id');
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map(validateAttachmentMeta)
    : [];
  const headers = raw.headers && typeof raw.headers === 'object' ? raw.headers : {};
  return {
    id,
    html: typeof raw.html === 'string' ? raw.html : null,
    text: typeof raw.text === 'string' ? raw.text : null,
    // Only the specific threading headers are extracted (as strings) — the raw
    // headers object is attacker-controlled and unbounded, so it is not retained.
    inReplyTo: firstHeaderValue(header(headers, 'in-reply-to') || raw.in_reply_to),
    references: toRefArray(header(headers, 'references') || raw.references),
    attachments,
  };
}
