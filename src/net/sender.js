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
        detail = (await res.json()).message || '';
      } catch (e) {
        detail = '';
      }
      throw new Error(`send failed: ${res.status} ${detail}`.trim());
    }
    return res.json();
  }
  return {send};
}
