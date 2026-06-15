import {createResendClient} from './resendClient';

// Verify a Resend API key against the inbound list endpoint.
//
// Returns {ok:true} on success, or {ok:false, status, reason} so the UI can tell
// an invalid/forbidden key (401/403) apart from "inbound not enabled" (404/422),
// a server error (5xx), or a network failure (status 0) — instead of collapsing
// every failure into a blanket "rejected".
export async function verifyApiKey(apiKey, {fetchImpl} = {}) {
  try {
    const client = createResendClient({apiKey, fetchImpl});
    const res = await client.request('/emails/receiving?limit=1');
    if (res.status === 200) return {ok: true};
    let reason = '';
    try {
      reason = ((await res.json()) || {}).message || '';
    } catch (e) {
      reason = '';
    }
    return {ok: false, status: res.status, reason};
  } catch (e) {
    return {ok: false, status: 0, reason: (e && e.message) || 'network error'};
  }
}
