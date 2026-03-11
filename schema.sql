-- Nexus Financial OS: Genesis Schema
-- Purpose: Multi-tenant capital management and neural auditing

-- 1. Tenants (Your Clients/Entities)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tenant Memberships (Mapping users to entities)
-- SECURITY NOTE:
-- - Treat this table as the source of truth for access control.
-- - Do not trust `auth.users.user_metadata.role` (user-editable).
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'client',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Audit Logs (Powers the Sentinel Alert System)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Enable Realtime for High-Magnitude Alerts
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_object THEN
    NULL;
END $$;

-- 5. Row Level Security (RLS)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Helper Functions (security definer so RLS policies can call safely)
CREATE OR REPLACE FUNCTION public.nexus_is_master_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.nexus_can_access_tenant(t UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.nexus_is_master_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = t
    );
$$;

-- Used by the Login screen before auth. Safe to expose (returns only a boolean).
CREATE OR REPLACE FUNCTION public.nexus_is_system_initialized()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.nexus_is_system_initialized() TO anon, authenticated;

-- 7. Bootstrap Role Assignment
-- First membership inserted becomes the Master Admin. After that:
-- - non-admin inserts are forced to 'client'
-- - admin inserts may specify 'role'
CREATE OR REPLACE FUNCTION public.nexus_assign_membership_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE role = 'admin') THEN
    NEW.role := 'admin';
    RETURN NEW;
  END IF;

  IF public.nexus_is_master_admin() THEN
    NEW.role := COALESCE(NULLIF(NEW.role, ''), 'client');
    RETURN NEW;
  END IF;

  NEW.role := 'client';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_assign_membership_role ON public.tenant_memberships;
CREATE TRIGGER nexus_assign_membership_role
BEFORE INSERT ON public.tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.nexus_assign_membership_role();

-- 8. Policies
-- Drop legacy policies if present
DROP POLICY IF EXISTS "Allow authenticated access to tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow authenticated access to logs" ON public.audit_logs;

-- Tenants
DROP POLICY IF EXISTS tenants_select ON public.tenants;
CREATE POLICY tenants_select ON public.tenants
FOR SELECT
USING (public.nexus_is_master_admin() OR public.nexus_can_access_tenant(id));

DROP POLICY IF EXISTS tenants_insert ON public.tenants;
CREATE POLICY tenants_insert ON public.tenants
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS tenants_update ON public.tenants;
CREATE POLICY tenants_update ON public.tenants
FOR UPDATE
USING (public.nexus_is_master_admin())
WITH CHECK (public.nexus_is_master_admin());

DROP POLICY IF EXISTS tenants_delete ON public.tenants;
CREATE POLICY tenants_delete ON public.tenants
FOR DELETE
USING (public.nexus_is_master_admin());

-- Tenant memberships
DROP POLICY IF EXISTS memberships_select ON public.tenant_memberships;
CREATE POLICY memberships_select ON public.tenant_memberships
FOR SELECT
USING (public.nexus_is_master_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS memberships_insert ON public.tenant_memberships;
CREATE POLICY memberships_insert ON public.tenant_memberships
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.nexus_is_master_admin()
    OR user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS memberships_update ON public.tenant_memberships;
CREATE POLICY memberships_update ON public.tenant_memberships
FOR UPDATE
USING (public.nexus_is_master_admin())
WITH CHECK (public.nexus_is_master_admin());

DROP POLICY IF EXISTS memberships_delete ON public.tenant_memberships;
CREATE POLICY memberships_delete ON public.tenant_memberships
FOR DELETE
USING (public.nexus_is_master_admin());

-- Audit logs
DROP POLICY IF EXISTS logs_select ON public.audit_logs;
CREATE POLICY logs_select ON public.audit_logs
FOR SELECT
USING (public.nexus_is_master_admin() OR public.nexus_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS logs_insert ON public.audit_logs;
CREATE POLICY logs_insert ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.nexus_is_master_admin()
    OR (
      user_id = auth.uid()
      AND public.nexus_can_access_tenant(tenant_id)
    )
  )
);

DROP POLICY IF EXISTS logs_update ON public.audit_logs;
CREATE POLICY logs_update ON public.audit_logs
FOR UPDATE
USING (public.nexus_is_master_admin())
WITH CHECK (public.nexus_is_master_admin());

