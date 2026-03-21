alter table public.conversations
  add column if not exists assignee_ai_key text;
create index if not exists conversations_tenant_assignee_ai_key_idx
  on public.conversations (tenant_id, assignee_ai_key);
