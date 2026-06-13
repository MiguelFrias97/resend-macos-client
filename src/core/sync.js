import {threadIdFor} from './threading';

export async function syncOnce({source, store, knownThreads = {}}) {
  const messages = await source.listReceived({limit: 100});
  let count = 0;
  for (const m of messages) {
    const threadId = threadIdFor(m, knownThreads);
    if (m.rfcMessageId) knownThreads[m.rfcMessageId] = threadId;
    await store.upsertMessage({...m, threadId});
    count += 1;
  }
  return count;
}

export function startSyncLoop({source, store, intervalMs = 25000, schedule = setInterval}) {
  const knownThreads = {};
  const tick = () => syncOnce({source, store, knownThreads}).catch(() => {});
  tick();
  const handle = schedule(tick, intervalMs);
  return () => clearInterval(handle);
}
