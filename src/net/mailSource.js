import {createResendClient} from './resendClient';
import {
  validateReceivedEmail,
  validateReceivedEmailContent,
  validateAttachmentMeta,
} from '../data/validators';

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
      // Advance only on a usable id; otherwise stop rather than drop the cursor
      // and re-fetch page 1 forever (an undefined `after` omits the param).
      const next = raw[raw.length - 1].id;
      if (!next) break;
      after = next;
    }
    return all;
  }

  async function getReceivedEmail(id) {
    const res = await client.request(`/emails/receiving/${encodeURIComponent(id)}`);
    if (res.status !== 200) throw new Error(`getReceivedEmail failed: ${res.status}`);
    return validateReceivedEmailContent(await res.json());
  }

  async function getAttachment(emailId, attId) {
    const res = await client.request(`/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attId)}`);
    if (res.status !== 200) throw new Error(`getAttachment failed: ${res.status}`);
    return validateAttachmentMeta(await res.json());
  }

  async function downloadBytes(downloadUrl) {
    // download_url is server-supplied. Require https so a spoofed/MITM'd response
    // can't redirect the fetch to file:// (local-file read) or an internal host
    // (SSRF). Resend's presigned download URLs are always https.
    let parsed;
    try {
      parsed = new URL(String(downloadUrl));
    } catch (e) {
      throw new Error('downloadBytes: invalid url');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('downloadBytes: refusing non-https url');
    }
    // Block redirects: the https check only covers the first hop, so a 30x to
    // http://localhost or an internal host would otherwise be followed.
    const res = await (fetchImpl || fetch)(parsed.toString(), {redirect: 'manual'});
    if (res.status >= 300 && res.status < 400) {
      throw new Error('downloadBytes: refusing to follow redirect');
    }
    if (res.status !== 200) throw new Error(`downloadBytes failed: ${res.status}`);
    return res;
  }

  return {
    listReceived,
    listAllReceived,
    getReceivedEmail,
    getAttachment,
    downloadBytes,
  };
}
