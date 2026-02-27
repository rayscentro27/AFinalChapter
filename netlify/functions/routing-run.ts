import type { Handler } from '@netlify/functions';
import { handler as routingRunHandler } from './routing_run';

export const handler: Handler = async (event, context) => {
  return routingRunHandler(event, context);
};
