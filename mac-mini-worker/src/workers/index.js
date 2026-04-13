import { handleSentimentTriage } from './sentiment_triage.js';
import { handleAdminCommandExecute } from './admin_command_execute.js';

const supportedHandlers = {
  sentiment_triage: handleSentimentTriage,
  admin_command_execute: handleAdminCommandExecute,
};

const plannedHandlers = {
  neural_scout_batch: async () => {
    throw new Error('neural_scout_batch is planned but not yet implemented');
  },
  scenario_runner: async () => {
    throw new Error('scenario_runner is planned but not yet implemented');
  },
  grants_matcher: async () => {
    throw new Error('grants_matcher is planned but not yet implemented');
  },
  content_factory: async () => {
    throw new Error('content_factory is planned but not yet implemented');
  },
};

/**
 * Handler Registry
 * Maps currently supported job types to their handler functions.
 */
export const handlers = supportedHandlers;

/**
 * Planned job types that exist in the roadmap but are not executable yet.
 */
export const plannedJobHandlers = plannedHandlers;

/**
 * Get supported job types.
 */
export function getSupportedJobTypes() {
  return Object.keys(supportedHandlers);
}

/**
 * Get planned job types.
 */
export function getPlannedJobTypes() {
  return Object.keys(plannedHandlers);
}

/**
 * Get handler for a specific job type.
 */
export function getHandler(jobType) {
  return supportedHandlers[jobType] || null;
}

export default {
  handlers,
  plannedJobHandlers,
  getSupportedJobTypes,
  getPlannedJobTypes,
  getHandler,
};
