import type { Handler, HandlerResponse } from '@netlify/functions';
import { handler as routingRunHandler } from './routing_run';

export const handler: Handler = async (event, context) => {
  const result = await routingRunHandler(event, context);
  if (result) return result as HandlerResponse;

  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'routing_run returned no response' }),
  };
};
