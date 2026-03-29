import { supabaseAdmin } from '../supabase.js';
import { ENV } from '../env.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { hasValidCronToken, isLocalRequest, parseAllowedTenantIds } from '../util/cron-auth.js';
import {
  enrichMessage,
  applyMessageEnrichment,
  markMessageEnrichmentFailed,
} from '../lib/ai/enrichMessage.js';
import { computeSuggestionScore } from '../lib/ai/suggestionScorer.js';
import { checkLimit, getPlan, getUsageForMetric } from '../lib/billing/planEnforcer.js';
import { logAudit } from '../lib/audit/auditLog.js';
import {
  createTenantApiKey,
  listTenantApiKeys,
  requireTenantApiKey,
  revokeTenantApiKey,
} from '../lib/public-api/apiKeyAuth.js';
import {
  buildWebhookEventKey,
  queueOutgoingWebhookEvent,
  runWebhookDispatchQueue,
} from '../lib/public-api/webhookDispatcher.js';
import { resolveBestIdentityForQueue } from '../util/send-route-selector.js';
import { attachIdentityToContact, mergeContacts, normalizeIdentity } from '../util/contact-identities.js';
import { sha256Hex } from '../util/hash.js';

const PUBLIC_API_RATE_LIMIT = {
  max: 120,
  timeWindow: '1 minute',
  keyGenerator: (req) => String(req.headers['x-tenant-api-key'] || req.ip || 'public').slice(0, 80),
};

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function lower(value) {
  return asText(value).toLowerCase();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getTenantIdFromRequest(req) {
  return (
    asText(req?.body?.tenant_id)
    || asText(req?.query?.tenant_id)
    || asText(req?.params?.tenant_id)
    || asText(req?.tenant?.id)
    || ''
  );
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function normalizeIdentityValue(identityType, value) {
  const type = lower(identityType);
  const text = asText(value);
  if (!text) return '';

  if (type === 'email') return text.toLowerCase();
  if (type === 'phone') {
    let out = text.replace(/[^\d+]/g, '');
    if (!out) return '';
    if (!out.startsWith('+') && /^\d{10}$/.test(out)) out = `+1${out}`;
    return out;
  }

  return text;
}

function normalizeSuggestionType(value) {
  const text = lower(value);
  if (text === 'merge_contacts' || text === 'link_identity') return text;
  return null;
}

function normalizeSuggestionStatus(value) {
  const text = lower(value);
  if (text === 'open' || text === 'approved' || text === 'rejected') return text;
  return null;
}

function makeIdempotencyKey({ tenantId, contactId, provider, bodyText, attachments }) {
  const minuteBucket = new Date().toISOString().slice(0, 16);
  return `api:${sha256Hex([tenantId, contactId || '', provider || '', bodyText || '', JSON.stringify(attachments || []), minuteBucket].join('|'))}`;
}

function jsonl(items) {
  return items.map((row) => JSON.stringify(row)).join('\n') + (items.length ? '\n' : '');
}

function toCsvValue(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csv(rows) {
  const header = ['id', 'tenant_id', 'actor_user_id', 'actor_type', 'action', 'entity_type', 'entity_id', 'metadata', 'occurred_at'];
  const lines = [header.join(',')];
  for (const row of rows || []) {
    lines.push([
      row.id,
      row.tenant_id,
      row.actor_user_id || '',
      row.actor_type,
      row.action,
      row.entity_type,
      row.entity_id,
      JSON.stringify(row.metadata || {}),
      row.occurred_at,
    ].map(toCsvValue).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return;
  }
  return undefined;
}

async function buildSuggestionsForTenant({ tenantId, limit = 100 }) {
  const limitRows = Math.max(1, Math.min(500, Number(limit || 100)));

  const contactsRes = await supabaseAdmin
    .from('contacts')
    .select('id,tenant_id,display_name,name,primary_email,primary_phone,email,phone,metadata,created_at,updated_at,merged_into_contact_id')
    .eq('tenant_id', tenantId)
    .is('merged_into_contact_id', null)
    .order('updated_at', { ascending: false })
    .limit(1200);

  if (contactsRes.error) throw new Error(`contacts lookup failed: ${contactsRes.error.message}`);

  const contacts = contactsRes.data || [];
  const contactIds = contacts.map((row) => asText(row.id)).filter(Boolean);
  if (!contactIds.length) return [];

  const identitiesRes = await supabaseAdmin
    .from('contact_identities')
    .select('id,tenant_id,contact_id,provider,identity_type,identity_value,channel_account_id,verified,is_primary,confidence,created_at')
    .eq('tenant_id', tenantId)
    .in('contact_id', contactIds)
    .limit(50000);

  if (identitiesRes.error) {
    if (isMissingSchema(identitiesRes.error)) return [];
    throw new Error(`contact identities lookup failed: ${identitiesRes.error.message}`);
  }

  const convoRes = await supabaseAdmin
    .from('conversations')
    .select('contact_id')
    .eq('tenant_id', tenantId)
    .in('contact_id', contactIds)
    .limit(50000);

  if (convoRes.error && !isMissingSchema(convoRes.error)) {
    throw new Error(`conversation count lookup failed: ${convoRes.error.message}`);
  }

  const conversationCountByContact = new Map();
  for (const row of convoRes.data || []) {
    const id = asText(row?.contact_id);
    if (!id) continue;
    conversationCountByContact.set(id, Number(conversationCountByContact.get(id) || 0) + 1);
  }

  const identitiesByContact = new Map();
  for (const row of identitiesRes.data || []) {
    const cid = asText(row?.contact_id);
    if (!cid) continue;
    const list = identitiesByContact.get(cid) || [];
    list.push(row);
    identitiesByContact.set(cid, list);
  }

  const rankContact = (contact) => {
    const ids = identitiesByContact.get(asText(contact?.id)) || [];
    const verified = ids.filter((row) => Boolean(row?.verified)).length;
    const conv = Number(conversationCountByContact.get(asText(contact?.id)) || 0);
    return (verified * 100) + (ids.length * 10) + Math.min(25, conv);
  };

  const suggestions = [];
  for (let i = 0; i < contacts.length; i += 1) {
    for (let j = i + 1; j < contacts.length; j += 1) {
      const a = contacts[i];
      const b = contacts[j];

      const score = computeSuggestionScore({
        sourceContact: a,
        targetContact: b,
        sourceIdentities: identitiesByContact.get(asText(a.id)) || [],
        targetIdentities: identitiesByContact.get(asText(b.id)) || [],
      });

      if (Number(score.score || 0) < 55) continue;

      const aRank = rankContact(a);
      const bRank = rankContact(b);
      const source = aRank <= bRank ? a : b;
      const target = aRank <= bRank ? b : a;

      const suggestion_type = score.score >= 75 ? 'merge_contacts' : 'link_identity';
      const reasonText = (score.reasons || []).map((reason) => {
        if (typeof reason === 'string') return reason;
        return String(reason?.signal || 'heuristic_match');
      });

      suggestions.push({
        tenant_id: tenantId,
        suggestion_type,
        source_contact_id: asText(source.id),
        target_contact_id: asText(target.id),
        strength: score.strength,
        score: Number(score.score || 0),
        reasons: score.reasons || reasonText,
        source_contact: source,
        target_contact: target,
      });

      if (suggestions.length >= limitRows * 5) break;
    }
    if (suggestions.length >= limitRows * 5) break;
  }

  for (const suggestion of suggestions) {
    const upsert = await supabaseAdmin
      .from('identity_suggestions')
      .upsert({
        tenant_id: suggestion.tenant_id,
        suggestion_type: suggestion.suggestion_type,
        source_contact_id: suggestion.source_contact_id,
        target_contact_id: suggestion.target_contact_id,
        strength: suggestion.strength,
        score: suggestion.score,
        reasons: suggestion.reasons,
        status: 'open',
      }, { onConflict: 'tenant_id,suggestion_type,source_contact_id,target_contact_id' });

    if (upsert.error && !isMissingSchema(upsert.error)) {
      throw new Error(`identity suggestions upsert failed: ${upsert.error.message}`);
    }
  }

  const typeByPair = new Map();
  for (const s of suggestions) {
    typeByPair.set(`${s.suggestion_type}:${s.source_contact_id}:${s.target_contact_id}`, {
      source_contact: s.source_contact,
      target_contact: s.target_contact,
    });
  }

  const fetchRes = await supabaseAdmin
    .from('identity_suggestions')
    .select('id,tenant_id,suggestion_type,source_contact_id,target_contact_id,strength,score,reasons,status,created_at,acted_at,acted_by')
    .eq('tenant_id', tenantId)
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limitRows);

  if (fetchRes.error) {
    if (isMissingSchema(fetchRes.error)) return [];
    throw new Error(`identity suggestions fetch failed: ${fetchRes.error.message}`);
  }

  return (fetchRes.data || []).map((row) => {
    const pair = typeByPair.get(`${row.suggestion_type}:${row.source_contact_id}:${row.target_contact_id}`);
    return {
      ...row,
      source_contact: pair?.source_contact || null,
      target_contact: pair?.target_contact || null,
    };
  });
}

async function requireCronOrOwnerAdmin(req, reply, ownerAdminRoleGuard, cronTenantAllowlist) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) {
    return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
  }

  req._tenantId = tenantId;

  const hasCronHeader = Boolean(asText(req.headers['x-cron-token']));
  if (hasCronHeader) {
    if (!hasValidCronToken(req, ENV.ORACLE_CRON_TOKEN)) {
      return reply.code(401).send({ ok: false, error: 'invalid_cron_token' });
    }

    if (!isLocalRequest(req)) {
      return reply.code(403).send({ ok: false, error: 'cron_not_from_localhost' });
    }

    if (cronTenantAllowlist.size === 0 || !cronTenantAllowlist.has(tenantId)) {
      return reply.code(403).send({ ok: false, error: 'tenant_not_allowed_for_cron' });
    }

    req.user = { id: 'system:cron', jwt: null };
    req.tenant = { id: tenantId, role: 'system' };
    req.auth_mode = 'cron';
    return undefined;
  }

  await ownerAdminRoleGuard(req, reply);
  if (reply.sent) return undefined;

  if (asText(req.tenant?.id) && asText(req.tenant.id) !== tenantId) {
    return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
  }

  req.auth_mode = 'user';
  return undefined;
}

export async function platformMaturityRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({ supabaseAdmin, allowedRoles: ['owner', 'admin', 'agent'] });
  const ownerRoleGuard = requireTenantRole({ supabaseAdmin, allowedRoles: ['owner'] });
  const ownerAdminRoleGuard = requireTenantRole({ supabaseAdmin, allowedRoles: ['owner', 'admin'] });

  const apiKeysManageGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'api_keys.manage',
    mfaMode: 'admin',
  });

  const webhooksManageGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'webhooks.manage',
    mfaMode: 'admin',
  });

  const cronTenantAllowlist = parseAllowedTenantIds(ENV.ORACLE_TENANT_IDS);

  fastify.post('/admin/ai/enrich/run', {
    preHandler: [requireApiKey, async (req, reply) => requireCronOrOwnerAdmin(req, reply, ownerAdminRoleGuard, cronTenantAllowlist)],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = req._tenantId || getTenantIdFromRequest(req);
    const requested = asInt(req.body?.limit, 25);
    const limit = Math.max(1, Math.min(100, requested || 25));

    const rowsRes = await supabaseAdmin
      .from('messages')
      .select('id,tenant_id,conversation_id,direction,ai_enrich_status,received_at')
      .eq('tenant_id', tenantId)
      .eq('direction', 'in')
      .in('ai_enrich_status', ['pending', 'failed'])
      .order('received_at', { ascending: false })
      .limit(limit);

    if (rowsRes.error) {
      if (isMissingSchema(rowsRes.error)) {
        return reply.code(400).send({ ok: false, error: 'ai_enrichment_schema_missing_run_migration' });
      }
      return reply.code(500).send({ ok: false, error: `enrichment queue lookup failed: ${rowsRes.error.message}` });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const items = [];

    for (const row of rowsRes.data || []) {
      processed += 1;
      try {
        const enrichment = await enrichMessage({ tenant_id: tenantId, message_id: row.id });
        await applyMessageEnrichment({ tenant_id: tenantId, message_id: row.id, enrichment });
        succeeded += 1;
        items.push({ message_id: row.id, status: 'done', sentiment: enrichment.sentiment, intent: enrichment.intent, urgency: enrichment.urgency });
      } catch (error) {
        failed += 1;
        items.push({ message_id: row.id, status: 'failed', error: String(error?.message || error) });
        try {
          await markMessageEnrichmentFailed({ tenant_id: tenantId, message_id: row.id, error });
        } catch {
          // noop
        }
      }
    }

    await logAudit({
      tenant_id: tenantId,
      actor_user_id: req.user?.id || null,
      actor_type: req.auth_mode === 'cron' ? 'system' : 'user',
      action: 'ai_enrich_run',
      entity_type: 'message',
      entity_id: tenantId,
      metadata: { processed, succeeded, failed, limit, auth_mode: req.auth_mode || 'user' },
    }).catch(() => {});

    return reply.send({ ok: true, tenant_id: tenantId, processed, succeeded, failed, items });
  });

  fastify.get('/admin/suggestions', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const limit = Math.max(1, Math.min(200, asInt(req.query?.limit, 100) || 100));
    const type = normalizeSuggestionType(req.query?.type);
    const status = normalizeSuggestionStatus(req.query?.status || 'open') || 'open';

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const refresh = String(req.query?.refresh || 'true').toLowerCase() !== 'false';
      if (refresh) await buildSuggestionsForTenant({ tenantId, limit });

      let query = supabaseAdmin
        .from('identity_suggestions')
        .select('id,tenant_id,suggestion_type,source_contact_id,target_contact_id,strength,score,reasons,status,created_at,acted_at,acted_by')
        .eq('tenant_id', tenantId)
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (type) query = query.eq('suggestion_type', type);
      if (status !== 'all') query = query.eq('status', status);

      const rowsRes = await query;
      if (rowsRes.error) {
        if (isMissingSchema(rowsRes.error)) return reply.code(400).send({ ok: false, error: 'identity_suggestions_schema_missing' });
        throw new Error(rowsRes.error.message);
      }

      const rows = rowsRes.data || [];
      const contactIds = Array.from(new Set(rows.flatMap((row) => [asText(row.source_contact_id), asText(row.target_contact_id)]).filter(Boolean)));

      const contactsRes = contactIds.length
        ? await supabaseAdmin
          .from('contacts')
          .select('id,display_name,name,primary_email,primary_phone,email,phone,metadata,updated_at')
          .eq('tenant_id', tenantId)
          .in('id', contactIds)
        : { data: [], error: null };

      if (contactsRes.error) throw new Error(`suggestions contacts fetch failed: ${contactsRes.error.message}`);

      const contactMap = new Map((contactsRes.data || []).map((row) => [asText(row.id), row]));

      return reply.send({
        ok: true,
        tenant_id: tenantId,
        count: rows.length,
        suggestions: rows.map((row) => ({
          ...row,
          source_contact: contactMap.get(asText(row.source_contact_id)) || null,
          target_contact: contactMap.get(asText(row.target_contact_id)) || null,
        })),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin suggestions failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/suggestions/approve', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const suggestionId = asText(req.body?.suggestion_id);
    if (!tenantId || !suggestionId) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    try {
      const suggestionRes = await supabaseAdmin
        .from('identity_suggestions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', suggestionId)
        .maybeSingle();

      if (suggestionRes.error) throw new Error(`suggestion lookup failed: ${suggestionRes.error.message}`);
      if (!suggestionRes.data) return reply.code(404).send({ ok: false, error: 'suggestion_not_found' });
      if (suggestionRes.data.status !== 'open') return reply.code(409).send({ ok: false, error: 'suggestion_not_open' });

      const suggestion = suggestionRes.data;
      const actor = asText(req.user?.id) || null;

      let actionResult = {};
      if (suggestion.suggestion_type === 'merge_contacts') {
        const reason = `AI suggestion approved (${suggestion.strength}/${suggestion.score})`;
        const merged = await mergeContacts({
          tenant_id: tenantId,
          from_contact_id: suggestion.source_contact_id,
          into_contact_id: suggestion.target_contact_id,
          merged_by: actor,
          reason,
        });
        actionResult = {
          merge_job_id: merged?.merge_job_id || null,
          from_contact_id: merged?.from_contact_id || suggestion.source_contact_id,
          into_contact_id: merged?.into_contact_id || suggestion.target_contact_id,
        };

        await queueOutgoingWebhookEvent({
          tenant_id: tenantId,
          event_type: 'contact.updated',
          event_key: buildWebhookEventKey('contact.updated', {
            contact_id: actionResult.into_contact_id,
            action: 'merge',
            source_contact_id: actionResult.from_contact_id,
          }),
          payload: {
            action: 'merge',
            source_contact_id: actionResult.from_contact_id,
            target_contact_id: actionResult.into_contact_id,
            merge_job_id: actionResult.merge_job_id,
          },
        }).catch(() => {});
      } else {
        const sourceIdsRes = await supabaseAdmin
          .from('contact_identities')
          .select('provider,identity_type,identity_value,channel_account_id')
          .eq('tenant_id', tenantId)
          .eq('contact_id', suggestion.source_contact_id)
          .limit(2000);

        if (sourceIdsRes.error && !isMissingSchema(sourceIdsRes.error)) {
          throw new Error(`source identities lookup failed: ${sourceIdsRes.error.message}`);
        }

        const existingKeys = new Set((sourceIdsRes.data || []).map((row) => {
          const v = normalizeIdentityValue(row.identity_type, row.identity_value);
          return `${lower(row.provider)}:${lower(row.identity_type)}:${v}:${asText(row.channel_account_id) || 'null'}`;
        }));

        const targetIdsRes = await supabaseAdmin
          .from('contact_identities')
          .select('provider,identity_type,identity_value,channel_account_id,verified,confidence,is_primary,metadata')
          .eq('tenant_id', tenantId)
          .eq('contact_id', suggestion.target_contact_id)
          .order('verified', { ascending: false })
          .order('is_primary', { ascending: false })
          .order('confidence', { ascending: false })
          .limit(2000);

        if (targetIdsRes.error) {
          throw new Error(`target identities lookup failed: ${targetIdsRes.error.message}`);
        }

        const pick = (targetIdsRes.data || []).find((row) => {
          const v = normalizeIdentityValue(row.identity_type, row.identity_value);
          const key = `${lower(row.provider)}:${lower(row.identity_type)}:${v}:${asText(row.channel_account_id) || 'null'}`;
          return v && !existingKeys.has(key);
        });

        if (!pick) return reply.code(409).send({ ok: false, error: 'no_linkable_identity_found' });

        const normalized = normalizeIdentity({
          provider: pick.provider,
          identity_type: pick.identity_type,
          identity_value: pick.identity_value,
        });

        const attached = await attachIdentityToContact({
          supabaseAdmin,
          tenant_id: tenantId,
          contact_id: suggestion.source_contact_id,
          provider: normalized.provider,
          identity_type: normalized.identity_type,
          identity_value: normalized.identity_value,
          channel_account_id: asText(pick.channel_account_id) || null,
          verified: Boolean(pick.verified),
          confidence: Number(pick.confidence || 60),
          is_primary: false,
          metadata: pick.metadata || null,
        });

        actionResult = {
          contact_id: asText(attached?.contact_id) || suggestion.source_contact_id,
          linked_identity: {
            provider: normalized.provider,
            identity_type: normalized.identity_type,
            identity_value: normalized.identity_value,
          },
        };

        await queueOutgoingWebhookEvent({
          tenant_id: tenantId,
          event_type: 'contact.updated',
          event_key: buildWebhookEventKey('contact.updated', {
            contact_id: actionResult.contact_id,
            action: 'link_identity',
            identity: actionResult.linked_identity,
          }),
          payload: {
            action: 'link_identity',
            contact_id: actionResult.contact_id,
            linked_identity: actionResult.linked_identity,
          },
        }).catch(() => {});
      }

      const updateRes = await supabaseAdmin
        .from('identity_suggestions')
        .update({
          status: 'approved',
          acted_at: new Date().toISOString(),
          acted_by: actor,
        })
        .eq('tenant_id', tenantId)
        .eq('id', suggestionId)
        .select('*')
        .single();

      if (updateRes.error) throw new Error(`suggestion approve update failed: ${updateRes.error.message}`);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: actor,
        actor_type: 'user',
        action: 'suggestion_approved',
        entity_type: 'identity_suggestion',
        entity_id: suggestionId,
        metadata: {
          suggestion_type: suggestion.suggestion_type,
          source_contact_id: suggestion.source_contact_id,
          target_contact_id: suggestion.target_contact_id,
          score: suggestion.score,
          strength: suggestion.strength,
        },
      }).catch(() => {});

      return reply.send({ ok: true, suggestion: updateRes.data, result: actionResult });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, suggestion_id: suggestionId }, 'suggestion approve failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/suggestions/reject', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const suggestionId = asText(req.body?.suggestion_id);
    const reason = asText(req.body?.reason);

    if (!tenantId || !suggestionId) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    try {
      const updateRes = await supabaseAdmin
        .from('identity_suggestions')
        .update({
          status: 'rejected',
          acted_at: new Date().toISOString(),
          acted_by: asText(req.user?.id) || null,
        })
        .eq('tenant_id', tenantId)
        .eq('id', suggestionId)
        .select('*')
        .single();

      if (updateRes.error) throw new Error(`suggestion reject failed: ${updateRes.error.message}`);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: 'user',
        action: 'suggestion_rejected',
        entity_type: 'identity_suggestion',
        entity_id: suggestionId,
        metadata: { reason: reason || null },
      }).catch(() => {});

      return reply.send({ ok: true, suggestion: updateRes.data });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, suggestion_id: suggestionId }, 'suggestion reject failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/plan', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const plan = await getPlan({ supabaseAdmin, tenant_id: tenantId });
      const metrics = ['messages_sent_per_month', 'attachments_mb_per_month', 'channels_max'];
      const usage = {};
      for (const metric of metrics) {
        usage[metric] = await getUsageForMetric({ supabaseAdmin, tenant_id: tenantId, metric });
      }

      return reply.send({ ok: true, tenant_id: tenantId, plan, usage });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.put('/admin/plan', {
    preHandler: [requireApiKey, ownerRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const planKey = lower(req.body?.plan_key || 'pro') || 'pro';
    const limits = asObject(req.body?.limits);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const upsert = await supabaseAdmin
        .from('tenant_plans')
        .upsert({
          tenant_id: tenantId,
          plan_key: planKey,
          limits,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id' })
        .select('tenant_id,plan_key,limits,created_at,updated_at')
        .single();

      if (upsert.error) {
        if (isMissingSchema(upsert.error)) return reply.code(400).send({ ok: false, error: 'tenant_plans_schema_missing' });
        throw new Error(upsert.error.message);
      }

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: 'user',
        action: 'plan_updated',
        entity_type: 'tenant_plan',
        entity_id: tenantId,
        metadata: { plan_key: planKey, limits },
      }).catch(() => {});

      return reply.send({ ok: true, plan: upsert.data });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });


  fastify.post('/admin/channel-accounts/set-active', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const channelAccountId = asText(req.body?.channel_account_id);
    const isActive = Boolean(req.body?.is_active);

    if (!tenantId || !channelAccountId) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const currentRes = await supabaseAdmin
        .from('channel_accounts')
        .select('id,tenant_id,is_active,provider,display_name,label')
        .eq('tenant_id', tenantId)
        .eq('id', channelAccountId)
        .maybeSingle();

      if (currentRes.error) throw new Error(`channel lookup failed: ${currentRes.error.message}`);
      if (!currentRes.data) return reply.code(404).send({ ok: false, error: 'channel_account_not_found' });

      if (isActive && !currentRes.data.is_active) {
        const limitCheck = await checkLimit({
          supabaseAdmin,
          tenant_id: tenantId,
          metric: 'channels_max',
          projected_increment: 1,
        });

        if (!limitCheck.allowed) {
          return reply.code(402).send({
            ok: false,
            error: 'limit_exceeded',
            metric: limitCheck.metric,
            limit: limitCheck.limit,
            used: limitCheck.used,
          });
        }
      }

      const updateRes = await supabaseAdmin
        .from('channel_accounts')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', channelAccountId)
        .select('id,tenant_id,is_active,provider,display_name,label,updated_at')
        .single();

      if (updateRes.error) throw new Error(`channel update failed: ${updateRes.error.message}`);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: 'user',
        action: 'channel_account_set_active',
        entity_type: 'channel_account',
        entity_id: channelAccountId,
        metadata: { is_active: isActive },
      }).catch(() => {});

      return reply.send({ ok: true, channel_account: updateRes.data });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/audit/export', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const from = asText(req.query?.from);
    const to = asText(req.query?.to);
    const format = lower(req.query?.format || 'jsonl');
    const limit = Math.max(1, Math.min(50000, asInt(req.query?.limit, 10000) || 10000));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    let query = supabaseAdmin
      .from('audit_events')
      .select('id,tenant_id,actor_user_id,actor_type,action,entity_type,entity_id,metadata,occurred_at')
      .eq('tenant_id', tenantId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (from) query = query.gte('occurred_at', from);
    if (to) query = query.lte('occurred_at', to);

    const rowsRes = await query;
    if (rowsRes.error) {
      if (isMissingSchema(rowsRes.error)) return reply.code(400).send({ ok: false, error: 'audit_events_schema_missing' });
      return reply.code(500).send({ ok: false, error: `audit export failed: ${rowsRes.error.message}` });
    }

    const rows = rowsRes.data || [];
    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(csv(rows));
    }

    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    return reply.send(jsonl(rows));
  });

  fastify.post('/admin/audit/retention/run', {
    preHandler: [requireApiKey, async (req, reply) => requireCronOrOwnerAdmin(req, reply, ownerAdminRoleGuard, cronTenantAllowlist)],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = req._tenantId || getTenantIdFromRequest(req);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const retentionRes = await supabaseAdmin
        .from('retention_settings')
        .select('retain_days')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (retentionRes.error && !isMissingSchema(retentionRes.error)) {
        throw new Error(`retention settings lookup failed: ${retentionRes.error.message}`);
      }

      const retainDays = Math.max(1, Math.min(3650, asInt(retentionRes.data?.retain_days, 365) || 365));
      const cutoffIso = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000).toISOString();

      const deleteRes = await supabaseAdmin
        .from('audit_events')
        .delete()
        .eq('tenant_id', tenantId)
        .lt('occurred_at', cutoffIso);

      if (deleteRes.error) {
        if (isMissingSchema(deleteRes.error)) {
          return reply.code(400).send({ ok: false, error: 'audit_events_schema_missing' });
        }
        throw new Error(`audit retention delete failed: ${deleteRes.error.message}`);
      }

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: req.auth_mode === 'cron' ? 'system' : 'user',
        action: 'audit_retention_run',
        entity_type: 'audit_events',
        entity_id: tenantId,
        metadata: { retain_days: retainDays, cutoff_iso: cutoffIso },
      }).catch(() => {});

      return reply.send({ ok: true, tenant_id: tenantId, retain_days: retainDays, cutoff_iso: cutoffIso });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/public/api-keys', {
    preHandler: [requireApiKey, apiKeysManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const keys = await listTenantApiKeys({ supabaseAdmin, tenant_id: tenantId });
      return reply.send({ ok: true, tenant_id: tenantId, keys });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/public/api-keys', {
    preHandler: [requireApiKey, apiKeysManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const name = asText(req.body?.name || 'Tenant API Key');
    const scopes = asArray(req.body?.scopes);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const created = await createTenantApiKey({ supabaseAdmin, tenant_id: tenantId, name, scopes });

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: 'user',
        action: 'api_key_created',
        entity_type: 'api_key',
        entity_id: created.key.id,
        metadata: { name, scopes: created.key.scopes },
      }).catch(() => {});

      return reply.send({ ok: true, tenant_id: tenantId, key: created.key, raw_key: created.raw_key });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/public/api-keys/revoke', {
    preHandler: [requireApiKey, apiKeysManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const keyId = asText(req.body?.key_id);
    if (!tenantId || !keyId) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    try {
      await revokeTenantApiKey({ supabaseAdmin, tenant_id: tenantId, key_id: keyId });

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: 'user',
        action: 'api_key_revoked',
        entity_type: 'api_key',
        entity_id: keyId,
        metadata: {},
      }).catch(() => {});

      return reply.send({ ok: true, tenant_id: tenantId, key_id: keyId });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/public/webhooks', {
    preHandler: [requireApiKey, webhooksManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    const rowsRes = await supabaseAdmin
      .from('webhook_subscriptions')
      .select('id,tenant_id,url,events,is_active,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (rowsRes.error) {
      if (isMissingSchema(rowsRes.error)) return reply.code(400).send({ ok: false, error: 'webhook_subscriptions_schema_missing' });
      return reply.code(500).send({ ok: false, error: `webhook subscriptions list failed: ${rowsRes.error.message}` });
    }

    return reply.send({ ok: true, tenant_id: tenantId, subscriptions: rowsRes.data || [] });
  });

  fastify.post('/admin/public/webhooks', {
    preHandler: [requireApiKey, webhooksManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const url = asText(req.body?.url);
    const secret = asText(req.body?.secret);
    const events = asArray(req.body?.events).map((event) => asText(event)).filter(Boolean);

    if (!tenantId || !url || !secret) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    const insertRes = await supabaseAdmin
      .from('webhook_subscriptions')
      .insert({
        tenant_id: tenantId,
        url,
        secret,
        events: events.length ? events : ['message.created', 'message.status', 'contact.updated'],
        is_active: true,
      })
      .select('id,tenant_id,url,events,is_active,created_at')
      .single();

    if (insertRes.error) {
      if (isMissingSchema(insertRes.error)) return reply.code(400).send({ ok: false, error: 'webhook_subscriptions_schema_missing' });
      return reply.code(500).send({ ok: false, error: `webhook subscription create failed: ${insertRes.error.message}` });
    }

    await logAudit({
      tenant_id: tenantId,
      actor_user_id: asText(req.user?.id) || null,
      actor_type: 'user',
      action: 'webhook_subscription_created',
      entity_type: 'webhook_subscription',
      entity_id: insertRes.data.id,
      metadata: { events: insertRes.data.events },
    }).catch(() => {});

    return reply.send({ ok: true, subscription: insertRes.data });
  });

  fastify.post('/admin/public/webhooks/revoke', {
    preHandler: [requireApiKey, webhooksManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const id = asText(req.body?.id);
    if (!tenantId || !id) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    const updateRes = await supabaseAdmin
      .from('webhook_subscriptions')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id,tenant_id,url,events,is_active,created_at')
      .single();

    if (updateRes.error) {
      if (isMissingSchema(updateRes.error)) return reply.code(400).send({ ok: false, error: 'webhook_subscriptions_schema_missing' });
      return reply.code(500).send({ ok: false, error: `webhook subscription revoke failed: ${updateRes.error.message}` });
    }

    await logAudit({
      tenant_id: tenantId,
      actor_user_id: asText(req.user?.id) || null,
      actor_type: 'user',
      action: 'webhook_subscription_revoked',
      entity_type: 'webhook_subscription',
      entity_id: id,
      metadata: {},
    }).catch(() => {});

    return reply.send({ ok: true, subscription: updateRes.data });
  });

  fastify.post('/admin/public/webhooks/test', {
    preHandler: [requireApiKey, webhooksManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const id = asText(req.body?.id);
    if (!tenantId || !id) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    try {
      const key = buildWebhookEventKey('system.test', { tenant_id: tenantId, subscription_id: id, ts: Date.now() });

      const insert = await supabaseAdmin
        .from('webhook_dispatch_queue')
        .insert({
          tenant_id: tenantId,
          subscription_id: id,
          event_type: 'system.test',
          event_key: key,
          payload: {
            message: 'Test webhook from Nexus',
            tenant_id: tenantId,
            created_at: new Date().toISOString(),
          },
          status: 'queued',
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
        });

      if (insert.error) throw new Error(insert.error.message);

      return reply.send({ ok: true, tenant_id: tenantId, subscription_id: id, event_key: key });
    } catch (error) {
      if (isMissingSchema(error)) return reply.code(400).send({ ok: false, error: 'webhook_dispatch_schema_missing' });
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/public/webhooks/run', {
    preHandler: [requireApiKey, webhooksManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const limit = Math.max(1, Math.min(200, asInt(req.body?.limit, 25) || 25));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const result = await runWebhookDispatchQueue({ tenant_id: tenantId, limit });
      return reply.send({ ok: true, tenant_id: tenantId, ...result });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  const publicReadGuard = requireTenantApiKey({ supabaseAdmin, requiredScopes: ['read'] });
  const publicWriteGuard = requireTenantApiKey({ supabaseAdmin, requiredScopes: ['write'] });

  fastify.get('/v1/contacts', {
    preHandler: [publicReadGuard],
    config: { rateLimit: PUBLIC_API_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.publicApi?.tenant_id);
    const limit = Math.max(1, Math.min(500, asInt(req.query?.limit, 100) || 100));
    const search = asText(req.query?.search);

    let query = supabaseAdmin
      .from('contacts')
      .select('id,tenant_id,display_name,primary_email,primary_phone,notes,created_at,updated_at,merged_into_contact_id')
      .eq('tenant_id', tenantId)
      .is('merged_into_contact_id', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (search) {
      const like = `%${search}%`;
      query = query.or(`display_name.ilike.${like},primary_email.ilike.${like},primary_phone.ilike.${like}`);
    }

    const rowsRes = await query;
    if (rowsRes.error) return reply.code(500).send({ ok: false, error: `contacts query failed: ${rowsRes.error.message}` });

    return reply.send({ ok: true, tenant_id: tenantId, items: rowsRes.data || [] });
  });

  fastify.get('/v1/conversations', {
    preHandler: [publicReadGuard],
    config: { rateLimit: PUBLIC_API_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.publicApi?.tenant_id);
    const limit = Math.max(1, Math.min(500, asInt(req.query?.limit, 100) || 100));

    const rowsRes = await supabaseAdmin
      .from('conversations')
      .select('id,tenant_id,contact_id,channel_account_id,status,priority,last_message_at,created_at,updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (rowsRes.error) return reply.code(500).send({ ok: false, error: `conversations query failed: ${rowsRes.error.message}` });

    return reply.send({ ok: true, tenant_id: tenantId, items: rowsRes.data || [] });
  });

  fastify.get('/v1/messages', {
    preHandler: [publicReadGuard],
    config: { rateLimit: PUBLIC_API_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.publicApi?.tenant_id);
    const conversationId = asText(req.query?.conversation_id);
    const limit = Math.max(1, Math.min(500, asInt(req.query?.limit, 100) || 100));

    let query = supabaseAdmin
      .from('messages')
      .select('id,tenant_id,conversation_id,contact_id,direction,provider,provider_message_id,body,content,status,delivery_status,received_at,created_at')
      .eq('tenant_id', tenantId)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (conversationId) query = query.eq('conversation_id', conversationId);

    const rowsRes = await query;
    if (rowsRes.error) return reply.code(500).send({ ok: false, error: `messages query failed: ${rowsRes.error.message}` });

    return reply.send({ ok: true, tenant_id: tenantId, items: rowsRes.data || [] });
  });

  fastify.post('/v1/messages/send', {
    preHandler: [publicWriteGuard],
    config: { rateLimit: PUBLIC_API_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.publicApi?.tenant_id);
    const bodyText = asText(req.body?.body_text || req.body?.text || req.body?.body);
    const attachments = asArray(req.body?.attachments).filter((item) => item && typeof item === 'object');
    const conversationId = asText(req.body?.conversation_id);
    const contactId = asText(req.body?.contact_id);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    if (!bodyText && attachments.length === 0) {
      return reply.code(400).send({ ok: false, error: 'missing_body_or_attachments' });
    }
    if (!conversationId && !contactId) {
      return reply.code(400).send({ ok: false, error: 'missing_contact_id_or_conversation_id' });
    }

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound sending is disabled while SAFE_MODE=true' });
    }

    try {
      const limitCheck = await checkLimit({
        supabaseAdmin,
        tenant_id: tenantId,
        metric: 'messages_sent_per_month',
        projected_increment: 1,
      });

      if (!limitCheck.allowed) {
        return reply.code(402).send({
          ok: false,
          error: 'limit_exceeded',
          metric: limitCheck.metric,
          limit: limitCheck.limit,
          used: limitCheck.used,
        });
      }

      const route = await resolveBestIdentityForQueue({
        supabaseAdmin,
        tenant_id: tenantId,
        contact_id: contactId || null,
        conversation_id: conversationId || null,
        preferred_provider: asText(req.body?.provider || req.body?.channel_preference) || null,
        channel_preference: asText(req.body?.channel_preference) || null,
        to_address: asText(req.body?.to_address || req.body?.to || req.body?.recipient_id) || null,
        identity_id: asText(req.body?.identity_id) || null,
      });

      if (!route?.ok) {
        return reply.code(409).send({ ok: false, error: route?.reason || 'no_send_route_found' });
      }

      const idempotencyKey = asText(req.body?.idempotency_key)
        || makeIdempotencyKey({
          tenantId,
          contactId: route.contact_id || contactId,
          provider: route.provider,
          bodyText,
          attachments,
        });

      const outboxPayload = {
        tenant_id: tenantId,
        contact_id: route.contact_id || contactId || null,
        conversation_id: conversationId || null,
        provider: asText(route.provider),
        channel_account_id: asText(route.channel_account_id) || null,
        identity_id: route.identity_id ? String(route.identity_id) : null,
        idempotency_key: idempotencyKey,
        client_request_id: idempotencyKey,
        body_text: bodyText,
        body: bodyText,
        attachments,
        content: {
          source: 'public_api',
          attachments,
          send_route: {
            selected_provider: asText(route.provider),
            selected_channel_account_id: asText(route.channel_account_id) || null,
            fallback_used: Boolean(route.fallback_used),
            source: asText(route.source) || null,
          },
        },
        status: 'queued',
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        to_address: asText(route.to_address),
        from_address: asText(route.from_address) || null,
        created_by: null,
        updated_at: new Date().toISOString(),
      };

      let insert = await supabaseAdmin
        .from('outbox_messages')
        .insert(outboxPayload)
        .select('id,tenant_id,status,provider,channel_account_id,to_address,from_address,idempotency_key')
        .maybeSingle();

      let deduped = false;
      if (insert.error && String(insert.error.message || '').toLowerCase().includes('duplicate')) {
        const existing = await supabaseAdmin
          .from('outbox_messages')
          .select('id,tenant_id,status,provider,channel_account_id,to_address,from_address,idempotency_key')
          .eq('tenant_id', tenantId)
          .eq('idempotency_key', idempotencyKey)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing.error) throw new Error(`outbox idempotency lookup failed: ${existing.error.message}`);
        insert = existing;
        deduped = true;
      }

      if (insert.error) throw new Error(`outbox queue insert failed: ${insert.error.message}`);
      if (!insert.data) throw new Error('outbox queue insert returned no row');

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: null,
        actor_type: 'system',
        action: 'send_message_queued',
        entity_type: 'outbox_message',
        entity_id: String(insert.data.id),
        metadata: {
          provider: insert.data.provider,
          channel_account_id: insert.data.channel_account_id,
          deduped,
          source: 'public_api',
        },
      }).catch(() => {});

      return reply.send({
        ok: true,
        outbox_id: insert.data.id,
        status: insert.data.status,
        deduped,
        idempotency_key: insert.data.idempotency_key,
        warning: limitCheck.warning ? limitCheck.warning_message : null,
      });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
