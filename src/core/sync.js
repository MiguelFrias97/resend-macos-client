import {threadIdFor} from './threading';

export async function syncOnce({
  source,
  store,
  // Null-prototype map: keys are attacker-controlled Message-IDs (see threadIdFor).
  knownThreads = Object.create(null),
  knownIds,
  onNewMessages,
  onSkip,
} = {}) {
  const messages = source.listAllReceived
    ? await source.listAllReceived({onSkip})
    : await source.listReceived({limit: 100, onSkip});
  // Oldest-first so a parent is ingested before its replies. Compare by parsed
  // timestamp with an id tiebreak, for a total/stable order even on ties or
  // null/malformed timestamps.
  const ordered = [...messages].sort((a, b) => {
    const ta = Date.parse(a.receivedAt) || 0;
    const tb = Date.parse(b.receivedAt) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const fresh = [];
  let count = 0;
  for (const m of ordered) {
    const threadId = threadIdFor(m, knownThreads);
    if (m.rfcMessageId) knownThreads[m.rfcMessageId] = threadId;
    await store.upsertMessage({...m, threadId});
    if (knownIds && !knownIds.has(m.id)) {
      fresh.push(m);
      knownIds.add(m.id);
    }
    count += 1;
  }
  if (onNewMessages && fresh.length) onNewMessages(fresh);
  return count;
}

export function startSyncLoop({
  source,
  store,
  intervalMs = 25000,
  schedule = setInterval,
  onError,
  onTick,
  onNewMessages,
} = {}) {
  const knownThreads = Object.create(null);
  const knownIds = new Set();
  let seeded = false;
  const tick = async () => {
    try {
      // The first tick seeds knownIds without notifying (don't alert for the
      // whole existing mailbox on launch).
      const n = await syncOnce({
        source,
        store,
        knownThreads,
        knownIds,
        onNewMessages: seeded ? onNewMessages : undefined,
      });
      seeded = true;
      if (onTick) onTick(n);
    } catch (e) {
      if (onError) onError(e);
    }
  };
  tick();
  const handle = schedule(tick, intervalMs);
  return () => clearInterval(handle);
}
