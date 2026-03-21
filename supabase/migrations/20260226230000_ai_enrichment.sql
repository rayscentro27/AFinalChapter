-- AI message enrichment columns and indexing
-- Safe to run multiple times.

alter table if exists public.messages
  add column if not exists ai_sentiment text,
  add column if not exists ai_intent text,
  add column if not exists ai_urgency text,
  add column if not exists ai_summary text,
  add column if not exists ai_suggested_tags jsonb,
  add column if not exists ai_suggested_reply text,
  add column if not exists ai_enriched_at timestamptz,
  add column if not exists ai_enrich_status text default 'pending',
  add column if not exists ai_last_error text;
update public.messages
set ai_enrich_status = 'pending'
where ai_enrich_status is null;
create index if not exists messages_tenant_ai_enrich_status_received_idx
  on public.messages (tenant_id, ai_enrich_status, received_at desc);
