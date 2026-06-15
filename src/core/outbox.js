async function attemptSend({store, sender, item}) {
  await store.setOutboxStatus(item.id, 'sending');
  try {
    // The stable outbox id doubles as the idempotency key so a retry can't
    // double-send if a prior attempt reached Resend but the response was lost.
    const res = await sender.send(item.payload, {idempotencyKey: item.id});
    await store.setOutboxStatus(item.id, 'sent', {resendSendId: res.id});
    if (item.sentMessage) await store.insertSentMessage(item.sentMessage);
    return {ok: true, id: res.id};
  } catch (e) {
    // A 4xx (except 429 rate-limit) is permanent — a bad payload or revoked key
    // won't succeed on retry, so don't keep firing authenticated requests at it.
    // Force attemptCount past the cap so processOutbox stops retrying it.
    const permanent = typeof e.status === 'number' && e.status >= 400 && e.status < 500 && e.status !== 429;
    const attemptCount = permanent ? Number.MAX_SAFE_INTEGER : (item.attemptCount || 0) + 1;
    await store.setOutboxStatus(item.id, 'failed', {lastError: e.message, attemptCount});
    return {ok: false, error: e, permanent};
  }
}

export async function sendReply({store, sender, id, threadId, payload, sentMessage}) {
  await store.enqueueOutbox({id, threadId, payload, sentMessage, createdAt: null});
  return attemptSend({store, sender, item: {id, payload, sentMessage, attemptCount: 0}});
}

export async function processOutbox({store, sender, maxAttempts = 5}) {
  const pending = await store.listPendingOutbox();
  for (const item of pending) {
    if ((item.attemptCount || 0) >= maxAttempts) continue;
    await attemptSend({store, sender, item});
  }
}
