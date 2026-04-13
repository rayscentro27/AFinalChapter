import { Readable } from 'node:stream';

import { google } from 'googleapis';

import { ENV } from '../env.js';
import {
  buildGoogleOAuthUrl,
  clearGoogleOAuthState,
  createGoogleOAuthState,
  exchangeGoogleOAuthCode,
  getAuthorizedGoogleOAuthClient,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  loadGoogleOAuthState,
  persistGoogleOAuthState,
} from '../lib/google/oauth.js';
import { createGoogleAuth, GOOGLE_SERVICE_SCOPES, resolveGoogleServiceAccountKeyfile } from '../lib/google/serviceAccount.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }
  return undefined;
}

async function requireGoogleOAuthClient(req, reply) {
  if (!isGoogleOAuthConfigured()) {
    return reply.code(503).send({
      ok: false,
      error: 'google_oauth_not_configured',
      required: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    });
  }
  return undefined;
}

export async function googleRoutes(fastify) {
  fastify.get('/api/google/test', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    try {
      const { auth, keyFile } = await createGoogleAuth();
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = asText(tokenResponse?.token || tokenResponse);

      return reply.send({
        ok: true,
        connected: true,
        authenticated: Boolean(token),
        keyfile: keyFile || resolveGoogleServiceAccountKeyfile(),
        scopes: GOOGLE_SERVICE_SCOPES,
      });
    } catch (error) {
      req.log.error({ err: error }, 'google_service_account_test_failed');
      return reply.code(500).send({
        ok: false,
        connected: false,
        error: String(error?.message || error),
      });
    }
  });

  fastify.get('/api/google/oauth/start', {
    preHandler: [requireApiKey, requireGoogleOAuthClient],
  }, async (_req, reply) => {
    const state = await createGoogleOAuthState();
    await persistGoogleOAuthState(state);
    const authUrl = await buildGoogleOAuthUrl({ state });

    return reply.send({
      ok: true,
      connected: false,
      auth_url: authUrl,
      redirect_uri: getGoogleOAuthConfig().redirectUri,
      scopes: getGoogleOAuthConfig().scopes,
      state,
    });
  });

  fastify.get('/api/google/oauth/status', {
    preHandler: [requireApiKey, requireGoogleOAuthClient],
  }, async (_req, reply) => {
    const config = getGoogleOAuthConfig();
    const state = await loadGoogleOAuthState();

    try {
      const { tokens } = await getAuthorizedGoogleOAuthClient();
      return reply.send({
        ok: true,
        configured: config.configured,
        connected: true,
        has_refresh_token: Boolean(tokens?.refresh_token),
        redirect_uri: config.redirectUri,
        scopes: config.scopes,
        pending_state: Boolean(state?.state),
      });
    } catch (error) {
      return reply.send({
        ok: true,
        configured: config.configured,
        connected: false,
        error: String(error?.message || error),
        redirect_uri: config.redirectUri,
        scopes: config.scopes,
        pending_state: Boolean(state?.state),
      });
    }
  });

  fastify.get('/api/google/oauth/callback', {
    preHandler: [requireGoogleOAuthClient],
  }, async (req, reply) => {
    const code = asText(req.query?.code);
    const state = asText(req.query?.state);
    const stored = await loadGoogleOAuthState();

    if (!code) {
      return reply.code(400).send({ ok: false, error: 'missing_oauth_code' });
    }
    if (!stored?.state || stored.state !== state) {
      return reply.code(400).send({ ok: false, error: 'invalid_oauth_state' });
    }

    try {
      const { tokens } = await exchangeGoogleOAuthCode(code);
      await clearGoogleOAuthState();
      return reply.send({
        ok: true,
        connected: true,
        message: 'Google OAuth connected successfully.',
        has_refresh_token: Boolean(tokens?.refresh_token),
      });
    } catch (error) {
      req.log.error({ err: error }, 'google_oauth_callback_failed');
      return reply.code(500).send({
        ok: false,
        connected: false,
        error: String(error?.message || error),
      });
    }
  });

  fastify.get('/api/google/oauth/test', {
    preHandler: [requireApiKey, requireGoogleOAuthClient],
  }, async (_req, reply) => {
    const { client } = await getAuthorizedGoogleOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    return reply.send({
      ok: true,
      connected: true,
      email_address: profile?.data?.emailAddress || null,
      messages_total: profile?.data?.messagesTotal ?? null,
      threads_total: profile?.data?.threadsTotal ?? null,
      scopes: getGoogleOAuthConfig().scopes,
    });
  });

  fastify.get('/api/google/gmail/search', {
    preHandler: [requireApiKey, requireGoogleOAuthClient],
  }, async (req, reply) => {
    const query = asText(req.query?.q || req.query?.query);
    const maxResults = Math.max(1, Math.min(25, asInt(req.query?.maxResults || req.query?.max_results || 10, 10)));
    const { client } = await getAuthorizedGoogleOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth: client });

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query || undefined,
      maxResults,
    });

    const messages = Array.isArray(listResponse?.data?.messages) ? listResponse.data.messages : [];
    const results = [];

    for (const message of messages.slice(0, maxResults)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      results.push({
        id: message.id || null,
        thread_id: message.threadId || null,
        snippet: detail?.data?.snippet || null,
        headers: Array.isArray(detail?.data?.payload?.headers) ? detail.data.payload.headers : [],
      });
    }

    return reply.send({
      ok: true,
      query,
      total_estimate: listResponse?.data?.resultSizeEstimate ?? results.length,
      messages: results,
    });
  });

  fastify.post('/api/google/calendar/events', {
    preHandler: [requireApiKey, requireGoogleOAuthClient],
  }, async (req, reply) => {
    const body = asObject(req.body);
    const summary = asText(body.summary);
    const start = asText(body.start);
    const end = asText(body.end);
    const timeZone = asText(body.time_zone || body.timeZone || 'America/Phoenix');
    const description = asText(body.description);
    const location = asText(body.location);
    const attendees = asArray(body.attendees).map((email) => ({ email }));

    if (!summary) return reply.code(400).send({ ok: false, error: 'summary_required' });
    if (!start || !end) return reply.code(400).send({ ok: false, error: 'start_and_end_required' });

    const { client } = await getAuthorizedGoogleOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description: description || undefined,
        location: location || undefined,
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
        attendees: attendees.length ? attendees : undefined,
      },
    });

    return reply.send({
      ok: true,
      created: true,
      event: event?.data || null,
    });
  });

  fastify.post('/api/google/drive/upload', {
    preHandler: [requireApiKey, requireGoogleOAuthClient],
  }, async (req, reply) => {
    const body = asObject(req.body);
    const fileName = asText(body.file_name || body.fileName);
    const mimeType = asText(body.mime_type || body.mimeType || 'application/octet-stream') || 'application/octet-stream';
    const contentBase64 = asText(body.content_base64 || body.contentBase64);
    const parentFolderId = asText(body.parent_folder_id || body.parentFolderId);

    if (!fileName) return reply.code(400).send({ ok: false, error: 'file_name_required' });
    if (!contentBase64) return reply.code(400).send({ ok: false, error: 'content_base64_required' });

    const buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) {
      return reply.code(400).send({ ok: false, error: 'invalid_base64_content' });
    }

    const { client } = await getAuthorizedGoogleOAuthClient();
    const drive = google.drive({ version: 'v3', auth: client });

    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: parentFolderId ? [parentFolderId] : undefined,
      },
      media: {
        mimeType,
        body: Readable.from([buffer]),
      },
      fields: 'id, name, mimeType, webViewLink',
    });

    return reply.send({
      ok: true,
      uploaded: true,
      file: file?.data || null,
    });
  });
}
