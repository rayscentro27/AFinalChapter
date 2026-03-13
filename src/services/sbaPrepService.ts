import { supabase } from '../../lib/supabaseClient';
import { getSignedDocumentUrl } from './documentCenterService';

export type SbaPlanStatus = 'not_started' | 'in_progress' | 'ready_to_apply' | 'archived';
export type SbaLinkStatus = 'missing' | 'uploaded' | 'verified';
export type SbaMilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export type SbaMilestone = {
  key: string;
  title: string;
  due_date: string;
  status: SbaMilestoneStatus;
  completed_at?: string;
};

export type SbaPrepPlanRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  status: SbaPlanStatus;
  target_amount_cents: number | null;
  target_timeline_months: number | null;
  readiness_score: number;
  milestones: SbaMilestone[];
  created_at: string;
  updated_at: string;
};

export type SbaRequiredDocumentRow = {
  id: string;
  key: string;
  title: string;
  description_md: string;
  created_at: string;
};

export type UploadRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bucket: string;
  object_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type SbaDocumentLinkRow = {
  id: string;
  plan_id: string;
  required_doc_key: string;
  upload_id: string | null;
  status: SbaLinkStatus;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
  sba_documents_required?: SbaRequiredDocumentRow | null;
  uploads?: UploadRow | null;
};

export type SbaPackDocumentRow = {
  id: string;
  category: 'sba';
  title: string;
  status: string;
  source_type: 'manual';
  source_id: string | null;
  storage_path: string | null;
  content_hash: string | null;
  updated_at: string;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function toMilestones(value: unknown): SbaMilestone[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const key = normalizeString(item.key);
      if (!key) return null;
      const status = normalizeString(item.status).toLowerCase();
      const normalizedStatus: SbaMilestoneStatus = ['pending', 'in_progress', 'completed', 'blocked'].includes(status)
        ? (status as SbaMilestoneStatus)
        : 'pending';

      return {
        key,
        title: normalizeString(item.title) || key,
        due_date: normalizeString(item.due_date) || new Date().toISOString().slice(0, 10),
        status: normalizedStatus,
        completed_at: normalizeString(item.completed_at) || undefined,
      };
    })
    .filter((row): row is SbaMilestone => Boolean(row));
}

async function invokeSbaFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sba-prep', { body });

  if (error) {
    throw new Error(error.message || 'SBA function call failed.');
  }

  const payload = (data || {}) as Record<string, unknown>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'SBA request failed.'));
  }

  return payload as T;
}

export async function createSbaPlan(input: {
  client_file_id: string;
  target_amount_cents?: number | null;
  target_timeline_months?: number | null;
}): Promise<{ plan_id: string; document_id: string }> {
  const payload = await invokeSbaFunction<{ plan_id: string; document_id: string }>({
    action: 'create',
    client_file_id: normalizeString(input.client_file_id),
    target_amount_cents: input.target_amount_cents ?? null,
    target_timeline_months: input.target_timeline_months ?? null,
  });

  return {
    plan_id: normalizeString(payload.plan_id),
    document_id: normalizeString(payload.document_id),
  };
}

export async function generateSbaPack(planId: string): Promise<{ document_id: string; storage_path: string | null; content_hash: string | null }> {
  const payload = await invokeSbaFunction<{ document_id: string; storage_path?: string | null; content_hash?: string | null }>({
    action: 'generate-pack',
    plan_id: normalizeString(planId),
  });

  return {
    document_id: normalizeString(payload.document_id),
    storage_path: payload.storage_path ? String(payload.storage_path) : null,
    content_hash: payload.content_hash ? String(payload.content_hash) : null,
  };
}

export async function updateSbaMilestone(input: {
  plan_id: string;
  milestone_key: string;
  status: SbaMilestoneStatus;
}): Promise<{ readiness_score: number; plan_status: SbaPlanStatus; milestones: SbaMilestone[] }> {
  const payload = await invokeSbaFunction<{
    readiness_score: number;
    plan_status: SbaPlanStatus;
    milestones: unknown;
  }>({
    action: 'update-milestone',
    plan_id: normalizeString(input.plan_id),
    milestone_key: normalizeString(input.milestone_key),
    status: input.status,
  });

  return {
    readiness_score: Number(payload.readiness_score || 0),
    plan_status: payload.plan_status || 'in_progress',
    milestones: toMilestones(payload.milestones),
  };
}

export async function runSbaReminderTick(planId?: string): Promise<{ plans_scanned: number; tasks_created: number; emails_queued: number }> {
  const payload = await invokeSbaFunction<{
    plans_scanned: number;
    tasks_created: number;
    emails_queued: number;
  }>({
    action: 'tick-reminders',
    plan_id: normalizeString(planId || '') || null,
  });

  return {
    plans_scanned: Number(payload.plans_scanned || 0),
    tasks_created: Number(payload.tasks_created || 0),
    emails_queued: Number(payload.emails_queued || 0),
  };
}

export async function listSbaPlansForUser(userId: string): Promise<SbaPrepPlanRow[]> {
  const { data, error } = await supabase
    .from('sba_prep_plans')
    .select('id,tenant_id,user_id,client_file_id,status,target_amount_cents,target_timeline_months,readiness_score,milestones,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message || 'Unable to load SBA plans.');
  }

  return ((data || []) as any[]).map((row) => ({
    ...row,
    milestones: toMilestones(row.milestones),
  })) as SbaPrepPlanRow[];
}

