const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  sender TEXT,
  subject TEXT,
  received_at TEXT,
  seen INTEGER DEFAULT 0
);`;

export async function createLocalStore(db) {
  await db.execute(SCHEMA);

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

  return {upsertMessage, listInbox};
}
