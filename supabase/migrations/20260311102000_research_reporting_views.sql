begin;
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
  sp.created_at,
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
  osp.created_at,
  row_number() over (
    partition by osp.tenant_id
    order by coalesce(osp.net_pnl, 0) desc, coalesce(osp.win_rate, 0) desc, osp.created_at desc
  ) as rank
from public.options_strategy_performance osp;
create or replace view public.v_research_agent_scorecards_latest as
select distinct on (ascs.tenant_id, ascs.agent_role)
  ascs.id,
  ascs.tenant_id,
  ascs.agent_name,
  ascs.agent_role,
  ascs.score,
  ascs.decision_accuracy,
  ascs.confidence_calibration_score,
  ascs.throughput,
  ascs.status,
  ascs.decision,
  ascs.confidence_band,
  ascs.snapshot_window,
  ascs.created_at
from public.agent_scorecards ascs
order by ascs.tenant_id, ascs.agent_role, ascs.created_at desc;
commit;
