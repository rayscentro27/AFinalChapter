const META_SEND_ERROR_RE = /^Meta send failed \((\d+)\):\s*(.+)$/i;
const PERMANENT_RETRY_DELAY_MINUTES = 365 * 24 * 60;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function computeBackoffMinutes(attempts) {
  const schedule = [1, 5, 15, 60, 360];
  const index = Math.max(0, Math.min(schedule.length - 1, Number(attempts || 1) - 1));
  return schedule[index];
}

export function parseMetaSendError(error) {
  const message = asText(error?.message || error);
  if (!message) return null;

  const match = message.match(META_SEND_ERROR_RE);
  if (!match) return null;

  const httpStatus = Number(match[1]);
  const providerMessage = asText(match[2]);
  const providerCodeMatch = providerMessage.match(/^\(#(\d+)\)\s*/);
  const providerCode = providerCodeMatch ? Number(providerCodeMatch[1]) : null;

  return {
    provider: 'meta',
    httpStatus,
    providerCode,
    providerMessage,
    rawMessage: message,
  };
}

export function classifyMetaSendError(error) {
  const parsed = parseMetaSendError(error);
  if (!parsed) return null;

  const lowerMessage = parsed.providerMessage.toLowerCase();
  const capabilityMissing = parsed.providerCode === 3
    || lowerMessage.includes('does not have the capability')
    || lowerMessage.includes('capability to make this api call');

  if (capabilityMissing) {
    return {
      ...parsed,
      category: 'capability_missing',
      retryable: false,
      summary: 'Meta app capability missing for outbound Instagram messaging',
      recommendation: 'Enable Messenger API for Instagram, confirm Live mode, and recheck app review / token scopes.',
    };
  }

  if (parsed.httpStatus >= 500) {
    return {
      ...parsed,
      category: 'meta_server_error',
      retryable: true,
      summary: 'Meta server error while sending message',
      recommendation: 'Retry later after Meta recovers.',
    };
  }

  return {
    ...parsed,
    category: 'meta_client_error',
    retryable: false,
    summary: 'Meta rejected the outbound send request',
    recommendation: 'Review the app token, permissions, recipient eligibility, and API payload.',
  };
}

export function computeMetaOutboxRetryPlan(error, attempts, now = new Date()) {
  const classification = classifyMetaSendError(error);
  const retryable = classification ? classification.retryable : true;
  const nextRetryMinutes = retryable
    ? computeBackoffMinutes(attempts)
    : PERMANENT_RETRY_DELAY_MINUTES;
  const nextRetryAt = new Date(now.getTime() + nextRetryMinutes * 60_000).toISOString();

  return {
    classification,
    retryable,
    nextRetryMinutes,
    nextRetryAt,
  };
}
