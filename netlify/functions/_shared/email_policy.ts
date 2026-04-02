import type { SupabaseClient } from '@supabase/supabase-js';

export type EmailCategory =
  | 'lead_inquiry'
  | 'client_support'
  | 'system_alert'
  | 'report_digest'
  | 'content_review'
  | 'founder_decision'
  | 'formal_notice'
  | 'internal_ops';

export type EmailOutboxStatus = 'draft' | 'queued' | 'approved' | 'sent' | 'failed' | 'cancelled';

export type EmailAliasRule = {
  id: string;
  tenant_id: string | null;
  alias_email: string;
  destination_email: string;
  category: EmailCategory;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailTemplate = {
  id: string;
  tenant_id: string | null;
  template_key: string;
  template_name: string;
  category: EmailCategory;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailPolicy = {
  id: string;
  tenant_id: string | null;
  policy_key: string;
  policy_value_json: unknown;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailOutboxRow = {
  id: string;
  tenant_id: string | null;
  to_email: string;
  from_alias: string | null;
  category: EmailCategory;
  subject: string;
  body: string;
  status: EmailOutboxStatus;
  requires_review: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export type CreateEmailOutboxDraftInput = {
  tenantId?: string | null;
  toEmail: string;
  fromAlias?: string | null;
  category: EmailCategory;
  subject: string;
  body: string;
  createdBy?: string | null;
  requiresReview?: boolean;
  status?: EmailOutboxStatus;
};

function normalizeKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return normalizeKey(value);
}

function unwrapPolicyValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  if (Object.prototype.hasOwnProperty.call(value, 'value')) return (value as any).value;
  return value;
}

async function readSingle<T>(query: PromiseLike<{ data: T[] | null; error: any }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw error;
  return (Array.isArray(data) && data[0]) ? data[0] as T : null;
}

export async function getEmailAliasRule(
  supabase: SupabaseClient,
  aliasEmail: string
): Promise<EmailAliasRule | null> {
  const alias = normalizeEmail(aliasEmail);
  if (!alias) return null;

  return readSingle<EmailAliasRule>(
    supabase
      .from('email_alias_rules')
      .select('id,tenant_id,alias_email,destination_email,category,is_active,notes,created_at,updated_at')
      .eq('alias_email', alias)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
  );
}

export async function getEmailRuleByCategory(
  supabase: SupabaseClient,
  category: EmailCategory
): Promise<EmailAliasRule | null> {
  const key = normalizeKey(category);
  if (!key) return null;

  return readSingle<EmailAliasRule>(
    supabase
      .from('email_alias_rules')
      .select('id,tenant_id,alias_email,destination_email,category,is_active,notes,created_at,updated_at')
      .eq('category', key)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
  );
}

export async function getEmailTemplate(
  supabase: SupabaseClient,
  templateKey: string
): Promise<EmailTemplate | null> {
  const key = normalizeKey(templateKey);
  if (!key) return null;

  return readSingle<EmailTemplate>(
    supabase
      .from('email_templates')
      .select('id,tenant_id,template_key,template_name,category,subject_template,body_template,is_active,created_at,updated_at')
      .eq('template_key', key)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
  );
}

export async function getEmailPolicy(
  supabase: SupabaseClient,
  policyKey: string
): Promise<EmailPolicy | null> {
  const key = normalizeKey(policyKey);
  if (!key) return null;

  const row = await readSingle<EmailPolicy>(
    supabase
      .from('email_policies')
      .select('id,tenant_id,policy_key,policy_value_json,description,created_at,updated_at')
      .eq('policy_key', key)
      .order('created_at', { ascending: false })
      .limit(1)
  );

  if (!row) return null;
  return {
    ...row,
    policy_value_json: unwrapPolicyValue(row.policy_value_json),
  };
}

export async function createEmailOutboxDraft(
  supabase: SupabaseClient,
  input: CreateEmailOutboxDraftInput
): Promise<EmailOutboxRow> {
  const payload = {
    tenant_id: input.tenantId || null,
    to_email: normalizeEmail(input.toEmail),
    from_alias: input.fromAlias ? normalizeEmail(input.fromAlias) : null,
    category: normalizeKey(input.category) as EmailCategory,
    subject: String(input.subject || '').trim(),
    body: String(input.body || ''),
    status: (input.status || 'draft') as EmailOutboxStatus,
    requires_review: input.requiresReview ?? true,
    created_by: input.createdBy || null,
  };

  const { data, error } = await supabase
    .from('email_outbox')
    .insert(payload)
    .select('id,tenant_id,to_email,from_alias,category,subject,body,status,requires_review,created_by,created_at,updated_at,sent_at')
    .single();

  if (error) throw error;
  return data as EmailOutboxRow;
}

export async function listActiveEmailAliasRules(supabase: SupabaseClient): Promise<EmailAliasRule[]> {
  const { data, error } = await supabase
    .from('email_alias_rules')
    .select('id,tenant_id,alias_email,destination_email,category,is_active,notes,created_at,updated_at')
    .eq('is_active', true)
    .order('alias_email', { ascending: true });

  if (error) throw error;
  return (data || []) as EmailAliasRule[];
}
