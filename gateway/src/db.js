import { supabaseAdmin } from './supabase.js';
import { buildWebhookEventKey, queueOutgoingWebhookEvent } from './lib/public-api/webhookDispatcher.js';

export async function enqueueJob({
  tenant_id,
  job_type,
  payload,
  logger = console,
}) {
  if (!tenant_id || !job_type) {
    logger.warn({ tenant_id, job_type }, 'enqueueJob: missing required fields');
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('job_queue')
      .insert({
        tenant_id,
        job_type,
        payload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      logger.error({ error: error.message, job_type, tenant_id }, 'enqueueJob: failed to insert job');
      return null;
    }

    logger.info({ job_id: data?.id, job_type, tenant_id }, 'Job enqueued');
    return data?.id || null;
  } catch (err) {
    logger.error({ error: String(err.message || err), job_type, tenant_id }, 'enqueueJob: exception');
    return null;
  }
}

export async function getChannelAccount({ provider, external_account_id }) {
  const { data, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('id, tenant_id, provider, external_account_id, metadata, is_active')
    .eq('provider', provider)
    .eq('external_account_id', external_account_id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`channel_accounts lookup failed: ${error.message}`);
  if (!data) return null;
  return data;
}

export async function upsertContactByPhone({ tenant_id, phone_e164, display_name, wa_number }) {
  const { data: existing, error: e1 } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, phone_e164, wa_number')
    .eq('tenant_id', tenant_id)
    .eq('phone_e164', phone_e164)
    .maybeSingle();

  if (e1) throw new Error(`contacts lookup failed: ${e1.message}`);

  if (existing) {
    const patch = {};
    if (!existing.display_name && display_name) patch.display_name = display_name;
    if (!existing.wa_number && wa_number) patch.wa_number = wa_number;

    if (Object.keys(patch).length) {
      const { error: e2 } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', existing.id);
      if (e2) throw new Error(`contacts update failed: ${e2.message}`);
    }
    return existing.id;
  }

  const { data: created, error: e3 } = await supabaseAdmin
    .from('contacts')
    .insert({
      tenant_id,
      client_id: tenant_id,
      display_name: display_name || null,
      phone_e164,
      wa_number: wa_number || null,
      status: 'active',
    })
    .select('id')
    .single();

  if (e3) throw new Error(`contacts insert failed: ${e3.message}`);
  return created.id;
}

export async function upsertContactByPSID({ tenant_id, fb_psid, display_name }) {
  const { data: existing, error: e1 } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, fb_psid')
    .eq('tenant_id', tenant_id)
    .eq('fb_psid', fb_psid)
    .maybeSingle();

  if (e1) throw new Error(`contacts psid lookup failed: ${e1.message}`);

  if (existing) {
    const patch = {};
    if (!existing.display_name && display_name) patch.display_name = display_name;

    if (Object.keys(patch).length) {
      const { error: e2 } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', existing.id);
      if (e2) throw new Error(`contacts psid update failed: ${e2.message}`);
    }

    return existing.id;
  }

  const { data: created, error: e3 } = await supabaseAdmin
    .from('contacts')
    .insert({
      tenant_id,
      client_id: tenant_id,
      display_name: display_name || null,
      fb_psid,
      status: 'active',
    })
    .select('id')
    .single();

  if (e3) throw new Error(`contacts psid insert failed: ${e3.message}`);
  return created.id;
}

export async function upsertContactByIG({ tenant_id, ig_handle, matrix_user_id, display_name }) {
  const key = ig_handle || null;

  if (!key) {
    const { data: created, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        tenant_id,
        client_id: tenant_id,
        display_name: display_name || 'Instagram User',
        ig_handle: null,
        metadata: { source: 'instagram', matrix_user_id: matrix_user_id || null },
        status: 'active',
      })
      .select('id')
      .single();

    if (error) throw new Error(`contacts ig fallback insert failed: ${error.message}`);
    return created.id;
  }

  const { data: existing, error: e1 } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, ig_handle')
    .eq('tenant_id', tenant_id)
    .eq('ig_handle', key)
    .maybeSingle();

  if (e1) throw new Error(`contacts ig lookup failed: ${e1.message}`);

  if (existing) {
    const patch = {};
    if (!existing.display_name && display_name) patch.display_name = display_name;

    if (Object.keys(patch).length) {
      const { error: e2 } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', existing.id);
      if (e2) throw new Error(`contacts ig update failed: ${e2.message}`);
    }
    return existing.id;
  }

  const { data: created, error: e3 } = await supabaseAdmin
    .from('contacts')
    .insert({
      tenant_id,
      client_id: tenant_id,
      display_name: display_name || null,
      ig_handle: key,
      status: 'active',
    })
    .select('id')
    .single();

  if (e3) throw new Error(`contacts ig insert failed: ${e3.message}`);
  return created.id;
}

export async function getOrCreateConversation({ tenant_id, channel_account_id, contact_id }) {
  const { data: existing, error: e1 } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('channel_account_id', channel_account_id)
    .eq('contact_id', contact_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (e1) throw new Error(`conversations lookup failed: ${e1.message}`);
  if (existing) return existing.id;

  const { data: created, error: e2 } = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id,
      channel_account_id,
      contact_id,
      status: 'open',
      priority: 3,
    })
    .select('id')
    .single();

  if (e2) throw new Error(`conversations insert failed: ${e2.message}`);
  return created.id;
}

export async function insertProviderEvent({ tenant_id, provider, provider_event_id, event_type, payload }) {
  const { error } = await supabaseAdmin.from('provider_events').insert({
    tenant_id,
    provider,
    provider_event_id,
    event_type,
    payload,
    received_at: new Date().toISOString(),
  });

  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
    throw new Error(`provider_events insert failed: ${error.message}`);
  }
}

export async function insertMessage({
  tenant_id,
  conversation_id,
  direction,
  provider,
  provider_message_id,
  provider_message_id_real,
  from_id,
  to_id,
  body,
  content,
  status,
  received_at,
}) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id,
      conversation_id,
      direction,
      provider,
      provider_message_id,
      provider_message_id_real: provider_message_id_real || null,
      from_id,
      to_id,
      body,
      content: content || {},
      status: status || 'received',
      received_at: received_at || new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique')) return null;
    throw new Error(`messages insert failed: ${error.message}`);
  }

  await queueOutgoingWebhookEvent({
    tenant_id,
    event_type: 'message.created',
    event_key: buildWebhookEventKey('message.created', {
      message_id: data.id,
      conversation_id,
      provider,
      provider_message_id,
    }),
    payload: {
      message_id: data.id,
      conversation_id,
      direction,
      provider,
      provider_message_id,
      status: status || 'received',
      received_at: received_at || new Date().toISOString(),
    },
  }).catch(() => {});

  // Enqueue sentiment triage job for inbound messages
  if (direction === 'in') {
    await enqueueJob({
      tenant_id,
      job_type: 'sentiment_triage',
      payload: {
        message_id: data.id,
        conversation_id,
        provider,
      },
    }).catch(() => {});
  }

  return data.id;
}

export { supabaseAdmin };
