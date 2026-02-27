import { supabaseAdmin } from '../supabase.js';
import {
  attachIdentityToContact,
  mergeContacts,
  normalizeIdentity,
  resolveCanonicalContactId,
} from '../util/contact-identities.js';
import { ENV } from '../env.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { evaluatePolicy } from '../lib/policy/policyEngine.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { logAudit } from '../lib/audit/auditLog.js';
import { buildWebhookEventKey, queueOutgoingWebhookEvent } from '../lib/public-api/webhookDispatcher.js';

const UNDO_WINDOW_HOURS = 24;

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return Math.trunc(out);
}

function unique(values) {
  return Array.from(new Set(values));
}

function normalizeEmail(value) {
  return asText(value).toLowerCase();
}

function normalizePhone(value) {
  let out = asText(value).replace(/[^\d+]/g, '');
  if (!out) return '';
  if (!out.startsWith('+') && /^\d{10}$/.test(out)) out = `+1${out}`;
  return out;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isDuplicateError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('duplicate') || message.includes('unique') || message.includes('conflict');
}

function identityKey(row) {
  const scoped = row?.channel_account_id ? String(row.channel_account_id) : 'null';
  return `${String(row?.provider || '')}::${String(row?.identity_type || '')}::${String(row?.identity_value || '')}::${scoped}`;
}

function verifiedValuesByType(identities, identityType) {
  return unique(
    (identities || [])
      .filter((row) => String(row?.identity_type || '').toLowerCase() === identityType)
      .filter((row) => Boolean(row?.verified))
      .map((row) => asText(row?.identity_value))
      .filter(Boolean)
  );
}

function hasOverlap(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).some((value) => rightSet.has(value));
}

function computeConflicts({ fromIdentities, intoIdentities }) {
  const reasons = [];

  const fromPhones = verifiedValuesByType(fromIdentities, 'phone').map(normalizePhone).filter(Boolean);
  const intoPhones = verifiedValuesByType(intoIdentities, 'phone').map(normalizePhone).filter(Boolean);
  if (fromPhones.length > 0 && intoPhones.length > 0 && !hasOverlap(fromPhones, intoPhones)) {
    reasons.push('Different verified phones');
  }

  const fromEmails = verifiedValuesByType(fromIdentities, 'email').map(normalizeEmail).filter(Boolean);
  const intoEmails = verifiedValuesByType(intoIdentities, 'email').map(normalizeEmail).filter(Boolean);
  if (fromEmails.length > 0 && intoEmails.length > 0 && !hasOverlap(fromEmails, intoEmails)) {
    reasons.push('Different verified emails');
  }

  return {
    block: reasons.length > 0,
    reasons,
  };
}

function computeWarnings({
  fromContact,
  intoContact,
  fromIdentities,
  intoIdentities,
  overlap,
  fromConversationCount,
  intoConversationCount,
  conflicts,
}) {
  const warnings = [];

  const fromName = asText(fromContact?.display_name);
  const intoName = asText(intoContact?.display_name);
  if (fromName && intoName && fromName.toLowerCase() !== intoName.toLowerCase()) {
    warnings.push('Display names differ between source and target contacts.');
  }

  const overlapCount = (overlap?.exact_matches || []).length;
  if ((fromIdentities?.length || 0) >= 3 && (intoIdentities?.length || 0) >= 3 && overlapCount === 0) {
    warnings.push('Low or no identity overlap while both contacts have 3+ identities.');
  }

  const fromHighConfidence = (fromIdentities || []).filter((row) => Number(row?.confidence || 0) >= 85).length;
  const intoHighConfidence = (intoIdentities || []).filter((row) => Number(row?.confidence || 0) >= 85).length;
  if (fromHighConfidence >= 2 && intoHighConfidence >= 2 && overlapCount === 0) {
    warnings.push('Both contacts have 2+ high-confidence identities but no overlap.');
  }

  if ((fromConversationCount || 0) >= 20 || (intoConversationCount || 0) >= 20) {
    warnings.push('One contact has 20+ conversations; verify this merge carefully.');
  }

  const fromPrimaryPhone = normalizePhone(fromContact?.primary_phone);
  const intoPrimaryPhone = normalizePhone(intoContact?.primary_phone);
  if (
    fromPrimaryPhone
    && intoPrimaryPhone
    && fromPrimaryPhone !== intoPrimaryPhone
    && !conflicts.reasons.includes('Different verified phones')
  ) {
    warnings.push('Primary phones differ (non-verified conflict).');
  }

  const fromPrimaryEmail = normalizeEmail(fromContact?.primary_email);
  const intoPrimaryEmail = normalizeEmail(intoContact?.primary_email);
  if (
    fromPrimaryEmail
    && intoPrimaryEmail
    && fromPrimaryEmail !== intoPrimaryEmail
    && !conflicts.reasons.includes('Different verified emails')
  ) {
    warnings.push('Primary emails differ (non-verified conflict).');
  }

  return warnings;
}

