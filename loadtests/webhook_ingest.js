import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const API_KEY = __ENV.INTERNAL_API_KEY || '';
const MATRIX_TOKEN = __ENV.MATRIX_WEBHOOK_TOKEN || '';
const TENANT_ID = __ENV.TENANT_ID || '';

export const options = {
  scenarios: {
    webhook_ingest: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 25,
      maxVUs: 250,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const payload = {
    tenant_id: TENANT_ID,
    event_id: `evt_${__VU}_${__ITER}_${Date.now()}`,
    room_id: '!sre-test:matrix.local',
    sender: '@loadtest:matrix.local',
    type: 'm.room.message',
    content: {
      body: 'k6 webhook ingest test',
      msgtype: 'm.text',
    },
  };

  const headers = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) headers['x-api-key'] = API_KEY;
  if (MATRIX_TOKEN) headers['x-matrix-token'] = MATRIX_TOKEN;

  const res = http.post(`${BASE_URL}/webhooks/matrix`, JSON.stringify(payload), { headers });

  check(res, {
    'webhook status is 2xx/4xx': (r) => r.status >= 200 && r.status < 500,
  });
}
