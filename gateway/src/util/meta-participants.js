import { supabaseAdmin } from '../supabase.js';

function text(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function isMissingError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

async function resolveMetaChannelAccountId({ tenant_id, external_page_id }) {
  if (!tenant_id || !external_page_id) return null;

  const { data, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('provider', 'meta')
    .eq('external_account_id', external_page_id)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingError(error)) return null;
    throw new Error(`channel account lookup failed: ${error.message}`);
  }

  return data?.id || null;
}

async function resolveByParticipants({ tenant_id, external_user_id, external_page_id }) {
  let q = supabaseAdmin
    .from('conversation_participants')
    .select('conversation_id, created_at')
    .eq('tenant_id', tenant_id)
    .eq('provider', 'meta')
    .eq('external_user_id', external_user_id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (external_page_id) q = q.eq('external_page_id', external_page_id);

  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isMissingError(error)) return null;
    throw new Error(`conversation_participants lookup failed: ${error.message}`);
  }

  return data?.conversation_id || null;
}

async function resolveByContact({ tenant_id, external_user_id, external_page_id }) {
  async function resolveMergedContact(contactId) {
    if (!contactId) return null;

    let current = String(contactId);
    for (let i = 0; i < 8; i += 1) {
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('id, merged_into_contact_id')
        .eq('tenant_id', tenant_id)
        .eq('id', current)
        .maybeSingle();

      if (error) {
        if (isMissingError(error)) return current;
        throw new Error(`contacts merged lookup failed: ${error.message}`);
      }

      if (!data?.merged_into_contact_id) return data?.id || current;
      current = String(data.merged_into_contact_id);
    }

    return current;
  }

  async function lookupContactViaIdentity(identity_type, identity_value) {
    if (!identity_value) return null;

    const { data, error } = await supabaseAdmin
      .from('contact_identities')
      .select('contact_id, created_at')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'meta')
      .eq('identity_type', identity_type)
      .eq('identity_value', identity_value)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingError(error)) return null;
      throw new Error(`contact_identities lookup failed: ${error.message}`);
    }

    return resolveMergedContact(data?.contact_id || null);
  }

  async function lookupContact(psid) {
    const identityHits = [];
    const normalized = String(psid || '').trim();
    if (normalized) {
      if (normalized.startsWith('ig:')) {
        identityHits.push(await lookupContactViaIdentity('igsid', normalized.slice(3)));
      } else {
        identityHits.push(await lookupContactViaIdentity('psid', normalized));
        identityHits.push(await lookupContactViaIdentity('igsid', normalized));
      }
    }

    for (const hit of identityHits) {
      if (hit) return hit;
    }

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('fb_psid', psid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingError(error)) return null;
      throw new Error(`contacts lookup failed: ${error.message}`);
    }

    return resolveMergedContact(data?.id || null);
  }

  let contactId = await lookupContact(external_user_id);
  if (!contactId && !external_user_id.startsWith('ig:')) {
    contactId = await lookupContact(`ig:${external_user_id}`);
  }

  if (!contactId) return null;

  const channelAccountId = await resolveMetaChannelAccountId({ tenant_id, external_page_id });

  let withProvider = supabaseAdmin
    .from('conversations')
    .select('id, updated_at')
    .eq('tenant_id', tenant_id)
    .eq('contact_id', contactId)
    .eq('provider', 'meta')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (channelAccountId) withProvider = withProvider.eq('channel_account_id', channelAccountId);

  const attemptWithProvider = await withProvider.maybeSingle();
  if (!attemptWithProvider.error && attemptWithProvider.data?.id) return attemptWithProvider.data.id;

  if (attemptWithProvider.error && !isMissingError(attemptWithProvider.error)) {
    throw new Error(`conversations lookup failed: ${attemptWithProvider.error.message}`);
  }

  let fallback = supabaseAdmin
    .from('conversations')
    .select('id, updated_at')
    .eq('tenant_id', tenant_id)
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (channelAccountId) fallback = fallback.eq('channel_account_id', channelAccountId);

  const { data, error } = await fallback.maybeSingle();
  if (error) {
    if (isMissingError(error)) return null;
    throw new Error(`conversations fallback lookup failed: ${error.message}`);
  }

  return data?.id || null;
}

async function resolveByConversationToAddress({ tenant_id, external_user_id }) {
  let withProvider = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('provider', 'meta')
    .eq('to_address', external_user_id)
    .limit(1)
    .maybeSingle();

  if (!withProvider.error && withProvider.data?.id) return withProvider.data.id;
  if (withProvider.error && !isMissingError(withProvider.error)) {
    throw new Error(`conversations to_address lookup failed: ${withProvider.error.message}`);
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('to_address', external_user_id)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingError(error)) return null;
    throw new Error(`conversations to_address fallback failed: ${error.message}`);
  }

  return data?.id || null;
}

export async function resolveConversationIdByMetaParticipants({ tenant_id, senderId, recipientId }) {
  const normalizedTenantId = text(tenant_id);
  const external_user_id = text(senderId);
  const external_page_id = text(recipientId);

  if (!normalizedTenantId || !external_user_id) return null;

  const byParticipants = await resolveByParticipants({
    tenant_id: normalizedTenantId,
    external_user_id,
    external_page_id,
  });
  if (byParticipants) return byParticipants;

  const byContact = await resolveByContact({
    tenant_id: normalizedTenantId,
    external_user_id,
    external_page_id,
  });
  if (byContact) return byContact;

  return resolveByConversationToAddress({
    tenant_id: normalizedTenantId,
    external_user_id,
  });
}

export async function upsertMetaParticipant({ tenant_id, conversation_id, senderId, recipientId }) {
  const normalizedTenantId = text(tenant_id);
  const normalizedConversationId = text(conversation_id);
  const external_user_id = text(senderId);
  const external_page_id = text(recipientId);

  if (!normalizedTenantId || !normalizedConversationId || !external_user_id) return false;

  const { error } = await supabaseAdmin
    .from('conversation_participants')
    .upsert(
      {
        tenant_id: normalizedTenantId,
        conversation_id: normalizedConversationId,
        provider: 'meta',
        external_user_id,
        external_page_id,
      },
      {
        onConflict: 'tenant_id,provider,external_user_id,external_page_id',
      }
    );

  if (!error) return true;
  if (isMissingError(error)) return false;

  const message = String(error.message || '').toLowerCase();
  if (message.includes('there is no unique or exclusion constraint')) {
    const fallback = await supabaseAdmin
      .from('conversation_participants')
      .insert({
        tenant_id: normalizedTenantId,
        conversation_id: normalizedConversationId,
        provider: 'meta',
        external_user_id,
        external_page_id,
      });

    if (!fallback.error) return true;
    if (isMissingError(fallback.error)) return false;
    if (String(fallback.error.message || '').toLowerCase().includes('duplicate')) return true;

    throw new Error(`conversation_participants insert failed: ${fallback.error.message}`);
  }

  throw new Error(`conversation_participants upsert failed: ${error.message}`);
}
