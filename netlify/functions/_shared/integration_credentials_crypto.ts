import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENVELOPE_VERSION = 1;
const ENVELOPE_ALGORITHM = 'aes-256-gcm';
const ENV_KEY_NAME = 'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY';

type JsonRecord = Record<string, any>;

type EncryptedCredentialsEnvelope = {
  __enc_v: number;
  alg: string;
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

function deriveAes256Key(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function isEnvelope(value: any): value is EncryptedCredentialsEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    value.__enc_v === ENVELOPE_VERSION &&
    value.alg === ENVELOPE_ALGORITHM &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.data === 'string'
  );
}

export function encryptIntegrationCredentials(
  credentials: JsonRecord,
  args: { envKey?: string } = {}
): EncryptedCredentialsEnvelope {
  const envKey = args.envKey || ENV_KEY_NAME;
  const secret = getEncryptionSecret(envKey);
  if (!secret) {
    throw configError(`${envKey} is required to store integration credentials securely.`);
  }

  const key = deriveAes256Key(secret);
  const iv = randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(asRecord(credentials)), 'utf8');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    __enc_v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALGORITHM,
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

  const secret = getEncryptionSecret(envKey);
  if (!secret) {
    throw configError(`${envKey} is required to decrypt integration credentials.`);
  }

  const key = deriveAes256Key(secret);
  const iv = Buffer.from(stored.iv, 'base64');
  const tag = Buffer.from(stored.tag, 'base64');
  const ciphertext = Buffer.from(stored.data, 'base64');

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted);
    return asRecord(parsed);
  } catch {
    throw configError('Unable to decrypt integration credentials. Verify encryption key configuration.');
  }
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
