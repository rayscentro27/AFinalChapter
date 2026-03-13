import { supabase } from '../../lib/supabaseClient';

export type OutcomeStatus = 'planned' | 'applied' | 'approved' | 'denied';
export type CommissionStatus = 'estimated' | 'invoiced' | 'paid' | 'waived' | 'disputed';
export type InvoiceProvider = 'stripe' | 'manual';

export type CommissionAgreementRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  version: string;
  rate_bps: number;
  cap_cents: number | null;
  effective_at: string;
  policy_version_id: string;
  consent_id: string;
  created_at: string;
};

export type FundingOutcomeRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  provider_name: string;
  product_type: string;
  outcome_status: OutcomeStatus;
  approved_amount_cents: number | null;
  approval_date: string | null;
  evidence_upload_id: string | null;
  notes_md: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionEventRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  funding_outcome_id: string;
  commission_rate_bps: number;
  base_amount_cents: number;
  commission_amount_cents: number;
  status: CommissionStatus;
  invoice_provider: InvoiceProvider;
  invoice_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  funding_outcomes?: {
    provider_name?: string | null;
    product_type?: string | null;
    outcome_status?: string | null;
    approved_amount_cents?: number | null;
    approval_date?: string | null;
    client_file_id?: string | null;
  } | null;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export async function uploadOutcomeEvidence(input: {
  tenantId: string;
  userId: string;
  file: File;
}): Promise<string> {
  const ext = normalizeString(input.file.name).split('.').pop() || 'bin';
  const objectPath = `commission/evidence/${input.tenantId}/${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const uploadRes = await supabase.storage
    .from('documents')
    .upload(objectPath, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadRes.error) {
    throw new Error(uploadRes.error.message || 'Unable to upload evidence file.');
  }

  const { data, error } = await supabase
    .from('uploads')
    .insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      bucket: 'documents',
      object_path: objectPath,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      size_bytes: Number(input.file.size || 0),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || 'Unable to index evidence upload.');
  }

  return String(data.id);
}

export async function createFundingOutcome(input: {
  client_file_id: string;
  provider_name: string;
  product_type: 'card' | 'loc' | 'loan';
  outcome_status: OutcomeStatus;
  approved_amount_cents?: number | null;
  evidence_upload_id?: string | null;
  notes_md?: string;
}): Promise<{ outcome_id: string; commission_event_id: string | null }> {
  const { data, error } = await supabase.functions.invoke('commission-ledger', {
    body: {
      action: 'create-outcome',
      ...input,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to create funding outcome.');
  }

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Unable to create funding outcome.'));
  }

  return {
    outcome_id: String(payload.outcome_id || ''),
    commission_event_id: payload.commission_event_id ? String(payload.commission_event_id) : null,
  };
}

export async function markCommissionInvoiced(input: {
  commission_event_id: string;
  invoice_provider: InvoiceProvider;
  invoice_id?: string | null;
  due_date?: string | null;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('commission-ledger', {
    body: {
      action: 'mark-invoiced',
      ...input,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to mark commission event invoiced.');
  }

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Unable to mark commission event invoiced.'));
  }
}

export async function markCommissionPaid(input: {
  commission_event_id: string;
  paid_at?: string | null;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('commission-ledger', {
    body: {
      action: 'mark-paid',
      ...input,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to mark commission event paid.');
  }

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Unable to mark commission event paid.'));
  }
}

export async function markCommissionStatus(input: {
  commission_event_id: string;
  status: CommissionStatus;
  invoice_provider?: InvoiceProvider;
  invoice_id?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('commission-ledger', {
    body: {
      action: 'mark-status',
      ...input,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to update commission event status.');
  }

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Unable to update commission event status.'));
  }
}

export async function listFundingOutcomes(userId: string): Promise<FundingOutcomeRow[]> {
  const { data, error } = await supabase
    .from('funding_outcomes')
    .select('id,tenant_id,user_id,client_file_id,provider_name,product_type,outcome_status,approved_amount_cents,approval_date,evidence_upload_id,notes_md,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message || 'Unable to load funding outcomes.');
  }

  return (data || []) as FundingOutcomeRow[];
}

export async function listCommissionEventsForUser(userId: string): Promise<CommissionEventRow[]> {
  const { data, error } = await supabase
    .from('commission_events')
    .select('id,tenant_id,user_id,funding_outcome_id,commission_rate_bps,base_amount_cents,commission_amount_cents,status,invoice_provider,invoice_id,due_date,paid_at,created_at,updated_at,funding_outcomes(provider_name,product_type,outcome_status,approved_amount_cents,approval_date,client_file_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message || 'Unable to load commission events.');
  }

  return (data || []) as CommissionEventRow[];
}

export async function listCommissionAgreementsForUser(userId: string): Promise<CommissionAgreementRow[]> {
  const { data, error } = await supabase
    .from('commission_agreements')
    .select('id,tenant_id,user_id,version,rate_bps,cap_cents,effective_at,policy_version_id,consent_id,created_at')
    .eq('user_id', userId)
    .order('effective_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message || 'Unable to load commission agreements.');
  }

  return (data || []) as CommissionAgreementRow[];
}

export async function listCommissionEventsAdmin(filters?: {
  status?: CommissionStatus | 'all';
  tenant_id?: string | 'all';
  date_from?: string;
  date_to?: string;
}): Promise<CommissionEventRow[]> {
  let query = supabase
    .from('commission_events')
    .select('id,tenant_id,user_id,funding_outcome_id,commission_rate_bps,base_amount_cents,commission_amount_cents,status,invoice_provider,invoice_id,due_date,paid_at,created_at,updated_at,funding_outcomes(provider_name,product_type,outcome_status,approved_amount_cents,approval_date,client_file_id)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.tenant_id && filters.tenant_id !== 'all') {
    query = query.eq('tenant_id', filters.tenant_id);
  }

  if (filters?.date_from) {
    query = query.gte('created_at', `${filters.date_from}T00:00:00.000Z`);
  }

  if (filters?.date_to) {
    query = query.lte('created_at', `${filters.date_to}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Unable to load commission events.');
  }

  return (data || []) as CommissionEventRow[];
}

export async function listAvailableTenants(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id,name')
    .order('name', { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(error.message || 'Unable to load tenants.');
  }

  return (data || []) as Array<{ id: string; name: string }>;
}

export function commissionEventsToCsv(rows: CommissionEventRow[]): string {
  const header = [
    'commission_event_id',
    'tenant_id',
    'user_id',
    'funding_outcome_id',
    'provider_name',
    'product_type',
    'outcome_status',
    'approved_amount_cents',
    'commission_rate_bps',
    'base_amount_cents',
    'commission_amount_cents',
    'status',
    'invoice_provider',
    'invoice_id',
    'due_date',
    'paid_at',
    'created_at',
  ];

  const escape = (value: unknown): string => {
    const raw = String(value ?? '');
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };

  const lines = rows.map((row) => [
    row.id,
    row.tenant_id,
    row.user_id,
    row.funding_outcome_id,
    row.funding_outcomes?.provider_name || '',
    row.funding_outcomes?.product_type || '',
    row.funding_outcomes?.outcome_status || '',
    row.funding_outcomes?.approved_amount_cents ?? '',
    row.commission_rate_bps,
    row.base_amount_cents,
    row.commission_amount_cents,
    row.status,
    row.invoice_provider,
    row.invoice_id || '',
    row.due_date || '',
    row.paid_at || '',
    row.created_at,
  ].map(escape).join(','));

  return [header.join(','), ...lines].join('\n');
}
