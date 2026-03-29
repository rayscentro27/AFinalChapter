import { supabase } from '../../lib/supabaseClient';
import { resolveTenantIdForUser, sha256Marker } from '../../utils/tenantContext';

export type DocumentCategory = 'credit' | 'funding' | 'grants' | 'sba' | 'legal';
export type DocumentStatus = 'draft' | 'needs_review' | 'approved' | 'finalized' | 'mailed' | 'archived';
export type DocumentSourceType = 'ai_artifact' | 'finalized_letter' | 'upload' | 'manual';
export type DocumentApprovalType = 'review_ack' | 'authorize_submit' | 'authorize_mailing';

export type DocumentRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  category: DocumentCategory;
  title: string;
  status: DocumentStatus;
  source_type: DocumentSourceType;
  source_id: string | null;
  storage_path: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentApprovalRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  document_id: string;
  approval_type: DocumentApprovalType;
  policy_version_id: string | null;
  approved_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  notes: string | null;
};

export type CreateDocumentFromArtifactInput = {
  tenant_id?: string | null;
  user_id: string;
  category: DocumentCategory;
  title: string;
  status: DocumentStatus;
  source_type: DocumentSourceType;
  source_id?: string | null;
  storage_path?: string | null;
  content_hash?: string | null;
};

export type ApproveDocumentInput = {
  document_id: string;
  user_id: string;
  approval_type: DocumentApprovalType;
  policy_version_id?: string | null;
  notes?: string | null;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function isUuid(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

export function parseStoragePath(input: string | null | undefined): { bucket: string; objectPath: string } | null {
  const raw = normalizeString(input).replace(/^\/+/, '');
  if (!raw) return null;

  const slash = raw.indexOf('/');
  if (slash <= 0) return null;

  const bucket = raw.slice(0, slash).trim();
  const objectPath = raw.slice(slash + 1).trim();
  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

export async function getSignedDocumentUrl(storagePath: string, expiresInSeconds = 60 * 10): Promise<string | null> {
  const parsed = parseStoragePath(storagePath);
  if (!parsed) return null;

  const result = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.objectPath, expiresInSeconds);

  if (result.error) {
    throw new Error(result.error.message || 'Unable to create signed document URL.');
  }

  return result.data?.signedUrl || null;
}

export async function createDocumentFromArtifact(input: CreateDocumentFromArtifactInput): Promise<DocumentRow> {
  const userId = normalizeString(input.user_id);
  if (!userId) throw new Error('user_id is required.');

  const tenantId = normalizeString(input.tenant_id) || String(await resolveTenantIdForUser(userId) || '');
  if (!tenantId) throw new Error('Unable to resolve tenant_id for document creation.');

  const sourceId = isUuid(input.source_id || null) ? String(input.source_id) : null;

  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    category: input.category,
    title: normalizeString(input.title) || 'Document',
    status: input.status,
    source_type: input.source_type,
    source_id: sourceId,
    storage_path: normalizeString(input.storage_path) || null,
    content_hash: normalizeString(input.content_hash) || null,
  };

  if (sourceId) {
    const upsertRes = await supabase
      .from('documents')
      .upsert(payload, { onConflict: 'source_type,source_id' })
      .select('id,tenant_id,user_id,category,title,status,source_type,source_id,storage_path,content_hash,created_at,updated_at')
      .single();

    if (upsertRes.error || !upsertRes.data) {
      throw new Error(upsertRes.error?.message || 'Unable to create document row.');
    }

    return upsertRes.data as DocumentRow;
  }

  const insertRes = await supabase
    .from('documents')
    .insert(payload)
    .select('id,tenant_id,user_id,category,title,status,source_type,source_id,storage_path,content_hash,created_at,updated_at')
    .single();

  if (insertRes.error || !insertRes.data) {
    throw new Error(insertRes.error?.message || 'Unable to create document row.');
  }

  return insertRes.data as DocumentRow;
}

export async function resolveLatestPolicyVersionId(policyKey: string): Promise<string | null> {
  const key = normalizeString(policyKey);
  if (!key) return null;

  const docRes = await supabase
    .from('policy_documents')
    .select('id')
    .eq('key', key)
    .limit(1)
    .maybeSingle();

  if (docRes.error || !docRes.data?.id) return null;

  const versionRes = await supabase
    .from('policy_versions')
    .select('id')
    .eq('document_id', String(docRes.data.id))
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionRes.error || !versionRes.data?.id) return null;
  return String(versionRes.data.id);
}

export async function approveDocument(input: ApproveDocumentInput): Promise<DocumentApprovalRow> {
  const userId = normalizeString(input.user_id);
  if (!userId) throw new Error('user_id is required.');

  const docRes = await supabase
    .from('documents')
    .select('id,tenant_id,user_id,status')
    .eq('id', input.document_id)
    .limit(1)
    .maybeSingle();

  if (docRes.error || !docRes.data) {
    throw new Error(docRes.error?.message || 'Document not found for approval.');
  }

  const doc = docRes.data as { id: string; tenant_id: string; user_id: string; status: DocumentStatus };
  if (doc.user_id !== userId) {
    throw new Error('You can only approve your own documents.');
  }

  const now = new Date().toISOString();
  const ipHash = await sha256Marker(`${userId}:${doc.id}:${input.approval_type}:${now}`);
  const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';

  let policyVersionId = input.policy_version_id || null;
  if (!policyVersionId && input.approval_type === 'authorize_mailing') {
    policyVersionId = await resolveLatestPolicyVersionId('docupost_mailing_auth');
  }

  const approvalPayload = {
    tenant_id: doc.tenant_id,
    user_id: userId,
    document_id: doc.id,
    approval_type: input.approval_type,
    policy_version_id: policyVersionId,
    approved_at: now,
    ip_hash: ipHash,
    user_agent: userAgent || null,
    notes: normalizeString(input.notes) || null,
  };

  const upsertRes = await supabase
    .from('document_approvals')
    .upsert(approvalPayload, { onConflict: 'document_id,user_id,approval_type' })
    .select('id,tenant_id,user_id,document_id,approval_type,policy_version_id,approved_at,ip_hash,user_agent,notes')
    .single();

  if (upsertRes.error || !upsertRes.data) {
    throw new Error(upsertRes.error?.message || 'Unable to save document approval.');
  }

  return upsertRes.data as DocumentApprovalRow;
}
