import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';

const EmailCategorySchema = z.enum([
  'lead_inquiry',
  'client_support',
  'system_alert',
  'report_digest',
  'content_review',
  'founder_decision',
  'formal_notice',
  'internal_ops',
]);

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  alias_email: z.string().email().optional(),
  category: EmailCategorySchema.optional(),
  template_key: z.string().min(1).max(128).optional(),
  policy_key: z.string().min(1).max(128).optional(),
  include_inactive: z.enum(['1', 'true', 'yes']).optional(),
});

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function normalizeOptional(value: string | undefined): string | null {
  const text = String(value || '').trim().toLowerCase();
  return text ? text : null;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const supabase = getUserSupabaseClient(event);
    const parsed = QuerySchema.safeParse(event.queryStringParameters || {});
    if (!parsed.success) {
      return json(400, {
        ok: false,
        error: 'invalid_query',
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const filters = parsed.data;
    const tenantId = filters.tenant_id || null;
    const includeInactive = Boolean(filters.include_inactive);

    const { data: isAdmin, error: adminError } = await supabase.rpc('nexus_is_master_admin_compat');
    if (adminError || !isAdmin) {
      return json(403, {
        ok: false,
        error: 'admin_access_required',
      });
    }

    const aliasQuery = supabase
      .from('email_alias_rules')
      .select('id,tenant_id,alias_email,destination_email,category,is_active,notes,created_at,updated_at')
      .order('alias_email', { ascending: true });
    if (!includeInactive) aliasQuery.eq('is_active', true);
    if (tenantId) aliasQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    if (filters.alias_email) aliasQuery.eq('alias_email', normalizeOptional(filters.alias_email));
    if (filters.category) aliasQuery.eq('category', filters.category);

    const templateQuery = supabase
      .from('email_templates')
      .select('id,tenant_id,template_key,template_name,category,subject_template,body_template,is_active,created_at,updated_at')
      .order('template_key', { ascending: true });
    if (!includeInactive) templateQuery.eq('is_active', true);
    if (tenantId) templateQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    if (filters.template_key) templateQuery.eq('template_key', normalizeOptional(filters.template_key));
    if (filters.category) templateQuery.eq('category', filters.category);

    const policyQuery = supabase
      .from('email_policies')
      .select('id,tenant_id,policy_key,policy_value_json,description,created_at,updated_at')
      .order('policy_key', { ascending: true });
    if (tenantId) policyQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    if (filters.policy_key) policyQuery.eq('policy_key', normalizeOptional(filters.policy_key));

    const [aliasesRes, templatesRes, policiesRes] = await Promise.all([
      aliasQuery,
      templateQuery,
      policyQuery,
    ]);

    const firstError = aliasesRes.error || templatesRes.error || policiesRes.error;
    if (firstError) {
      return json(400, {
        ok: false,
        error: String(firstError.message || firstError),
      });
    }

    return json(200, {
      ok: true,
      filters: {
        tenant_id: tenantId,
        alias_email: filters.alias_email || null,
        category: filters.category || null,
        template_key: filters.template_key || null,
        policy_key: filters.policy_key || null,
        include_inactive: includeInactive,
      },
      aliases: aliasesRes.data || [],
      templates: templatesRes.data || [],
      policies: policiesRes.data || [],
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return json(statusCode, {
      ok: false,
      error: String(error?.message || error || 'email_policy_error'),
    });
  }
};
