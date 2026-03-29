import { supabase } from '../../lib/supabaseClient';

export type FundingPacketStatus = 'draft' | 'delivered' | 'archived';
export type FundingApplicationStatus = 'planned' | 'applied' | 'approved' | 'denied';

export type FundingRecommendation = {
  rank: number;
  bank_id: string;
  bank_name: string;
  product_key: string;
  product_type: string;
  product_label: string;
  intro_apr_percent: number | null;
  intro_apr_months: number | null;
  estimated_max_limit_cents: number | null;
  score: number;
  reason_codes: string[];
  rationale: string;
};

export type FundingResearchPacketRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  status: FundingPacketStatus;
  input_snapshot: Record<string, unknown>;
  recommendations: FundingRecommendation[];
  created_at: string;
  updated_at: string;
};

export type FundingApplicationRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  packet_id: string;
  bank_id: string;
  product_key: string;
  client_status: FundingApplicationStatus;
  approved_amount_cents: number | null;
  opened_at: string;
  updated_at: string;
  bank_catalog?: {
    name?: string | null;
  } | null;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export async function generateFundingResearchPacket(clientFileId: string): Promise<{
  packet_id: string;
  document_id: string;
  recommendation_count: number;
}> {
  const id = normalizeString(clientFileId);
  if (!id) throw new Error('client_file_id is required.');

  const { data, error } = await supabase.functions.invoke('funding-research', {
    body: {
      action: 'generate',
      client_file_id: id,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to generate funding research packet.');
  }

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Funding research generation failed.'));
  }

  return {
    packet_id: String(payload.packet_id || ''),
    document_id: String(payload.document_id || ''),
    recommendation_count: Number(payload.recommendation_count || 0),
  };
}

export async function listFundingPackets(userId: string): Promise<FundingResearchPacketRow[]> {
  const { data, error } = await supabase
    .from('funding_research_packets')
    .select('id,tenant_id,user_id,client_file_id,status,input_snapshot,recommendations,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message || 'Unable to load funding packets.');
  }

  return ((data || []) as any[]).map((row) => ({
    ...row,
    input_snapshot: (row.input_snapshot || {}) as Record<string, unknown>,
    recommendations: Array.isArray(row.recommendations) ? row.recommendations as FundingRecommendation[] : [],
  })) as FundingResearchPacketRow[];
}

export async function listFundingTracker(packetId: string): Promise<FundingApplicationRow[]> {
  const { data, error } = await supabase
    .from('funding_applications_tracker')
    .select('id,tenant_id,user_id,packet_id,bank_id,product_key,client_status,approved_amount_cents,opened_at,updated_at,bank_catalog(name)')
    .eq('packet_id', packetId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message || 'Unable to load funding application tracker.');
  }

  return (data || []) as FundingApplicationRow[];
}

export async function upsertFundingTrackerRow(input: {
  packet_id: string;
  user_id: string;
  tenant_id: string;
  bank_id: string;
  product_key: string;
  client_status: FundingApplicationStatus;
  approved_amount_cents?: number | null;
}): Promise<FundingApplicationRow> {
  const payload = {
    packet_id: input.packet_id,
    user_id: input.user_id,
    tenant_id: input.tenant_id,
    bank_id: input.bank_id,
    product_key: input.product_key,
    client_status: input.client_status,
    approved_amount_cents: input.approved_amount_cents ?? null,
  };

  const { data, error } = await supabase
    .from('funding_applications_tracker')
    .upsert(payload, { onConflict: 'packet_id,bank_id,product_key' })
    .select('id,tenant_id,user_id,packet_id,bank_id,product_key,client_status,approved_amount_cents,opened_at,updated_at,bank_catalog(name)')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to save funding application tracker row.');
  }

  return data as FundingApplicationRow;
}

export async function updateFundingTrackerRow(input: {
  id: string;
  client_status: FundingApplicationStatus;
  approved_amount_cents?: number | null;
}): Promise<void> {
  const { error } = await supabase
    .from('funding_applications_tracker')
    .update({
      client_status: input.client_status,
      approved_amount_cents: input.approved_amount_cents ?? null,
    })
    .eq('id', input.id);

  if (error) {
    throw new Error(error.message || 'Unable to update funding tracker row.');
  }
}
