import { GoogleGenAI } from '@google/genai';
import type { Message } from '../types';

type GenerateContentRequest = {
  model: string;
  contents: any;
  config?: any;
};

type PolicyOptions = {
  cache?: {
    enabled?: boolean;
    // If true, use a fuzzy key in addition to exact key (cheap semantic-ish cache).
    semantic?: boolean;
    // Override TTL (ms). When omitted, a heuristic TTL is used.
    ttlMs?: number;
  };
  router?: {
    enabled?: boolean;
    // When true and the caller requested a "pro" model, try a cheaper model first.
    cascade?: boolean;
  };
  // Output expectations (used to decide whether to retry on a better model)
  expect?: {
    json?: boolean;
    minChars?: number;
  };
  limits?: {
    maxRequestsPerMinute?: number;
    maxEstimatedTokensPerDay?: number;
  };
  // Optional label to namespace caches.
  task?: string;
};

const MODEL_SMALL = 'gemini-3-flash-preview';

let cachedAi: GoogleGenAI | null = null;
let cachedKey = '';
const getClient = (apiKey: string) => {
  if (!cachedAi || cachedKey != apiKey) {
    cachedAi = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
  }
  return cachedAi;
};


const stableStringify = (value: any): string => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

const fnv1a = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const normalizeText = (s: string): string =>
  s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Cheap "semantic" fingerprint: simhash over word features (no embeddings cost).
const simhash64 = (text: string): string => {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const v = new Array<number>(64).fill(0);
  for (const w of words) {
    const h = BigInt('0x' + fnv1a(w).padStart(16, '0'));
    for (let i = 0n; i < 64n; i++) {
      const bit = (h >> i) & 1n;
      v[Number(i)] += bit === 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let i = 0n; i < 64n; i++) {
    if (v[Number(i)] >= 0) out |= 1n << i;
  }
  return out.toString(16).padStart(16, '0');
};

const hamming64 = (aHex: string, bHex: string): number => {
  let x = BigInt('0x' + aHex) ^ BigInt('0x' + bHex);
  let c = 0;
  while (x) {
    x &= x - 1n;
    c++;
  }
  return c;
};

const nowMs = () => Date.now();

const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // ignore
  }
};

const lsDel = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    // ignore
  }
};

const CACHE_PREFIX = 'nexus_llm_cache_v1:';
const CACHE_INDEX_KEY = `${CACHE_PREFIX}index`;

type CacheEntry = { exp: number; text: string; sim?: string };

const getApiKey = (): string | null => {
  const override = lsGet('nexus_override_API_KEY');
  if (override && override.trim().length > 0) return override.trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const envKey = (process as any)?.env?.API_KEY as string | undefined;
  if (envKey && envKey.trim().length > 0) return envKey.trim();
  return null;
};

const estimateTokens = (req: GenerateContentRequest): number => {
  const s = stableStringify({ model: req.model, contents: req.contents, config: req.config });
  return Math.ceil(s.length / 4);
};

const dailyKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const checkAndBumpLimits = (opts: PolicyOptions, addTokens: number) => {
  const maxRpm = opts.limits?.maxRequestsPerMinute ?? 30;
  const maxDaily = opts.limits?.maxEstimatedTokensPerDay ?? 100_000;

  const minuteBucket = Math.floor(nowMs() / 60_000);
  const rpmKey = `${CACHE_PREFIX}rpm:${minuteBucket}`;
  const rpm = Number(lsGet(rpmKey) || '0');
  if (rpm >= maxRpm) throw new Error('LLM rate limit reached. Try again in a minute.');
  lsSet(rpmKey, String(rpm + 1));

  const day = dailyKey();
  const dayKey = `${CACHE_PREFIX}tok:${day}`;
  const used = Number(lsGet(dayKey) || '0');
  if (used + addTokens > maxDaily) throw new Error('LLM daily budget reached. Try again tomorrow.');
  lsSet(dayKey, String(used + addTokens));
};