DROP POLICY IF EXISTS logs_delete ON public.audit_logs;
CREATE POLICY logs_delete ON public.audit_logs
FOR DELETE
USING (public.nexus_is_master_admin());

-- 9. Task orchestration primitives (portal task board + AI assignee routing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.task_status AS ENUM ('red', 'yellow', 'green');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.task_progress AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  default_assignee_agent TEXT NOT NULL DEFAULT 'Nexus Analyst',
  prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  template_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_agent TEXT NOT NULL,
  status public.task_status NOT NULL DEFAULT 'red',
  progress public.task_progress NOT NULL DEFAULT 'not_started',
  due_at TIMESTAMP WITH TIME ZONE NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_tasks_tenant_idx ON public.client_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS client_tasks_user_idx ON public.client_tasks(user_id);
CREATE INDEX IF NOT EXISTS client_tasks_status_idx ON public.client_tasks(status);
CREATE UNIQUE INDEX IF NOT EXISTS task_templates_title_unique ON public.task_templates(title);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_client_tasks ON public.client_tasks;
CREATE TRIGGER trg_touch_client_tasks
BEFORE UPDATE ON public.client_tasks
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

-- Secure task access in browser while preserving service-role writes from functions.
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_templates_select ON public.task_templates;
CREATE POLICY task_templates_select ON public.task_templates
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS task_templates_insert ON public.task_templates;
CREATE POLICY task_templates_insert ON public.task_templates
FOR INSERT
WITH CHECK (public.nexus_is_master_admin());

DROP POLICY IF EXISTS task_templates_update ON public.task_templates;
CREATE POLICY task_templates_update ON public.task_templates
FOR UPDATE
USING (public.nexus_is_master_admin())
WITH CHECK (public.nexus_is_master_admin());

DROP POLICY IF EXISTS task_templates_delete ON public.task_templates;
CREATE POLICY task_templates_delete ON public.task_templates
FOR DELETE
USING (public.nexus_is_master_admin());

DROP POLICY IF EXISTS client_tasks_select ON public.client_tasks;
CREATE POLICY client_tasks_select ON public.client_tasks
FOR SELECT
USING (
  public.nexus_is_master_admin()
  OR (
    user_id = auth.uid()
    AND public.nexus_can_access_tenant(tenant_id)
  )
);

DROP POLICY IF EXISTS client_tasks_insert ON public.client_tasks;
CREATE POLICY client_tasks_insert ON public.client_tasks
FOR INSERT
WITH CHECK (
  public.nexus_is_master_admin()
  OR (
    user_id = auth.uid()
    AND public.nexus_can_access_tenant(tenant_id)
  )
);

DROP POLICY IF EXISTS client_tasks_update ON public.client_tasks;
CREATE POLICY client_tasks_update ON public.client_tasks
FOR UPDATE
USING (
  public.nexus_is_master_admin()
  OR (
    user_id = auth.uid()
    AND public.nexus_can_access_tenant(tenant_id)
  )
)
WITH CHECK (
  public.nexus_is_master_admin()
  OR (
    user_id = auth.uid()
    AND public.nexus_can_access_tenant(tenant_id)
  )
);

DROP POLICY IF EXISTS client_tasks_delete ON public.client_tasks;
CREATE POLICY client_tasks_delete ON public.client_tasks
FOR DELETE
USING (public.nexus_is_master_admin());

-- Starter templates (idempotent)
INSERT INTO public.task_templates (title, description, category, default_assignee_agent)
VALUES
  ('Form a fundable business', 'Register entity, EIN, bank account, NAICS alignment, professional contact stack.', 'foundation', 'Nexus Founder'),
  ('Upload credit reports', 'Upload reports from AnnualCreditReport.com and confirm all bureaus.', 'credit', 'Lex Ledger'),
  ('Credit optimization plan', 'Educational review of utilization/derogatories + dispute education resources.', 'credit', 'Lex Ledger'),
  ('Grant match shortlist', 'Find grants aligned to entity eligibility and prepare docs checklist.', 'grants', 'Nova Grant'),
  ('Re-engage stale leads', 'Ethical follow-up sequences and next-step scheduling.', 'sales', 'Ghost Hunter')
ON CONFLICT (title) DO NOTHING;
