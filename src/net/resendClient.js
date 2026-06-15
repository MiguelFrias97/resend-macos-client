const BASE = 'https://api.resend.com';

export function createResendClient({apiKey, fetchImpl = fetch} = {}) {
  // Trim defensively: a stray newline/space in the key makes the Authorization
  // header malformed and Resend rejects it with 400 "API key is invalid".
  const token = String(apiKey == null ? '' : apiKey).trim();
  async function request(path, {method = 'GET', body, headers} = {}) {
    // Caller headers first so the bearer credential below can't be clobbered.
    // Only declare a JSON body type when we actually send a body — sending
    // `Content-Type: application/json` on a bodyless GET makes a strict server
    // try to parse an empty body and reject the request with 400.
    const finalHeaders = {...(headers || {}), Authorization: `Bearer ${token}`};
    if (body) finalHeaders['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }
  return {request};
}
