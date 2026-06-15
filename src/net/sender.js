import {createResendClient} from './resendClient';

export function createSender({apiKey, fetchImpl} = {}) {
  const client = createResendClient({apiKey, fetchImpl});
  // idempotencyKey makes a retried send safe: if a prior attempt actually
  // reached Resend but the response was lost, Resend de-dupes on the key.
  async function send(payload, {idempotencyKey} = {}) {
    const headers = idempotencyKey ? {'Idempotency-Key': idempotencyKey} : undefined;
    const res = await client.request('/emails', {method: 'POST', body: payload, headers});
    if (res.status < 200 || res.status >= 300) {
      let detail = '';
      try {
        // Server message is untrusted and unbounded — cap it before it gets
        // thrown, persisted to the outbox, and shown in the UI.
        const msg = (await res.json()).message;
        detail = typeof msg === 'string' ? msg.slice(0, 300) : '';
      } catch (e) {
        detail = '';
      }
      const err = new Error(`send failed: ${res.status} ${detail}`.trim());
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  return {send};
}
