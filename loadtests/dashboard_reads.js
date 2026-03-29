import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const INTERNAL_API_KEY = __ENV.INTERNAL_API_KEY || '';
const AUTH_BEARER = __ENV.AUTH_BEARER || '';
const TENANT_ID = __ENV.TENANT_ID || '';

export const options = {
  scenarios: {
    dashboard_reads: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 10,
      maxVUs: 80,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

function headers() {
  const out = {
    'x-api-key': INTERNAL_API_KEY,
  };
  if (AUTH_BEARER) out.Authorization = `Bearer ${AUTH_BEARER}`;
  return out;
}

export default function () {
  const reqHeaders = { headers: headers() };
  const charts = http.get(`${BASE_URL}/admin/sre/charts?tenant_id=${encodeURIComponent(TENANT_ID)}&range=24h`, reqHeaders);
  const overview = http.get(`${BASE_URL}/admin/monitoring/overview?tenant_id=${encodeURIComponent(TENANT_ID)}`, reqHeaders);

  check(charts, {
    'charts ok': (r) => r.status === 200,
  });

  check(overview, {
    'overview ok': (r) => r.status === 200,
  });
}
