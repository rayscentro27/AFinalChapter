import { getEnv } from './supabase.js';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = LOG_LEVELS[getEnv('LOG_LEVEL', 'info')] ?? 1;

export class Logger {
  constructor(context = '') {
    this.context = context;
  }

  debug(data, message = '') {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.log(`[DEBUG] [${this.context}]`, message || '', typeof data === 'object' ? JSON.stringify(data) : data);
    }
  }

  info(data, message = '') {
    if (currentLevel <= LOG_LEVELS.info) {
      console.log(`[INFO] [${this.context}]`, message || '', typeof data === 'object' ? JSON.stringify(data) : data);
    }
  }

  warn(data, message = '') {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(`[WARN] [${this.context}]`, message || '', typeof data === 'object' ? JSON.stringify(data) : data);
    }
  }

  error(data, message = '') {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(`[ERROR] [${this.context}]`, message || '', typeof data === 'object' ? JSON.stringify(data) : data);
    }
  }
}

export const createLogger = (context) => new Logger(context);
