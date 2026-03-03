import { supabase } from '../../lib/supabaseClient';
import { BACKEND_CONFIG } from '../../adapters/config';

export type Bureau = 'experian' | 'equifax' | 'transunion';

export type SignedUploadUrlResult = {
  upload_id: string;
  bucket: string;
  object_path: string;
  token: string;
};

export type SanitizeRunResult = {
  sanitized_facts_id: string;
  manual_extraction_required: boolean;
};

export type GenerateDraftResult = {
  ai_draft_id: string;
  preview_md: string;
  privacy_proof?: {
    bureau: Bureau;
    disputes: unknown[];
  };
};

export type FinalizeDraftResult = {
  finalized_letter_id: string;
  dispute_packet_id: string;
  final_pdf_signed_url: string | null;
  final_storage_path: string;
  final_doc_hash: string;
};

function resolveSupabaseUrl(): string {
  const viteUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL;
  if (viteUrl) return String(viteUrl);
  return String(BACKEND_CONFIG.supabase.url || '');
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Authenticated session required.');
  return token;
}

async function callEdgeFunction<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken();
  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl) throw new Error('Supabase URL is missing from frontend configuration.');

  const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as any)?.error || `Function request failed (${response.status}).`));
  }

  return json as T;
}

export async function createCreditReportUploadUrl(filename: string): Promise<SignedUploadUrlResult> {
  return callEdgeFunction<SignedUploadUrlResult>('credit-extract-sanitize/create-upload-url', { filename });
}

export async function uploadCreditReportPdf(file: File, upload: SignedUploadUrlResult): Promise<void> {
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.object_path, upload.token, file, {
      contentType: file.type || 'application/pdf',
    });

  if (error) {
    throw new Error(error.message || 'Unable to upload credit report PDF.');
  }
}

export async function runCreditExtractSanitize(input: {
  upload_id: string;
  bureau: Bureau;
}): Promise<SanitizeRunResult> {
  return callEdgeFunction<SanitizeRunResult>('credit-extract-sanitize/run', input);
}

export async function generateDisputeLetterDraft(input: {
  sanitized_facts_id: string;
}): Promise<GenerateDraftResult> {
  return callEdgeFunction<GenerateDraftResult>('dispute-letter-generate/generate', input);
}

export async function finalizeDisputeLetterDraft(input: {
  ai_draft_id: string;
  dispute_packet_id: string;
}): Promise<FinalizeDraftResult> {
  return callEdgeFunction<FinalizeDraftResult>('dispute-letter-finalize/finalize', input);
}
