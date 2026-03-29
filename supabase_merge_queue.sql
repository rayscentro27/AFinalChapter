-- Unified Inbox bulk merge review queue support
-- Safe to run multiple times

CREATE TABLE IF NOT EXISTS public.merge_suggestion_actions (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  suggestion_key text NOT NULL,
  action text NOT NULL,
  acted_by uuid,
  acted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merge_suggestion_actions_tenant_acted_at_idx
  ON public.merge_suggestion_actions (tenant_id, acted_at DESC);

CREATE INDEX IF NOT EXISTS merge_suggestion_actions_tenant_key_acted_at_idx
  ON public.merge_suggestion_actions (tenant_id, suggestion_key, acted_at DESC);

CREATE INDEX IF NOT EXISTS merge_suggestion_actions_tenant_action_acted_at_idx
  ON public.merge_suggestion_actions (tenant_id, action, acted_at DESC);
