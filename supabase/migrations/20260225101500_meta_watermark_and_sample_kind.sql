alter table public.conversations
  add column if not exists last_read_watermark bigint;

create index if not exists conversations_last_read_watermark_idx
  on public.conversations (tenant_id, provider, last_read_watermark);

alter table public.provider_events
  add column if not exists event_kind text;

create index if not exists provider_events_kind_received_idx
  on public.provider_events (provider, event_kind, received_at desc);

update public.provider_events
set
  event_kind = regexp_replace(event_type, '^sample_', ''),
  event_type = 'sample'
where
  event_type like 'sample_%'
  and (event_kind is null or event_kind = '');