function extractBodyText(row) {
  const body = asText(row?.body || row?.body_text);
  if (body) return body;

  const maybeContent = row?.content;
  if (maybeContent && typeof maybeContent === 'object') {
    const direct = asText(maybeContent.text || maybeContent.body || maybeContent.message);
    if (direct) return direct;
  }

  return '';
}



function isMissingRelationError(error, relationName) {
  const msg = String(error?.message || '').toLowerCase();
  const relation = String(relationName || '').toLowerCase();
  return msg.includes('relation') && msg.includes(relation) && msg.includes('does not exist');
}

function normalizeIdentityValueForSuggestion(identityType, identityValue) {
  const type = asText(identityType).toLowerCase();
  if (type === 'email') return normalizeEmail(identityValue);
  if (type === 'phone') return normalizePhone(identityValue);
  return asText(identityValue);
}

function contactRank(meta) {
  const identityCount = Number(meta?.identity_count || 0);
  const verifiedIdentityCount = Number(meta?.verified_identity_count || 0);
  const conversationCount = Number(meta?.conversation_count || 0);
  const nameBoost = asText(meta?.display_name) ? 3 : 0;
  return (verifiedIdentityCount * 100) + (identityCount * 10) + Math.min(25, conversationCount) + nameBoost;
}

function suggestionKeyFromParts({ tenant_id, from_contact_id, into_contact_id, evidenceKeys }) {
  const normalizedEvidence = unique((evidenceKeys || []).map((v) => asText(v)).filter(Boolean)).sort();
  const evidencePart = normalizedEvidence.join('|');
  return 'merge:' + asText(tenant_id) + ':' + asText(from_contact_id) + ':' + asText(into_contact_id) + ':' + evidencePart;
}

function dedupeStrings(values) {
  return unique((values || []).map((value) => asText(value)).filter(Boolean));
}

async function getLatestSuggestionActionsByKey(tenant_id) {
  const actionsRes = await supabaseAdmin
    .from('merge_suggestion_actions')
    .select('suggestion_key,action,acted_at')
    .eq('tenant_id', tenant_id)
    .order('acted_at', { ascending: false })
    .limit(5000);

  if (actionsRes.error) {
    if (isMissingRelationError(actionsRes.error, 'merge_suggestion_actions')) return new Map();
    throw new Error('merge suggestion actions lookup failed: ' + actionsRes.error.message);
  }

  const latestByKey = new Map();
  for (const row of actionsRes.data || []) {
    const key = asText(row?.suggestion_key);
    if (!key || latestByKey.has(key)) continue;
    latestByKey.set(key, asText(row?.action).toLowerCase());
  }

  return latestByKey;
}

async function recordMergeSuggestionAction({ tenant_id, suggestion_key, action, acted_by }) {
  if (!tenant_id || !suggestion_key || !action) return;

  const insert = await supabaseAdmin
    .from('merge_suggestion_actions')
    .insert({
      tenant_id,
      suggestion_key,
      action,
      acted_by: acted_by || null,
    });

  if (insert.error) {
    if (isMissingRelationError(insert.error, 'merge_suggestion_actions')) return;
    throw new Error('merge suggestion action insert failed: ' + insert.error.message);
  }
}