export async function listSbaPlansForAdmin(): Promise<SbaPrepPlanRow[]> {
  const { data, error } = await supabase
    .from('sba_prep_plans')
    .select('id,tenant_id,user_id,client_file_id,status,target_amount_cents,target_timeline_months,readiness_score,milestones,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message || 'Unable to load SBA plans.');
  }

  return ((data || []) as any[]).map((row) => ({
    ...row,
    milestones: toMilestones(row.milestones),
  })) as SbaPrepPlanRow[];
}

export async function listSbaRequiredDocuments(): Promise<SbaRequiredDocumentRow[]> {
  const { data, error } = await supabase
    .from('sba_documents_required')
    .select('id,key,title,description_md,created_at')
    .order('key', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Unable to load SBA required documents.');
  }

  return (data || []) as SbaRequiredDocumentRow[];
}

export async function listSbaDocumentLinks(planId: string): Promise<SbaDocumentLinkRow[]> {
  const { data, error } = await supabase
    .from('sba_document_links')
    .select('id,plan_id,required_doc_key,upload_id,status,verified_by,created_at,updated_at,sba_documents_required(id,key,title,description_md,created_at),uploads(id,tenant_id,user_id,bucket,object_path,file_name,mime_type,size_bytes,created_at)')
    .eq('plan_id', planId)
    .order('required_doc_key', { ascending: true })
    .limit(300);

  if (error) {
    throw new Error(error.message || 'Unable to load SBA document links.');
  }

  return (data || []) as SbaDocumentLinkRow[];
}

export async function getSbaPackDocument(planId: string): Promise<SbaPackDocumentRow | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('id,category,title,status,source_type,source_id,storage_path,content_hash,updated_at')
    .eq('category', 'sba')
    .eq('source_type', 'manual')
    .eq('source_id', planId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Unable to load SBA checklist pack document.');
  }

  return (data || null) as SbaPackDocumentRow | null;
}

export async function getSbaPackSignedUrl(storagePath: string): Promise<string | null> {
  return getSignedDocumentUrl(storagePath);
}

function sanitizeFilename(input: string): string {
  const normalized = normalizeString(input).toLowerCase();
  if (!normalized) return 'document.pdf';
  return normalized.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
}

export async function uploadSbaDocument(input: {
  plan: SbaPrepPlanRow;
  required_doc_key: string;
  file: File;
}): Promise<void> {
  const filename = sanitizeFilename(input.file.name || `${input.required_doc_key}.pdf`);
  const objectPath = `sba/uploads/${input.plan.tenant_id}/${input.plan.user_id}/${input.plan.id}/${input.required_doc_key}/${Date.now()}-${filename}`;

  const uploadStorageRes = await supabase.storage
    .from('documents')
    .upload(objectPath, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: true,
    });

  if (uploadStorageRes.error) {
    throw new Error(uploadStorageRes.error.message || 'Unable to upload file to SBA vault storage.');
  }

  const uploadId = globalThis.crypto.randomUUID();

  const uploadRowRes = await supabase
    .from('uploads')
    .insert({
      id: uploadId,
      tenant_id: input.plan.tenant_id,
      user_id: input.plan.user_id,
      bucket: 'documents',
      object_path: objectPath,
      file_name: input.file.name || null,
      mime_type: input.file.type || null,
      size_bytes: input.file.size || null,
    })
    .select('id')
    .single();

  if (uploadRowRes.error || !uploadRowRes.data?.id) {
    throw new Error(uploadRowRes.error?.message || 'Unable to register uploaded file row.');
  }

  const linkUpdateRes = await supabase
    .from('sba_document_links')
    .update({
      upload_id: String(uploadRowRes.data.id),
      status: 'uploaded',
      verified_by: null,
    })
    .eq('plan_id', input.plan.id)
    .eq('required_doc_key', normalizeString(input.required_doc_key));

  if (linkUpdateRes.error) {
    throw new Error(linkUpdateRes.error.message || 'Unable to attach uploaded file to SBA document checklist.');
  }

  await supabase.rpc('nexus_sba_recompute_plan_readiness', {
    p_plan_id: input.plan.id,
  });
}

export async function markSbaDocumentVerified(input: {
  link_id: string;
  admin_user_id: string;
  verified: boolean;
}): Promise<void> {
  const linkRes = await supabase
    .from('sba_document_links')
    .select('id,plan_id,status')
    .eq('id', input.link_id)
    .limit(1)
    .maybeSingle();

  if (linkRes.error || !linkRes.data?.id) {
    throw new Error(linkRes.error?.message || 'SBA document link not found.');
  }

  const nextStatus = input.verified ? 'verified' : ((linkRes.data.status === 'missing') ? 'missing' : 'uploaded');

  const updateRes = await supabase
    .from('sba_document_links')
    .update({
      status: nextStatus,
      verified_by: input.verified ? input.admin_user_id : null,
    })
    .eq('id', input.link_id);

  if (updateRes.error) {
    throw new Error(updateRes.error.message || 'Unable to update SBA document verification status.');
  }

  await supabase.rpc('nexus_sba_recompute_plan_readiness', {
    p_plan_id: String(linkRes.data.plan_id),
  });
}
