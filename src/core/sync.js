import {threadIdFor} from './threading';

export async function syncOnce({source, store, knownThreads = {}, onSkip} = {}) {
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
  let count = 0;
  for (const m of ordered) {
    const threadId = threadIdFor(m, knownThreads);
    if (m.rfcMessageId) knownThreads[m.rfcMessageId] = threadId;
    await store.upsertMessage({...m, threadId});
    count += 1;
  }
  return count;
}

export function startSyncLoop({
  source,
  store,
  intervalMs = 25000,
  schedule = setInterval,
  onError,
  onTick,
} = {}) {
  const knownThreads = {};
  const tick = async () => {
    try {
      const n = await syncOnce({source, store, knownThreads});
      if (onTick) onTick(n);
    } catch (e) {
      if (onError) onError(e);
    }
  };
  tick();
  const handle = schedule(tick, intervalMs);
  return () => clearInterval(handle);
}
