begin;
create extension if not exists pgcrypto;
create table if not exists public.reviewed_signal_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  proposal_key text not null unique,
  strategy_id text,
  asset_type text not null default 'forex',
  symbol text,
  timeframe text,
  side text,
  confidence numeric,
  confidence_band text,
  status text not null default 'proposed',
  decision text,
  approval_status text not null default 'pending',
  summary text,
  rationale text,
  source_trace_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.risk_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  proposal_id uuid,
  strategy_id text,
  symbol text,
  decision text not null,
  approval_status text not null default 'pending',
  confidence_band text,
  risk_score numeric,
  risk_notes text,
  reviewer text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.approval_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  proposal_id uuid,
  strategy_id text,
  symbol text,
  status text not null default 'queued',
  decision text,
  approval_status text not null default 'pending',
  priority integer not null default 50,
  requested_by text,
  resolved_by text,
  resolved_at timestamptz,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.proposal_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  proposal_id uuid,
  strategy_id text,
  asset_type text,
  symbol text,
  status text not null default 'open',
  decision text,
  approval_status text,
  pnl numeric,
  return_pct numeric,
  closed_at timestamptz,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.strategy_performance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  strategy_id text not null,
  asset_type text not null default 'forex',
  symbol text,
  timeframe text,
  trades_total integer not null default 0,
  win_rate numeric,
  profit_factor numeric,
  net_pnl numeric,
  max_drawdown numeric,
  sharpe numeric,
  confidence_band text,
  status text not null default 'active',
  decision text,
  approval_status text,
  source_run_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.options_trade_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  proposal_key text not null unique,
  strategy_id text,
  underlying_symbol text,
  structure_type text,
  expiry_date date,
  strike_payload jsonb not null default '{}'::jsonb,
  confidence numeric,
  confidence_band text,
  status text not null default 'proposed',
  decision text,
  approval_status text not null default 'pending',
  summary text,
  source_trace_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.options_risk_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  proposal_id uuid,
  strategy_id text,
  symbol text,
  decision text not null,
  approval_status text not null default 'pending',
  confidence_band text,
  risk_score numeric,
  risk_notes text,
  reviewer text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.options_strategy_performance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  strategy_id text not null,
  asset_type text not null default 'options',
  symbol text,
  underlying_symbol text,
  structure_type text,
  trades_total integer not null default 0,
  win_rate numeric,
  profit_factor numeric,
  net_pnl numeric,
  max_drawdown numeric,
  sharpe numeric,
  confidence_band text,
  status text not null default 'active',
  decision text,
  approval_status text,
  source_run_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.agent_scorecards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  agent_name text not null,
  agent_role text not null,
  score numeric,
  decision_accuracy numeric,
  confidence_calibration_score numeric,
  throughput integer,
  status text not null default 'active',
  decision text,
  confidence_band text,
  snapshot_window text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Existing environments may already contain earlier versions of these tables.
