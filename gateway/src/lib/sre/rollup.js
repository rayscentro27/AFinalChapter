import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';

const METRICS = {
  OUTBOX_SENT: 'outbox_sent',
  OUTBOX_FAILED: 'outbox_failed',
  OUTBOX_QUEUED: 'outbox_queued',
  WEBHOOKS_ACCEPTED: 'webhooks_accepted',
  WEBHOOKS_FAILED: 'webhooks_failed',
  WEBHOOKS_IGNORED: 'webhooks_ignored',
  DELIVERY_DELIVERED: 'delivery_delivered',
  DELIVERY_FAILED: 'delivery_failed',
  DELIVERY_READ: 'delivery_read',
  PROVIDER_DOWN_COUNT: 'provider_down_count',
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 300;

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function nowIso(value = new Date()) {
  return new Date(value).toISOString();
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function bucketStartIso(input, bucketSeconds) {
  const ms = new Date(input || '').getTime();
  if (!Number.isFinite(ms)) return null;
  const floored = Math.floor(ms / (bucketSeconds * 1000)) * bucketSeconds * 1000;
  return new Date(floored).toISOString();
}

function metricKey(metric, bucketStart) {
  return `${metric}::${bucketStart}`;
}

function incrementMetric(map, metric, bucketStart, amount = 1) {
  if (!metric || !bucketStart) return;
  const key = metricKey(metric, bucketStart);
  map.set(key, Number(map.get(key) || 0) + Number(amount || 0));
}

function setMetricMax(map, metric, bucketStart, value) {
  if (!metric || !bucketStart) return;
  const key = metricKey(metric, bucketStart);
  const prev = Number(map.get(key) || 0);
  const next = Number(value || 0);
  map.set(key, Math.max(prev, next));
}

function mapToRows({ tenantId, runAtIso, map }) {
  const rows = [];
  for (const [key, value] of map.entries()) {
    const [metric, bucket_start] = key.split('::');
    rows.push({
      tenant_id: tenantId,
      bucket_start,
      metric,
      value_num: Number(value || 0),
      updated_at: runAtIso,
    });
  }
  return rows;
}

async function fetchPagedRows(queryFactory) {
  const rows = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await queryFactory().range(from, to);
    if (error) {
      if (isMissingSchema(error)) {
        return { rows: [], missingSchema: true, truncated: false };
      }
      throw new Error(String(error?.message || error));
    }

    const batch = Array.isArray(data) ? data : [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return {
    rows,
    missingSchema: false,
    truncated: rows.length >= PAGE_SIZE * MAX_PAGES,
  };
}

async function upsertRollupRows({ supabaseAdmin, table, rows }) {
  if (!rows.length) return { upserted: 0 };

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(chunk, { onConflict: 'tenant_id,bucket_start,metric' });

    if (error) {
      if (isMissingSchema(error)) {
        return { upserted, schemaMissing: true };
      }
      throw new Error(`${table} upsert failed: ${error.message}`);
    }

    upserted += chunk.length;
  }

  return { upserted };
}

async function collectOutbox({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map }) {
  const queued = await fetchPagedRows(() => (
    supabaseAdmin
      .from('outbox_messages')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso)
      .order('created_at', { ascending: true })
  ));

  if (!queued.missingSchema) {
    for (const row of queued.rows) {
      const bucket = bucketStartIso(row.created_at, bucketSeconds);
      incrementMetric(map, METRICS.OUTBOX_QUEUED, bucket, 1);
    }
  }

  const sentFailed = await fetchPagedRows(() => (
    supabaseAdmin
      .from('outbox_messages')
      .select('status,updated_at')
      .eq('tenant_id', tenantId)
      .in('status', ['sent', 'failed'])
      .gte('updated_at', sinceIso)
      .lte('updated_at', untilIso)
      .order('updated_at', { ascending: true })
  ));

  if (sentFailed.missingSchema) return;

  for (const row of sentFailed.rows) {
    const status = asText(row.status).toLowerCase();
    const metric = status === 'sent' ? METRICS.OUTBOX_SENT : METRICS.OUTBOX_FAILED;
    const bucket = bucketStartIso(row.updated_at, bucketSeconds);
    incrementMetric(map, metric, bucket, 1);
  }
}

async function collectWebhooks({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map }) {
  const out = await fetchPagedRows(() => (
    supabaseAdmin
      .from('webhook_events')
      .select('status,received_at')
      .eq('tenant_id', tenantId)
      .gte('received_at', sinceIso)
      .lte('received_at', untilIso)
      .order('received_at', { ascending: true })
  ));

  if (out.missingSchema) return;

  for (const row of out.rows) {
    const status = asText(row.status).toLowerCase();
    let metric = null;
    if (status === 'accepted') metric = METRICS.WEBHOOKS_ACCEPTED;
    if (status === 'failed') metric = METRICS.WEBHOOKS_FAILED;
    if (status === 'ignored') metric = METRICS.WEBHOOKS_IGNORED;
    if (!metric) continue;

    const bucket = bucketStartIso(row.received_at, bucketSeconds);
    incrementMetric(map, metric, bucket, 1);
  }
}

async function collectDelivery({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map }) {
  const out = await fetchPagedRows(() => (
    supabaseAdmin
      .from('message_delivery_events')
      .select('status,occurred_at')
      .eq('tenant_id', tenantId)
      .gte('occurred_at', sinceIso)
      .lte('occurred_at', untilIso)
      .order('occurred_at', { ascending: true })
  ));

  if (out.missingSchema) return;

  for (const row of out.rows) {
    const status = asText(row.status).toLowerCase();
    let metric = null;
    if (status === 'delivered') metric = METRICS.DELIVERY_DELIVERED;
    if (status === 'failed') metric = METRICS.DELIVERY_FAILED;
    if (status === 'read') metric = METRICS.DELIVERY_READ;
    if (!metric) continue;

    const bucket = bucketStartIso(row.occurred_at, bucketSeconds);
    incrementMetric(map, metric, bucket, 1);
  }
}

async function collectProviderDown({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map }) {
  const events = await fetchPagedRows(() => (
    supabaseAdmin
      .from('provider_health_events')
      .select('severity,occurred_at')
      .eq('tenant_id', tenantId)
      .gte('occurred_at', sinceIso)
      .lte('occurred_at', untilIso)
      .order('occurred_at', { ascending: true })
  ));

  if (!events.missingSchema) {
    for (const row of events.rows) {
      const severity = asText(row.severity).toLowerCase();
      if (severity !== 'error' && severity !== 'critical') continue;
      const bucket = bucketStartIso(row.occurred_at, bucketSeconds);
      incrementMetric(map, METRICS.PROVIDER_DOWN_COUNT, bucket, 1);
    }
  }

  const downCountRes = await supabaseAdmin
    .from('channel_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('health_status', 'down');

  if (!downCountRes.error) {
    const currentBucket = bucketStartIso(untilIso, bucketSeconds);
    setMetricMax(map, METRICS.PROVIDER_DOWN_COUNT, currentBucket, Number(downCountRes.count || 0));
  }
}

async function collectRollupMetrics({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds }) {
  const map = new Map();

  await collectOutbox({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map });
  await collectWebhooks({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map });
  await collectDelivery({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map });
  await collectProviderDown({ supabaseAdmin, tenantId, sinceIso, untilIso, bucketSeconds, map });

  return map;
}

async function cleanupOldRows({ supabaseAdmin, table, tenantId, keepSinceIso }) {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('tenant_id', tenantId)
    .lt('bucket_start', keepSinceIso);

  if (error && !isMissingSchema(error)) {
    throw new Error(`${table} cleanup failed: ${error.message}`);
  }
}

export async function rollup5m({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  now = new Date(),
  horizon_hours = 24,
}) {
  const tenantId = asText(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const horizonHours = Math.max(1, Math.min(24 * 7, asInt(horizon_hours, 24) || 24));
  const untilIso = nowIso(now);
  const sinceIso = new Date(new Date(untilIso).getTime() - horizonHours * 60 * 60 * 1000).toISOString();

  const metricMap = await collectRollupMetrics({
    supabaseAdmin,
    tenantId,
    sinceIso,
    untilIso,
    bucketSeconds: 300,
  });

  const rows = mapToRows({ tenantId, runAtIso: untilIso, map: metricMap });
  const upsert = await upsertRollupRows({
    supabaseAdmin,
    table: 'sre_rollup_5m',
    rows,
  });

  const keepSinceIso = new Date(new Date(untilIso).getTime() - 35 * 24 * 60 * 60 * 1000).toISOString();
  await cleanupOldRows({ supabaseAdmin, table: 'sre_rollup_5m', tenantId, keepSinceIso });

  return {
    ok: true,
    bucket: '5m',
    tenant_id: tenantId,
    horizon_hours: horizonHours,
    since: sinceIso,
    until: untilIso,
    points: rows.length,
    upserted: Number(upsert.upserted || 0),
  };
}

export async function rollup1h({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  now = new Date(),
}) {
  const tenantId = asText(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const untilIso = nowIso(now);
  const sinceIso = new Date(new Date(untilIso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const metricMap = await collectRollupMetrics({
    supabaseAdmin,
    tenantId,
    sinceIso,
    untilIso,
    bucketSeconds: 3600,
  });

  const rows = mapToRows({ tenantId, runAtIso: untilIso, map: metricMap });
  const upsert = await upsertRollupRows({
    supabaseAdmin,
    table: 'sre_rollup_1h',
    rows,
  });

  const keepSinceIso = new Date(new Date(untilIso).getTime() - 400 * 24 * 60 * 60 * 1000).toISOString();
  await cleanupOldRows({ supabaseAdmin, table: 'sre_rollup_1h', tenantId, keepSinceIso });

  return {
    ok: true,
    bucket: '1h',
    tenant_id: tenantId,
    horizon_days: 30,
    since: sinceIso,
    until: untilIso,
    points: rows.length,
    upserted: Number(upsert.upserted || 0),
  };
}

function buildBuckets({ sinceIso, untilIso, stepMs }) {
  const out = [];
  const start = new Date(sinceIso).getTime();
  const end = new Date(untilIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || stepMs <= 0) return out;

  for (let t = start; t <= end; t += stepMs) {
    out.push(new Date(t).toISOString());
  }
  return out;
}

export async function loadSreSeries({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  range = '24h',
  now = new Date(),
}) {
  const tenantId = asText(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const normalizedRange = ['24h', '7d', '30d'].includes(asText(range)) ? asText(range) : '24h';
  const use5m = normalizedRange === '24h';
  const table = use5m ? 'sre_rollup_5m' : 'sre_rollup_1h';
  const stepMs = use5m ? 5 * 60 * 1000 : 60 * 60 * 1000;

  const nowDate = new Date(now);
  const sinceMs = nowDate.getTime() - (normalizedRange === '24h' ? 24 : normalizedRange === '7d' ? 7 * 24 : 30 * 24) * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const untilIso = nowDate.toISOString();

  const { data, error } = await supabaseAdmin
    .from(table)
    .select('bucket_start,metric,value_num')
    .eq('tenant_id', tenantId)
    .gte('bucket_start', sinceIso)
    .lte('bucket_start', untilIso)
    .in('metric', [
      METRICS.OUTBOX_SENT,
      METRICS.OUTBOX_FAILED,
      METRICS.WEBHOOKS_ACCEPTED,
      METRICS.WEBHOOKS_FAILED,
      METRICS.DELIVERY_FAILED,
      METRICS.PROVIDER_DOWN_COUNT,
    ])
    .order('bucket_start', { ascending: true })
    .limit(20000);

  if (error) {
    if (isMissingSchema(error)) {
      return {
        ok: true,
        range: normalizedRange,
        series: {
          outbox_sent: [],
          outbox_failed: [],
          webhook_accepted: [],
          webhook_failed: [],
          delivery_failed: [],
          provider_down_count: [],
        },
        warning: `${table}_missing`,
      };
    }
    throw new Error(`${table} charts query failed: ${error.message}`);
  }

  const byMetric = {
    [METRICS.OUTBOX_SENT]: new Map(),
    [METRICS.OUTBOX_FAILED]: new Map(),
    [METRICS.WEBHOOKS_ACCEPTED]: new Map(),
    [METRICS.WEBHOOKS_FAILED]: new Map(),
    [METRICS.DELIVERY_FAILED]: new Map(),
    [METRICS.PROVIDER_DOWN_COUNT]: new Map(),
  };

  for (const row of data || []) {
    const metric = asText(row.metric);
    const bucket = asText(row.bucket_start);
    const value = Number(row.value_num || 0);
    if (!byMetric[metric]) continue;
    byMetric[metric].set(bucket, value);
  }

  const buckets = buildBuckets({ sinceIso, untilIso, stepMs });
  const buildSeries = (metric) => buckets.map((t) => ({ t, v: Number(byMetric[metric].get(t) || 0) }));

  return {
    ok: true,
    range: normalizedRange,
    since: sinceIso,
    until: untilIso,
    series: {
      outbox_sent: buildSeries(METRICS.OUTBOX_SENT),
      outbox_failed: buildSeries(METRICS.OUTBOX_FAILED),
      webhook_accepted: buildSeries(METRICS.WEBHOOKS_ACCEPTED),
      webhook_failed: buildSeries(METRICS.WEBHOOKS_FAILED),
      delivery_failed: buildSeries(METRICS.DELIVERY_FAILED),
      provider_down_count: buildSeries(METRICS.PROVIDER_DOWN_COUNT),
    },
  };
}

function toMinuteBucketIso(value) {
  const ms = new Date(value || '').getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.floor(ms / 60000) * 60000).toISOString();
}

function peakPerMinute(rows, field) {
  const map = new Map();
  for (const row of rows || []) {
    const bucket = toMinuteBucketIso(row?.[field]);
    if (!bucket) continue;
    map.set(bucket, Number(map.get(bucket) || 0) + 1);
  }

  let peak = 0;
  for (const value of map.values()) {
    if (value > peak) peak = value;
  }
  return peak;
}

async function fetchLast24hRows({ supabaseAdmin, table, select, tenantId, tsColumn, extraFilters = [] }) {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return fetchPagedRows(() => {
    let query = supabaseAdmin
      .from(table)
      .select(select)
      .eq('tenant_id', tenantId)
      .gte(tsColumn, sinceIso)
      .order(tsColumn, { ascending: true });

    for (const filter of extraFilters) {
      if (!filter || !filter.type || !filter.column) continue;
      if (filter.type === 'eq') query = query.eq(filter.column, filter.value);
      if (filter.type === 'in') query = query.in(filter.column, filter.value);
      if (filter.type === 'not') query = query.not(filter.column, filter.op, filter.value);
    }

    return query;
  });
}

async function countHead({ supabaseAdmin, table, tenantId, filters = [] }) {
  let query = supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  for (const filter of filters) {
    if (!filter || !filter.type || !filter.column) continue;
    if (filter.type === 'eq') query = query.eq(filter.column, filter.value);
    if (filter.type === 'in') query = query.in(filter.column, filter.value);
    if (filter.type === 'lte') query = query.lte(filter.column, filter.value);
    if (filter.type === 'gte') query = query.gte(filter.column, filter.value);
  }

  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(`${table} count failed: ${error.message}`);
  }
  return Number(count || 0);
}

export async function loadCapacitySnapshot({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
}) {
  const tenantId = asText(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const [
    webhooksRows,
    sentRows,
    receivedRows,
    failedOutboxCount,
    totalOutboxCount,
    attachmentsRows,
    outboxDueCount,
  ] = await Promise.all([
    fetchLast24hRows({
      supabaseAdmin,
      table: 'webhook_events',
      select: 'received_at',
      tenantId,
      tsColumn: 'received_at',
    }),
    fetchLast24hRows({
      supabaseAdmin,
      table: 'outbox_messages',
      select: 'updated_at',
      tenantId,
      tsColumn: 'updated_at',
      extraFilters: [{ type: 'eq', column: 'status', value: 'sent' }],
    }),
    fetchLast24hRows({
      supabaseAdmin,
      table: 'messages',
      select: 'received_at',
      tenantId,
      tsColumn: 'received_at',
      extraFilters: [{ type: 'eq', column: 'direction', value: 'in' }],
    }),
    countHead({
      supabaseAdmin,
      table: 'outbox_messages',
      tenantId,
      filters: [
        { type: 'eq', column: 'status', value: 'failed' },
        { type: 'gte', column: 'updated_at', value: sinceIso },
      ],
    }),
    countHead({
      supabaseAdmin,
      table: 'outbox_messages',
      tenantId,
      filters: [
        { type: 'in', column: 'status', value: ['sent', 'failed'] },
        { type: 'gte', column: 'updated_at', value: sinceIso },
      ],
    }),
    fetchLast24hRows({
      supabaseAdmin,
      table: 'attachments',
      select: 'size_bytes,created_at',
      tenantId,
      tsColumn: 'created_at',
    }),
    countHead({
      supabaseAdmin,
      table: 'outbox_messages',
      tenantId,
      filters: [
        { type: 'in', column: 'status', value: ['queued', 'failed'] },
        { type: 'lte', column: 'next_attempt_at', value: nowIso },
      ],
    }),
  ]);

  const webhooksPeak = peakPerMinute(webhooksRows.rows, 'received_at');
  const messagesSentPeak = peakPerMinute(sentRows.rows, 'updated_at');
  const messagesReceivedPeak = peakPerMinute(receivedRows.rows, 'received_at');

  const attachmentBytes = (attachmentsRows.rows || []).reduce((sum, row) => {
    const value = Number(row?.size_bytes || 0);
    if (!Number.isFinite(value)) return sum;
    return sum + value;
  }, 0);

  const attachmentMb = Number((attachmentBytes / (1024 * 1024)).toFixed(2));
  const outboxFailedRate = totalOutboxCount > 0 ? Number((failedOutboxCount / totalOutboxCount).toFixed(4)) : 0;

  const dbQueryHotspots = [
    {
      key: 'outbox_due_queue',
      approx_rows: outboxDueCount,
      level: outboxDueCount > 500 ? 'high' : outboxDueCount > 100 ? 'medium' : 'low',
      note: 'Queued/failed outbox jobs that are due now.',
    },
    {
      key: 'webhook_ingest_volume',
      approx_rows: webhooksRows.rows.length,
      level: webhooksPeak > 120 ? 'high' : webhooksPeak > 40 ? 'medium' : 'low',
      note: 'Webhook events sampled in last 24h (paged API read).',
    },
    {
      key: 'attachments_24h_mb',
      approx_rows: attachmentMb,
      level: attachmentMb > 2048 ? 'high' : attachmentMb > 512 ? 'medium' : 'low',
      note: 'Attachment uploads in last 24h.',
    },
  ];

  const recommendations = [];
  if (webhooksPeak >= 120) {
    recommendations.push('Webhook ingress peak is high; consider scaling gateway CPU and increasing worker concurrency.');
  }
  if (messagesSentPeak >= 60) {
    recommendations.push('Outbound peak is high; split outbox workers by tenant or provider to reduce contention.');
  }
  if (outboxFailedRate >= 0.1) {
    recommendations.push('Outbox failed rate is elevated; review provider health and retry/backoff configuration.');
  }
  if (outboxDueCount >= 500) {
    recommendations.push('Outbox due backlog is large; run outbox workers more frequently or increase per-run limit.');
  }
  if (attachmentMb >= 2048) {
    recommendations.push('Attachment volume is high; apply storage lifecycle policies and compression where possible.');
  }
  if (!recommendations.length) {
    recommendations.push('Current load is within baseline thresholds. Continue monitoring peaks and error rates.');
  }

  return {
    ok: true,
    tenant_id: tenantId,
    last_24h: {
      webhooks_per_min_peak: webhooksPeak,
      messages_sent_per_min_peak: messagesSentPeak,
      messages_received_per_min_peak: messagesReceivedPeak,
      outbox_failed_rate: outboxFailedRate,
      attachment_upload_mb: attachmentMb,
      db_query_hotspots: dbQueryHotspots,
    },
    recommendations,
  };
}

export const SRE_METRICS = METRICS;
