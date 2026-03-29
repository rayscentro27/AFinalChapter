const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export type EncryptedJsonBundle = {
  alg: 'AES-GCM';
  iv_b64: string;
  ciphertext_b64: string;
};

export async function encryptJson(payload: unknown, secret: string): Promise<EncryptedJsonBundle> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload ?? {}));

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    alg: 'AES-GCM',
    iv_b64: bytesToBase64(iv),
    ciphertext_b64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson(bundle: EncryptedJsonBundle, secret: string): Promise<unknown> {
  const key = await deriveKey(secret);
  const iv = base64ToBytes(bundle.iv_b64);
  const ciphertext = base64ToBytes(bundle.ciphertext_b64);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}
