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
    await store.setOutboxStatus(item.id, 'failed', {lastError: e.message, attemptCount: (item.attemptCount || 0) + 1});
    return {ok: false, error: e};
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
