import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENVELOPE_VERSION = 1;
const ENVELOPE_ALGORITHM = 'aes-256-gcm';
const ENV_KEY_NAME = 'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY';
const ENV_ACTIVE_KID_NAME = 'INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID';
const ENV_KEYRING_NAME = 'INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING';
const ENV_PREVIOUS_KEY_NAME = 'INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY';

type JsonRecord = Record<string, any>;
type KeyCandidate = {
  kid: string;
  secret: string;
  source: 'keyring' | 'primary' | 'previous';
};

type EncryptedCredentialsEnvelope = {
  __enc_v: number;
  alg: string;
  kid?: string;
  iv: string;
  tag: string;
  data: string;
};

function configError(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 500;
  return err;
}

function asRecord(value: any): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function getEncryptionSecret(envKey: string): string {
  return String(process.env[envKey] || '').trim();
}

function getOptionalEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function deriveAes256Key(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function isEnvelope(value: any): value is EncryptedCredentialsEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    value.__enc_v === ENVELOPE_VERSION &&
    value.alg === ENVELOPE_ALGORITHM &&
    (value.kid === undefined || typeof value.kid === 'string') &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.data === 'string'
  );
}

function parseKeyring(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const out: Record<string, string> = {};
    for (const [kid, value] of Object.entries(parsed as Record<string, any>)) {
      if (!kid || typeof value !== 'string') continue;
      const secret = value.trim();
      if (secret) out[kid.trim()] = secret;
    }
    return out;
  } catch {
    throw configError(`${ENV_KEYRING_NAME} must be a JSON object like {"kid":"secret"}.`);
  }
}

function resolveActiveEncryptionKey(envKey: string): KeyCandidate {
  const primarySecret = getEncryptionSecret(envKey);
  const activeKid = getOptionalEnv(ENV_ACTIVE_KID_NAME);
  const keyring = parseKeyring(getOptionalEnv(ENV_KEYRING_NAME));

  if (activeKid) {
    if (keyring[activeKid]) {
      return { kid: activeKid, secret: keyring[activeKid], source: 'keyring' };
    }
    if (primarySecret) {
      return { kid: activeKid, secret: primarySecret, source: 'primary' };
    }
    throw configError(`Missing active key material for kid=${activeKid}. Configure ${ENV_KEYRING_NAME} or ${envKey}.`);
  }

  if (primarySecret) {
    return { kid: 'primary', secret: primarySecret, source: 'primary' };
  }

  const keyringEntries = Object.entries(keyring);
  if (keyringEntries.length === 1) {
    const [kid, secret] = keyringEntries[0];
    return { kid, secret, source: 'keyring' };
  }

  if (keyringEntries.length > 1) {
    throw configError(`Multiple keys found in ${ENV_KEYRING_NAME}; set ${ENV_ACTIVE_KID_NAME} to choose one.`);
  }

  throw configError(`${envKey} is required to store integration credentials securely.`);
}

function addCandidate(list: KeyCandidate[], seen: Set<string>, candidate?: KeyCandidate) {
  if (!candidate || !candidate.secret) return;
  const dedupe = `${candidate.kid}:${candidate.secret}`;
  if (seen.has(dedupe)) return;
  seen.add(dedupe);
  list.push(candidate);
}

function resolveDecryptCandidates(envKey: string, storedKid?: string): KeyCandidate[] {
  const primarySecret = getEncryptionSecret(envKey);
  const previousSecret = getOptionalEnv(ENV_PREVIOUS_KEY_NAME);
  const activeKid = getOptionalEnv(ENV_ACTIVE_KID_NAME);
  const keyring = parseKeyring(getOptionalEnv(ENV_KEYRING_NAME));
  const candidates: KeyCandidate[] = [];
  const seen = new Set<string>();

  if (storedKid && keyring[storedKid]) {
    addCandidate(candidates, seen, { kid: storedKid, secret: keyring[storedKid], source: 'keyring' });
  }

  if (storedKid && primarySecret && activeKid === storedKid) {
    addCandidate(candidates, seen, { kid: storedKid, secret: primarySecret, source: 'primary' });
  }

  try {
    addCandidate(candidates, seen, resolveActiveEncryptionKey(envKey));
  } catch {
    // Keep compatibility for decrypt-only environments with legacy key setup.
  }

  if (primarySecret) {
    addCandidate(candidates, seen, {
      kid: activeKid || storedKid || 'primary',
      secret: primarySecret,
      source: 'primary',
    });
  }

  if (previousSecret) {
    addCandidate(candidates, seen, { kid: 'previous', secret: previousSecret, source: 'previous' });
  }

  for (const [kid, secret] of Object.entries(keyring)) {
    addCandidate(candidates, seen, { kid, secret, source: 'keyring' });
  }

  return candidates;
}

export function encryptIntegrationCredentials(
  credentials: JsonRecord,
  args: { envKey?: string } = {}
): EncryptedCredentialsEnvelope {
  const envKey = args.envKey || ENV_KEY_NAME;
  const activeKey = resolveActiveEncryptionKey(envKey);

  const key = deriveAes256Key(activeKey.secret);
  const iv = randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(asRecord(credentials)), 'utf8');

  const cipher = createCipheriv(ENVELOPE_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    __enc_v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALGORITHM,
    kid: activeKey.kid,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptIntegrationCredentials(
  stored: any,
  args: { envKey?: string; allowPlaintext?: boolean } = {}
): JsonRecord {
  const envKey = args.envKey || ENV_KEY_NAME;
  const allowPlaintext = args.allowPlaintext !== false;

  if (!isEnvelope(stored)) {
    if (!allowPlaintext) {
      throw configError('Integration credentials are not encrypted; plaintext credentials are rejected.');
    }
    return asRecord(stored);
  }

  const candidates = resolveDecryptCandidates(envKey, stored.kid);
  if (candidates.length === 0) {
    throw configError(`${envKey} is required to decrypt integration credentials.`);
  }

  const iv = Buffer.from(stored.iv, 'base64');
  const tag = Buffer.from(stored.tag, 'base64');
  const ciphertext = Buffer.from(stored.data, 'base64');

  for (const candidate of candidates) {
    try {
      const key = deriveAes256Key(candidate.secret);
      const decipher = createDecipheriv(ENVELOPE_ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      const parsed = JSON.parse(decrypted);
      return asRecord(parsed);
    } catch {
      // Try next candidate.
    }
  }

  throw configError('Unable to decrypt integration credentials. Verify encryption key rotation configuration.');
}

export function maskIntegrationCredentials(
  provider: string,
  stored: any,
  args: { envKey?: string } = {}
): Record<string, string> {
  try {
    const credentials = decryptIntegrationCredentials(stored, { envKey: args.envKey, allowPlaintext: true });
    const masked: Record<string, string> = {};

    for (const [k, v] of Object.entries(credentials || {})) {
      if (typeof v !== 'string') continue;
      if (k.includes('token') || k.includes('key')) masked[k] = maskSecret(v);
      else masked[k] = v;
    }

    if (provider === 'stripe' && credentials?.secret_key && !masked.secret_key) {
      masked.secret_key = maskSecret(String(credentials.secret_key));
    }

    return masked;
  } catch {
    return { encrypted: 'true' };
  }
}

function maskSecret(value: string) {
  const v = String(value || '');
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}
