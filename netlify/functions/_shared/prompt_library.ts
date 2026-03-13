import * as fs from 'node:fs';
import * as path from 'node:path';

type PromptIndex = {
  version: string;
  prompts: Record<string, { path: string; task_type?: string; risk_class?: string }>;
};

const ROOT = path.resolve(process.cwd(), 'prompts');
const INDEX_PATH = path.join(ROOT, 'index.json');

let cachedIndex: PromptIndex | null = null;

function loadIndex(): PromptIndex {
  if (cachedIndex) return cachedIndex;
  const raw = fs.readFileSync(INDEX_PATH, 'utf8');
  cachedIndex = JSON.parse(raw) as PromptIndex;
  return cachedIndex;
}

export function getPromptMeta(promptId?: string | null) {
  if (!promptId) return null;
  const idx = loadIndex();
  const entry = idx.prompts?.[promptId];
  if (!entry) return null;
  const fullPath = path.join(ROOT, entry.path);
  if (!fullPath.startsWith(ROOT)) throw new Error('Invalid prompt path');
  const text = fs.readFileSync(fullPath, 'utf8');
  return {
    id: promptId,
    text,
    taskType: entry.task_type || null,
    riskClass: entry.risk_class || null,
    version: idx.version,
  };
}
