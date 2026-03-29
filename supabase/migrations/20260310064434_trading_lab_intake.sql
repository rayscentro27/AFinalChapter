begin;
create extension if not exists pgcrypto;
create table if not exists public.tv_raw_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'tradingview',
  ip text,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  secret_valid boolean not null default false,
  trace_id text,
  status text not null default 'received'
);
create index if not exists tv_raw_alerts_created_at_idx
  on public.tv_raw_alerts(created_at desc);
create index if not exists tv_raw_alerts_trace_id_idx
  on public.tv_raw_alerts(trace_id);
create table if not exists public.tv_normalized_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_alert_id uuid references public.tv_raw_alerts(id) on delete set null,
  symbol text,
  timeframe text,
  side text,
  strategy_id text,
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  confidence numeric,
  session_label text,
  source text not null default 'tradingview',
  trace_id text,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'new'
);
create index if not exists tv_normalized_signals_created_at_idx
  on public.tv_normalized_signals(created_at desc);
create index if not exists tv_normalized_signals_status_created_idx
  on public.tv_normalized_signals(status, created_at desc);
create index if not exists tv_normalized_signals_trace_id_idx
  on public.tv_normalized_signals(trace_id);
create table if not exists public.market_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  symbol text,
  bid numeric,
  ask numeric,
  mid numeric,
  spread numeric,
  source text not null default 'oanda',
  trace_id text,
  raw jsonb not null default '{}'::jsonb
);
create index if not exists market_price_snapshots_symbol_created_idx
  on public.market_price_snapshots(symbol, created_at desc);
create index if not exists market_price_snapshots_trace_id_idx
  on public.market_price_snapshots(trace_id);
create table if not exists public.signal_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  signal_id uuid references public.tv_normalized_signals(id) on delete cascade,
  status text not null default 'queued',
  note text,
  trace_id text,
  raw jsonb not null default '{}'::jsonb
);
create index if not exists signal_enrichment_jobs_status_created_idx
  on public.signal_enrichment_jobs(status, created_at asc);
create index if not exists signal_enrichment_jobs_signal_id_idx
  on public.signal_enrichment_jobs(signal_id, created_at desc);
create table if not exists public.signal_delivery_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  signal_id uuid,
  channel text,
  destination text,
  status text,
  trace_id text,
  raw jsonb not null default '{}'::jsonb
);
create index if not exists signal_delivery_log_signal_id_created_idx
  on public.signal_delivery_log(signal_id, created_at desc);
create index if not exists signal_delivery_log_trace_id_idx
  on public.signal_delivery_log(trace_id);
commit;
