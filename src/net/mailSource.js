import {createResendClient} from './resendClient';
import {validateReceivedEmail} from '../data/validators';

export function createMailSource({apiKey, fetchImpl} = {}) {
  const client = createResendClient({apiKey, fetchImpl});

  async function fetchPage({limit = 100, after} = {}) {
    const q = new URLSearchParams({limit: String(limit)});
    if (after) q.set('after', after);
    const res = await client.request(`/emails/receiving?${q.toString()}`);
    if (res.status !== 200) {
      throw new Error(`listReceived failed: ${res.status}`);
    }
    const body = await res.json();
    return Array.isArray(body.data) ? body.data : [];
  }

  function normalize(rawItems, onSkip) {
    const out = [];
    for (const raw of rawItems) {
      try {
        out.push(validateReceivedEmail(raw));
      } catch (e) {
        if (onSkip) onSkip(raw, e);
      }
    }
    return out;
  }

  async function listReceived({limit = 100, after, onSkip} = {}) {
    return normalize(await fetchPage({limit, after}), onSkip);
  }

  // Walk pages via the `after` cursor; cap pages for safety.
  async function listAllReceived({pageSize = 100, maxPages = 50, onSkip} = {}) {
    const all = [];
    let after;
    for (let i = 0; i < maxPages; i++) {
      const raw = await fetchPage({limit: pageSize, after});
      if (!raw.length) break;
      all.push(...normalize(raw, onSkip));
      if (raw.length < pageSize) break;
      after = raw[raw.length - 1].id;
    }
    return all;
  }

  return {listReceived, listAllReceived};
}
