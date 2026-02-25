import { supabaseAdmin } from '../supabase.js';
import { mergeContacts } from '../util/contact-identities.js';
import { ENV } from '../env.js';

function requireApiKey(req, reply) {
  const key = req.headers['x-api-key'];
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function asText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function identityKey(row) {
  const scoped = row?.channel_account_id ? String(row.channel_account_id) : 'null';
  return `${String(row?.provider || '')}::${String(row?.identity_type || '')}::${String(row?.identity_value || '')}::${scoped}`;
}

function unique(values) {
  return Array.from(new Set(values));
}

function pickVerifiedValues(identities, identityType) {
  return unique(
    (identities || [])
      .filter((row) => String(row?.identity_type || '').toLowerCase() === identityType && Boolean(row?.verified))
      .map((row) => String(row?.identity_value || '').trim())
      .filter(Boolean)
  );
}

function hasOverlap(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).some((value) => rightSet.has(value));
}

function computeConflicts({ fromIdentities, intoIdentities }) {
  const reasons = [];

  const fromPhones = pickVerifiedValues(fromIdentities, 'phone');
  const intoPhones = pickVerifiedValues(intoIdentities, 'phone');
  if (fromPhones.length > 0 && intoPhones.length > 0 && !hasOverlap(fromPhones, intoPhones)) {
    reasons.push('Different verified phones');
  }

  const fromEmails = pickVerifiedValues(fromIdentities, 'email');
  const intoEmails = pickVerifiedValues(intoIdentities, 'email');
  if (fromEmails.length > 0 && intoEmails.length > 0 && !hasOverlap(fromEmails, intoEmails)) {
    reasons.push('Different verified emails');
  }

  return {
    block: reasons.length > 0,
    reasons,
  };
}

async function buildMergePreview({ tenant_id, from_contact_id, into_contact_id }) {
  if (from_contact_id === into_contact_id) {
    return {
      ok: true,
      conflicts: { block: false, reasons: [] },
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

  return {
    ok: true,
    conflicts,
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
    identity_overlap: {
      exact_matches,
      from_only,
      into_only,
    },
  };
}

export async function adminContactRoutes(fastify) {
  fastify.post('/admin/contacts/merge/preview', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    const body = req.body || {};
    const tenant_id = asText(body.tenant_id);
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

  fastify.post('/admin/contacts/merge', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    const body = req.body || {};
    const tenant_id = asText(body.tenant_id);
    const from_contact_id = asText(body.from_contact_id);
    const into_contact_id = asText(body.into_contact_id);
    const reason = asText(body.reason);
    const merged_by = asText(body.merged_by || body.requester_user_id);

    if (!tenant_id || !from_contact_id || !into_contact_id) {
      return reply.code(400).send({
        ok: false,
        error: 'Missing tenant_id, from_contact_id, or into_contact_id',
      });
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

      const result = await mergeContacts({
        tenant_id,
        from_contact_id,
        into_contact_id,
        merged_by,
        reason,
      });

      return reply.code(200).send({ ok: true, result });
    } catch (error) {
      req.log.error({ err: error, tenant_id, from_contact_id, into_contact_id }, 'Contact merge failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
