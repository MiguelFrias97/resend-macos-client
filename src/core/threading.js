function normalizeSubject(s) {
  return (s || '')
    .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}

function participantsKey(m) {
  const all = [m.from, ...(m.to || [])]
    .map(x => String(x).toLowerCase())
    .sort();
  return all.join('|');
}

// knownThreads: map of rfcMessageId -> threadId for already-ingested messages.
export function threadIdFor(m, knownThreads = {}) {
  const refs = [...(m.references || []), m.inReplyTo].filter(Boolean);
  for (const ref of refs) {
    if (knownThreads[ref]) return knownThreads[ref];
  }
  if (m.inReplyTo) return m.inReplyTo;
  if (refs.length) return refs[0];
  return `subj:${normalizeSubject(m.subject)}::${participantsKey(m)}`;
}
