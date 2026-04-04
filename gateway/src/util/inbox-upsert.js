import { supabaseAdmin } from '../supabase.js';
import { buildWebhookEventKey, queueOutgoingWebhookEvent } from '../lib/public-api/webhookDispatcher.js';
import {
  attachIdentityToContact,
  getOrCreateContactByIdentity,
  normalizeIdentity,
} from './contact-identities.js';

function cleanText(input) {
  const value = String(input || '').trim();
  return value || null;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function isMissingProviderColumn(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes('provider');
}

function isMissingColumn(error, column) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes(String(column || '').toLowerCase());
}

async function findContactByField(tenantId, field, value) {
  if (!value) return null;

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, metadata')
    .eq('tenant_id', tenantId)
    .eq(field, value)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`contacts lookup failed: ${error.message}`);
  return data || null;
}

function inferMetaIdentity(psid, metadata) {
  const normalized = cleanText(psid);
  if (!normalized) return null;

  if (normalized.startsWith('ig:')) {
    return {
      provider: 'meta',
      identity_type: 'igsid',
      identity_value: normalized.slice(3),
      confidence: 70,
      verified: false,
    };
  }

  const channel = String(metadata?.channel || '').toLowerCase();
  if (channel === 'instagram') {
    return {
      provider: 'meta',
      identity_type: 'igsid',
      identity_value: normalized,
      confidence: 70,
      verified: false,
    };
  }

  return {
    provider: 'meta',
    identity_type: 'psid',
    identity_value: normalized,
    confidence: 70,
    verified: false,
  };
}

async function legacyFallbackContact({
  tenantId,
  normalizedPhone,
  normalizedWa,
  normalizedPsid,
  normalizedName,
  metadata,
}) {
  const lookupFields = [
    ['phone_e164', normalizedPhone],
    ['wa_number', normalizedWa],
    ['fb_psid', normalizedPsid],
  ];

  for (const [field, value] of lookupFields) {
    const hit = await findContactByField(tenantId, field, value);
    if (!hit) continue;

    const patch = compact({
      display_name: hit.display_name || normalizedName,
      metadata: { ...(hit.metadata || {}), ...metadata },
      phone_e164: normalizedPhone,
      wa_number: normalizedWa,
      fb_psid: normalizedPsid,
    });

    const { error: upErr } = await supabaseAdmin
      .from('contacts')
      .update(patch)
      .eq('id', hit.id);

    if (upErr) throw new Error(`contacts update failed: ${upErr.message}`);
    return hit.id;
  }

  const insertRow = {
    tenant_id: tenantId,
    client_id: tenantId,
    display_name: normalizedName,
    name: normalizedName,
    phone_e164: normalizedPhone,
    wa_number: normalizedWa,
    fb_psid: normalizedPsid,
    metadata,
    status: 'active',
  };

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert(insertRow)
    .select('id')
    .single();

  if (!error) return data.id;

  if (normalizedPhone) {
    const fallback = await findContactByField(tenantId, 'phone_e164', normalizedPhone);
    if (fallback) return fallback.id;
  }

  throw new Error(`contacts insert failed: ${error.message}`);
}

export async function upsertContact({
  tenantId,
  phoneE164,
  waNumber,
  fbPsid,
  displayName,
  metadata = {},
  channelAccountId = null,
}) {
  if (!tenantId) return null;

  const normalizedPhone = cleanText(phoneE164);
  const normalizedWa = cleanText(waNumber);
  const normalizedPsid = cleanText(fbPsid);
  const normalizedName = cleanText(displayName);

  const identityCandidates = [];

  if (normalizedPhone) {
    const norm = normalizeIdentity({
      provider: 'custom',
      identity_type: 'phone',
      identity_value: normalizedPhone,
    });
    identityCandidates.push({ ...norm, confidence: 90, verified: true });
  }

  if (normalizedWa && normalizedWa !== normalizedPhone) {
    const norm = normalizeIdentity({
      provider: 'custom',
      identity_type: 'phone',
      identity_value: normalizedWa,
    });
    identityCandidates.push({ ...norm, confidence: 90, verified: true });
  }

  const metaIdentity = inferMetaIdentity(normalizedPsid, metadata);
  if (metaIdentity?.identity_value) {
    identityCandidates.push(metaIdentity);
  }

  let contactId = null;

  if (identityCandidates.length > 0) {
    const first = identityCandidates[0];
    contactId = await getOrCreateContactByIdentity({
      supabaseAdmin,
      tenant_id: tenantId,
      provider: first.provider,
      identity_type: first.identity_type,
      identity_value: first.identity_value,
      channel_account_id: first.provider === 'meta' ? channelAccountId : null,
      display_name: normalizedName,
      confidence: first.confidence,
      verified: first.verified,
    });

    if (contactId) {
      for (const identity of identityCandidates) {
        const attached = await attachIdentityToContact({
          supabaseAdmin,
          tenant_id: tenantId,
          contact_id: contactId,
          provider: identity.provider,
          identity_type: identity.identity_type,
          identity_value: identity.identity_value,
          channel_account_id: identity.provider === 'meta' ? channelAccountId : null,
          confidence: identity.confidence,
          verified: identity.verified,
          is_primary: false,
          metadata: null,
        });

        if (attached.ok && attached.contact_id && attached.contact_id !== contactId) {
          contactId = attached.contact_id;
        }
      }
    }
  }

  if (!contactId) {
    contactId = await legacyFallbackContact({
      tenantId,
      normalizedPhone,
      normalizedWa,
      normalizedPsid,
      normalizedName,
      metadata,
    });
  }

  const { data: hit, error: hitErr } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, metadata, phone_e164, wa_number, fb_psid, email, primary_phone, primary_email')
    .eq('tenant_id', tenantId)
    .eq('id', contactId)
    .maybeSingle();

  if (hitErr) throw new Error(`contacts canonical lookup failed: ${hitErr.message}`);

  const patch = compact({
    display_name: hit?.display_name || normalizedName,
    metadata: { ...(hit?.metadata || {}), ...metadata },
    phone_e164: hit?.phone_e164 || normalizedPhone || undefined,
    wa_number: hit?.wa_number || normalizedWa || undefined,
    fb_psid: hit?.fb_psid || normalizedPsid || undefined,
    primary_phone: hit?.primary_phone || normalizedPhone || normalizedWa || undefined,
    primary_email: hit?.primary_email || (hit?.email ? String(hit.email).toLowerCase() : undefined),
    updated_at: new Date().toISOString(),
  });

  let update = await supabaseAdmin
    .from('contacts')
    .update(patch)
    .eq('id', contactId);

  if (update.error && (isMissingColumn(update.error, 'primary_phone') || isMissingColumn(update.error, 'primary_email'))) {
    delete patch.primary_phone;
    delete patch.primary_email;
    update = await supabaseAdmin
      .from('contacts')
      .update(patch)
      .eq('id', contactId);
  }

  if (update.error) throw new Error(`contacts canonical update failed: ${update.error.message}`);

  return contactId;
}

