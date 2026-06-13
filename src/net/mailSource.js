import {createResendClient} from './resendClient';
import {validateReceivedEmail} from '../data/validators';

export function createMailSource({apiKey, fetchImpl} = {}) {
  const client = createResendClient({apiKey, fetchImpl});

  async function listReceived({limit = 20, after} = {}) {
    const q = new URLSearchParams({limit: String(limit)});
    if (after) q.set('after', after);
    const res = await client.request(`/emails/receiving?${q.toString()}`);
    if (res.status !== 200) {
      throw new Error(`listReceived failed: ${res.status}`);
    }
    const body = await res.json();
    const data = Array.isArray(body.data) ? body.data : [];
    return data.map(validateReceivedEmail);
  }

  return {listReceived};
}
