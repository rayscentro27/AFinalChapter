import { supabase } from './supabaseClient';

export type ClaimConversationInput = {
  tenantId: string;
  conversationId: string;
};

export type ClaimConversationResult = {
  ok: boolean;
  reason: string;
};

export async function claimConversation({
  tenantId,
  conversationId,
}: ClaimConversationInput): Promise<ClaimConversationResult> {
  const { data, error } = await supabase.rpc('claim_conversation', {
    p_tenant_id: tenantId,
    p_conversation_id: conversationId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  return {
    ok: Boolean(row?.ok),
    reason: String(row?.reason || 'unknown'),
  };
}