async function buildMergeSuggestions({ tenant_id, limit = 100 }) {
  const cappedLimit = Math.min(200, Math.max(1, asInt(limit, 100)));

  const contactsRes = await supabaseAdmin
    .from('contacts')
    .select('id,tenant_id,display_name,primary_email,primary_phone,created_at,updated_at,merged_into_contact_id')
    .eq('tenant_id', tenant_id)
    .is('merged_into_contact_id', null)
    .order('updated_at', { ascending: false })
    .limit(2000);

  if (contactsRes.error) {
    throw new Error('contacts suggestions lookup failed: ' + contactsRes.error.message);
  }

  const contacts = contactsRes.data || [];
  const contactIds = contacts.map((row) => asText(row.id)).filter(Boolean);
  if (!contactIds.length) return [];

  const identitiesRes = await supabaseAdmin
    .from('contact_identities')
    .select('contact_id,provider,identity_type,identity_value,verified,confidence,is_primary,created_at')
    .eq('tenant_id', tenant_id)
    .in('contact_id', contactIds)
    .in('identity_type', ['phone', 'email'])
    .order('created_at', { ascending: true })
    .limit(20000);

  if (identitiesRes.error) {
    throw new Error('contact identities suggestions lookup failed: ' + identitiesRes.error.message);
  }

  const conversationsRes = await supabaseAdmin
    .from('conversations')
    .select('contact_id')
    .eq('tenant_id', tenant_id)
    .in('contact_id', contactIds)
    .limit(20000);

  if (conversationsRes.error) {
    throw new Error('conversation counts suggestions lookup failed: ' + conversationsRes.error.message);
  }

  const conversationCountByContactId = new Map();
  for (const row of conversationsRes.data || []) {
    const contactId = asText(row?.contact_id);
    if (!contactId) continue;
    conversationCountByContactId.set(contactId, Number(conversationCountByContactId.get(contactId) || 0) + 1);
  }

  const identityStatsByContactId = new Map();
  const groupedIdentity = new Map();

  for (const row of identitiesRes.data || []) {
    const contactId = asText(row?.contact_id);
    const identityType = asText(row?.identity_type).toLowerCase();
    const identityValue = normalizeIdentityValueForSuggestion(identityType, row?.identity_value);
    if (!contactId || !identityType || !identityValue) continue;

    const currentStats = identityStatsByContactId.get(contactId) || {
      identity_count: 0,
      verified_identity_count: 0,
    };

    currentStats.identity_count += 1;
    if (row?.verified) currentStats.verified_identity_count += 1;
    identityStatsByContactId.set(contactId, currentStats);

    const identityKey = identityType + '::' + identityValue;
    const currentGroup = groupedIdentity.get(identityKey) || {
      identity_type: identityType,
      identity_value: identityValue,
      contact_ids: new Set(),
      verified_count: 0,
      providers: new Set(),
    };

    currentGroup.contact_ids.add(contactId);
    if (row?.verified) currentGroup.verified_count += 1;
    const provider = asText(row?.provider).toLowerCase();
    if (provider) currentGroup.providers.add(provider);

    groupedIdentity.set(identityKey, currentGroup);
  }

  const contactById = new Map();
  for (const row of contacts) {
    const id = asText(row.id);
    if (!id) continue;

    const stats = identityStatsByContactId.get(id) || {
      identity_count: 0,
      verified_identity_count: 0,
    };

    contactById.set(id, {
      id,
      tenant_id: asText(row.tenant_id),
      display_name: asText(row.display_name) || null,
      primary_email: asText(row.primary_email) || null,
      primary_phone: asText(row.primary_phone) || null,
      created_at: asText(row.created_at) || null,
      identity_count: stats.identity_count,
      verified_identity_count: stats.verified_identity_count,
      conversation_count: Number(conversationCountByContactId.get(id) || 0),
      rank: contactRank({
        ...stats,
        display_name: row.display_name,
        conversation_count: Number(conversationCountByContactId.get(id) || 0),
      }),
    });
  }

  const latestActionsByKey = await getLatestSuggestionActionsByKey(tenant_id);
  const suggestionsByPair = new Map();

  for (const [, group] of groupedIdentity.entries()) {
    const ids = Array.from(group.contact_ids || []);
    if (ids.length < 2) continue;

    const ranked = ids
      .map((id) => contactById.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(b.rank || 0) - Number(a.rank || 0) || String(a.id).localeCompare(String(b.id)));

    const target = ranked[0];
    if (!target) continue;

    for (const source of ranked.slice(1)) {
      if (!source || source.id === target.id) continue;

      const pairKey = source.id + '::' + target.id;
      const current = suggestionsByPair.get(pairKey) || {
        tenant_id,
        from_contact_id: source.id,
        into_contact_id: target.id,
        source_contact: source,
        target_contact: target,
        evidence: [],
        evidence_keys: new Set(),
        reasons: [],
        strength: 'medium',
        score: 0,
      };

      const evidenceKey = group.identity_type + '::' + group.identity_value;
      if (!current.evidence_keys.has(evidenceKey)) {
        current.evidence_keys.add(evidenceKey);
        current.evidence.push({
          identity_type: group.identity_type,
          identity_value: group.identity_value,
          contacts_count: ids.length,
          verified_count: Number(group.verified_count || 0),
          providers: Array.from(group.providers || []),
        });
      }

      const reason = 'same ' + group.identity_type + ' (' + group.identity_value + ')';
      if (!current.reasons.includes(reason)) current.reasons.push(reason);

      const strong = Number(group.verified_count || 0) > 0;
      if (strong) current.strength = 'strong';
      current.score += (strong ? 120 : 60) + Math.min(40, ids.length * 5);

      suggestionsByPair.set(pairKey, current);
    }
  }

  const out = [];
  for (const suggestion of suggestionsByPair.values()) {
    const suggestionKey = suggestionKeyFromParts({
      tenant_id,
      from_contact_id: suggestion.from_contact_id,
      into_contact_id: suggestion.into_contact_id,
      evidenceKeys: Array.from(suggestion.evidence_keys || []),
    });

    if (latestActionsByKey.get(suggestionKey) === 'rejected') continue;

    out.push({
      suggestion_key: suggestionKey,
      strength: suggestion.strength === 'strong' ? 'strong' : 'medium',
      score: Number(suggestion.score || 0),
      reasons: dedupeStrings(suggestion.reasons),
      source_contact: suggestion.source_contact,
      target_contact: suggestion.target_contact,
      identity_evidence: suggestion.evidence,
    });
  }

  out.sort((a, b) => {
    if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return String(a.suggestion_key).localeCompare(String(b.suggestion_key));
  });

  return out.slice(0, cappedLimit);
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }
  return undefined;
}

