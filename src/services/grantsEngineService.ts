import { supabase } from '../../lib/supabaseClient';

export type GrantCatalogRow = {
  id: string;
  source: string;
  name: string;
  sponsor: string;
  url: string | null;
  geography: string[];
  industry_tags: string[];
  eligibility_md: string;
  award_range_md: string | null;
  deadline_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type GrantMatchStatus = 'shortlisted' | 'dismissed' | 'drafting' | 'submitted' | 'awarded' | 'denied';
export type GrantDraftStatus = 'draft' | 'needs_review' | 'approved_to_submit' | 'submitted';
export type GrantSubmissionStatus = 'pending' | 'accepted' | 'rejected' | 'awarded' | 'denied';

export type GrantMatchRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  status: GrantMatchStatus;
  grant_id: string;
  match_score: number;
  match_reasons: Array<{ code: string; detail: string }>;
  notes_md: string | null;
  created_at: string;
  updated_at: string;
  grants_catalog?: GrantCatalogRow | null;
};

export type GrantDraftRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  grant_match_id: string;
  status: GrantDraftStatus;
  draft_md: string;
  draft_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GrantSubmissionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  grant_match_id: string;
  submission_method: 'client_self_submit' | 'assisted_submit';
  submitted_at: string | null;
  confirmation_ref: string | null;
  status: GrantSubmissionStatus;
  payload_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  grant_matches?: GrantMatchRow | null;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export async function shortlistGrants(input: {
  client_file_id: string;
  filters?: {
    geography?: string[];
    tags?: string[];
  };
}): Promise<{ match_ids: string[] }> {
  const clientFileId = normalizeString(input.client_file_id);
  if (!clientFileId) throw new Error('client_file_id is required.');

  const { data, error } = await supabase.functions.invoke('grants-engine', {
    body: {
      action: 'shortlist',
      client_file_id: clientFileId,
      filters: input.filters || {},
    },
  });

  if (error) throw new Error(error.message || 'Unable to shortlist grants.');

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Grant shortlist failed.'));
  }

  return {
    match_ids: Array.isArray(payload.match_ids) ? payload.match_ids.map((v) => String(v)) : [],
  };
}

export async function createGrantDraft(grantMatchId: string): Promise<{ draft_id: string; document_id: string }> {
  const id = normalizeString(grantMatchId);
  if (!id) throw new Error('grant_match_id is required.');

  const { data, error } = await supabase.functions.invoke('grants-engine', {
    body: {
      action: 'draft',
      grant_match_id: id,
    },
  });

  if (error) throw new Error(error.message || 'Unable to create grant draft.');

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Grant draft creation failed.'));
  }

  return {
    draft_id: String(payload.draft_id || ''),
    document_id: String(payload.document_id || ''),
  };
}

export async function markGrantDraftApproved(documentId: string): Promise<void> {
  const id = normalizeString(documentId);
  if (!id) throw new Error('document_id is required.');

  const { data, error } = await supabase.functions.invoke('grants-engine', {
    body: {
      action: 'mark-approved',
      document_id: id,
    },
  });

  if (error) throw new Error(error.message || 'Unable to mark grant draft approved.');

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Grant draft approval failed.'));
  }
}

export async function markGrantSubmitted(input: {
  grant_match_id: string;
  submission_method: 'client_self_submit' | 'assisted_submit';
  confirmation_ref?: string;
}): Promise<{ submission_id: string; status: string }> {
  const grantMatchId = normalizeString(input.grant_match_id);
  if (!grantMatchId) throw new Error('grant_match_id is required.');

  const { data, error } = await supabase.functions.invoke('grants-engine', {
    body: {
      action: 'mark-submitted',
      grant_match_id: grantMatchId,
      submission_method: input.submission_method,
      confirmation_ref: normalizeString(input.confirmation_ref) || null,
    },
  });

  if (error) throw new Error(error.message || 'Unable to mark grant submitted.');

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Grant submission update failed.'));
  }

  return {
    submission_id: String(payload.submission_id || ''),
    status: String(payload.status || ''),
  };
}

export async function listGrantCatalog(): Promise<GrantCatalogRow[]> {
  const { data, error } = await supabase
    .from('grants_catalog')
    .select('id,source,name,sponsor,url,geography,industry_tags,eligibility_md,award_range_md,deadline_date,is_active,created_at,updated_at')
    .order('deadline_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(300);

  if (error) throw new Error(error.message || 'Unable to load grants catalog.');
  return (data || []) as GrantCatalogRow[];
}

export async function listGrantMatches(userId: string): Promise<GrantMatchRow[]> {
  const { data, error } = await supabase
    .from('grant_matches')
    .select('id,tenant_id,user_id,client_file_id,status,grant_id,match_score,match_reasons,notes_md,created_at,updated_at,grants_catalog(id,source,name,sponsor,url,geography,industry_tags,eligibility_md,award_range_md,deadline_date,is_active,created_at,updated_at)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message || 'Unable to load grant matches.');
  return (data || []) as GrantMatchRow[];
}

export async function listGrantDrafts(userId: string): Promise<GrantDraftRow[]> {
  const { data, error } = await supabase
    .from('grant_application_drafts')
    .select('id,tenant_id,user_id,client_file_id,grant_match_id,status,draft_md,draft_json,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message || 'Unable to load grant drafts.');
  return (data || []) as GrantDraftRow[];
}

export async function listGrantSubmissions(userId: string): Promise<GrantSubmissionRow[]> {
  const { data, error } = await supabase
    .from('grant_submissions')
    .select('id,tenant_id,user_id,grant_match_id,submission_method,submitted_at,confirmation_ref,status,payload_meta,created_at,updated_at,grant_matches(id,tenant_id,user_id,client_file_id,status,grant_id,match_score,match_reasons,notes_md,created_at,updated_at)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message || 'Unable to load grant submissions.');
  return (data || []) as GrantSubmissionRow[];
}
