function text(value) {
  return String(value || '').trim().toLowerCase();
}

const MAP = {
  pending: 'pending',
  queued: 'pending',
  accepted: 'pending',
  created: 'pending',
  sending: 'pending',

  sent: 'sent',
  submitted: 'sent',

  delivered: 'delivered',
  delivery: 'delivered',
  success: 'delivered',

  read: 'read',
  seen: 'read',

  failed: 'failed',
  failure: 'failed',
  error: 'failed',
  undelivered: 'failed',
  rejected: 'failed',
  expired: 'failed',
  canceled: 'failed',
  cancelled: 'failed',
};

export function normalizeDeliveryStatus(provider, rawStatus) {
  const status = text(rawStatus);
  if (!status) return 'pending';

  if (provider === 'twilio') {
    if (status === 'queued' || status === 'accepted' || status === 'sending') return 'pending';
    if (status === 'sent') return 'sent';
    if (status === 'delivered') return 'delivered';
    if (status === 'read') return 'read';
    if (status === 'undelivered' || status === 'failed') return 'failed';
  }

  if (provider === 'meta' || provider === 'whatsapp' || provider === 'matrix') {
    if (status === 'sent') return 'sent';
    if (status === 'delivered') return 'delivered';
    if (status === 'read' || status === 'seen') return 'read';
    if (status === 'failed' || status === 'error') return 'failed';
  }

  return MAP[status] || 'pending';
}
