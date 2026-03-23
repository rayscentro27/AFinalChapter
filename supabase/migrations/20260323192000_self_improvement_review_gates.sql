begin;

create extension if not exists pgcrypto;

create table if not exists public.improvement_experiments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  experiment_type text not null
    check (experiment_type in ('prompt_variant', 'playbook_version', 'policy_candidate', 'signal_filter', 'routing_rule')),
  name text not null,
  description text,
  hypothesis text,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'completed', 'rolled_back', 'cancelled')),
  baseline_key text,
  auto_promote_allowed boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists improvement_experiments_status_idx
  on public.improvement_experiments (status, created_at desc);

create index if not exists improvement_experiments_tenant_idx
  on public.improvement_experiments (tenant_id, created_at desc);

create table if not exists public.candidate_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.improvement_experiments(id) on delete cascade,
  variant_key text not null,
  variant_type text not null
    check (variant_type in ('prompt', 'playbook', 'policy', 'filter', 'routing_rule')),
  content text not null,
  version_number integer not null default 1,
  is_control boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'promoted', 'archived', 'rejected')),
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experiment_id, variant_key)
);

create index if not exists candidate_variants_status_idx
  on public.candidate_variants (experiment_id, status, created_at desc);

create table if not exists public.variant_review_queue (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.candidate_variants(id) on delete cascade,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'changes_requested')),
  reviewer_user_id uuid,
  decision_notes text,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id)
);

create index if not exists variant_review_queue_status_idx
  on public.variant_review_queue (review_status, created_at desc);

create table if not exists public.promotion_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  experiment_id uuid references public.improvement_experiments(id) on delete cascade,
  target_variant_id uuid not null references public.candidate_variants(id) on delete cascade,
  promotion_condition text not null,
  promote_to_value text not null,
  is_active boolean not null default true,
  triggered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotion_rules_active_idx
  on public.promotion_rules (is_active, created_at desc);

create table if not exists public.variant_test_results (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.candidate_variants(id) on delete cascade,
  sample_size integer not null default 0,
  success_rate numeric(8,4),
  cost_delta_pct numeric(8,4),
  latency_delta_pct numeric(8,4),
  reviewer_score numeric(8,4),
  result_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists variant_test_results_variant_idx
  on public.variant_test_results (variant_id, created_at desc);

drop trigger if exists trg_improvement_experiments_set_updated_at on public.improvement_experiments;
create trigger trg_improvement_experiments_set_updated_at
before update on public.improvement_experiments
for each row execute function public.set_updated_at();

drop trigger if exists trg_candidate_variants_set_updated_at on public.candidate_variants;
create trigger trg_candidate_variants_set_updated_at
before update on public.candidate_variants
for each row execute function public.set_updated_at();

drop trigger if exists trg_variant_review_queue_set_updated_at on public.variant_review_queue;
create trigger trg_variant_review_queue_set_updated_at
before update on public.variant_review_queue
for each row execute function public.set_updated_at();

drop trigger if exists trg_promotion_rules_set_updated_at on public.promotion_rules;
create trigger trg_promotion_rules_set_updated_at
before update on public.promotion_rules
for each row execute function public.set_updated_at();

alter table public.improvement_experiments enable row level security;
alter table public.candidate_variants enable row level security;
alter table public.variant_review_queue enable row level security;
alter table public.promotion_rules enable row level security;
alter table public.variant_test_results enable row level security;

drop policy if exists improvement_experiments_admin_select on public.improvement_experiments;
create policy improvement_experiments_admin_select on public.improvement_experiments
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists improvement_experiments_admin_write on public.improvement_experiments;
create policy improvement_experiments_admin_write on public.improvement_experiments
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists candidate_variants_admin_select on public.candidate_variants;
create policy candidate_variants_admin_select on public.candidate_variants
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists candidate_variants_admin_write on public.candidate_variants;
create policy candidate_variants_admin_write on public.candidate_variants
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists variant_review_queue_admin_select on public.variant_review_queue;
create policy variant_review_queue_admin_select on public.variant_review_queue
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists variant_review_queue_admin_write on public.variant_review_queue;
create policy variant_review_queue_admin_write on public.variant_review_queue
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists promotion_rules_admin_select on public.promotion_rules;
create policy promotion_rules_admin_select on public.promotion_rules
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists promotion_rules_admin_write on public.promotion_rules;
create policy promotion_rules_admin_write on public.promotion_rules
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists variant_test_results_admin_select on public.variant_test_results;
create policy variant_test_results_admin_select on public.variant_test_results
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists variant_test_results_admin_write on public.variant_test_results;
create policy variant_test_results_admin_write on public.variant_test_results
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

commit;