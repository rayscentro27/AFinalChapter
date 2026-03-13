alter table if exists public.outbox_messages
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists identity_id bigint,
  add column if not exists body_text text,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists idempotency_key text;

create unique index if not exists outbox_messages_tenant_idempotency_uidx
  on public.outbox_messages (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists outbox_messages_tenant_contact_created_idx
  on public.outbox_messages (tenant_id, contact_id, created_at desc);
