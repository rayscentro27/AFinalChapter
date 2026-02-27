import crypto from 'node:crypto';
import { request } from 'undici';
import { ENV } from '../env.js';
import { upsertMetaParticipant } from '../util/meta-participants.js';

function asText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function mapKindToMetaType(kind, mime) {
  const k = String(kind || '').toLowerCase();
  if (k === 'image') return 'image';
  if (k === 'video') return 'video';
  if (k === 'audio') return 'audio';

  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
}

async function fetchMetaSend({ apiVersion, pageId, pageAccessToken, payload }) {
  const url = `https://graph.facebook.com/${apiVersion}/${pageId}/messages`;

  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.body.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = json?.error?.message || text || `HTTP ${res.statusCode}`;
    throw new Error(`Meta send failed (${res.statusCode}): ${msg}`);
  }

  return json;
}

async function signedUrlForAttachment(supabaseAdmin, {
  storage_bucket,
  storage_path,
  expiresSec = 6 * 60 * 60,
}) {
  const bucket = asText(storage_bucket) || 'message-media';
  const path = asText(storage_path);
  if (!path) throw new Error('Attachment missing storage_path');

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresSec);
  if (error) throw new Error(`Signed URL failed for ${bucket}/${path}: ${error.message}`);

  const url = asText(data?.signedUrl);
  if (!url) throw new Error(`Signed URL missing for ${bucket}/${path}`);
  return url;
}

async function resolveMetaChannelAccount({ supabaseAdmin, channelAccountId }) {
  const selectWithOptionalColumns = 'id, tenant_id, external_account_id, metadata, access_token, api_version';

  let account;
  {
    const primary = await supabaseAdmin
      .from('channel_accounts')
      .select(selectWithOptionalColumns)
      .eq('id', channelAccountId)
      .single();

    if (!primary.error) {
      account = primary.data;
    } else {
      const msg = String(primary.error.message || '').toLowerCase();
      const missingColumn = msg.includes('column') && (msg.includes('access_token') || msg.includes('api_version'));
      if (!missingColumn) {
        throw new Error(`channel_accounts lookup failed: ${primary.error.message}`);
      }

      const fallback = await supabaseAdmin
        .from('channel_accounts')
        .select('id, tenant_id, external_account_id, metadata')
        .eq('id', channelAccountId)
        .single();

      if (fallback.error) {
        throw new Error(`channel_accounts fallback lookup failed: ${fallback.error.message}`);
      }

      account = fallback.data;
    }
  }

  if (!account) throw new Error('Meta channel account not found');

  const metadata = asObject(account.metadata);
  const pageId = asText(account.external_account_id);
  const accessToken = asText(account.access_token) || asText(metadata.access_token) || asText(ENV.META_PAGE_ACCESS_TOKEN);
  const apiVersion = asText(account.api_version) || asText(metadata.api_version) || asText(ENV.META_GRAPH_VERSION) || 'v22.0';

  if (!pageId) throw new Error('Meta channel account missing external_account_id (page id)');
  if (!accessToken) throw new Error('Meta channel account missing access token');

  return { pageId, accessToken, apiVersion };
}

function toAttachments(content) {
  const list = Array.isArray(content?.attachments) ? content.attachments : [];
  return list.filter((item) => item && typeof item === 'object');
}

async function attachmentUrl(supabaseAdmin, attachment) {
  const inline = asText(attachment.url) || asText(attachment.signed_url);
  if (inline) return inline;

  return signedUrlForAttachment(supabaseAdmin, {
    storage_bucket: attachment.storage_bucket,
    storage_path: attachment.storage_path,
    expiresSec: Number(attachment.expires_sec) || 6 * 60 * 60,
  });
}

export async function metaSendOutbox(outbox, { supabaseAdmin }) {
  if (!supabaseAdmin) throw new Error('metaSendOutbox missing supabaseAdmin');

  const { pageId, accessToken, apiVersion } = await resolveMetaChannelAccount({
    supabaseAdmin,
    channelAccountId: outbox.channel_account_id,
  });

  const recipientId = asText(outbox.to_address);
  if (!recipientId) throw new Error('Meta outbox missing recipient id (to_address)');

  // Keep participant mapping current so watermark-based read callbacks can resolve conversation.
  await upsertMetaParticipant({
    tenant_id: outbox.tenant_id,
    conversation_id: outbox.conversation_id,
    senderId: recipientId,
    recipientId: pageId,
  });

  const content = asObject(outbox.content);
  const attachments = toAttachments(content);
  const text = asText(outbox.body) || '';

  const base = {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE',
  };

  if (attachments.length === 0) {
    const raw = await fetchMetaSend({
      apiVersion,
      pageId,
      pageAccessToken: accessToken,
      payload: {
        ...base,
        message: { text },
      },
    });

    return {
      provider_message_id: asText(raw?.message_id) || `m:${crypto.randomUUID()}`,
      raw,
    };
  }

  const allImages = attachments.every((a) => mapKindToMetaType(a.kind, a.mime_type) === 'image');
  if (attachments.length > 1 && allImages) {
    const metas = [];

    for (const attachment of attachments.slice(0, 30)) {
      const url = await attachmentUrl(supabaseAdmin, attachment);
      metas.push({ type: 'image', payload: { url } });
    }

    const raw = await fetchMetaSend({
      apiVersion,
      pageId,
      pageAccessToken: accessToken,
      payload: {
        ...base,
        message: { attachments: metas },
      },
    });

    return {
      provider_message_id: asText(raw?.message_id) || `m:${crypto.randomUUID()}`,
      raw,
    };
  }

  let lastMessageId = null;
  let lastRaw = null;

  if (text) {
    lastRaw = await fetchMetaSend({
      apiVersion,
      pageId,
      pageAccessToken: accessToken,
      payload: {
        ...base,
        message: { text },
      },
    });

    lastMessageId = asText(lastRaw?.message_id) || lastMessageId;
  }

  for (const attachment of attachments) {
    const url = await attachmentUrl(supabaseAdmin, attachment);
    const type = mapKindToMetaType(attachment.kind, attachment.mime_type);

    lastRaw = await fetchMetaSend({
      apiVersion,
      pageId,
      pageAccessToken: accessToken,
      payload: {
        ...base,
        message: {
          attachment: {
            type,
            payload: {
              url,
              is_reusable: false,
            },
          },
        },
      },
    });

    lastMessageId = asText(lastRaw?.message_id) || lastMessageId;
  }

  return {
    provider_message_id: lastMessageId || `m:${crypto.randomUUID()}`,
    raw: lastRaw || {},
  };
}
