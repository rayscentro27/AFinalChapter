import { supabaseAdmin } from './supabase.js';

export async function getConversationContext({ tenant_id, conversation_id }) {
  const { data: convo, error: e1 } = await supabaseAdmin
    .from('conversations')
    .select('id, tenant_id, channel_account_id, contact_id, status, priority, tags, assignee_user_id, assignee_type, assignee_ai_key')
    .eq('tenant_id', tenant_id)
    .eq('id', conversation_id)
    .single();

  if (e1) throw new Error(`Conversation not found: ${e1.message}`);

  const { data: channel, error: e2 } = await supabaseAdmin
    .from('channel_accounts')
    .select('id, tenant_id, provider, external_account_id')
    .eq('tenant_id', tenant_id)
    .eq('id', convo.channel_account_id)
    .single();

  if (e2) throw new Error(`Channel account not found: ${e2.message}`);

  const { data: msg, error: e3 } = await supabaseAdmin
    .from('messages')
    .select('id, direction, body, content, received_at')
    .eq('tenant_id', tenant_id)
    .eq('conversation_id', conversation_id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (e3) throw new Error(`Failed loading last message: ${e3.message}`);

  return {
    conversation: convo,
    channel,
    lastMessage: msg || null,
  };
}

export async function getActiveRoutingRules({ tenant_id }) {
  const { data, error } = await supabaseAdmin
    .from('routing_rules')
    .select('id, tenant_id, name, is_active, match_type, match_value, target_type, target_user_id, target_ai_key, priority, created_at')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed loading routing rules: ${error.message}`);
  return data || [];
}

export async function applyAssignment({
  tenant_id,
  conversation_id,
  target_type,
  target_user_id,
  target_ai_key,
}) {
  const patch =
    target_type === 'agent'
      ? {
          assignee_type: 'agent',
          assignee_user_id: target_user_id,
          assignee_ai_key: null,
        }
      : {
          assignee_type: 'ai',
          assignee_user_id: null,
          assignee_ai_key: target_ai_key || null,
        };

  const { error } = await supabaseAdmin
    .from('conversations')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .eq('id', conversation_id);

  if (error) throw new Error(`Failed updating conversation assignment: ${error.message}`);
}

export async function logRoutingRun({
  tenant_id,
  conversation_id,
  rule_id,
  applied,
  notes,
}) {
  const { error } = await supabaseAdmin
    .from('routing_runs')
    .insert({
      tenant_id,
      conversation_id,
      rule_id: rule_id || null,
      applied: !!applied,
      notes: notes || null,
    });

  if (error) throw new Error(`Failed inserting routing_runs: ${error.message}`);
}
