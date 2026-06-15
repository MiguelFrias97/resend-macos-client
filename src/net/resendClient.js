const BASE = 'https://api.resend.com';

export function createResendClient({apiKey, fetchImpl = fetch} = {}) {
  async function request(path, {method = 'GET', body, headers} = {}) {
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        // Caller headers first so the bearer credential and content-type below
        // can't be clobbered (e.g. a stray Authorization override).
        ...(headers || {}),
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }
  return {request};
}
