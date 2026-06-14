import {createMailSource} from './mailSource';

export async function verifyApiKey(apiKey, {fetchImpl} = {}) {
  try {
    const source = createMailSource({apiKey, fetchImpl});
    await source.listReceived({limit: 1});
    return true;
  } catch {
    return false;
  }
}
