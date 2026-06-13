const BASE = 'https://api.resend.com';

export function createResendClient({apiKey, fetchImpl = fetch} = {}) {
  async function request(path, {method = 'GET', body} = {}) {
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }
  return {request};
}