async function restoreIdentityFromSnapshot({ tenant_id, fromContactId, snapshot }) {
  const provider = asText(snapshot?.provider);
  const identityType = asText(snapshot?.identity_type);
  const identityValue = asText(snapshot?.identity_value);

  if (!provider || !identityType || !identityValue) return;

  let existsQuery = supabaseAdmin
    .from('contact_identities')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('identity_type', identityType)
    .eq('identity_value', identityValue);

  if (snapshot?.channel_account_id) {
    existsQuery = existsQuery.eq('channel_account_id', String(snapshot.channel_account_id));
  } else {
    existsQuery = existsQuery.is('channel_account_id', null);
  }

  const existing = await existsQuery.maybeSingle();
  if (existing.error) {
    throw new Error(`identity existence lookup failed: ${existing.error.message}`);
  }
  if (existing.data?.id) return;

  const payload = {
    tenant_id,
    contact_id: fromContactId,
    provider,
    identity_type: identityType,
    identity_value: identityValue,
    channel_account_id: snapshot?.channel_account_id ? String(snapshot.channel_account_id) : null,
    verified: Boolean(snapshot?.verified),
    confidence: Number.isFinite(Number(snapshot?.confidence)) ? Number(snapshot.confidence) : 50,
    is_primary: Boolean(snapshot?.is_primary),
    metadata: snapshot?.metadata || null,
  };

  const insert = await supabaseAdmin
    .from('contact_identities')
    .insert(payload);

  if (insert.error && !isDuplicateError(insert.error)) {
    throw new Error(`identity restore insert failed: ${insert.error.message}`);
  }
}

async function buildMergePreview({ tenant_id, from_contact_id, into_contact_id }) {
  if (from_contact_id === into_contact_id) {
    return {
      ok: true,
      conflicts: { block: false, reasons: [] },
      warnings: [],
      summary: null,
      identity_overlap: { exact_matches: [], from_only: [], into_only: [] },
    };
  }

  const fromContactResult = await supabaseAdmin
    .from('contacts')
    .select('id,display_name,primary_email,primary_phone,merged_into_contact_id,created_at,updated_at')
    .eq('tenant_id', tenant_id)
    .eq('id', from_contact_id)
    .maybeSingle();

  if (fromContactResult.error) {
    throw new Error(`from contact lookup failed: ${fromContactResult.error.message}`);
  }
  if (!fromContactResult.data) {
    const error = new Error('from_contact_not_found');
    error.statusCode = 404;
    throw error;
  }

  const intoContactResult = await supabaseAdmin
    .from('contacts')
    .select('id,display_name,primary_email,primary_phone,merged_into_contact_id,created_at,updated_at')
    .eq('tenant_id', tenant_id)
    .eq('id', into_contact_id)
    .maybeSingle();

  if (intoContactResult.error) {
    throw new Error(`into contact lookup failed: ${intoContactResult.error.message}`);
  }
  if (!intoContactResult.data) {
    const error = new Error('into_contact_not_found');
    error.statusCode = 404;
    throw error;
  }

  const fromIdentitiesResult = await supabaseAdmin
    .from('contact_identities')
    .select('id,provider,identity_type,identity_value,channel_account_id,verified,confidence,is_primary,created_at')
    .eq('tenant_id', tenant_id)
    .eq('contact_id', from_contact_id);

  if (fromIdentitiesResult.error) {
    throw new Error(`from identities lookup failed: ${fromIdentitiesResult.error.message}`);
  }

  const intoIdentitiesResult = await supabaseAdmin
    .from('contact_identities')
    .select('id,provider,identity_type,identity_value,channel_account_id,verified,confidence,is_primary,created_at')
    .eq('tenant_id', tenant_id)
    .eq('contact_id', into_contact_id);

  if (intoIdentitiesResult.error) {
    throw new Error(`into identities lookup failed: ${intoIdentitiesResult.error.message}`);
  }

  const fromIdentities = fromIdentitiesResult.data || [];
  const intoIdentities = intoIdentitiesResult.data || [];

  const fromConversationsResult = await supabaseAdmin
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('contact_id', from_contact_id);

  if (fromConversationsResult.error) {
    throw new Error(`from conversations count failed: ${fromConversationsResult.error.message}`);
  }

  const intoConversationsResult = await supabaseAdmin
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('contact_id', into_contact_id);

  if (intoConversationsResult.error) {
    throw new Error(`into conversations count failed: ${intoConversationsResult.error.message}`);
  }

  const fromMap = new Map(fromIdentities.map((row) => [identityKey(row), row]));
  const intoMap = new Map(intoIdentities.map((row) => [identityKey(row), row]));

  const exact_matches = [];
  const from_only = [];
  const into_only = [];

  for (const [key, row] of fromMap.entries()) {
    if (intoMap.has(key)) {
      exact_matches.push(row);
    } else {
      from_only.push(row);
    }
  }

  for (const [key, row] of intoMap.entries()) {
    if (!fromMap.has(key)) {
      into_only.push(row);
    }
  }

  const conflicts = computeConflicts({
    fromIdentities,
    intoIdentities,
  });

  const overlap = {
    exact_matches,
    from_only,
    into_only,
  };

  const warnings = computeWarnings({
    fromContact: fromContactResult.data,
    intoContact: intoContactResult.data,
    fromIdentities,
    intoIdentities,
    overlap,
    fromConversationCount: fromConversationsResult.count || 0,
    intoConversationCount: intoConversationsResult.count || 0,
    conflicts,
  });

  return {
    ok: true,
    conflicts,
    warnings,
    summary: {
      from: {
        ...fromContactResult.data,
        identity_count: fromIdentities.length,
        conversation_count: fromConversationsResult.count || 0,
      },
      into: {
        ...intoContactResult.data,
        identity_count: intoIdentities.length,
        conversation_count: intoConversationsResult.count || 0,
      },
      move: {
        identities_to_move: from_only.length,
        conversations_to_move: fromConversationsResult.count || 0,
      },
    },
    identity_overlap: overlap,
  };
}

