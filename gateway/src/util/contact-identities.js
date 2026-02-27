import { supabaseAdmin as defaultSupabaseAdmin } from '../supabase.js';

const STRONG_TYPES = new Set(['phone', 'email']);

function text(value) {
  const out = String(value || '').trim();
  return out || null;
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function isDuplicate(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('conflict');
}

export function normalizeIdentity({ provider, identity_type, identity_value }) {
  const normalizedProvider = text(provider)?.toLowerCase() || 'custom';
  const normalizedType = text(identity_type)?.toLowerCase() || 'other';
  let value = text(identity_value) || '';

  if (!value) {
    return {
      provider: normalizedProvider,
      identity_type: normalizedType,
      identity_value: null,
    };
  }

  if (normalizedType === 'email') {
    value = value.toLowerCase();
  }

  if (normalizedType === 'phone') {
    value = value.replace(/[^\d+]/g, '');
    if (!value.startsWith('+') && /^\d{10}$/.test(value)) value = `+1${value}`;
  }

  if (normalizedType === 'matrix_user') {
    value = value.toLowerCase();
  }

  return {
    provider: normalizedProvider,
    identity_type: normalizedType,
    identity_value: value,
  };
}

export async function resolveCanonicalContactId({ supabaseAdmin, tenant_id, contact_id }) {
  let current = text(contact_id);
  if (!tenant_id || !current) return null;

  for (let i = 0; i < 8; i += 1) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('id, merged_into_contact_id')
      .eq('tenant_id', tenant_id)
      .eq('id', current)
      .maybeSingle();

    if (error) {
      if (isMissingSchema(error)) return current;
      throw new Error(`contacts canonical lookup failed: ${error.message}`);
    }

    if (!data?.merged_into_contact_id) return data?.id || current;
    current = String(data.merged_into_contact_id);
  }

  return current;
}

async function findIdentityRow({
  supabaseAdmin,
  tenant_id,
  provider,
  identity_type,
  identity_value,
  channel_account_id,
}) {
  if (!tenant_id || !provider || !identity_type || !identity_value) return null;

  const select = 'id, contact_id';

  if (channel_account_id) {
    const scoped = await supabaseAdmin
      .from('contact_identities')
      .select(select)
      .eq('tenant_id', tenant_id)
      .eq('provider', provider)
      .eq('identity_type', identity_type)
      .eq('identity_value', identity_value)
      .eq('channel_account_id', channel_account_id)
      .maybeSingle();

    if (!scoped.error && scoped.data) return scoped.data;
    if (scoped.error && !isMissingSchema(scoped.error)) {
      throw new Error(`contact identity scoped lookup failed: ${scoped.error.message}`);
    }
  }

  const unscoped = await supabaseAdmin
    .from('contact_identities')
    .select(select)
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('identity_type', identity_type)
    .eq('identity_value', identity_value)
    .is('channel_account_id', null)
    .maybeSingle();

  if (!unscoped.error) return unscoped.data || null;
  if (isMissingSchema(unscoped.error)) return null;
  throw new Error(`contact identity lookup failed: ${unscoped.error.message}`);
}

async function createContact({ supabaseAdmin, tenant_id, display_name }) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      tenant_id,
      client_id: tenant_id,
      display_name: text(display_name),
      name: text(display_name),
      status: 'active',
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) throw new Error(`contacts insert failed: ${error.message}`);
  return data.id;
}

async function moveIdentityOrDropDuplicate({ supabaseAdmin, row, into_contact_id }) {
  const update = await supabaseAdmin
    .from('contact_identities')
    .update({ contact_id: into_contact_id })
    .eq('id', row.id);

  if (!update.error) return;
  if (!isDuplicate(update.error)) {
    throw new Error(`contact identity move failed: ${update.error.message}`);
  }

  let existsQ = supabaseAdmin
    .from('contact_identities')
    .select('id')
    .eq('tenant_id', row.tenant_id)
    .eq('provider', row.provider)
    .eq('identity_type', row.identity_type)
    .eq('identity_value', row.identity_value);

  if (row.channel_account_id) {
    existsQ = existsQ.eq('channel_account_id', row.channel_account_id);
  } else {
    existsQ = existsQ.is('channel_account_id', null);
  }

  const exists = await existsQ.maybeSingle();
  if (exists.error && !isMissingSchema(exists.error)) {
    throw new Error(`contact identity duplicate check failed: ${exists.error.message}`);
  }

  if (exists.data?.id) {
    const drop = await supabaseAdmin.from('contact_identities').delete().eq('id', row.id);
    if (drop.error && !isMissingSchema(drop.error)) {
      throw new Error(`contact identity duplicate drop failed: ${drop.error.message}`);
    }
    return;
  }

  throw new Error(`contact identity move conflicted: ${update.error.message}`);
}

