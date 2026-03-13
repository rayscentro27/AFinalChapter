import { getActiveChannels } from './metrics.js';
import { redactText } from '../../util/redact.js';

function safeText(value) {
  return redactText(String(value || '')).slice(0, 500);
}

function buildTitle({ severity, alert_key }) {
  const sev = String(severity || 'info').toUpperCase();
  return `Nexus Alerts | ${sev} | ${alert_key}`;
}

function buildMessage({ tenant_id, severity, alert_key, message, details }) {
  return {
    title: buildTitle({ severity, alert_key }),
    text: safeText(message),
    severity: String(severity || 'info'),
    alert_key: String(alert_key || 'unknown_alert'),
    tenant_id: String(tenant_id || ''),
    details: details || {},
  };
}

async function sendWebhook(destination, payload) {
  const response = await fetch(destination, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });

  const body = await response.text().catch(() => '');
  return {
    ok: response.ok,
    status: response.status,
    body: safeText(body),
  };
}

async function sendEmail({ destination, payload }) {
  const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
  const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
  const SMTP_USER = String(process.env.SMTP_USER || '').trim();
  const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
  const SMTP_FROM = String(process.env.SMTP_FROM || '').trim();

  if (!SMTP_HOST || !SMTP_FROM) {
    return { ok: false, status: 0, body: 'smtp_not_configured' };
  }

  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    return { ok: false, status: 0, body: 'nodemailer_not_installed' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: destination,
    subject: payload.title,
    text: `${payload.text}\n\nTenant: ${payload.tenant_id}\nAlert: ${payload.alert_key}`,
  });

  return { ok: true, status: 202, body: 'sent' };
}

export async function sendNotifications({ tenant_id, alert_event }) {
  const channels = await getActiveChannels({ tenant_id });
  const payload = buildMessage({
    tenant_id,
    severity: alert_event?.severity,
    alert_key: alert_event?.alert_key,
    message: alert_event?.message,
    details: alert_event?.details,
  });

  const results = [];

  for (const channel of channels) {
    const kind = String(channel.kind || '').trim().toLowerCase();
    const destination = String(channel.destination || '').trim();

    if (!kind || !destination) {
      results.push({ channel_id: channel.id, kind, ok: false, status: 0, error: 'invalid_channel_destination' });
      continue;
    }

    try {
      if (kind === 'slack_webhook') {
        const res = await sendWebhook(destination, {
          text: `${payload.title}\n${payload.text}\nTenant: ${payload.tenant_id}`,
        });
        results.push({ channel_id: channel.id, kind, ok: res.ok, status: res.status, error: res.ok ? null : res.body });
        continue;
      }

      if (kind === 'discord_webhook') {
        const res = await sendWebhook(destination, {
          content: `${payload.title}\n${payload.text}\nTenant: ${payload.tenant_id}`,
        });
        results.push({ channel_id: channel.id, kind, ok: res.ok, status: res.status, error: res.ok ? null : res.body });
        continue;
      }

      if (kind === 'email') {
        const res = await sendEmail({ destination, payload });
        results.push({ channel_id: channel.id, kind, ok: res.ok, status: res.status, error: res.ok ? null : res.body });
        continue;
      }

      results.push({ channel_id: channel.id, kind, ok: false, status: 0, error: 'unsupported_channel_kind' });
    } catch (error) {
      results.push({
        channel_id: channel.id,
        kind,
        ok: false,
        status: 0,
        error: safeText(error?.message || error),
      });
    }
  }

  return {
    ok: true,
    total: channels.length,
    sent: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}
