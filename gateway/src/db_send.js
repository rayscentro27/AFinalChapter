import { supabaseAdmin } from './supabase.js';

export async function getConversationOrThrow({ tenant_id, conversation_id }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, tenant_id, channel_account_id, contact_id')
    .eq('tenant_id', tenant_id)
    .eq('id', conversation_id)
    .single();

  if (error) throw new Error(`Conversation not found: ${error.message}`);
  return data;
}

export async function getChannelAccountOrThrow({ tenant_id, channel_account_id }) {
  const { data, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('id, tenant_id, provider, external_account_id, metadata, is_active')
    .eq('tenant_id', tenant_id)
    .eq('id', channel_account_id)
    .eq('is_active', true)
    .single();

  if (error) throw new Error(`Channel account not found: ${error.message}`);
  return data;
}

export async function setProviderRealId({ tenant_id, message_id, provider_message_id_real }) {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ provider_message_id_real })
    .eq('tenant_id', tenant_id)
    .eq('id', message_id);

  if (error) throw new Error(`setProviderRealId failed: ${error.message}`);
}

export async function setMessageStatus({ tenant_id, message_id, status, error = null }) {
  const patch = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (error) patch.error = error;

  const { error: e1 } = await supabaseAdmin
    .from('messages')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .eq('id', message_id);

  if (e1) throw new Error(`setMessageStatus failed: ${e1.message}`);
}

export async function markMessageFailed({ tenant_id, message_id, errorPayload }) {
  await setMessageStatus({
    tenant_id,
    message_id,
    status: 'failed',
    error: errorPayload || { message: 'Unknown provider send error' },
  });
}
