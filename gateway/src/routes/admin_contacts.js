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

const UNDO_WINDOW_HOURS = 24;

function isDuplicateError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('duplicate') || message.includes('unique') || message.includes('conflict');
}

async function getTenantRole({ tenant_id, user_id }) {
  const result = await supabaseAdmin
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenant_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (result.error) {
    throw new Error(`tenant role lookup failed: ${result.error.message}`);
  }

  return asText(result.data?.role)?.toLowerCase() || null;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
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

  fastify.post('/admin/contacts/merge/undo', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    const body = req.body || {};
    const tenant_id = asText(body.tenant_id);
    const requester_user_id = asText(body.requester_user_id || body.requesterUserId);
    const reason = asText(body.reason);
    const jobIdNum = Number(body.job_id);

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

      const role = await getTenantRole({ tenant_id, user_id: requester_user_id });
      if (!role) {
        return reply.code(403).send({ ok: false, error: 'not_in_tenant' });
      }

      if (role !== 'owner') {
        if (role !== 'admin' && role !== 'agent') {
          return reply.code(403).send({ ok: false, error: 'insufficient_role', details: { role } });
        }

        const createdMs = new Date(job.created_at).getTime();
        const nowMs = Date.now();
        const ageHours = (nowMs - createdMs) / (1000 * 60 * 60);

        if (!Number.isFinite(ageHours) || ageHours > UNDO_WINDOW_HOURS) {
          return reply.code(403).send({
            ok: false,
            error: 'undo_window_expired',
            details: {
              role,
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
        const idNum = Number(item.item_id);
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
        const idNum = Number(item.item_id);
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
          undo_reason: reason,
        })
        .eq('tenant_id', tenant_id)
        .eq('id', jobIdNum);

      if (markUndone.error) {
        throw new Error(`merge job undo marker failed: ${markUndone.error.message}`);
      }

      return reply.code(200).send({
        ok: true,
        result: {
          job_id: jobIdNum,
          from_contact_id: job.from_contact_id,
          into_contact_id: job.into_contact_id,
          undone_by: requester_user_id,
        },
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id, job_id: jobIdNum, requester_user_id }, 'Contact merge undo failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
