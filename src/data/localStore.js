const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  sender TEXT,
  subject TEXT,
  received_at TEXT,
  seen INTEGER DEFAULT 0,
  starred INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  html TEXT,
  text TEXT,
  body_fetched INTEGER DEFAULT 0,
  direction TEXT DEFAULT 'received',
  rfc_message_id TEXT,
  recipient TEXT
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, message_id TEXT, filename TEXT, content_type TEXT, size INTEGER,
  content_id TEXT, disposition TEXT, download_url TEXT, local_path TEXT, downloaded INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, thread_id TEXT, payload TEXT, sent_message TEXT, status TEXT DEFAULT 'pending', resend_send_id TEXT, attempt_count INTEGER DEFAULT 0, last_error TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`;

async function runSchema(db) {
  for (const stmt of SCHEMA.split(';')) {
    const trimmed = stmt.trim();
    if (trimmed) await db.execute(trimmed);
  }
  // Migrations for databases created before a column existed. ADD COLUMN throws
  // if it's already there, so each is best-effort.
  for (const alter of ['ALTER TABLE messages ADD COLUMN recipient TEXT']) {
    try {
      await db.execute(alter);
    } catch (e) {
      // column already exists — fine
    }
  }
}

const FILTERS = {
  inbox: `direction='received' AND archived=0`,
  unread: `direction='received' AND archived=0 AND seen=0`,
  starred: `direction='received' AND starred=1 AND archived=0`,
  archive: `direction='received' AND archived=1`,
  sent: `direction='sent'`,
};

// Collapse a plaintext body into a short, single-line list preview.
function previewFromText(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 140);
}

function mapRow(r) {
  return {
    id: r.id,
    threadId: r.thread_id,
    from: r.sender,
    subject: r.subject,
    receivedAt: r.received_at,
    seen: Boolean(r.seen),
    starred: Boolean(r.starred),
    archived: Boolean(r.archived),
    direction: r.direction ?? 'received',
    recipient: r.recipient ?? null,
    // Surface the stored recipient as a to[] so the reply's From can be derived.
    to: r.recipient ? [r.recipient] : [],
    html: r.html,
    text: r.text,
    // One-line preview for the list (only present once a body has been fetched).
    snippet: previewFromText(r.text),
    bodyFetched: Boolean(r.body_fetched),
  };
}

export async function createLocalStore(db) {
  await runSchema(db);

  async function upsertMessage(m) {
    // recipient = the address this mail was received at; it becomes the reply's
    // From (the user's own verified inbound address).
    const recipient = Array.isArray(m.to) && m.to.length ? m.to[0] : m.recipient ?? null;
    await db.execute(
      `INSERT INTO messages (id, thread_id, sender, subject, received_at, rfc_message_id, recipient)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         thread_id=excluded.thread_id,
         sender=excluded.sender,
         subject=excluded.subject,
         received_at=excluded.received_at,
         rfc_message_id=excluded.rfc_message_id,
         recipient=COALESCE(excluded.recipient, messages.recipient)`,
      [m.id, m.threadId, m.from, m.subject, m.receivedAt, m.rfcMessageId ?? null, recipient],
    );
  }

  // Group a message into its parent's thread by RFC Message-ID, using the
  // In-Reply-To / References headers (only available once the body is retrieved,
  // since the list endpoint omits them). Returns the adopted thread id or null.
  async function rethreadByHeaders(messageId, inReplyTo, references) {
    const refs = [inReplyTo, ...(references || [])].filter(Boolean);
    if (!refs.length) return null;
    const placeholders = refs.map(() => '?').join(',');
    const res = await db.execute(
      `SELECT thread_id FROM messages WHERE rfc_message_id IN (${placeholders}) AND id != ? LIMIT 1`,
      [...refs, messageId],
    );
    const parentThread = res.rows[0] ? res.rows[0].thread_id : null;
    if (!parentThread) return null;
    const cur = await db.execute(`SELECT thread_id FROM messages WHERE id=?`, [messageId]);
    const oldThread = cur.rows[0] ? cur.rows[0].thread_id : null;
    if (oldThread && oldThread !== parentThread) {
      // Merge this message's WHOLE current thread into the parent's, so any
      // replies already grouped under it come along (no orphaned split thread).
      await db.execute(`UPDATE messages SET thread_id=? WHERE thread_id=?`, [parentThread, oldThread]);
    } else {
      await db.execute(`UPDATE messages SET thread_id=? WHERE id=?`, [parentThread, messageId]);
    }
    return parentThread;
  }

  async function listMessages(filter = 'inbox') {
    // `where` is a static SQL fragment interpolated below, so the filter key must
    // come from the hardcoded FILTERS allowlist — never accept an arbitrary key.
    const where = Object.prototype.hasOwnProperty.call(FILTERS, filter)
      ? FILTERS[filter]
      : FILTERS.inbox;
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction, recipient, text FROM messages WHERE ${where} ORDER BY received_at DESC`,
    );
    return res.rows.map(mapRow);
  }

  // Per-folder counts for the sidebar. Returns total per filter plus the unread
  // total, which is what the sidebar badges show.
  async function counts() {
    const out = {};
    for (const key of Object.keys(FILTERS)) {
      const res = await db.execute(
        `SELECT COUNT(*) AS n FROM messages WHERE ${FILTERS[key]}`,
      );
      out[key] = (res.rows[0] && res.rows[0].n) || 0;
    }
    return out;
  }

  async function listInbox() {
    return listMessages('inbox');
  }

  async function searchMessages(query) {
    // Escape LIKE wildcards so a query of "%" or "_" matches literally instead of
    // everything (and can't force a pathological scan). Values are parameterized.
    const esc = String(query ?? '').replace(/[\\%_]/g, c => `\\${c}`);
    const like = `%${esc}%`;
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction FROM messages WHERE direction='received' AND (sender LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\') ORDER BY received_at DESC`,
      [like, like, like],
    );
    return res.rows.map(mapRow);
  }

  async function listThread(threadId) {
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction, recipient, html, text, body_fetched FROM messages WHERE thread_id=? ORDER BY received_at ASC, id ASC`,
      [threadId],
    );
    return res.rows.map(mapRow);
  }

  // Column names can't be parameterized, so the column is interpolated — gate it
  // behind a fixed allowlist so this can never become an injection sink.
  const FLAG_COLUMNS = new Set(['seen', 'starred', 'archived']);
  async function setFlag(column, id, value) {
    if (!FLAG_COLUMNS.has(column)) {
      throw new Error(`setFlag: invalid column ${column}`);
    }
    await db.execute(`UPDATE messages SET ${column}=? WHERE id=?`, [
      value ? 1 : 0,
      id,
    ]);
  }

  const setSeen = (id, value) => setFlag('seen', id, value);
  const setStarred = (id, value) => setFlag('starred', id, value);
  const setArchived = (id, value) => setFlag('archived', id, value);

  async function saveBody(id, {html, text}) {
    await db.execute(
      `UPDATE messages SET html=?, text=?, body_fetched=1 WHERE id=?`,
      [html, text, id],
    );
  }

  async function getMessage(id) {
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, html, text, body_fetched
       FROM messages WHERE id=?`,
      [id],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      threadId: r.thread_id,
      from: r.sender,
      subject: r.subject,
      receivedAt: r.received_at,
      seen: Boolean(r.seen),
      html: r.html,
      text: r.text,
      bodyFetched: Boolean(r.body_fetched),
    };
  }

  async function saveAttachments(messageId, atts) {
    for (const a of atts) {
      await db.execute(
        `INSERT INTO attachments (id, message_id, filename, content_type, size, content_id, disposition, download_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           message_id=excluded.message_id,
           filename=excluded.filename,
           content_type=excluded.content_type,
           size=excluded.size,
           content_id=excluded.content_id,
           disposition=excluded.disposition,
           download_url=excluded.download_url`,
        [
          a.id,
          messageId,
          a.filename,
          a.contentType,
          a.size,
          a.contentId,
          a.disposition,
          a.downloadUrl,
        ],
      );
    }
  }

  async function listAttachments(messageId) {
    const res = await db.execute(
      `SELECT id, filename, content_type, size, content_id, disposition, download_url, local_path, downloaded
       FROM attachments WHERE message_id=?`,
      [messageId],
    );
    return res.rows.map(r => ({
      id: r.id,
      filename: r.filename,
      contentType: r.content_type,
      size: r.size,
      contentId: r.content_id,
      disposition: r.disposition,
      downloadUrl: r.download_url,
      localPath: r.local_path,
      downloaded: Boolean(r.downloaded),
    }));
  }

  async function markAttachmentDownloaded(id, localPath) {
    await db.execute(
      `UPDATE attachments SET local_path=?, downloaded=1 WHERE id=?`,
      [localPath, id],
    );
  }

  async function enqueueOutbox(item) {
    await db.execute(
      `INSERT INTO outbox (id, thread_id, payload, sent_message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        item.id,
        item.threadId ?? null,
        JSON.stringify(item.payload),
        item.sentMessage ? JSON.stringify(item.sentMessage) : null,
        item.createdAt ?? null,
      ],
    );
  }

  async function setOutboxStatus(id, status, {resendSendId, lastError, attemptCount} = {}) {
    await db.execute(
      `UPDATE outbox SET status=?, resend_send_id=?, last_error=?, attempt_count=COALESCE(?, attempt_count) WHERE id=?`,
      [status, resendSendId ?? null, lastError ?? null, attemptCount ?? null, id],
    );
  }

  async function listPendingOutbox() {
    // 'sending' is included so a row orphaned by a crash/quit mid-send is
    // retried; the idempotency key makes re-sending an in-flight item safe.
    const res = await db.execute(
      `SELECT id, thread_id, payload, sent_message, status, attempt_count FROM outbox WHERE status IN ('pending','failed','sending') ORDER BY created_at ASC`,
    );
    return res.rows.map(r => ({
      id: r.id,
      threadId: r.thread_id,
      payload: JSON.parse(r.payload),
      sentMessage: r.sent_message ? JSON.parse(r.sent_message) : null,
      status: r.status,
      attemptCount: r.attempt_count,
    }));
  }

  async function insertSentMessage(m) {
    await db.execute(
      `INSERT INTO messages (id, thread_id, sender, subject, received_at, direction, html, body_fetched) VALUES (?, ?, ?, ?, ?, 'sent', ?, 1) ON CONFLICT(id) DO UPDATE SET direction='sent', html=excluded.html, body_fetched=1`,
      [m.id, m.threadId, m.from, m.subject, m.receivedAt, m.html ?? null],
    );
  }

  async function setSetting(key, value) {
    await db.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, value],
    );
  }

  async function getSetting(key) {
    const res = await db.execute(`SELECT value FROM settings WHERE key=?`, [key]);
    return res.rows[0] ? res.rows[0].value : null;
  }

  return {
    upsertMessage,
    rethreadByHeaders,
    listInbox,
    listMessages,
    counts,
    searchMessages,
    listThread,
    setSeen,
    setStarred,
    setArchived,
    saveBody,
    getMessage,
    saveAttachments,
    listAttachments,
    markAttachmentDownloaded,
    enqueueOutbox,
    setOutboxStatus,
    listPendingOutbox,
    insertSentMessage,
    setSetting,
    getSetting,
  };
}
