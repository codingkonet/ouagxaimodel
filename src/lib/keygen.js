// Secure random API-key generator. Runs in the browser (ouagx.com/#/key)
// and under Node. Keys are generated locally and never sent anywhere.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateKey(length = 48) {
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    throw new Error('Key length must be an integer between 16 and 128.');
  }
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('No secure random generator available (crypto.getRandomValues).');
  }
  const bytes = cryptoObj.getRandomValues(new Uint8Array(length));
  let key = '';
  for (let i = 0; i < length; i++) {
    key += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return key;
}
