
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
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'admin',
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
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;

-- 5. Row Level Security (RLS) - Simplistic for initial activation
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated access to tenants" ON public.tenants FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access to logs" ON public.audit_logs FOR ALL USING (auth.role() = 'authenticated');
