import { supabase } from '../lib/supabaseClient';

export const Type = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  INTEGER: 'integer',
} as const;

export const Modality = {
  AUDIO: 'AUDIO',
  TEXT: 'TEXT',
} as const;

export type FunctionDeclaration = {
  name: string;
  parameters?: any;
};

export type LiveServerMessage = {
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
    outputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
    turnComplete?: boolean;
  };
};

type GenerateContentArgs = {
  model: string;
  contents: any;
  config?: any;
  cache_namespace?: string;
};

const GEMINI_FN = '/.netlify/functions/gemini_generate';

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callServer(args: GenerateContentArgs): Promise<{ text: string; candidates?: any; cached?: boolean }> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  };

  let lastErr: unknown = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(GEMINI_FN, {
        method: 'POST',
        headers,
        body: JSON.stringify(args),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as any)?.error || `gemini_generate failed with ${response.status}`);
      }

      if (typeof (payload as any)?.text !== 'string') {
        throw new Error('gemini_generate returned invalid payload');
      }

      return payload as any;
    } catch (error) {
      lastErr = error;
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(2000, 250 * 2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('gemini_generate failed');
}

export class GoogleGenAI {
  constructor(_opts?: { apiKey?: string }) {}

  models = {
    generateContent: async (args: GenerateContentArgs) => callServer(args),
    generateVideos: async (_args: any) => {
      throw new Error('generateVideos is unavailable in secure browser mode');
    },
  };

  operations = {
    getVideosOperation: async (_args: any) => {
      throw new Error('getVideosOperation is unavailable in secure browser mode');
    },
  };

  live = {
    connect: async ({ callbacks }: { [key: string]: any; callbacks?: any }) => {
      if (callbacks?.onopen) callbacks.onopen();
      if (callbacks?.onerror) {
        setTimeout(() => {
          callbacks.onerror(new Error('Realtime browser AI is disabled. Use server-mediated channels only.'));
        }, 0);
      }
      return {
        sendRealtimeInput: async (_input: any) => undefined,
        close: async () => {
          if (callbacks?.onclose) callbacks.onclose();
        },
      };
    },
  };
}
