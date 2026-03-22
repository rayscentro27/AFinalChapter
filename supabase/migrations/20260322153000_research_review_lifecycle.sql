begin;

alter table public.reviewed_signal_proposals add column if not exists is_published boolean not null default false;
alter table public.reviewed_signal_proposals add column if not exists published_at timestamptz;
alter table public.reviewed_signal_proposals add column if not exists expires_at timestamptz;
alter table public.reviewed_signal_proposals add column if not exists expired_at timestamptz;

alter table public.strategy_performance add column if not exists is_published boolean not null default false;
alter table public.strategy_performance add column if not exists published_at timestamptz;
alter table public.strategy_performance add column if not exists expires_at timestamptz;
alter table public.strategy_performance add column if not exists expired_at timestamptz;
alter table public.strategy_performance add column if not exists updated_at timestamptz not null default now();

alter table public.options_strategy_performance add column if not exists is_published boolean not null default false;
alter table public.options_strategy_performance add column if not exists published_at timestamptz;
alter table public.options_strategy_performance add column if not exists expires_at timestamptz;
alter table public.options_strategy_performance add column if not exists expired_at timestamptz;
alter table public.options_strategy_performance add column if not exists updated_at timestamptz not null default now();

update public.reviewed_signal_proposals
set is_published = true,
    published_at = coalesce(published_at, created_at, now())
where approval_status = 'approved'
  and coalesce(is_published, false) = false;

update public.strategy_performance
set is_published = true,
    published_at = coalesce(published_at, created_at, now()),
    updated_at = coalesce(updated_at, now())
where approval_status = 'approved'
  and coalesce(is_published, false) = false;

update public.options_strategy_performance
set is_published = true,
    published_at = coalesce(published_at, created_at, now()),
    updated_at = coalesce(updated_at, now())
where approval_status = 'approved'
  and coalesce(is_published, false) = false;

drop view if exists public.v_research_strategy_rankings;
drop view if exists public.v_research_options_rankings;

create index if not exists reviewed_signal_proposals_lifecycle_idx
  on public.reviewed_signal_proposals (tenant_id, approval_status, is_published, expires_at, created_at desc);

create index if not exists strategy_performance_lifecycle_idx
  on public.strategy_performance (tenant_id, approval_status, is_published, expires_at, created_at desc);

create index if not exists options_strategy_performance_lifecycle_idx
  on public.options_strategy_performance (tenant_id, approval_status, is_published, expires_at, created_at desc);

create or replace view public.v_research_strategy_rankings as
select
  sp.id,
  sp.tenant_id,
  sp.strategy_id,
  sp.asset_type,
  sp.symbol,
  sp.timeframe,
  sp.trades_total,
  sp.win_rate,
  sp.profit_factor,
  sp.net_pnl,
  sp.max_drawdown,
  sp.sharpe,
  sp.confidence_band,
  sp.status,
  sp.decision,
  sp.approval_status,
  sp.is_published,
  sp.published_at,
  sp.expires_at,
  sp.expired_at,
  sp.created_at,
  sp.updated_at,
  row_number() over (
    partition by sp.tenant_id
    order by coalesce(sp.net_pnl, 0) desc, coalesce(sp.win_rate, 0) desc, sp.created_at desc
  ) as rank
from public.strategy_performance sp;

create or replace view public.v_research_options_rankings as
select
  osp.id,
  osp.tenant_id,
  osp.strategy_id,
  osp.asset_type,
  osp.symbol,
  osp.underlying_symbol,
  osp.structure_type,
  osp.trades_total,
  osp.win_rate,
  osp.profit_factor,
  osp.net_pnl,
  osp.max_drawdown,
  osp.sharpe,
  osp.confidence_band,
  osp.status,
  osp.decision,
  osp.approval_status,
  osp.is_published,
  osp.published_at,
  osp.expires_at,
  osp.expired_at,
  osp.created_at,
  osp.updated_at,
  row_number() over (
    partition by osp.tenant_id
    order by coalesce(osp.net_pnl, 0) desc, coalesce(osp.win_rate, 0) desc, osp.created_at desc
  ) as rank
from public.options_strategy_performance osp;

commit;