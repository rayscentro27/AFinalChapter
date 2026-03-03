import { supabase } from '../../lib/supabaseClient';

export type CaptureLeadInput = {
  email: string;
  first_name?: string;
  last_name?: string;
  phone_e164?: string;
  marketing_opt_in: boolean;
  source?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    ref?: string;
    landing_page?: string;
  };
};

export type FunnelLeadRow = {
  id: string;
  tenant_id: string | null;
  email: string;
  phone_e164: string | null;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  status: string;
  marketing_opt_in: boolean;
  marketing_opt_in_consent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FunnelSequenceRow = {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FunnelStepRow = {
  id: string;
  sequence_id: string;
  step_order: number;
  wait_minutes: number;
  action_type: 'SEND_EMAIL' | 'TAG_LEAD' | 'START_WORKFLOW' | 'CREATE_TASK' | 'SHOW_OFFER' | 'NOOP';
  action_payload: Record<string, unknown>;
  created_at: string;
};

export type LeadEventRow = {
  id: string;
  tenant_id: string;
  lead_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type OfferInboxRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  offer_key: string;
  status: 'unseen' | 'seen' | 'clicked' | 'dismissed' | 'accepted';
  created_at: string;
  updated_at: string;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function captureLead(input: CaptureLeadInput): Promise<{ lead_id: string; enrollment_id?: string | null }> {
  const { data, error } = await supabase.functions.invoke('lead-capture', {
    body: {
      action: 'capture',
      ...input,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to capture lead.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Lead capture failed.');
  }

  return {
    lead_id: normalizeString(payload.lead_id),
    enrollment_id: payload.enrollment_id ? normalizeString(payload.enrollment_id) : null,
  };
}

export async function unsubscribeLeadByToken(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('lead-capture', {
    body: {
      action: 'unsubscribe',
      token,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to unsubscribe.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Unsubscribe failed.');
  }
}

export async function linkSignupLead(): Promise<{ linked: boolean; lead_id?: string }> {
  const { data, error } = await supabase.functions.invoke('funnel-engine', {
    body: {
      action: 'link-signup',
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to link signup lead.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Signup linkage failed.');
  }

  return {
    linked: Boolean(payload.linked),
    lead_id: payload.lead_id ? normalizeString(payload.lead_id) : undefined,
  };
}

export async function enrollLeadInSequence(leadId: string, sequenceKey: string): Promise<{ enrollment_id: string }> {
  const { data, error } = await supabase.functions.invoke('funnel-engine', {
    body: {
      action: 'enroll',
      lead_id: leadId,
      sequence_key: sequenceKey,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to enroll lead.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Lead enrollment failed.');
  }

  return {
    enrollment_id: normalizeString(payload.enrollment_id),
  };
}

export async function runFunnelTick(limit = 20, tenantId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('funnel-engine', {
    body: {
      action: 'tick',
      limit,
      tenant_id: tenantId || null,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to run funnel tick.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Funnel tick failed.');
  }
}

export async function aggregateFunnelMetrics(input?: {
  day?: string;
  days_back?: number;
  tenant_id?: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('funnel-engine', {
    body: {
      action: 'aggregate-daily',
      ...asObject(input || {}),
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to aggregate funnel metrics.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Funnel metrics aggregation failed.');
  }
}

export async function listOffersInboxForUser(userId: string): Promise<OfferInboxRow[]> {
  const { data, error } = await supabase
    .from('offers_inbox')
    .select('id,tenant_id,user_id,offer_key,status,created_at,updated_at')
    .eq('user_id', userId)
    .in('status', ['unseen', 'seen', 'clicked'])
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message || 'Unable to load offers inbox.');
  }

  return (data || []) as OfferInboxRow[];
}

export async function markOfferSeen(offerInboxId: string): Promise<void> {
  const { error } = await supabase
    .from('offers_inbox')
    .update({ status: 'seen' })
    .eq('id', offerInboxId)
    .eq('status', 'unseen');

  if (error) {
    throw new Error(error.message || 'Unable to mark offer seen.');
  }
}

export async function markOfferDismissed(offerInboxId: string): Promise<void> {
  const { error } = await supabase
    .from('offers_inbox')
    .update({ status: 'dismissed' })
    .eq('id', offerInboxId);

  if (error) {
    throw new Error(error.message || 'Unable to dismiss offer.');
  }
}

export async function markOfferClicked(offerInboxId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('funnel-engine', {
    body: {
      action: 'offer-click',
      offer_inbox_id: offerInboxId,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to mark offer clicked.');
  }

  const payload = asObject(data);
  if (!payload.success) {
    throw new Error(normalizeString(payload.error) || 'Offer click logging failed.');
  }
}

export async function listFunnelSequences(tenantId: string): Promise<FunnelSequenceRow[]> {
  const { data, error } = await supabase
    .from('funnel_sequences')
    .select('id,tenant_id,key,name,description,is_active,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Unable to load funnel sequences.');
  }

  return (data || []) as FunnelSequenceRow[];
}

export async function listFunnelSteps(sequenceId: string): Promise<FunnelStepRow[]> {
  const { data, error } = await supabase
    .from('funnel_steps')
    .select('id,sequence_id,step_order,wait_minutes,action_type,action_payload,created_at')
    .eq('sequence_id', sequenceId)
    .order('step_order', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Unable to load funnel steps.');
  }

  return (data || []).map((row: any) => ({
    ...row,
    action_payload: asObject(row.action_payload),
  })) as FunnelStepRow[];
}

export async function listFunnelLeads(tenantId: string): Promise<FunnelLeadRow[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('id,tenant_id,email,phone_e164,first_name,last_name,source,status,marketing_opt_in,marketing_opt_in_consent_id,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(800);

  if (error) {
    throw new Error(error.message || 'Unable to load leads.');
  }

  return (data || []) as FunnelLeadRow[];
}

export async function listLeadEvents(leadId: string): Promise<LeadEventRow[]> {
  const { data, error } = await supabase
    .from('lead_events')
    .select('id,tenant_id,lead_id,event_type,payload,created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(600);

  if (error) {
    throw new Error(error.message || 'Unable to load lead events.');
  }

  return (data || []).map((row: any) => ({
    ...row,
    payload: asObject(row.payload),
  })) as LeadEventRow[];
}