const loadIndex = (): string[] => {
  const raw = lsGet(CACHE_INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveIndex = (keys: string[]) => {
  const trimmed = keys.slice(-500);
  lsSet(CACHE_INDEX_KEY, JSON.stringify(trimmed));
};

const getCache = (key: string): CacheEntry | null => {
  const raw = lsGet(`${CACHE_PREFIX}${key}`);
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as CacheEntry;
    if (!e || typeof e.exp !== 'number' || typeof e.text !== 'string') return null;
    if (e.exp <= nowMs()) {
      lsDel(`${CACHE_PREFIX}${key}`);
      return null;
    }
    return e;
  } catch {
    return null;
  }
};

const setCache = (key: string, entry: CacheEntry) => {
  lsSet(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  const idx = loadIndex();
  idx.push(key);
  saveIndex(idx);
};

const heuristicTtlMs = (req: GenerateContentRequest): number => {
  const c = typeof req.contents === 'string' ? req.contents : stableStringify(req.contents);
  if (c.includes('Forensic audit of this content URL:') || c.includes('content URL:')) return 24 * 60 * 60 * 1000;
  if (c.includes('Extract') || c.includes('forensic') || c.includes('Perform a forensic')) return 7 * 24 * 60 * 60 * 1000;
  if (req.config?.tools) return 60 * 60 * 1000;
  return 10 * 60 * 1000;
};

const shouldCascade = (req: GenerateContentRequest, opts: PolicyOptions): boolean => {
  if (!opts.router?.enabled || !opts.router?.cascade) return false;
  const requestedPro = typeof req.model === 'string' && req.model.includes('-pro-');
  if (!requestedPro) return false;
  if (req.config?.tools) return false;
  const c = req.contents;
  if (Array.isArray(c) && c.some((p: any) => p && typeof p === 'object' && 'inlineData' in p)) return false;
  return true;
};

const validateText = (text: string, opts: PolicyOptions): boolean => {
  if (!text || text.trim().length === 0) return false;
  const min = opts.expect?.minChars ?? 0;
  if (text.length < min) return false;
  if (opts.expect?.json) {
    try {
      JSON.parse(text);
    } catch {
      return false;
    }
  }
  return true;
};

export const generateContentWithPolicy = async (
  req: GenerateContentRequest,
  opts: PolicyOptions = {}
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Missing API key. Configure it in Settings -> API Matrix.');

  const cacheEnabled = opts.cache?.enabled ?? true;
  const semEnabled = opts.cache?.semantic ?? false;
  const ttlMs = opts.cache?.ttlMs ?? heuristicTtlMs(req);

  const taskNs = opts.task ? `t:${opts.task}|` : '';
  const baseKeyInput = `${taskNs}${stableStringify({ contents: req.contents, config: req.config })}`;
  const exactKey = fnv1a(`${baseKeyInput}|m:${req.model}`);

  if (cacheEnabled) {
    const hit = getCache(exactKey);
    if (hit) return hit.text;

    if (semEnabled) {
      const idx = loadIndex();
      const needle = simhash64(typeof req.contents === 'string' ? req.contents : stableStringify(req.contents));
      for (let i = idx.length - 1; i >= 0 && i >= idx.length - 100; i--) {
        const k = idx[i];
        const e = getCache(k);
        if (e?.sim && hamming64(needle, e.sim) <= 3) return e.text;
      }
    }
  }

  const tokenEst = estimateTokens(req);
  checkAndBumpLimits(opts, tokenEst);

  const ai = getClient(apiKey);

  const cascade = shouldCascade(req, opts);
  const attempts: GenerateContentRequest[] = cascade ? [{ ...req, model: MODEL_SMALL }, req] : [req];

  let lastText = '';
  for (const attempt of attempts) {
    const resp = await ai.models.generateContent({
      model: attempt.model,
      contents: attempt.contents,
      config: attempt.config,
    });
    lastText = resp.text || '';
    if (validateText(lastText, opts)) {
      if (cacheEnabled) {
        const sim = semEnabled
          ? simhash64(typeof req.contents === 'string' ? req.contents : stableStringify(req.contents))
          : undefined;
        setCache(exactKey, { exp: nowMs() + ttlMs, text: lastText, sim });
      }
      return lastText;
    }
  }

  throw new Error('LLM returned an invalid response. Please retry.');
};

export const buildSlimConversation = async (
  messages: Message[],
  opts: { maxRecent?: number; maxChars?: number; limits?: PolicyOptions['limits'] } = {}
): Promise<string> => {
  const maxRecent = opts.maxRecent ?? 8;
  const maxChars = opts.maxChars ?? 6000;

  const full = messages.map(m => ({
    sender: m.sender,
    content: m.content,
    timestamp: m.timestamp,
  }));

  // Trim from the front until we fit maxChars.
  while (full.length > maxRecent && stableStringify(full).length > maxChars) {
    full.shift();
  }

  const recent = full.slice(-maxRecent);
  const recentStr = stableStringify(recent);
  if (messages.length <= maxRecent && recentStr.length <= maxChars) return recentStr;

  const summaryKey = fnv1a(
    `convsum|${stableStringify(full.map(m => [m.sender, m.content, m.timestamp]))}`
  );
  const cached = getCache(summaryKey);
  if (cached) return stableStringify({ summary: cached.text, recent });

  const summaryText = await generateContentWithPolicy(
    {
      model: MODEL_SMALL,
      contents:
        `Summarize this CRM conversation in 8-12 bullet points. Include: goals, objections, commitments, sentiment shifts, and any required follow-ups.\n\nConversation JSON:\n${stableStringify(full)}`,
      config: { systemInstruction: 'You are a terse CRM conversation summarizer.' },
    },
    {
      task: 'conversation_summary',
      cache: { enabled: true, semantic: false, ttlMs: 24 * 60 * 60 * 1000 },
      router: { enabled: false },
      expect: { minChars: 20 },
      limits: opts.limits,
    }
  );

  setCache(summaryKey, { exp: nowMs() + 24 * 60 * 60 * 1000, text: summaryText });
  return stableStringify({ summary: summaryText, recent });
};
