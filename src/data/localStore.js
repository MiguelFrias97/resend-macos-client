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
  direction TEXT DEFAULT 'received'
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, message_id TEXT, filename TEXT, content_type TEXT, size INTEGER,
  content_id TEXT, disposition TEXT, download_url TEXT, local_path TEXT, downloaded INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, thread_id TEXT, payload TEXT, sent_message TEXT, status TEXT DEFAULT 'pending', resend_send_id TEXT, attempt_count INTEGER DEFAULT 0, last_error TEXT, created_at TEXT);`;

async function runSchema(db) {
  for (const stmt of SCHEMA.split(';')) {
    const trimmed = stmt.trim();
    if (trimmed) await db.execute(trimmed);
  }
}

const FILTERS = {
  inbox: `direction='received' AND archived=0`,
  unread: `direction='received' AND archived=0 AND seen=0`,
  starred: `direction='received' AND starred=1`,
  archive: `direction='received' AND archived=1`,
};

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
    html: r.html,
    text: r.text,
    bodyFetched: Boolean(r.body_fetched),
  };
}

export async function createLocalStore(db) {
  await runSchema(db);

  async function upsertMessage(m) {
    await db.execute(
      `INSERT INTO messages (id, thread_id, sender, subject, received_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         thread_id=excluded.thread_id,
         sender=excluded.sender,
         subject=excluded.subject,
         received_at=excluded.received_at`,
      [m.id, m.threadId, m.from, m.subject, m.receivedAt],
    );
  }

  async function listMessages(filter = 'inbox') {
    const where = FILTERS[filter] ?? FILTERS.inbox;
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction FROM messages WHERE ${where} ORDER BY received_at DESC`,
    );
    return res.rows.map(mapRow);
  }

  async function listInbox() {
    return listMessages('inbox');
  }

  async function searchMessages(query) {
    const like = `%${query}%`;
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction FROM messages WHERE direction='received' AND (sender LIKE ? OR subject LIKE ? OR text LIKE ?) ORDER BY received_at DESC`,
      [like, like, like],
    );
    return res.rows.map(mapRow);
  }

  async function listThread(threadId) {
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen, starred, archived, direction, html, text, body_fetched FROM messages WHERE thread_id=? ORDER BY received_at ASC`,
      [threadId],
    );
    return res.rows.map(mapRow);
  }

  async function setFlag(column, id, value) {
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

  return {
    upsertMessage,
    listInbox,
    listMessages,
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
  };
}
