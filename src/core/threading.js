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
// Keys come from attacker-controlled Message-IDs, so look them up with
// hasOwnProperty — a ref of "__proto__"/"constructor" must not match an
// inherited Object.prototype member (which would return a non-string threadId).
export function threadIdFor(m, knownThreads = Object.create(null)) {
  const refs = [...(m.references || []), m.inReplyTo].filter(Boolean);
  for (const ref of refs) {
    if (Object.prototype.hasOwnProperty.call(knownThreads, ref)) {
      return knownThreads[ref];
    }
  }
  if (m.inReplyTo) return m.inReplyTo;
  if (refs.length) return refs[0];
  return `subj:${normalizeSubject(m.subject)}::${participantsKey(m)}`;
}
