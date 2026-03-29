import type { RiskClass } from './model_router';

export function estimateTokens(payload: unknown) {
  try {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return Math.max(1, Math.ceil(raw.length / 4));
  } catch {
    return 1;
  }
}

export function budgetForRisk(riskClass: RiskClass, env: Record<string, string | undefined>) {
  const low = Number(env.AI_TOKEN_BUDGET_LOW || 4000);
  const med = Number(env.AI_TOKEN_BUDGET_MEDIUM || 8000);
  const high = Number(env.AI_TOKEN_BUDGET_HIGH || 12000);
  const critical = Number(env.AI_TOKEN_BUDGET_CRITICAL || 16000);

  if (riskClass === 'low') return low;
  if (riskClass === 'high') return high;
  if (riskClass === 'critical') return critical;
  return med;
}

export function sanitizeForSummary(input: string) {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\-\s().]{7,}\d/g, '[phone]')
    .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[ssn]');
}

export function compressContents(contents: any, maxChars = 12000): { contents: any; summary: string | null; compressed: boolean } {
  const raw = typeof contents === 'string' ? contents : JSON.stringify(contents);
  if (!raw || raw.length <= maxChars) {
    return { contents, summary: null, compressed: false };
  }

  const cleaned = sanitizeForSummary(raw);
  const head = cleaned.slice(0, Math.floor(maxChars * 0.45));
  const tail = cleaned.slice(-Math.floor(maxChars * 0.35));
  const summary = `Compressed context (${cleaned.length} chars). Head+tail excerpt retained.`;

  return {
    contents: `${head}\n\n[...context omitted for budget...]\n\n${tail}`,
    summary,
    compressed: true,
  };
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }) {
  const retries = Math.max(0, Number(opts?.retries ?? 2));
  const base = Math.max(50, Number(opts?.baseDelayMs ?? 250));
  let lastErr: unknown;

  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        const waitMs = Math.min(4000, base * 2 ** i);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Request failed after retries');
}

export async function withTimeout<T>(promiseFactory: () => Promise<T>, timeoutMs: number): Promise<T> {
  const ms = Math.max(1000, timeoutMs || 20000);
  return await Promise.race([
    promiseFactory(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Upstream timeout after ${ms}ms`)), ms)),
  ]);
}
