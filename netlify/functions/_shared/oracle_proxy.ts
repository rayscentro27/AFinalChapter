type OracleProxyRequest = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  forwardAuth?: boolean;
  event?: {
    headers?: Record<string, string | undefined>;
  };
};

type OracleProxyResponse = {
  status: number;
  ok: boolean;
  text: string;
  json: any;
};

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string {
  const target = String(name || '').toLowerCase();
  const hit = Object.entries(headers || {}).find(([k]) => String(k || '').toLowerCase() === target)?.[1];
  return String(hit || '').trim();
}

export function getOracleProxyConfig() {
  const baseUrl = String(
    process.env.ORACLE_API_BASE_URL
    || process.env.ORACLE_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || ''
  )
    .trim()
    .replace(/\/$/, '');

  const apiKey = String(
    process.env.ORACLE_API_KEY
    || process.env.ORACLE_INTERNAL_API_KEY
    || process.env.GATEWAY_INTERNAL_API_KEY
    || ''
  ).trim();

  return { baseUrl, apiKey };
}

export function assertOracleProxyConfig() {
  const { baseUrl, apiKey } = getOracleProxyConfig();
  if (!baseUrl || !apiKey) {
    const err: any = new Error(
      'Server misconfigured: missing ORACLE_API_BASE_URL/ORACLE_API_KEY (or ORACLE_BASE_URL/ORACLE_INTERNAL_API_KEY, GATEWAY_BASE_URL/GATEWAY_INTERNAL_API_KEY)'
    );
    err.statusCode = 500;
    throw err;
  }
  return { baseUrl, apiKey };
}

export async function proxyToOracle(request: OracleProxyRequest): Promise<OracleProxyResponse> {
  const { baseUrl, apiKey } = assertOracleProxyConfig();
  const method = request.method || 'POST';

  const url = new URL(`${baseUrl}${request.path}`);
  if (request.query && typeof request.query === 'object') {
    for (const [key, value] of Object.entries(request.query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };

  if (request.forwardAuth) {
    const auth = getHeader(request.event?.headers, 'authorization');
    if (auth) headers.Authorization = auth;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: request.body === undefined || method === 'GET' ? undefined : JSON.stringify(request.body),
  });

  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    text,
    json,
  };
}
