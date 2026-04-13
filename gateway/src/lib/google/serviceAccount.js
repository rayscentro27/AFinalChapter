import { access } from 'node:fs/promises';

import googleapis from 'googleapis';

import { ENV } from '../../env.js';

const { google } = googleapis;

export const GOOGLE_SERVICE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
];

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export function resolveGoogleServiceAccountKeyfile() {
  return asText(ENV.GOOGLE_SERVICE_ACCOUNT_KEYFILE) || '/opt/nexus-api/secrets/google-service-account.json';
}

export async function createGoogleAuth() {
  const keyFile = resolveGoogleServiceAccountKeyfile();
  await access(keyFile);

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: GOOGLE_SERVICE_SCOPES,
  });

  return { auth, keyFile };
}