export async function getOrCreateConversation({
  tenantId,
  channelAccountId,
  contactId,
  subject,
  provider,
  channelType,
  workflowThreadType = 'general',
  threadStatus = 'new',
  ownerUserId = null,
  aiMode = 'off',
}) {
  if (!tenantId || !channelAccountId) return null;

  const { data: existing, error: selErr } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel_account_id', channelAccountId)
    .eq('contact_id', contactId)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (selErr) throw new Error(`conversations lookup failed: ${selErr.message}`);
  if (existing && existing.length > 0) return existing[0].id;

  const row = {
    tenant_id: tenantId,
    channel_account_id: channelAccountId,
    contact_id: contactId,
    status: 'open',
    subject: cleanText(subject),
    thread_status: threadStatus || 'new',
    workflow_thread_type: workflowThreadType || 'general',
    owner_user_id: ownerUserId || null,
    ai_mode: aiMode || 'off',
    channel_type: channelType || 'nexus_chat',
  };

  const normalizedProvider = cleanText(provider);
  if (normalizedProvider) row.provider = normalizedProvider;

  let result = await supabaseAdmin
    .from('conversations')
    .insert(row)
    .select('id')
    .single();

  if (result.error && normalizedProvider && isMissingProviderColumn(result.error)) {
    delete row.provider;
    result = await supabaseAdmin
      .from('conversations')
      .insert(row)
      .select('id')
      .single();
  }

  const workflowColumns = ['thread_status', 'workflow_thread_type', 'owner_user_id', 'ai_mode', 'channel_type'];
  if (result.error && workflowColumns.some((column) => isMissingColumn(result.error, column))) {
    for (const key of workflowColumns) delete row[key];
    result = await supabaseAdmin
      .from('conversations')
      .insert(row)
      .select('id')
      .single();
  }

  if (result.error) throw new Error(`conversations insert failed: ${result.error.message}`);
  return result.data.id;
}

export async function upsertMessage({
  tenantId,
  conversationId,
  provider,
  providerMessageId,
  providerMessageIdReal,
  direction,
  fromId,
  toId,
  body,
  content,
  status,
  receivedAt,
}) {
  const row = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    provider,
    provider_message_id: providerMessageId,
    provider_message_id_real: providerMessageIdReal || null,
    direction,
    from_id: cleanText(fromId),
    to_id: cleanText(toId),
    body: body ?? null,
    content: content || {},
    status: status || 'received',
    received_at: receivedAt || new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(row)
    .select('id, conversation_id, provider_message_id, provider_message_id_real, status')
    .single();

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique')) return null;
    throw new Error(`messages insert failed: ${error.message}`);
  }

  await queueOutgoingWebhookEvent({
    tenant_id: tenantId,
    event_type: 'message.created',
    event_key: buildWebhookEventKey('message.created', {
      message_id: data.id,
      conversation_id: conversationId,
      provider,
      provider_message_id: providerMessageId,
    }),
    payload: {
      message_id: data.id,
      conversation_id: conversationId,
      contact_id: null,
      direction,
      provider,
      provider_message_id: providerMessageId,
      status: status || 'received',
      received_at: receivedAt || new Date().toISOString(),
    },
  }).catch(() => {});

  return data;
}

export async function updateMessageStatus({ tenantId, provider, providerMessageId, status, errorPayload }) {
  if (!tenantId || !providerMessageId) return false;

  const patch = compact({
    status: cleanText(status) || 'updated',
    error: errorPayload || {},
  });

  const { error } = await supabaseAdmin
    .from('messages')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('provider_message_id_real', providerMessageId);

  if (error) throw new Error(`messages status update failed: ${error.message}`);
  return true;
}
