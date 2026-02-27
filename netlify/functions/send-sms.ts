import type { Handler, HandlerResponse } from '@netlify/functions';
import { handler as sendOutboxHandler } from './send-outbox';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body: any = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  const response = await sendOutboxHandler(
    {
      ...event,
      body: JSON.stringify({ ...body, provider: 'sms' }),
    },
    context
  );

  return (response || {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'No response from send-outbox handler' }),
  }) as HandlerResponse;
};