export async function attachIdentityToContact({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  contact_id,
  provider,
  identity_type,
  identity_value,
  channel_account_id = null,
  confidence = 60,
  verified = false,
  is_primary = false,
  metadata = null,
}) {
  const normed = normalizeIdentity({ provider, identity_type, identity_value });
  const tenantId = text(tenant_id);
  const contactId = text(contact_id);

  if (!tenantId || !contactId || !normed.identity_value) {
    return { ok: false, contact_id: null, attached: false };
  }

  const row = {
    tenant_id: tenantId,
    contact_id: contactId,
    provider: normed.provider,
    identity_type: normed.identity_type,
    identity_value: normed.identity_value,
    channel_account_id: text(channel_account_id),
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 60,
    verified: Boolean(verified),
    is_primary: Boolean(is_primary),
    metadata,
  };

  const insert = await supabaseAdmin.from('contact_identities').insert(row);
  if (!insert.error) {
    return { ok: true, contact_id: contactId, attached: true };
  }

  if (isMissingSchema(insert.error)) {
    return { ok: false, contact_id: contactId, attached: false };
  }

  if (!isDuplicate(insert.error)) {
    throw new Error(`contact identity insert failed: ${insert.error.message}`);
  }

  const existing = await findIdentityRow({
    supabaseAdmin,
    tenant_id: tenantId,
    provider: normed.provider,
    identity_type: normed.identity_type,
    identity_value: normed.identity_value,
    channel_account_id: text(channel_account_id),
  });

  if (!existing?.contact_id) {
    throw new Error(`contact identity conflict but lookup missing for ${normed.provider}:${normed.identity_type}`);
  }

  const canonical = await resolveCanonicalContactId({
    supabaseAdmin,
    tenant_id: tenantId,
    contact_id: existing.contact_id,
  });

  return {
    ok: true,
    contact_id: canonical || existing.contact_id,
    attached: false,
  };
}

