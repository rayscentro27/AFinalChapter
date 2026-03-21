import { handleSentimentTriage } from './sentiment_triage.js';

/**
 * Handler Registry
 * Maps job types to their handler functions
 */
export const handlers = {
  sentiment_triage: handleSentimentTriage,
  
  // Placeholder handlers (to be implemented)
  neural_scout_batch: async (job, ctx) => {
    throw new Error('neural_scout_batch not yet implemented');
  },
  
  scenario_runner: async (job, ctx) => {
    throw new Error('scenario_runner not yet implemented');
  },
  
  grants_matcher: async (job, ctx) => {
    throw new Error('grants_matcher not yet implemented');
  },
  
  content_factory: async (job, ctx) => {
    throw new Error('content_factory not yet implemented');
  }
};

/**
 * Get supported job types
 */
export function getSupportedJobTypes() {
  return Object.keys(handlers);
}

/**
 * Get handler for a specific job type
 */
export function getHandler(jobType) {
  return handlers[jobType] || null;
}

export default {
  handlers,
  getSupportedJobTypes,
  getHandler
};