-- Backfill missing columns before creating indexes/views.
alter table public.reviewed_signal_proposals add column if not exists tenant_id uuid;
alter table public.reviewed_signal_proposals add column if not exists proposal_key text;
alter table public.reviewed_signal_proposals add column if not exists strategy_id text;
alter table public.reviewed_signal_proposals add column if not exists asset_type text not null default 'forex';
alter table public.reviewed_signal_proposals add column if not exists symbol text;
alter table public.reviewed_signal_proposals add column if not exists timeframe text;
alter table public.reviewed_signal_proposals add column if not exists side text;
alter table public.reviewed_signal_proposals add column if not exists confidence numeric;
alter table public.reviewed_signal_proposals add column if not exists confidence_band text;
alter table public.reviewed_signal_proposals add column if not exists status text not null default 'proposed';
alter table public.reviewed_signal_proposals add column if not exists decision text;
alter table public.reviewed_signal_proposals add column if not exists approval_status text not null default 'pending';
alter table public.reviewed_signal_proposals add column if not exists summary text;
alter table public.reviewed_signal_proposals add column if not exists rationale text;
alter table public.reviewed_signal_proposals add column if not exists source_trace_id text;
alter table public.reviewed_signal_proposals add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.reviewed_signal_proposals add column if not exists created_at timestamptz not null default now();
alter table public.reviewed_signal_proposals add column if not exists updated_at timestamptz not null default now();
alter table public.risk_decisions add column if not exists tenant_id uuid;
alter table public.risk_decisions add column if not exists proposal_id uuid;
alter table public.risk_decisions add column if not exists strategy_id text;
alter table public.risk_decisions add column if not exists symbol text;
alter table public.risk_decisions add column if not exists decision text;
alter table public.risk_decisions add column if not exists approval_status text not null default 'pending';
alter table public.risk_decisions add column if not exists confidence_band text;
alter table public.risk_decisions add column if not exists risk_score numeric;
alter table public.risk_decisions add column if not exists risk_notes text;
alter table public.risk_decisions add column if not exists reviewer text;
alter table public.risk_decisions add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.risk_decisions add column if not exists created_at timestamptz not null default now();
alter table public.approval_queue add column if not exists tenant_id uuid;
alter table public.approval_queue add column if not exists proposal_id uuid;
alter table public.approval_queue add column if not exists strategy_id text;
alter table public.approval_queue add column if not exists symbol text;
alter table public.approval_queue add column if not exists status text not null default 'queued';
alter table public.approval_queue add column if not exists decision text;
alter table public.approval_queue add column if not exists approval_status text not null default 'pending';
alter table public.approval_queue add column if not exists priority integer not null default 50;
alter table public.approval_queue add column if not exists requested_by text;
alter table public.approval_queue add column if not exists resolved_by text;
alter table public.approval_queue add column if not exists resolved_at timestamptz;
alter table public.approval_queue add column if not exists notes text;
alter table public.approval_queue add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.approval_queue add column if not exists created_at timestamptz not null default now();
alter table public.proposal_outcomes add column if not exists tenant_id uuid;
alter table public.proposal_outcomes add column if not exists proposal_id uuid;
alter table public.proposal_outcomes add column if not exists strategy_id text;
alter table public.proposal_outcomes add column if not exists asset_type text;
alter table public.proposal_outcomes add column if not exists symbol text;
alter table public.proposal_outcomes add column if not exists status text not null default 'open';
alter table public.proposal_outcomes add column if not exists decision text;
alter table public.proposal_outcomes add column if not exists approval_status text;
alter table public.proposal_outcomes add column if not exists pnl numeric;
alter table public.proposal_outcomes add column if not exists return_pct numeric;
alter table public.proposal_outcomes add column if not exists closed_at timestamptz;
alter table public.proposal_outcomes add column if not exists notes text;
alter table public.proposal_outcomes add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.proposal_outcomes add column if not exists created_at timestamptz not null default now();
alter table public.strategy_performance add column if not exists tenant_id uuid;
alter table public.strategy_performance add column if not exists strategy_id text;
alter table public.strategy_performance add column if not exists asset_type text not null default 'forex';
alter table public.strategy_performance add column if not exists symbol text;
alter table public.strategy_performance add column if not exists timeframe text;
alter table public.strategy_performance add column if not exists trades_total integer not null default 0;
alter table public.strategy_performance add column if not exists win_rate numeric;
alter table public.strategy_performance add column if not exists profit_factor numeric;
alter table public.strategy_performance add column if not exists net_pnl numeric;
alter table public.strategy_performance add column if not exists max_drawdown numeric;
alter table public.strategy_performance add column if not exists sharpe numeric;
alter table public.strategy_performance add column if not exists confidence_band text;
alter table public.strategy_performance add column if not exists status text not null default 'active';
alter table public.strategy_performance add column if not exists decision text;
alter table public.strategy_performance add column if not exists approval_status text;
alter table public.strategy_performance add column if not exists source_run_id uuid;
alter table public.strategy_performance add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.strategy_performance add column if not exists created_at timestamptz not null default now();
alter table public.options_trade_proposals add column if not exists tenant_id uuid;
alter table public.options_trade_proposals add column if not exists proposal_key text;
alter table public.options_trade_proposals add column if not exists strategy_id text;
alter table public.options_trade_proposals add column if not exists underlying_symbol text;
alter table public.options_trade_proposals add column if not exists structure_type text;
alter table public.options_trade_proposals add column if not exists expiry_date date;
alter table public.options_trade_proposals add column if not exists strike_payload jsonb not null default '{}'::jsonb;
alter table public.options_trade_proposals add column if not exists confidence numeric;
alter table public.options_trade_proposals add column if not exists confidence_band text;
alter table public.options_trade_proposals add column if not exists status text not null default 'proposed';
alter table public.options_trade_proposals add column if not exists decision text;
alter table public.options_trade_proposals add column if not exists approval_status text not null default 'pending';
alter table public.options_trade_proposals add column if not exists summary text;
alter table public.options_trade_proposals add column if not exists source_trace_id text;
alter table public.options_trade_proposals add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.options_trade_proposals add column if not exists created_at timestamptz not null default now();
alter table public.options_trade_proposals add column if not exists updated_at timestamptz not null default now();
alter table public.options_risk_decisions add column if not exists tenant_id uuid;
alter table public.options_risk_decisions add column if not exists proposal_id uuid;
alter table public.options_risk_decisions add column if not exists strategy_id text;
alter table public.options_risk_decisions add column if not exists symbol text;
alter table public.options_risk_decisions add column if not exists decision text;
alter table public.options_risk_decisions add column if not exists approval_status text not null default 'pending';
alter table public.options_risk_decisions add column if not exists confidence_band text;
alter table public.options_risk_decisions add column if not exists risk_score numeric;
alter table public.options_risk_decisions add column if not exists risk_notes text;
alter table public.options_risk_decisions add column if not exists reviewer text;
alter table public.options_risk_decisions add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.options_risk_decisions add column if not exists created_at timestamptz not null default now();
alter table public.options_strategy_performance add column if not exists tenant_id uuid;
alter table public.options_strategy_performance add column if not exists strategy_id text;
alter table public.options_strategy_performance add column if not exists asset_type text not null default 'options';
alter table public.options_strategy_performance add column if not exists symbol text;
alter table public.options_strategy_performance add column if not exists underlying_symbol text;
alter table public.options_strategy_performance add column if not exists structure_type text;
alter table public.options_strategy_performance add column if not exists trades_total integer not null default 0;
alter table public.options_strategy_performance add column if not exists win_rate numeric;
alter table public.options_strategy_performance add column if not exists profit_factor numeric;
alter table public.options_strategy_performance add column if not exists net_pnl numeric;
alter table public.options_strategy_performance add column if not exists max_drawdown numeric;
alter table public.options_strategy_performance add column if not exists sharpe numeric;
alter table public.options_strategy_performance add column if not exists confidence_band text;
alter table public.options_strategy_performance add column if not exists status text not null default 'active';
alter table public.options_strategy_performance add column if not exists decision text;
alter table public.options_strategy_performance add column if not exists approval_status text;
alter table public.options_strategy_performance add column if not exists source_run_id uuid;
alter table public.options_strategy_performance add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.options_strategy_performance add column if not exists created_at timestamptz not null default now();
alter table public.agent_scorecards add column if not exists tenant_id uuid;
alter table public.agent_scorecards add column if not exists agent_name text;
alter table public.agent_scorecards add column if not exists agent_role text;
alter table public.agent_scorecards add column if not exists score numeric;
alter table public.agent_scorecards add column if not exists decision_accuracy numeric;
alter table public.agent_scorecards add column if not exists confidence_calibration_score numeric;
alter table public.agent_scorecards add column if not exists throughput integer;
alter table public.agent_scorecards add column if not exists status text not null default 'active';
alter table public.agent_scorecards add column if not exists decision text;
alter table public.agent_scorecards add column if not exists confidence_band text;
alter table public.agent_scorecards add column if not exists snapshot_window text;
alter table public.agent_scorecards add column if not exists notes text;
alter table public.agent_scorecards add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.agent_scorecards add column if not exists created_at timestamptz not null default now();
create index if not exists rsp_tenant_created_idx on public.reviewed_signal_proposals (tenant_id, created_at desc);
create index if not exists rsp_strategy_symbol_idx on public.reviewed_signal_proposals (strategy_id, asset_type, symbol, created_at desc);
create index if not exists rsp_status_idx on public.reviewed_signal_proposals (status, approval_status, decision, created_at desc);
create index if not exists rsp_confidence_band_idx on public.reviewed_signal_proposals (confidence_band, created_at desc);
create index if not exists risk_decisions_tenant_created_idx on public.risk_decisions (tenant_id, created_at desc);
create index if not exists risk_decisions_strategy_symbol_idx on public.risk_decisions (strategy_id, symbol, created_at desc);
create index if not exists risk_decisions_state_idx on public.risk_decisions (approval_status, decision, created_at desc);
create index if not exists risk_decisions_confidence_band_idx on public.risk_decisions (confidence_band, created_at desc);
create index if not exists approval_queue_tenant_created_idx on public.approval_queue (tenant_id, created_at desc);
create index if not exists approval_queue_state_idx on public.approval_queue (status, approval_status, decision, created_at desc);
create index if not exists approval_queue_strategy_symbol_idx on public.approval_queue (strategy_id, symbol, created_at desc);
create index if not exists proposal_outcomes_tenant_created_idx on public.proposal_outcomes (tenant_id, created_at desc);
create index if not exists proposal_outcomes_strategy_symbol_idx on public.proposal_outcomes (strategy_id, asset_type, symbol, created_at desc);
create index if not exists proposal_outcomes_state_idx on public.proposal_outcomes (status, approval_status, decision, created_at desc);
create index if not exists strategy_performance_tenant_created_idx on public.strategy_performance (tenant_id, created_at desc);
create index if not exists strategy_performance_key_idx on public.strategy_performance (strategy_id, asset_type, symbol, created_at desc);
create index if not exists strategy_performance_state_idx on public.strategy_performance (status, approval_status, decision, created_at desc);
create index if not exists strategy_performance_confidence_band_idx on public.strategy_performance (confidence_band, created_at desc);
create index if not exists options_trade_proposals_tenant_created_idx on public.options_trade_proposals (tenant_id, created_at desc);
create index if not exists options_trade_proposals_strategy_symbol_idx on public.options_trade_proposals (strategy_id, underlying_symbol, created_at desc);
create index if not exists options_trade_proposals_state_idx on public.options_trade_proposals (status, approval_status, decision, created_at desc);
create index if not exists options_trade_proposals_confidence_band_idx on public.options_trade_proposals (confidence_band, created_at desc);
create index if not exists options_risk_decisions_tenant_created_idx on public.options_risk_decisions (tenant_id, created_at desc);
create index if not exists options_risk_decisions_strategy_symbol_idx on public.options_risk_decisions (strategy_id, symbol, created_at desc);
create index if not exists options_risk_decisions_state_idx on public.options_risk_decisions (approval_status, decision, created_at desc);
create index if not exists options_risk_decisions_confidence_band_idx on public.options_risk_decisions (confidence_band, created_at desc);
create index if not exists options_strategy_performance_tenant_created_idx on public.options_strategy_performance (tenant_id, created_at desc);
create index if not exists options_strategy_performance_key_idx on public.options_strategy_performance (strategy_id, asset_type, symbol, created_at desc);
create index if not exists options_strategy_performance_state_idx on public.options_strategy_performance (status, approval_status, decision, created_at desc);
create index if not exists options_strategy_performance_confidence_band_idx on public.options_strategy_performance (confidence_band, created_at desc);
create index if not exists agent_scorecards_tenant_created_idx on public.agent_scorecards (tenant_id, created_at desc);
create index if not exists agent_scorecards_role_created_idx on public.agent_scorecards (agent_role, created_at desc);
create index if not exists agent_scorecards_state_idx on public.agent_scorecards (status, decision, confidence_band, created_at desc);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'risk_decisions_proposal_id_fkey'
  ) then
    begin
      alter table public.risk_decisions
        add constraint risk_decisions_proposal_id_fkey
        foreign key (proposal_id) references public.reviewed_signal_proposals(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'approval_queue_proposal_id_fkey'
  ) then
    begin
      alter table public.approval_queue
        add constraint approval_queue_proposal_id_fkey
        foreign key (proposal_id) references public.reviewed_signal_proposals(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proposal_outcomes_proposal_id_fkey'
  ) then
    begin
      alter table public.proposal_outcomes
        add constraint proposal_outcomes_proposal_id_fkey
        foreign key (proposal_id) references public.reviewed_signal_proposals(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'options_risk_decisions_proposal_id_fkey'
  ) then
    begin
      alter table public.options_risk_decisions
        add constraint options_risk_decisions_proposal_id_fkey
        foreign key (proposal_id) references public.options_trade_proposals(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;
end $$;
commit;