export async function adminContactRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });

  const contactsMergeGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'contacts.merge',
    mfaMode: 'merge',
  });

  const contactsWriteGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'contacts.write',
  });

  fastify.post('/admin/contacts/merge/preview', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const tenant_id = asText(body.tenant_id || req.tenant?.id);
    const from_contact_id = asText(body.from_contact_id);
    const into_contact_id = asText(body.into_contact_id);

    if (!tenant_id || !from_contact_id || !into_contact_id) {
      return reply.code(400).send({
        ok: false,
        error: 'missing_required_fields',
      });
    }

    try {
      const preview = await buildMergePreview({
        tenant_id,
        from_contact_id,
        into_contact_id,
      });
      return reply.code(200).send(preview);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      if (statusCode === 404) {
        return reply.code(404).send({ ok: false, error: String(error?.message || 'not_found') });
      }
      req.log.error({ err: error, tenant_id, from_contact_id, into_contact_id }, 'Contact merge preview failed');
      return reply.code(statusCode).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/contacts/merge', {
    preHandler: [requireApiKey, contactsMergeGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const tenant_id = asText(body.tenant_id || req.tenant?.id);
    const from_contact_id = asText(body.from_contact_id);
    const into_contact_id = asText(body.into_contact_id);
    const reason = asText(body.reason);
    const merged_by = asText(req.user?.id);

    if (!tenant_id || !from_contact_id || !into_contact_id) {
      return reply.code(400).send({
        ok: false,
        error: 'missing_required_fields',
      });
    }

    try {
      const policy = await evaluatePolicy({
        supabaseAdmin,
        action: 'contacts.merge',
        context: {
          tenant_id,
          user_id: merged_by || null,
          ip: req.ip,
          mfa_present: Boolean(req.user?.jwt?.aal === 'aal2' || req.user?.jwt?.aal === 'aal3'),
        },
      });

      if (!policy.allowed) {
        return reply.code(403).send({
          ok: false,
          error: 'policy_denied',
          reason: policy.reason,
          policy_id: policy.policy?.id || null,
        });
      }

      const preview = await buildMergePreview({
        tenant_id,
        from_contact_id,
        into_contact_id,
      });

      if (preview?.conflicts?.block) {
        return reply.code(409).send({
          ok: false,
          error: 'merge_blocked',
          reasons: preview.conflicts.reasons || [],
        });
      }

      const result = await mergeContacts({
        tenant_id,
        from_contact_id,
        into_contact_id,
        merged_by,
        reason,
      });

      await logAudit({
        tenant_id,
        actor_user_id: merged_by || null,
        actor_type: 'user',
        action: 'merge',
        entity_type: 'contact',
        entity_id: from_contact_id,
        metadata: { into_contact_id, merge_job_id: result?.merge_job_id || null, reason: reason || null },
      }).catch(() => {});

      await queueOutgoingWebhookEvent({
        tenant_id,
        event_type: 'contact.updated',
        event_key: buildWebhookEventKey('contact.updated', { action: 'merge', from_contact_id, into_contact_id, merge_job_id: result?.merge_job_id || null }),
        payload: { action: 'merge', from_contact_id, into_contact_id, merge_job_id: result?.merge_job_id || null },
      }).catch(() => {});

      return reply.code(200).send({
        ok: true,
        job_id: result?.merge_job_id || null,
        from_contact_id: result?.from_contact_id || from_contact_id,
        into_contact_id: result?.into_contact_id || into_contact_id,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id, from_contact_id, into_contact_id }, 'Contact merge failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/contacts/merge/undo', {
    preHandler: [requireApiKey, contactsMergeGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const tenant_id = asText(body.tenant_id || req.tenant?.id);
    const requester_user_id = asText(req.user?.id);
    const requesterRole = asText(req.tenant?.role).toLowerCase();
    const reason = asText(body.reason);
    const jobIdNum = asInt(body.job_id);

    if (!tenant_id || !requester_user_id || !Number.isInteger(jobIdNum) || jobIdNum <= 0) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const jobResult = await supabaseAdmin
        .from('contact_merge_jobs')
        .select('id,tenant_id,from_contact_id,into_contact_id,created_at,undone_at,undone_by')
        .eq('tenant_id', tenant_id)
        .eq('id', jobIdNum)
        .maybeSingle();

      if (jobResult.error) {
        throw new Error(`merge job lookup failed: ${jobResult.error.message}`);
      }

      const job = jobResult.data;
      if (!job) {
        return reply.code(404).send({ ok: false, error: 'job_not_found' });
      }

      if (job.undone_at) {
        return reply.code(409).send({ ok: false, error: 'already_undone' });
      }

      if (requesterRole !== 'owner') {
        if (requesterRole !== 'admin' && requesterRole !== 'agent') {
          return reply.code(403).send({ ok: false, error: 'insufficient_role', details: { role: requesterRole } });
        }

        const createdMs = new Date(job.created_at).getTime();
        const nowMs = Date.now();
        const ageHours = (nowMs - createdMs) / (1000 * 60 * 60);

        if (!Number.isFinite(ageHours) || ageHours > UNDO_WINDOW_HOURS) {
          return reply.code(403).send({
            ok: false,
            error: 'undo_window_expired',
            details: {
              role: requesterRole,
              window_hours: UNDO_WINDOW_HOURS,
              job_created_at: job.created_at,
            },
          });
        }
      }

      const itemsResult = await supabaseAdmin
        .from('contact_merge_job_items')
        .select('item_type,item_id,snapshot')
        .eq('tenant_id', tenant_id)
        .eq('job_id', jobIdNum);

      if (itemsResult.error) {
        throw new Error(`merge job items lookup failed: ${itemsResult.error.message}`);
      }

      const allItems = itemsResult.data || [];
      const identityItems = allItems.filter((item) => item.item_type === 'identity');
      const conversationItems = allItems.filter((item) => item.item_type === 'conversation');

      const conversationIds = conversationItems
        .map((item) => asText(item.item_id))
        .filter((id) => isValidUuid(id));

      if (conversationIds.length > 0) {
        const restoreConversations = await supabaseAdmin
          .from('conversations')
          .update({
            contact_id: job.from_contact_id,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenant_id)
          .eq('contact_id', job.into_contact_id)
          .in('id', conversationIds);

        if (restoreConversations.error) {
          throw new Error(`conversation restore failed: ${restoreConversations.error.message}`);
        }
      }

      for (const item of identityItems) {
        const idNum = asInt(item.item_id);
        if (!Number.isInteger(idNum) || idNum <= 0) continue;

        const restoreIdentity = await supabaseAdmin
          .from('contact_identities')
          .update({ contact_id: job.from_contact_id })
          .eq('tenant_id', tenant_id)
          .eq('id', idNum);

        if (restoreIdentity.error && !isDuplicateError(restoreIdentity.error)) {
          throw new Error(`identity restore update failed: ${restoreIdentity.error.message}`);
        }
      }

      for (const item of identityItems) {
        const idNum = asInt(item.item_id);
        if (!Number.isInteger(idNum) || idNum <= 0) continue;

        const exists = await supabaseAdmin
          .from('contact_identities')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('id', idNum)
          .maybeSingle();

        if (exists.error) {
          throw new Error(`identity restore existence check failed: ${exists.error.message}`);
        }
        if (exists.data?.id) continue;

        if (item.snapshot) {
          await restoreIdentityFromSnapshot({
            tenant_id,
            fromContactId: job.from_contact_id,
            snapshot: item.snapshot,
          });
        }
      }

      const restoreFromContact = await supabaseAdmin
        .from('contacts')
        .update({
          merged_into_contact_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id)
        .eq('id', job.from_contact_id);

      if (restoreFromContact.error) {
        throw new Error(`source contact unmerge failed: ${restoreFromContact.error.message}`);
      }

      const markUndone = await supabaseAdmin
        .from('contact_merge_jobs')
        .update({
          undone_at: new Date().toISOString(),
          undone_by: requester_user_id,
          undo_reason: reason || null,
        })
        .eq('tenant_id', tenant_id)
        .eq('id', jobIdNum);

      if (markUndone.error) {
        throw new Error(`merge job undo marker failed: ${markUndone.error.message}`);
      }

      await logAudit({
        tenant_id,
        actor_user_id: requester_user_id,
        actor_type: 'user',
        action: 'undo_merge',
        entity_type: 'contact_merge_job',
        entity_id: String(jobIdNum),
        metadata: { from_contact_id: job.from_contact_id, into_contact_id: job.into_contact_id, reason: reason || null },
      }).catch(() => {});

      await queueOutgoingWebhookEvent({
        tenant_id,
        event_type: 'contact.updated',
        event_key: buildWebhookEventKey('contact.updated', { action: 'undo_merge', from_contact_id: job.from_contact_id, into_contact_id: job.into_contact_id, job_id: jobIdNum }),
        payload: { action: 'undo_merge', from_contact_id: job.from_contact_id, into_contact_id: job.into_contact_id, job_id: jobIdNum },
      }).catch(() => {});

      return reply.code(200).send({
        ok: true,
        job_id: jobIdNum,
        from_contact_id: job.from_contact_id,
        into_contact_id: job.into_contact_id,
        undone_by: requester_user_id,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id, job_id: jobIdNum, requester_user_id }, 'Contact merge undo failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });



  fastify.get('/admin/merges/suggestions', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenant_id = asText(req.query?.tenant_id || req.tenant?.id);
    const limit = Math.min(200, Math.max(1, asInt(req.query?.limit, 100)));

    if (!tenant_id) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const suggestions = await buildMergeSuggestions({ tenant_id, limit });
      return reply.code(200).send({
        ok: true,
        tenant_id,
        count: suggestions.length,
        suggestions,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id }, 'Merge suggestions failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/merges/approve', {
    preHandler: [requireApiKey, contactsMergeGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const tenant_id = asText(body.tenant_id || req.tenant?.id);
    const from_contact_id = asText(body.from_contact_id);
    const into_contact_id = asText(body.into_contact_id);
    const requester_user_id = asText(req.user?.id);
    const providedSuggestionKey = asText(body.suggestion_key) || null;

    if (!tenant_id || !from_contact_id || !into_contact_id || from_contact_id === into_contact_id) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const preview = await buildMergePreview({
        tenant_id,
        from_contact_id,
        into_contact_id,
      });

      if (preview?.conflicts?.block) {
        return reply.code(409).send({
          ok: false,
          error: 'merge_blocked',
          reasons: preview.conflicts.reasons || [],
        });
      }

      const reason = asText(body.reason)
        || ('Suggested merge approved: ' + from_contact_id.slice(0, 8) + ' -> ' + into_contact_id.slice(0, 8));

      const result = await mergeContacts({
        tenant_id,
        from_contact_id,
        into_contact_id,
        merged_by: requester_user_id || null,
        reason,
      });

      const evidenceType = asText(body.identity_type).toLowerCase();
      const evidenceValue = normalizeIdentityValueForSuggestion(evidenceType, body.identity_value);
      const derivedSuggestionKey = suggestionKeyFromParts({
        tenant_id,
        from_contact_id,
        into_contact_id,
        evidenceKeys: evidenceType && evidenceValue ? [evidenceType + '::' + evidenceValue] : [],
      });

      await recordMergeSuggestionAction({
        tenant_id,
        suggestion_key: providedSuggestionKey || derivedSuggestionKey,
        action: 'approved',
        acted_by: requester_user_id || null,
      });

      await logAudit({
        tenant_id,
        actor_user_id: requester_user_id || null,
        actor_type: 'user',
        action: 'merge_suggestion_approved',
        entity_type: 'contact_merge_job',
        entity_id: String(result?.merge_job_id || ''),
        metadata: { from_contact_id, into_contact_id, suggestion_key: providedSuggestionKey || derivedSuggestionKey },
      }).catch(() => {});

      return reply.code(200).send({
        ok: true,
        job_id: result?.merge_job_id || null,
        from_contact_id: result?.from_contact_id || from_contact_id,
        into_contact_id: result?.into_contact_id || into_contact_id,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id, from_contact_id, into_contact_id }, 'Merge suggestion approve failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/merges/reject', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const tenant_id = asText(body.tenant_id || req.tenant?.id);
    const requester_user_id = asText(req.user?.id);
    const from_contact_id = asText(body.from_contact_id);
    const into_contact_id = asText(body.into_contact_id);

    let suggestion_key = asText(body.suggestion_key);
    if (!suggestion_key && tenant_id && from_contact_id && into_contact_id) {
      const evidenceType = asText(body.identity_type).toLowerCase();
      const evidenceValue = normalizeIdentityValueForSuggestion(evidenceType, body.identity_value);
      suggestion_key = suggestionKeyFromParts({
        tenant_id,
        from_contact_id,
        into_contact_id,
        evidenceKeys: evidenceType && evidenceValue ? [evidenceType + '::' + evidenceValue] : [],
      });
    }

    if (!tenant_id || !suggestion_key) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      await recordMergeSuggestionAction({
        tenant_id,
        suggestion_key,
        action: 'rejected',
        acted_by: requester_user_id || null,
      });

      await logAudit({
        tenant_id,
        actor_user_id: requester_user_id || null,
        actor_type: 'user',
        action: 'merge_suggestion_rejected',
        entity_type: 'identity_suggestion',
        entity_id: suggestion_key,
        metadata: {},
      }).catch(() => {});

      return reply.code(200).send({ ok: true, tenant_id, suggestion_key });
    } catch (error) {
      req.log.error({ err: error, tenant_id, suggestion_key }, 'Merge suggestion reject failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/contacts/link-identity', {
    preHandler: [requireApiKey, contactsWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const tenant_id = asText(body.tenant_id || req.tenant?.id);
    const contact_id = asText(body.contact_id);
    const provider = asText(body.provider);
    const identity_type = asText(body.identity_type);
    const identity_value = asText(body.identity_value);

    if (!tenant_id || !contact_id || !provider || !identity_type || !identity_value) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const effectiveContactId = await resolveCanonicalContactId({
        supabaseAdmin,
        tenant_id,
        contact_id,
      });

      if (!effectiveContactId) {
        return reply.code(404).send({ ok: false, error: 'contact_not_found' });
      }

      const normalized = normalizeIdentity({ provider, identity_type, identity_value });
      if (!normalized.identity_value) {
        return reply.code(400).send({ ok: false, error: 'invalid_identity_value' });
      }

      const attach = await attachIdentityToContact({
        supabaseAdmin,
        tenant_id,
        contact_id: effectiveContactId,
        provider: normalized.provider,
        identity_type: normalized.identity_type,
        identity_value: normalized.identity_value,
        channel_account_id: asText(body.channel_account_id) || null,
        verified: Boolean(body.verified),
        confidence: Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : 60,
        is_primary: Boolean(body.is_primary),
        metadata: body.metadata || null,
      });

      await logAudit({
        tenant_id,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: 'user',
        action: 'link_identity',
        entity_type: 'contact',
        entity_id: asText(attach?.contact_id) || effectiveContactId,
        metadata: {
          provider: normalized.provider,
          identity_type: normalized.identity_type,
          channel_account_id: asText(body.channel_account_id) || null,
        },
      }).catch(() => {});

      await queueOutgoingWebhookEvent({
        tenant_id,
        event_type: 'contact.updated',
        event_key: buildWebhookEventKey('contact.updated', { action: 'link_identity', contact_id: asText(attach?.contact_id) || effectiveContactId, provider: normalized.provider, identity_type: normalized.identity_type }),
        payload: {
          action: 'link_identity',
          contact_id: asText(attach?.contact_id) || effectiveContactId,
          provider: normalized.provider,
          identity_type: normalized.identity_type,
          identity_value: normalized.identity_value,
        },
      }).catch(() => {});

      return reply.code(200).send({
        ok: true,
        contact_id: asText(attach?.contact_id) || effectiveContactId,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id, contact_id }, 'Link identity failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/contacts/:tenant_id/:contact_id/timeline', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenant_id = asText(req.params?.tenant_id || req.query?.tenant_id || req.tenant?.id);
    const contact_id = asText(req.params?.contact_id || req.query?.contact_id);
    const limit = Math.min(500, Math.max(1, asInt(req.query?.limit, 200)));

    if (!tenant_id || !contact_id) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const effectiveContactId = await resolveCanonicalContactId({
        supabaseAdmin,
        tenant_id,
        contact_id,
      });

      if (!effectiveContactId) {
        return reply.code(404).send({ ok: false, error: 'contact_not_found' });
      }

      const conversationsRes = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('contact_id', effectiveContactId)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (conversationsRes.error) {
        throw new Error(`timeline conversations lookup failed: ${conversationsRes.error.message}`);
      }

      const conversationIds = (conversationsRes.data || []).map((row) => asText(row.id)).filter(Boolean);
      if (conversationIds.length === 0) {
        return reply.code(200).send({
          ok: true,
          contact_id,
          effective_contact_id: effectiveContactId,
          items: [],
        });
      }

      const messagesRes = await supabaseAdmin
        .from('messages')
        .select('id,conversation_id,provider,direction,received_at,sent_at,created_at,body,content,status')
        .eq('tenant_id', tenant_id)
        .in('conversation_id', conversationIds)
        .order('received_at', { ascending: false })
        .limit(limit);

      if (messagesRes.error) {
        throw new Error(`timeline messages lookup failed: ${messagesRes.error.message}`);
      }

      const items = (messagesRes.data || []).map((row) => ({
        id: asText(row.id),
        conversation_id: asText(row.conversation_id),
        provider: asText(row.provider),
        direction: asText(row.direction),
        received_at: asText(row.received_at || row.sent_at || row.created_at) || null,
        body_text: extractBodyText(row),
        status: asText(row.status) || null,
      }));

      return reply.code(200).send({
        ok: true,
        contact_id,
        effective_contact_id: effectiveContactId,
        items,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id, contact_id }, 'Contact timeline failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
