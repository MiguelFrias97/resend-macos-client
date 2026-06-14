const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  sender TEXT,
  subject TEXT,
  received_at TEXT,
  seen INTEGER DEFAULT 0,
  html TEXT,
  text TEXT,
  body_fetched INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, message_id TEXT, filename TEXT, content_type TEXT, size INTEGER,
  content_id TEXT, disposition TEXT, download_url TEXT, local_path TEXT, downloaded INTEGER DEFAULT 0
);`;

async function runSchema(db) {
  for (const stmt of SCHEMA.split(';')) {
    const trimmed = stmt.trim();
    if (trimmed) await db.execute(trimmed);
  }
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

  async function listInbox() {
    const res = await db.execute(
      `SELECT id, thread_id, sender, subject, received_at, seen FROM messages ORDER BY received_at DESC`,
    );
    return res.rows.map(r => ({
      id: r.id,
      threadId: r.thread_id,
      from: r.sender,
      subject: r.subject,
      receivedAt: r.received_at,
      seen: Boolean(r.seen),
    }));
  }

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

  return {
    upsertMessage,
    listInbox,
    saveBody,
    getMessage,
    saveAttachments,
    listAttachments,
    markAttachmentDownloaded,
  };
}
