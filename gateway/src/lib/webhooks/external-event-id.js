import { sha256Hex } from '../../util/hash.js';

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function unique(values) {
  return Array.from(new Set((values || []).map((v) => asText(v)).filter(Boolean)));
}

function makeHashed(prefix, pieces, rawBody) {
  const ids = unique(pieces);
  if (ids.length > 0) {
    const joined = ids.sort().join('|');
    if (joined.length <= 180) return `${prefix}:${joined}`;
    return `${prefix}:h:${sha256Hex(joined)}`;
  }

  return `${prefix}:h:${sha256Hex(String(rawBody || ''))}`;
}

export function extractMatrixExternalEventId(payload, rawBody = '') {
  return makeHashed('matrix', [payload?.event_id, payload?.id], rawBody || JSON.stringify(payload || {}));
}

export function extractMetaExternalEventId(payload, rawBody = '') {
  const ids = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const event of messaging) {
      ids.push(event?.message?.mid);
      const deliveryMids = Array.isArray(event?.delivery?.mids) ? event.delivery.mids : [];
      ids.push(...deliveryMids);
      const readMids = Array.isArray(event?.read?.mids) ? event.read.mids : [];
      ids.push(...readMids);

      if (event?.read?.watermark) {
        ids.push(`wm:${event?.sender?.id || 'unknown'}:${event.read.watermark}`);
      }
    }

    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const status of statuses) {
        ids.push(status?.id || status?.message_id || status?.mid);
      }

      const messages = Array.isArray(value?.messages)
        ? value.messages
        : value?.message
          ? [value.message]
          : [];

      for (const msg of messages) {
        ids.push(msg?.id || msg?.mid);
      }

      const watermark = value?.read?.watermark || value?.watermark || value?.timestamp;
      if (watermark) {
        ids.push(`wm:${value?.sender?.id || value?.from || 'unknown'}:${watermark}`);
      }
    }
  }

  return makeHashed('meta', ids, rawBody || JSON.stringify(payload || {}));
}

export function extractTelegramExternalEventId(payload, rawBody = '') {
  return makeHashed('telegram', [
    payload?.update_id,
    payload?.message?.message_id,
    payload?.edited_message?.message_id,
    payload?.channel_post?.message_id,
    payload?.edited_channel_post?.message_id,
    payload?.callback_query?.id,
  ], rawBody || JSON.stringify(payload || {}));
}
