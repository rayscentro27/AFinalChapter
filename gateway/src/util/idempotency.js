import { sha256Hex } from './hash.js';

export function deterministicEventId(prefix, seed) {
  return `${prefix}:${sha256Hex(seed)}`;
}
