import sanitizeHtml from 'sanitize-html';

// Strip CR/LF and other control chars. Values that end up in outbound headers
// (subject, addresses, In-Reply-To/References) originate from attacker-controlled
// received-email headers, so a raw newline could inject extra SMTP headers
// (e.g. a silent Bcc). Defense-in-depth at the assembly boundary — never rely on
// the transport to sanitize for us.
export function stripControlChars(s) {
  // eslint-disable-next-line no-control-regex
  return String(s == null ? '' : s).replace(/[\x00-\x1f\x7f]/g, '').trim();
}

// A Message-ID is a single whitespace-free token. Drop anything with whitespace
// or commas (which would break the space-joined References list or inject a
// header). Accepts ids with or without angle brackets (Resend may omit them).
export function sanitizeMessageId(id) {
  const s = stripControlChars(id);
  if (!s || /[\s,]/.test(s)) return null;
  return s;
}

export function replySubject(subject) {
  const s = stripControlChars(subject);
  if (!s) return 'Re:';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function extractEmail(addr) {
  // Take the first address if a comma-joined list, then unwrap "Name <email>".
  const first = String(addr || '').split(',')[0];
  const m = /<([^>]+)>/.exec(first);
  return stripControlChars(m ? m[1] : first);
}

export function replyHeaders(original) {
  const id = sanitizeMessageId(original.rfcMessageId);
  if (!id) return {};
  const refs = [
    ...(original.references || []).map(sanitizeMessageId).filter(Boolean),
    id,
  ];
  return {'In-Reply-To': id, References: refs.join(' ')};
}

function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(iso) {
  return iso || '';
}

// Strip scripts/styles/images/event-handlers from the quoted original so we
// don't forward the sender's tracking pixels or active markup to the recipient.
function sanitizeQuoted(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'b', 'i', 'u', 'em', 'strong', 'a', 'ul', 'ol', 'li',
      'blockquote', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'h1', 'h2', 'h3', 'h4',
    ],
    allowedAttributes: {a: ['href']},
    allowedSchemes: ['http', 'https', 'mailto'],
    // No <img>/<style>/<script>: don't re-emit remote content into the reply.
  });
}

export function quoteOriginal(original, originalHtml) {
  const attribution = `On ${escapeText(formatDate(original.receivedAt))}, ${escapeText(original.from)} wrote:`;
  return (
    '<br><blockquote class="gmail_quote" ' +
    'style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
    `${attribution}<br>${sanitizeQuoted(originalHtml)}</blockquote>`
  );
}

// Returns an error string if the payload can't be sent, else null. Used to
// fail fast instead of queuing a doomed send that retries forever.
export function replyPayloadError(payload) {
  if (!payload.from) {
    return "Can't reply: the original message has no address to send from.";
  }
  if (!payload.to) {
    return "Can't reply: no recipient address found on the original message.";
  }
  return null;
}

// Map the editor's inline images to Resend cid attachment parts. Shared by
// reply/compose/forward assembly.
export function inlineAttachmentParts(inlineImages) {
  return (inlineImages || []).map(img => ({
    filename: img.filename,
    content: img.base64,
    content_type: img.contentType,
    content_id: img.contentId,
  }));
}

export function assembleReplyPayload({original, replyHtml, originalHtml, inlineImages = [], attachments = []}) {
  const inlineParts = inlineAttachmentParts(inlineImages);
  return {
    from: extractEmail((original.to && original.to[0]) || ''),
    to: extractEmail(original.from),
    subject: replySubject(original.subject),
    headers: replyHeaders(original),
    html: `${replyHtml || ''}${quoteOriginal(original, originalHtml)}`,
    attachments: [...inlineParts, ...attachments],
  };
}
