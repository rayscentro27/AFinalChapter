import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import crypto from 'node:crypto';

import { google } from 'googleapis';

import { ENV } from '../../env.js';

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
];

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function oauthConfig() {
  const clientId = asText(ENV.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = asText(ENV.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = asText(ENV.GOOGLE_OAUTH_REDIRECT_URI) || 'https://api.goclearonline.cc/api/google/oauth/callback';
  const tokenFile = asText(ENV.GOOGLE_OAUTH_TOKEN_FILE) || '/opt/nexus-api/secrets/google-oauth-tokens.json';
  const stateFile = asText(ENV.GOOGLE_OAUTH_STATE_FILE) || '/opt/nexus-api/secrets/google-oauth-state.json';

  return {
    configured: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectUri,
    tokenFile,
    stateFile,
  };
}

async function ensureParentDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureParentDir(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await access(filePath);
}

export function getGoogleOAuthConfig() {
  return {
    ...oauthConfig(),
    scopes: [...GOOGLE_OAUTH_SCOPES],
  };
}

export function createGoogleOAuthClient() {
  const config = oauthConfig();
  if (!config.configured) {
    const error = new Error('google_oauth_not_configured');
    error.statusCode = 503;
    error.details = {
      client_id: Boolean(config.clientId),
      client_secret: Boolean(config.clientSecret),
      redirect_uri: Boolean(config.redirectUri),
    };
    throw error;
  }

  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export async function createGoogleOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

export async function persistGoogleOAuthState(state) {
  const config = oauthConfig();
  if (!config.configured) return null;
  const payload = {
    state,
    created_at: new Date().toISOString(),
  };
  await writeJson(config.stateFile, payload);
  try {
    await import('node:fs/promises').then((fs) => fs.chmod(config.stateFile, 0o600));
  } catch {}
  return payload;
}

export async function loadGoogleOAuthState() {
  const config = oauthConfig();
  if (!config.configured) return null;
  try {
    const raw = await readFile(config.stateFile, 'utf8');
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export async function clearGoogleOAuthState() {
  const config = oauthConfig();
  try {
    await unlink(config.stateFile);
  } catch {
    // ignore missing state file
  }
}

export async function saveGoogleOAuthTokens(tokens) {
  const config = oauthConfig();
  if (!config.configured) return null;

  const payload = {
    ...tokens,
    saved_at: new Date().toISOString(),
  };

  await writeJson(config.tokenFile, payload);
  try {
    await import('node:fs/promises').then((fs) => fs.chmod(config.tokenFile, 0o600));
  } catch {}
  return payload;
}

export async function loadGoogleOAuthTokens() {
  const config = oauthConfig();
  if (!config.configured) return null;
  try {
    const raw = await readFile(config.tokenFile, 'utf8');
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export async function buildGoogleOAuthUrl({ state } = {}) {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  });
}

export async function exchangeGoogleOAuthCode(code) {
  const client = createGoogleOAuthClient();
  const response = await client.getToken(code);
  const tokens = response?.tokens || response?.[0] || null;
  if (!tokens) {
    throw new Error('google_oauth_token_exchange_failed');
  }
  await saveGoogleOAuthTokens(tokens);
  client.setCredentials(tokens);
  return { client, tokens };
}

export async function getAuthorizedGoogleOAuthClient() {
  const client = createGoogleOAuthClient();
  const tokens = await loadGoogleOAuthTokens();
  if (!tokens) {
    const error = new Error('google_oauth_not_connected');
    error.statusCode = 409;
    throw error;
  }

  client.setCredentials(tokens);
  client.on('tokens', async (nextTokens) => {
    try {
      const merged = { ...tokens, ...nextTokens };
      await saveGoogleOAuthTokens(merged);
    } catch {}
  });

  return { client, tokens };
}

export function isGoogleOAuthConfigured() {
  return oauthConfig().configured;
}
