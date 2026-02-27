import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const INTERNAL_API_KEY = __ENV.INTERNAL_API_KEY || '';
const AUTH_BEARER = __ENV.AUTH_BEARER || '';
const TENANT_ID = __ENV.TENANT_ID || '';
const CONTACT_ID = __ENV.CONTACT_ID || '';

export const options = {
  scenarios: {
    send_outbox: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 150,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<700'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const payload = {
    tenant_id: TENANT_ID,
    contact_id: CONTACT_ID,
    body_text: `k6 outbound test ${__VU}-${__ITER}`,
    idempotency_key: `k6-send-${__VU}-${__ITER}`,
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': INTERNAL_API_KEY,
  };
  if (AUTH_BEARER) headers.Authorization = `Bearer ${AUTH_BEARER}`;

  const res = http.post(`${BASE_URL}/messages/send`, JSON.stringify(payload), { headers });

  check(res, {
    'send status is expected': (r) => [200, 202, 402, 409, 503].includes(r.status),
  });
}
