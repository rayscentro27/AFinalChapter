import { supabase } from '../lib/supabaseClient';

export type DisputeLetterItemInput = {
  bureau?: 'all' | 'experian' | 'equifax' | 'transunion';
  creditor: string;
  account_reference?: string;
  reason: string;
  details?: string;
};

export type RunDisputeLetterPipelineInput = {
  tenant_id?: string;
  contact_id?: string;
  recipient_name: string;
  recipient_address?: string;
  tone?: 'firm' | 'neutral';
  items: DisputeLetterItemInput[];
};

export type DisputeLetterPipelineResult = {
  success: boolean;
  run: {
    id: string;
    status: string;
    created_at: string;
    redaction_stats: {
      emails: number;
      phones: number;
      ssn: number;
      long_numbers: number;
    };
    model: string;
  };
  letter: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    letter_text: string;
  };
};

export async function runDisputeLetterPipeline(
  payload: RunDisputeLetterPipelineInput,
): Promise<DisputeLetterPipelineResult> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw new Error('Authenticated session required to generate dispute letters.');
  }

  const response = await fetch('/.netlify/functions/dispute_letter_pipeline', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as any)?.error || 'Failed to generate dispute letter.'));
  }

  return json as DisputeLetterPipelineResult;
}