export async function getOrCreateContactByIdentity({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  provider,
  identity_type,
  identity_value,
  channel_account_id = null,
  display_name = null,
  confidence = 60,
  verified = false,
}) {
  const tenantId = text(tenant_id);
  const normed = normalizeIdentity({ provider, identity_type, identity_value });
  if (!tenantId || !normed.identity_value) return null;

  const existing = await findIdentityRow({
    supabaseAdmin,
    tenant_id: tenantId,
    provider: normed.provider,
    identity_type: normed.identity_type,
    identity_value: normed.identity_value,
    channel_account_id: text(channel_account_id),
  });

  if (existing?.contact_id) {
    return resolveCanonicalContactId({
      supabaseAdmin,
      tenant_id: tenantId,
      contact_id: existing.contact_id,
    });
  }

  const createdContactId = await createContact({
    supabaseAdmin,
    tenant_id: tenantId,
    display_name,
  });

  const attached = await attachIdentityToContact({
    supabaseAdmin,
    tenant_id: tenantId,
    contact_id: createdContactId,
    provider: normed.provider,
    identity_type: normed.identity_type,
    identity_value: normed.identity_value,
    channel_account_id,
    confidence,
    verified,
    is_primary: true,
    metadata: null,
  });

  if (!attached.ok) return createdContactId;
  if (attached.contact_id === createdContactId) return createdContactId;

  const markMerged = await supabaseAdmin
    .from('contacts')
    .update({
      merged_into_contact_id: attached.contact_id,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', createdContactId);

  if (markMerged.error && !isMissingSchema(markMerged.error)) {
    throw new Error(`contacts merge marker failed: ${markMerged.error.message}`);
  }

  return attached.contact_id;
}

export async function mergeContacts({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  from_contact_id,
  into_contact_id,
  merged_by = null,
  reason = null,
}) {
  const tenantId = text(tenant_id);
  const fromRaw = text(from_contact_id);
  const intoRaw = text(into_contact_id);

  if (!tenantId || !fromRaw || !intoRaw) {
    throw new Error('Missing tenant_id, from_contact_id, or into_contact_id');
  }

  const fromId = await resolveCanonicalContactId({
    supabaseAdmin,
    tenant_id: tenantId,
    contact_id: fromRaw,
  });

  const intoId = await resolveCanonicalContactId({
    supabaseAdmin,
    tenant_id: tenantId,
    contact_id: intoRaw,
  });

  if (!fromId || !intoId || fromId === intoId) {
    return { ok: true, from_contact_id: fromId || fromRaw, into_contact_id: intoId || intoRaw, merged: false };
  }

  const fromContact = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, primary_email, primary_phone, phone_e164, email, notes, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', fromId)
    .maybeSingle();

  if (fromContact.error) throw new Error(`from contact lookup failed: ${fromContact.error.message}`);

  const intoContact = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, primary_email, primary_phone, phone_e164, email, notes, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', intoId)
    .maybeSingle();

  if (intoContact.error) throw new Error(`into contact lookup failed: ${intoContact.error.message}`);

  let mergeJobId = null;
  const createMergeJob = await supabaseAdmin
    .from('contact_merge_jobs')
    .insert({
      tenant_id: tenantId,
      from_contact_id: fromId,
      into_contact_id: intoId,
      merged_by: text(merged_by),
      reason: text(reason),
    })
    .select('id')
    .maybeSingle();

  if (createMergeJob.error) {
    if (!isMissingSchema(createMergeJob.error)) {
      throw new Error(`contact merge job create failed: ${createMergeJob.error.message}`);
    }
  } else {
    mergeJobId = createMergeJob.data?.id || null;
  }

  const ids = await supabaseAdmin
    .from('contact_identities')
    .select('id, tenant_id, contact_id, provider, identity_type, identity_value, channel_account_id, verified, confidence, is_primary, metadata, created_at')
    .eq('tenant_id', tenantId)
    .eq('contact_id', fromId);

  if (ids.error && !isMissingSchema(ids.error)) {
    throw new Error(`contact identities fetch failed: ${ids.error.message}`);
  }

  if (mergeJobId && (ids.data || []).length > 0) {
    const identityItems = (ids.data || []).map((row) => ({
      job_id: mergeJobId,
      tenant_id: tenantId,
      item_type: 'identity',
      item_id: String(row.id),
      from_contact_id: fromId,
      into_contact_id: intoId,
      snapshot: row,
    }));

    const identityItemsInsert = await supabaseAdmin
      .from('contact_merge_job_items')
      .insert(identityItems);

    if (identityItemsInsert.error && !isMissingSchema(identityItemsInsert.error)) {
      throw new Error(`contact merge identity items insert failed: ${identityItemsInsert.error.message}`);
    }
  }

  const fromConversations = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('contact_id', fromId);

  if (fromConversations.error && !isMissingSchema(fromConversations.error)) {
    throw new Error(`conversation ids fetch failed: ${fromConversations.error.message}`);
  }

  if (mergeJobId && (fromConversations.data || []).length > 0) {
    const conversationItems = (fromConversations.data || []).map((row) => ({
      job_id: mergeJobId,
      tenant_id: tenantId,
      item_type: 'conversation',
      item_id: String(row.id),
      from_contact_id: fromId,
      into_contact_id: intoId,
    }));

    const conversationItemsInsert = await supabaseAdmin
      .from('contact_merge_job_items')
      .insert(conversationItems);

    if (conversationItemsInsert.error && !isMissingSchema(conversationItemsInsert.error)) {
      throw new Error(`contact merge conversation items insert failed: ${conversationItemsInsert.error.message}`);
    }
  }

  for (const row of ids.data || []) {
    await moveIdentityOrDropDuplicate({
      supabaseAdmin,
      row,
      into_contact_id: intoId,
    });
  }

  const moveConversations = await supabaseAdmin
    .from('conversations')
    .update({
      contact_id: intoId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('contact_id', fromId);

  if (moveConversations.error && !isMissingSchema(moveConversations.error)) {
    throw new Error(`conversation move failed: ${moveConversations.error.message}`);
  }

  const intoPatch = {
    display_name: intoContact.data?.display_name || fromContact.data?.display_name || null,
    primary_email: intoContact.data?.primary_email || fromContact.data?.primary_email || fromContact.data?.email || null,
    primary_phone: intoContact.data?.primary_phone || fromContact.data?.primary_phone || fromContact.data?.phone_e164 || null,
    updated_at: new Date().toISOString(),
  };

  const patchInto = await supabaseAdmin
    .from('contacts')
    .update(intoPatch)
    .eq('tenant_id', tenantId)
    .eq('id', intoId);

  if (patchInto.error) throw new Error(`target contact patch failed: ${patchInto.error.message}`);

  const markFrom = await supabaseAdmin
    .from('contacts')
    .update({
      merged_into_contact_id: intoId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', fromId);

  if (markFrom.error) throw new Error(`source contact merge marker failed: ${markFrom.error.message}`);

  const audit = await supabaseAdmin
    .from('contact_merge_audit')
    .insert({
      tenant_id: tenantId,
      from_contact_id: fromId,
      into_contact_id: intoId,
      merged_by: text(merged_by),
      reason: text(reason),
      snapshot: {
        from_contact: fromContact.data || null,
        into_contact_before: intoContact.data || null,
      },
    });

  if (audit.error && !isMissingSchema(audit.error)) {
    throw new Error(`contact merge audit insert failed: ${audit.error.message}`);
  }

  return {
    ok: true,
    from_contact_id: fromId,
    into_contact_id: intoId,
    merged: true,
    merge_job_id: mergeJobId,
  };
}

export function isStrongIdentity(identity_type) {
  return STRONG_TYPES.has(String(identity_type || '').toLowerCase());
}
