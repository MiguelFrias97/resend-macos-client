const BASE = 'https://api.resend.com';

export function createResendClient({apiKey, fetchImpl = fetch} = {}) {
  async function request(path, {method = 'GET', body, headers} = {}) {
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }
  return {request};
}
