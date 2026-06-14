import {createResendClient} from './resendClient';

export function createSender({apiKey, fetchImpl} = {}) {
  const client = createResendClient({apiKey, fetchImpl});
  async function send(payload) {
    const res = await client.request('/emails', {method: 'POST', body: payload});
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
