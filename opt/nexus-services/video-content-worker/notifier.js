const { request } = require('undici');

async function sendTelegramMessage(botToken, chatId, text) {
  const token = String(botToken || '').trim();
  const chat = String(chatId || '').trim();
  if (!token || !chat) return { ok: false, skipped: true };

  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const body = { chat_id: chat, text: String(text || '').slice(0, 3900) };

  const response = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.statusCode >= 300) {
    const payload = await response.body.text();
    throw new Error(`telegram_send_failed_${response.statusCode}: ${payload}`);
  }

  return { ok: true };
}

module.exports = {
  sendTelegramMessage,
};
