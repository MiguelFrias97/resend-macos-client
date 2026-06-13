import {createResendClient} from './resendClient';

export async function verifyApiKey(apiKey, {fetchImpl} = {}) {
  const client = createResendClient({apiKey, fetchImpl});
  const res = await client.request('/emails/receiving?limit=1');
  return res.status === 200;
}
