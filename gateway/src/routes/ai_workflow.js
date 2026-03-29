import { supabaseAdmin } from '../supabase.js';
import { ENV } from '../env.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import {
  hasValidCronToken,
  isLocalRequest,
  parseAllowedTenantIds,
} from '../util/cron-auth.js';
import {
  tryAcquireTenantOutboxLock,
  releaseTenantOutboxLock,
} from '../util/outbox-lock.js';
import {
  AI_ROLE_KEYS,
  allowedPhasesForTier,
  decideNextRole,
  normalizeTier,
  roleAllowedForTier,
} from '../lib/ai/roleRouter.js';

const LEGAL_TAX_DISCLAIMER = 'Guidance is educational and operational only; not legal or tax advice.';
const INVESTMENT_DISCLAIMER = 'Investment content is educational only and is not investment advice.';

const FUNDING_ACTION_TYPES = new Set([
  'checklist_prepared',
  'client_submitted',
  'advisor_reviewed',
  'submitted_confirmation_captured',
]);

const SUBMITTED_BY_TYPES = new Set(['client', 'advisor']);

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function asNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function asInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function clampInt(value, fallback = 50, min = 1, max = 500) {
  const parsed = asInt(value);
  if (parsed === null) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function parseSsnLast4(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.slice(-4);
}

function normalizedDisclaimers({ includeInvestment = false } = {}) {
  const out = [LEGAL_TAX_DISCLAIMER];
  if (includeInvestment) out.push(INVESTMENT_DISCLAIMER);
  return out;
}

function roleDisplayName(roleKey) {
  const map = {
    [AI_ROLE_KEYS.INTAKE_SPECIALIST]: 'Intake Specialist',
    [AI_ROLE_KEYS.CREDIT_ANALYST]: 'Credit Analyst',
    [AI_ROLE_KEYS.BUSINESS_ADVISOR]: 'Business Advisor',
    [AI_ROLE_KEYS.FUNDING_SPECIALIST]: 'Funding Specialist',
    [AI_ROLE_KEYS.GRANT_WRITER]: 'Grant Writer',
    [AI_ROLE_KEYS.INVESTMENT_ADVISOR]: 'Investment Advisor',
    [AI_ROLE_KEYS.SUCCESS_MANAGER]: 'Success Manager',
  };

  return map[roleKey] || roleKey;
}

function scrubProfile(profile) {
  if (!profile) return null;
  const ssnLast4 = parseSsnLast4(profile.ssn_last4);

  return {
    id: profile.id,
    tenant_id: profile.tenant_id,
    contact_id: profile.contact_id,
    membership_tier: profile.membership_tier,
    ssn_last4: ssnLast4,
    dob: profile.dob,
    employment_status: profile.employment_status,
    annual_income: profile.annual_income,
    business_exists: Boolean(profile.business_exists),
    intake_status: profile.intake_status,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function normalizeProfileInput({ tenantId, contactId, membershipTier, profile }) {
  const src = (profile && typeof profile === 'object') ? profile : {};

  return {
    tenant_id: tenantId,
    contact_id: contactId,
    membership_tier: normalizeTier(membershipTier),
    ssn_last4: parseSsnLast4(src.ssn_last4 || src.ssn),
    dob: asText(src.dob) || null,
    employment_status: asText(src.employment_status) || null,
    annual_income: asNumber(src.annual_income),
    business_exists: asBool(src.business_exists, false),
    intake_status: asText(src.intake_status) || 'in_progress',
    updated_at: new Date().toISOString(),
  };
}

function normalizeGoalsInput(goals) {
  const src = (goals && typeof goals === 'object') ? goals : {};

  return {
    target_funding_amount: asNumber(src.target_funding_amount),
    target_timeline_months: asInt(src.target_timeline_months),
    funding_purpose: asText(src.funding_purpose) || null,
    notes: asText(src.notes) || null,
  };
}

function hasGoalData(goals) {
  if (!goals) return false;
  return (
    goals.target_funding_amount !== null
    || goals.target_timeline_months !== null
    || Boolean(goals.funding_purpose)
    || Boolean(goals.notes)
  );
}

function phaseTaskTemplates({ phase, reason }) {
  const reasonText = asText(reason);

  const templates = {
    intake: [
      {
        role_key: AI_ROLE_KEYS.INTAKE_SPECIALIST,
        title: 'Complete intake questionnaire',
        description: 'Collect tier selection, profile fields, business status, and funding goals.',
        priority: 'high',
      },
      {
        role_key: AI_ROLE_KEYS.SUCCESS_MANAGER,
        title: 'Schedule intake follow-up',
        description: 'Confirm the next milestone and communication cadence.',
        priority: 'normal',
      },
    ],
    credit: [
      {
        role_key: AI_ROLE_KEYS.CREDIT_ANALYST,
        title: 'Run 5-factor fundability assessment',
        description: 'Assess negative items, utilization, age, limits, and account depth.',
        priority: 'high',
      },
      {
        role_key: AI_ROLE_KEYS.CREDIT_ANALYST,
        title: 'Prepare dispute workflow and recommendations',
        description: 'Generate next actions and optional dispute templates.',
        priority: 'normal',
      },
    ],
    business: [
      {
        role_key: AI_ROLE_KEYS.BUSINESS_ADVISOR,
        title: 'Build business formation checklist',
        description: 'Confirm entity setup, EIN, NAICS, and business banking readiness.',
        priority: 'high',
      },
    ],
    funding: [
      {
        role_key: AI_ROLE_KEYS.FUNDING_SPECIALIST,
        title: 'Prepare lender short-list and submission checklist',
        description: 'Provide compliant assisted-submission flow and reserve planning.',
        priority: 'high',
      },
    ],
    grants: [
      {
        role_key: AI_ROLE_KEYS.GRANT_WRITER,
        title: 'Generate grant match pack',
        description: 'Match opportunities and prepare the required submission artifacts.',
        priority: 'normal',
      },
    ],
    investments: [
      {
        role_key: AI_ROLE_KEYS.INVESTMENT_ADVISOR,
        title: 'Publish educational opportunity brief',
        description: 'Share educational-only options with risk notes and no advice language.',
        priority: 'normal',
      },
    ],
    success: [
      {
        role_key: AI_ROLE_KEYS.SUCCESS_MANAGER,
        title: 'Update milestones and stakeholder updates',
        description: 'Track progress, blockers, and next best actions across roles.',
        priority: 'high',
      },
    ],
  };

  return (templates[phase] || []).map((task) => ({
    ...task,
    metadata: reasonText ? { advance_reason: reasonText } : {},
  }));
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return;
  }
  return undefined;
}

async function getProfile({ tenantId, contactId }) {
  const res = await supabaseAdmin
    .from('client_profiles')
    .select('id,tenant_id,contact_id,membership_tier,ssn_last4,dob,employment_status,annual_income,business_exists,intake_status,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (res.error) {
    throw new Error(`client profile lookup failed: ${res.error.message}`);
  }

  return res.data || null;
}

async function getActiveCase({ tenantId, contactId }) {
  const res = await supabaseAdmin
    .from('workflow_cases')
    .select('id,tenant_id,contact_id,current_phase,current_role_key,status,risk_level,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) {
    throw new Error(`workflow case lookup failed: ${res.error.message}`);
  }

  return res.data || null;
}

async function createTasks({ tenantId, caseId, tasks }) {
  if (!tasks.length) return [];

  const payload = tasks.map((task) => ({
    tenant_id: tenantId,
    case_id: caseId,
    role_key: task.role_key,
    title: task.title,
    description: task.description || null,
    status: task.status || 'todo',
    priority: task.priority || 'normal',
    due_at: task.due_at || null,
    assigned_to: task.assigned_to || null,
    metadata: (task.metadata && typeof task.metadata === 'object') ? task.metadata : {},
  }));

  const res = await supabaseAdmin
    .from('workflow_tasks')
    .insert(payload)
    .select('id,tenant_id,case_id,role_key,title,description,status,priority,due_at,assigned_to,metadata,created_at,completed_at');

  if (res.error) {
    throw new Error(`workflow task insert failed: ${res.error.message}`);
  }

  return res.data || [];
}

function validateTierAndPhase({ membershipTier, phase }) {
  const tier = normalizeTier(membershipTier);
  const allowedPhases = allowedPhasesForTier(tier);
  if (!allowedPhases.includes(phase)) {
    return {
      ok: false,
      tier,
      allowed_phases: allowedPhases,
    };
  }

  return {
    ok: true,
    tier,
    allowed_phases: allowedPhases,
  };
}

function validateTierRole({ membershipTier, roleKey }) {
  return roleAllowedForTier({ tier: membershipTier, roleKey });
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes(String(columnName || '').toLowerCase()) && msg.includes('does not exist');
}

function isLegacyFundingEventSchemaError(error) {
  return (
    isMissingColumnError(error, 'client_device_confirmed')
    || isMissingColumnError(error, 'confirmation_method')
    || isMissingColumnError(error, 'confirmation_metadata')
    || isMissingColumnError(error, 'captured_by')
  );
}

async function insertFundingEvent(eventPayload) {
  const selectFields = "id,tenant_id,contact_id,lender_name,action_type,submitted_by,notes,created_at";

  const first = await supabaseAdmin
    .from("funding_application_events")
    .insert(eventPayload)
    .select(selectFields)
    .single();

  if (!first.error) return first.data;

  if (!isLegacyFundingEventSchemaError(first.error)) {
    throw new Error("funding application event insert failed: " + String(first.error?.message || "unknown_error"));
  }

  const {
    client_device_confirmed: _clientDeviceConfirmed,
    confirmation_method: _confirmationMethod,
    confirmation_metadata: _confirmationMetadata,
    captured_by: _capturedBy,
    ...legacyPayload
  } = eventPayload || {};

  const fallback = await supabaseAdmin
    .from("funding_application_events")
    .insert(legacyPayload)
    .select(selectFields)
    .single();

  if (fallback.error) {
    throw new Error("funding application event insert failed: " + String(fallback.error?.message || "unknown_error"));
  }

  return fallback.data;
}

function buildSubmissionNote({ notes, confirmationMethod, metadata }) {
  const base = asText(notes);
  const method = asText(confirmationMethod);
  const md = (metadata && typeof metadata === "object") ? metadata : null;
  const safeMeta = md ? JSON.stringify(md).slice(0, 320) : "";

  const parts = [base];
  if (method) parts.push("confirmation_method=" + method);
  if (safeMeta) parts.push("confirmation_metadata=" + safeMeta);

  return parts.filter(Boolean).join(" | ").slice(0, 2000) || null;
}

async function ensureActiveCaseForContact({ tenantId, contactId, phase = "funding", roleKey = AI_ROLE_KEYS.FUNDING_SPECIALIST }) {
  let activeCase = await getActiveCase({ tenantId, contactId });

  if (!activeCase) {
    const createCaseRes = await supabaseAdmin
      .from("workflow_cases")
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        current_phase: phase,
        current_role_key: roleKey,
        status: "active",
        risk_level: "normal",
        updated_at: new Date().toISOString(),
      })
      .select("id,tenant_id,contact_id,current_phase,current_role_key,status,risk_level,created_at,updated_at")
      .single();

    if (createCaseRes.error) {
      throw new Error("workflow case create failed: " + String(createCaseRes.error.message || "unknown_error"));
    }

    activeCase = createCaseRes.data;
  }

  return activeCase;
}


function getTenantIdFromRequest(req) {
  return (
    asText(req?.body?.tenant_id)
    || asText(req?.query?.tenant_id)
    || asText(req?.params?.tenant_id)
    || asText(req?.tenant?.id)
    || null
  );
}

function olderThanMinutes(isoString, minutes) {
  const at = Date.parse(String(isoString || ''));
  if (!Number.isFinite(at)) return false;
  const diffMs = Date.now() - at;
  return diffMs >= (Math.max(0, Number(minutes || 0)) * 60 * 1000);
}

function fundingEventKey(row) {
  return `${asText(row?.contact_id) || ''}::${asText(row?.lender_name) || ''}`;
}

function latestFundingEventsByKey(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = fundingEventKey(row);
    if (!key || map.has(key)) continue;
    map.set(key, row);
  }
  return Array.from(map.values());
}

async function hasOpenFundingFollowupTask({ tenantId, caseId, followupKey }) {
  const taskRes = await supabaseAdmin
    .from('workflow_tasks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('case_id', caseId)
    .neq('status', 'completed')
    .contains('metadata', { followup_key: followupKey })
    .limit(1);

  if (taskRes.error) {
    throw new Error(`workflow follow-up lookup failed: ${taskRes.error.message}`);
  }

  return (taskRes.data || []).length > 0;
}

async function runFundingComplianceBatch({ tenantId, limit = 50, staleMinutes = 30 }) {
  const boundedLimit = Math.max(1, Math.min(500, Number(limit || 50)));
  const boundedStaleMinutes = Math.max(1, Math.min(24 * 60, Number(staleMinutes || 30)));
  const fetchLimit = Math.max(200, Math.min(2000, boundedLimit * 8));

  const eventsRes = await supabaseAdmin
    .from('funding_application_events')
    .select('id,tenant_id,contact_id,lender_name,action_type,submitted_by,notes,created_at')
    .eq('tenant_id', tenantId)
    .in('action_type', ['client_submitted', 'advisor_reviewed', 'submitted_confirmation_captured'])
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (eventsRes.error) {
    throw new Error(`funding compliance scan failed: ${eventsRes.error.message}`);
  }

  const latestByKey = latestFundingEventsByKey(eventsRes.data || []);
  const candidates = latestByKey
    .filter((row) => {
      const action = asText(row?.action_type);
      if (action !== 'client_submitted' && action !== 'advisor_reviewed') return false;
      return olderThanMinutes(row?.created_at, boundedStaleMinutes);
    })
    .slice(0, boundedLimit);

  let created = 0;
  let skipped = 0;
  const items = [];

  for (const row of candidates) {
    const contactId = asText(row?.contact_id);
    const lenderName = asText(row?.lender_name);
    const actionType = asText(row?.action_type) || 'client_submitted';

    if (!isUuid(contactId) || !lenderName) {
      skipped += 1;
      items.push({ contact_id: contactId || null, lender_name: lenderName || null, status: 'skipped', reason: 'invalid_event_shape' });
      continue;
    }

    const profile = await getProfile({ tenantId, contactId });
    if (!profile) {
      skipped += 1;
      items.push({ contact_id: contactId, lender_name: lenderName, status: 'skipped', reason: 'profile_missing' });
      continue;
    }

    const tier = normalizeTier(profile.membership_tier);
    if (tier !== 'tier3') {
      skipped += 1;
      items.push({ contact_id: contactId, lender_name: lenderName, status: 'skipped', reason: 'tier_not_allowed' });
      continue;
    }

    const activeCase = await ensureActiveCaseForContact({
      tenantId,
      contactId,
      phase: 'funding',
      roleKey: AI_ROLE_KEYS.FUNDING_SPECIALIST,
    });

    const followupKey = `${contactId}::${lenderName}`;
    const hasOpenTask = await hasOpenFundingFollowupTask({
      tenantId,
      caseId: activeCase.id,
      followupKey,
    });

    if (hasOpenTask) {
      skipped += 1;
      items.push({ contact_id: contactId, lender_name: lenderName, status: 'skipped', reason: 'open_followup_exists' });
      continue;
    }

    const tasks = await createTasks({
      tenantId,
      caseId: activeCase.id,
      tasks: [{
        role_key: AI_ROLE_KEYS.SUCCESS_MANAGER,
        title: `Capture client-device confirmation for ${lenderName}`,
        description: 'Follow up with client and capture verified submission evidence before assisted submission handling.',
        priority: 'high',
        metadata: {
          followup_key: followupKey,
          lender_name: lenderName,
          last_action_type: actionType,
          last_action_at: row?.created_at || null,
        },
      }],
    });

    created += 1;
    items.push({
      contact_id: contactId,
      lender_name: lenderName,
      status: 'created',
      task_id: tasks[0]?.id || null,
      last_action_type: actionType,
    });
  }

  return {
    scanned_events: (eventsRes.data || []).length,
    candidate_pairs: candidates.length,
    created_tasks: created,
    skipped_pairs: skipped,
    items,
  };
}
export async function aiWorkflowRoutes(fastify) {
  const roleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });

  const ownerAdminGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin'],
  });

  const cronTenantAllowlist = parseAllowedTenantIds(ENV.ORACLE_TENANT_IDS);

  async function requireFundingComplianceRunnerAuth(req, reply) {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    }

    if (!isUuid(tenantId)) {
      return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    }

    req.fundingComplianceTenantId = tenantId;

    const hasCronHeader = Boolean(asText(req.headers['x-cron-token']));
    if (hasCronHeader) {
      if (!hasValidCronToken(req, ENV.ORACLE_CRON_TOKEN)) {
        return reply.code(401).send({ ok: false, error: 'invalid_cron_token' });
      }

      if (!isLocalRequest(req)) {
        return reply.code(403).send({ ok: false, error: 'cron_not_from_localhost' });
      }

      if (cronTenantAllowlist.size === 0) {
        return reply.code(500).send({ ok: false, error: 'cron_tenant_allowlist_not_configured' });
      }

      if (!cronTenantAllowlist.has(tenantId)) {
        return reply.code(403).send({ ok: false, error: 'tenant_not_allowed_for_cron' });
      }

      req.user = { id: 'system:cron', jwt: null };
      req.tenant = { id: tenantId, role: 'system' };
      req.auth_mode = 'cron';
      return undefined;
    }

    await roleGuard(req, reply);
    if (reply.sent) return undefined;

    const scopedTenantId = asText(req.tenant?.id);
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    req.auth_mode = 'user';
    return undefined;
  }

  fastify.post('/admin/ai/intake/start', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const contactId = asText(req.body?.contact_id);
    const membershipTier = normalizeTier(req.body?.membership_tier);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });

    try {
      const profilePayload = normalizeProfileInput({
        tenantId,
        contactId,
        membershipTier,
        profile: req.body?.profile,
      });

      const profileRes = await supabaseAdmin
        .from('client_profiles')
        .upsert(profilePayload, { onConflict: 'tenant_id,contact_id' })
        .select('id,tenant_id,contact_id,membership_tier,ssn_last4,dob,employment_status,annual_income,business_exists,intake_status,created_at,updated_at')
        .maybeSingle();

      if (profileRes.error) {
        throw new Error(`client profile upsert failed: ${profileRes.error.message}`);
      }

      const goalsPayload = normalizeGoalsInput(req.body?.goals);
      if (hasGoalData(goalsPayload)) {
        const goalsRes = await supabaseAdmin
          .from('client_goals')
          .insert({
            tenant_id: tenantId,
            contact_id: contactId,
            ...goalsPayload,
          });

        if (goalsRes.error) {
          throw new Error(`client goals insert failed: ${goalsRes.error.message}`);
        }
      }

      const roleKey = decideNextRole({
        tier: membershipTier,
        phase: 'intake',
        credit_readiness: asText(req.body?.credit_readiness),
        business_exists: asBool(profilePayload.business_exists, false),
      });

      let activeCase = await getActiveCase({ tenantId, contactId });
      if (!activeCase) {
        const caseInsert = await supabaseAdmin
          .from('workflow_cases')
          .insert({
            tenant_id: tenantId,
            contact_id: contactId,
            current_phase: 'intake',
            current_role_key: roleKey,
            status: 'active',
            risk_level: 'normal',
            updated_at: new Date().toISOString(),
          })
          .select('id,tenant_id,contact_id,current_phase,current_role_key,status,risk_level,created_at,updated_at')
          .single();

        if (caseInsert.error) {
          throw new Error(`workflow case insert failed: ${caseInsert.error.message}`);
        }

        activeCase = caseInsert.data;
      } else {
        const caseUpdate = await supabaseAdmin
          .from('workflow_cases')
          .update({
            current_phase: 'intake',
            current_role_key: roleKey,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeCase.id)
          .select('id,tenant_id,contact_id,current_phase,current_role_key,status,risk_level,created_at,updated_at')
          .single();

        if (caseUpdate.error) {
          throw new Error(`workflow case update failed: ${caseUpdate.error.message}`);
        }

        activeCase = caseUpdate.data;
      }

      const autoTasks = phaseTaskTemplates({ phase: 'intake' })
        .filter((task) => validateTierRole({ membershipTier, roleKey: task.role_key }));

      const createdTasks = await createTasks({
        tenantId,
        caseId: activeCase.id,
        tasks: autoTasks,
      });

      return reply.send({
        ok: true,
        case: activeCase,
        profile: scrubProfile(profileRes.data),
        created_tasks: createdTasks,
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai intake start failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/case/:tenant_id/:contact_id', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.params?.tenant_id || req.tenant?.id);
    const contactId = asText(req.params?.contact_id);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });

    try {
      const [profile, activeCase] = await Promise.all([
        getProfile({ tenantId, contactId }),
        getActiveCase({ tenantId, contactId }),
      ]);

      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'client_profile_not_found' });
      }

      const tier = normalizeTier(profile.membership_tier);
      const phase = asText(activeCase?.current_phase || 'intake').toLowerCase();
      const recommendedRoleKey = decideNextRole({
        tier,
        phase,
        credit_readiness: asText(req.query?.credit_readiness),
        business_exists: Boolean(profile.business_exists),
      });

      let tasks = [];
      if (activeCase?.id) {
        const tasksRes = await supabaseAdmin
          .from('workflow_tasks')
          .select('id,tenant_id,case_id,role_key,title,description,status,priority,due_at,assigned_to,metadata,created_at,completed_at')
          .eq('tenant_id', tenantId)
          .eq('case_id', activeCase.id)
          .neq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(200);

        if (tasksRes.error) {
          throw new Error(`workflow task lookup failed: ${tasksRes.error.message}`);
        }

        tasks = tasksRes.data || [];
      }

      return reply.send({
        ok: true,
        case: activeCase,
        profile: scrubProfile(profile),
        open_tasks: tasks,
        role_recommendations: {
          recommended_role_key: recommendedRoleKey,
          recommended_role_name: roleDisplayName(recommendedRoleKey),
          allowed_phases: allowedPhasesForTier(tier),
          membership_tier: tier,
        },
        disclaimers: normalizedDisclaimers({ includeInvestment: phase === 'investments' || recommendedRoleKey === AI_ROLE_KEYS.INVESTMENT_ADVISOR }),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai case fetch failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/case/advance', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const contactId = asText(req.body?.contact_id);
    const nextPhase = asText(req.body?.next_phase).toLowerCase();
    const reason = asText(req.body?.reason);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });
    if (!nextPhase) return reply.code(400).send({ ok: false, error: 'missing_next_phase' });

    try {
      const profile = await getProfile({ tenantId, contactId });
      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'client_profile_not_found' });
      }

      const tierCheck = validateTierAndPhase({
        membershipTier: profile.membership_tier,
        phase: nextPhase,
      });

      if (!tierCheck.ok) {
        return reply.code(403).send({
          ok: false,
          error: 'tier_not_allowed_phase',
          details: {
            membership_tier: tierCheck.tier,
            next_phase: nextPhase,
            allowed_phases: tierCheck.allowed_phases,
          },
        });
      }

      let activeCase = await getActiveCase({ tenantId, contactId });
      if (!activeCase) {
        const createCaseRes = await supabaseAdmin
          .from('workflow_cases')
          .insert({
            tenant_id: tenantId,
            contact_id: contactId,
            current_phase: 'intake',
            current_role_key: AI_ROLE_KEYS.INTAKE_SPECIALIST,
            status: 'active',
            risk_level: 'normal',
            updated_at: new Date().toISOString(),
          })
          .select('id,tenant_id,contact_id,current_phase,current_role_key,status,risk_level,created_at,updated_at')
          .single();

        if (createCaseRes.error) {
          throw new Error(`workflow case create failed: ${createCaseRes.error.message}`);
        }

        activeCase = createCaseRes.data;
      }

      const roleKey = decideNextRole({
        tier: profile.membership_tier,
        phase: nextPhase,
        credit_readiness: asText(req.body?.credit_readiness),
        business_exists: Boolean(profile.business_exists),
      });

      if (!validateTierRole({ membershipTier: profile.membership_tier, roleKey })) {
        return reply.code(403).send({
          ok: false,
          error: 'tier_not_allowed_role',
          details: {
            membership_tier: normalizeTier(profile.membership_tier),
            requested_role_key: roleKey,
          },
        });
      }

      const updateRes = await supabaseAdmin
        .from('workflow_cases')
        .update({
          current_phase: nextPhase,
          current_role_key: roleKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeCase.id)
        .select('id,tenant_id,contact_id,current_phase,current_role_key,status,risk_level,created_at,updated_at')
        .single();

      if (updateRes.error) {
        throw new Error(`workflow case advance failed: ${updateRes.error.message}`);
      }

      const generatedTasks = phaseTaskTemplates({ phase: nextPhase, reason })
        .filter((task) => validateTierRole({ membershipTier: profile.membership_tier, roleKey: task.role_key }));

      const createdTasks = await createTasks({
        tenantId,
        caseId: activeCase.id,
        tasks: generatedTasks,
      });

      return reply.send({
        ok: true,
        case: updateRes.data,
        created_tasks: createdTasks,
        disclaimers: normalizedDisclaimers({ includeInvestment: nextPhase === 'investments' || roleKey === AI_ROLE_KEYS.INVESTMENT_ADVISOR }),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai case advance failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/tasks/create', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const caseId = asText(req.body?.case_id);
    const roleKey = asText(req.body?.role_key).toLowerCase();
    const title = asText(req.body?.title);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(caseId)) return reply.code(400).send({ ok: false, error: 'invalid_case_id' });
    if (!roleKey) return reply.code(400).send({ ok: false, error: 'missing_role_key' });
    if (!title) return reply.code(400).send({ ok: false, error: 'missing_title' });

    try {
      const caseRes = await supabaseAdmin
        .from('workflow_cases')
        .select('id,tenant_id,contact_id,status,current_phase,current_role_key,risk_level,created_at,updated_at')
        .eq('tenant_id', tenantId)
        .eq('id', caseId)
        .maybeSingle();

      if (caseRes.error) {
        throw new Error(`workflow case read failed: ${caseRes.error.message}`);
      }
      if (!caseRes.data) {
        return reply.code(404).send({ ok: false, error: 'workflow_case_not_found' });
      }

      const profile = await getProfile({ tenantId, contactId: caseRes.data.contact_id });
      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'client_profile_not_found' });
      }

      if (!validateTierRole({ membershipTier: profile.membership_tier, roleKey })) {
        return reply.code(403).send({
          ok: false,
          error: 'tier_not_allowed_role',
          details: {
            membership_tier: normalizeTier(profile.membership_tier),
            role_key: roleKey,
          },
        });
      }

      const metadata = (req.body?.metadata && typeof req.body.metadata === 'object') ? req.body.metadata : {};

      const insertRes = await supabaseAdmin
        .from('workflow_tasks')
        .insert({
          tenant_id: tenantId,
          case_id: caseId,
          role_key: roleKey,
          title,
          description: asText(req.body?.description) || null,
          status: asText(req.body?.status) || 'todo',
          priority: asText(req.body?.priority) || 'normal',
          due_at: asText(req.body?.due_at) || null,
          assigned_to: asText(req.body?.assigned_to) || null,
          metadata,
        })
        .select('id,tenant_id,case_id,role_key,title,description,status,priority,due_at,assigned_to,metadata,created_at,completed_at')
        .single();

      if (insertRes.error) {
        throw new Error(`workflow task create failed: ${insertRes.error.message}`);
      }

      return reply.send({
        ok: true,
        task: insertRes.data,
        disclaimers: normalizedDisclaimers({ includeInvestment: roleKey === AI_ROLE_KEYS.INVESTMENT_ADVISOR }),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, case_id: caseId }, 'ai task create failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/tasks/complete', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const taskId = asText(req.body?.task_id);
    const completionNote = asText(req.body?.completion_note);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(taskId)) return reply.code(400).send({ ok: false, error: 'invalid_task_id' });

    try {
      const taskRes = await supabaseAdmin
        .from('workflow_tasks')
        .select('id,tenant_id,case_id,role_key,title,description,status,priority,due_at,assigned_to,metadata,created_at,completed_at')
        .eq('tenant_id', tenantId)
        .eq('id', taskId)
        .maybeSingle();

      if (taskRes.error) {
        throw new Error(`workflow task read failed: ${taskRes.error.message}`);
      }
      if (!taskRes.data) {
        return reply.code(404).send({ ok: false, error: 'workflow_task_not_found' });
      }

      const metadata = {
        ...(taskRes.data.metadata && typeof taskRes.data.metadata === 'object' ? taskRes.data.metadata : {}),
      };
      if (completionNote) metadata.completion_note = completionNote;

      const updateRes = await supabaseAdmin
        .from('workflow_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          metadata,
        })
        .eq('tenant_id', tenantId)
        .eq('id', taskId)
        .select('id,tenant_id,case_id,role_key,title,description,status,priority,due_at,assigned_to,metadata,created_at,completed_at')
        .single();

      if (updateRes.error) {
        throw new Error(`workflow task complete failed: ${updateRes.error.message}`);
      }

      return reply.send({
        ok: true,
        task: updateRes.data,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, task_id: taskId }, 'ai task complete failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/tasks/list', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const contactId = asText(req.query?.contact_id);
    const status = asText(req.query?.status).toLowerCase();

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (contactId && !isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });

    try {
      let caseIds = null;
      if (contactId) {
        const caseRes = await supabaseAdmin
          .from('workflow_cases')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('contact_id', contactId)
          .limit(500);

        if (caseRes.error) {
          throw new Error(`workflow case list failed: ${caseRes.error.message}`);
        }

        caseIds = (caseRes.data || []).map((row) => row.id).filter(Boolean);
        if (!caseIds.length) {
          return reply.send({ ok: true, items: [] });
        }
      }

      let query = supabaseAdmin
        .from('workflow_tasks')
        .select('id,tenant_id,case_id,role_key,title,description,status,priority,due_at,assigned_to,metadata,created_at,completed_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (caseIds) query = query.in('case_id', caseIds);
      if (status) query = query.eq('status', status);

      const res = await query;

      if (res.error) {
        throw new Error(`workflow task list failed: ${res.error.message}`);
      }

      return reply.send({
        ok: true,
        items: res.data || [],
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai task list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/compliance/consent', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const contactId = asText(req.body?.contact_id);
    const consentType = asText(req.body?.consent_type);
    const consentVersion = asText(req.body?.consent_version);
    const capturedVia = asText(req.body?.captured_via || 'portal').toLowerCase();
    const granted = asBool(req.body?.granted, false);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });
    if (!consentType) return reply.code(400).send({ ok: false, error: 'missing_consent_type' });
    if (!consentVersion) return reply.code(400).send({ ok: false, error: 'missing_consent_version' });

    try {
      const evidence = (req.body?.evidence && typeof req.body.evidence === 'object') ? req.body.evidence : null;

      const insertRes = await supabaseAdmin
        .from('consent_logs')
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          consent_type: consentType,
          consent_version: consentVersion,
          granted,
          captured_via: capturedVia || 'portal',
          captured_by: req.user?.id || null,
          evidence,
        })
        .select('id,tenant_id,contact_id,consent_type,consent_version,granted,captured_via,captured_by,captured_at,evidence')
        .single();

      if (insertRes.error) {
        throw new Error(`consent log insert failed: ${insertRes.error.message}`);
      }

      return reply.send({
        ok: true,
        consent: insertRes.data,
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai consent capture failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/compliance/consents', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const contactId = asText(req.query?.contact_id);
    const consentType = asText(req.query?.consent_type);
    const limit = clampInt(req.query?.limit, 100, 1, 500);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (contactId && !isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });

    try {
      let query = supabaseAdmin
        .from('consent_logs')
        .select('id,tenant_id,contact_id,consent_type,consent_version,granted,captured_via,captured_by,captured_at,evidence')
        .eq('tenant_id', tenantId)
        .order('captured_at', { ascending: false })
        .limit(limit);

      if (contactId) query = query.eq('contact_id', contactId);
      if (consentType) query = query.eq('consent_type', consentType);

      const res = await query;
      if (res.error) throw new Error(`consent log list failed: ${res.error.message}`);

      return reply.send({ ok: true, items: res.data || [] });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai consent list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/funding/submission-event', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const contactId = asText(req.body?.contact_id);
    const lenderName = asText(req.body?.lender_name);
    const actionType = asText(req.body?.action_type).toLowerCase();
    const submittedBy = asText(req.body?.submitted_by || 'client').toLowerCase();
    const notes = asText(req.body?.notes) || null;

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });
    if (!lenderName) return reply.code(400).send({ ok: false, error: 'missing_lender_name' });

    if (!FUNDING_ACTION_TYPES.has(actionType)) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_action_type',
        details: { allowed_action_types: Array.from(FUNDING_ACTION_TYPES) },
      });
    }

    if (!SUBMITTED_BY_TYPES.has(submittedBy)) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_submitted_by',
        details: { allowed_values: Array.from(SUBMITTED_BY_TYPES) },
      });
    }

    if (submittedBy === 'advisor' && !asBool(req.body?.client_device_confirmed, false)) {
      return reply.code(400).send({
        ok: false,
        error: 'client_device_confirmation_required',
        details: {
          message: 'Advisor-assisted submissions require explicit client-device confirmation.',
        },
      });
    }

    try {
      const profile = await getProfile({ tenantId, contactId });
      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'client_profile_not_found' });
      }

      const tier = normalizeTier(profile.membership_tier);
      if (tier !== 'tier3') {
        return reply.code(403).send({ ok: false, error: 'tier_not_allowed', details: { required_tier: 'tier3' } });
      }

      const confirmationMethod = asText(req.body?.confirmation_method).toLowerCase() || null;
      const confirmationMetadata = (req.body?.confirmation_metadata && typeof req.body.confirmation_metadata === 'object')
        ? req.body.confirmation_metadata
        : null;

      const event = await insertFundingEvent({
        tenant_id: tenantId,
        contact_id: contactId,
        lender_name: lenderName,
        action_type: actionType,
        submitted_by: submittedBy,
        notes: buildSubmissionNote({ notes, confirmationMethod, metadata: confirmationMetadata }),
        client_device_confirmed: asBool(req.body?.client_device_confirmed, submittedBy === 'client'),
        confirmation_method: confirmationMethod,
        confirmation_metadata: confirmationMetadata,
        captured_by: req.user?.id || null,
      });

      return reply.send({
        ok: true,
        event,
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai funding event capture failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/funding/submission-events', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const contactId = asText(req.query?.contact_id);
    const actionType = asText(req.query?.action_type).toLowerCase();
    const limit = clampInt(req.query?.limit, 100, 1, 500);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (contactId && !isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });
    if (actionType && !FUNDING_ACTION_TYPES.has(actionType)) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_action_type',
        details: { allowed_action_types: Array.from(FUNDING_ACTION_TYPES) },
      });
    }

    try {
      let query = supabaseAdmin
        .from('funding_application_events')
        .select('id,tenant_id,contact_id,lender_name,action_type,submitted_by,notes,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (contactId) query = query.eq('contact_id', contactId);
      if (actionType) query = query.eq('action_type', actionType);

      const res = await query;
      if (res.error) {
        throw new Error(`funding application event list failed: ${res.error.message}`);
      }

      return reply.send({
        ok: true,
        items: res.data || [],
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai funding event list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/roles', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const membershipTier = asText(req.query?.membership_tier).toLowerCase();

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });

    try {
      const res = await supabaseAdmin
        .from('ai_roles')
        .select('id,tenant_id,key,display_name,tier_access,is_active,created_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('display_name', { ascending: true })
        .limit(500);

      if (res.error) throw new Error(`ai roles list failed: ${res.error.message}`);

      let items = res.data || [];
      if (membershipTier) {
        const tier = normalizeTier(membershipTier);
        items = items.filter((row) => {
          const tierAccess = Array.isArray(row?.tier_access) ? row.tier_access : [];
          if (!tierAccess.length) return true;
          return tierAccess.map((value) => asText(value).toLowerCase()).includes(tier);
        });
      }

      return reply.send({ ok: true, items });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'ai roles list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/roles/upsert', {
    preHandler: [requireApiKey, ownerAdminGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const key = asText(req.body?.key).toLowerCase();
    const displayName = asText(req.body?.display_name);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!key) return reply.code(400).send({ ok: false, error: 'missing_key' });
    if (!/^[a-z0-9_]+$/.test(key)) return reply.code(400).send({ ok: false, error: 'invalid_key_format' });
    if (!displayName) return reply.code(400).send({ ok: false, error: 'missing_display_name' });

    try {
      const tierAccessRaw = Array.isArray(req.body?.tier_access) ? req.body.tier_access : [];
      const tierAccess = Array.from(new Set(
        tierAccessRaw
          .map((value) => asText(value).toLowerCase())
          .filter((value) => ['tier1', 'tier2', 'tier3'].includes(value))
      ));

      const upsertRes = await supabaseAdmin
        .from('ai_roles')
        .upsert({
          tenant_id: tenantId,
          key,
          display_name: displayName,
          tier_access: tierAccess,
          is_active: asBool(req.body?.is_active, true),
        }, { onConflict: 'tenant_id,key' })
        .select('id,tenant_id,key,display_name,tier_access,is_active,created_at')
        .single();

      if (upsertRes.error) throw new Error(`ai role upsert failed: ${upsertRes.error.message}`);

      return reply.send({ ok: true, role: upsertRes.data });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, role_key: key }, 'ai role upsert failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/playbooks', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const roleKey = asText(req.query?.role_key).toLowerCase();
    const membershipTier = asText(req.query?.membership_tier).toLowerCase();
    const activeOnly = asBool(req.query?.active_only, true);
    const limit = clampInt(req.query?.limit, 200, 1, 500);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });

    try {
      let query = supabaseAdmin
        .from('ai_playbooks')
        .select('id,tenant_id,role_key,title,version,prompt_template,compliance_flags,is_active,created_at')
        .eq('tenant_id', tenantId)
        .order('role_key', { ascending: true })
        .order('version', { ascending: false })
        .limit(limit);

      if (roleKey) query = query.eq('role_key', roleKey);
      if (activeOnly) query = query.eq('is_active', true);

      const res = await query;
      if (res.error) throw new Error(`ai playbooks list failed: ${res.error.message}`);

      let items = res.data || [];
      if (membershipTier) {
        const tier = normalizeTier(membershipTier);
        items = items.filter((row) => validateTierRole({ membershipTier: tier, roleKey: row.role_key }));
      }

      return reply.send({ ok: true, items });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, role_key: roleKey }, 'ai playbooks list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/playbooks/upsert', {
    preHandler: [requireApiKey, ownerAdminGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const roleKey = asText(req.body?.role_key).toLowerCase();
    const title = asText(req.body?.title);
    const promptTemplate = asText(req.body?.prompt_template);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!roleKey) return reply.code(400).send({ ok: false, error: 'missing_role_key' });
    if (!title) return reply.code(400).send({ ok: false, error: 'missing_title' });
    if (!promptTemplate) return reply.code(400).send({ ok: false, error: 'missing_prompt_template' });

    try {
      const explicitVersion = asInt(req.body?.version);
      let version = explicitVersion;

      if (version === null || version < 1) {
        const latestRes = await supabaseAdmin
          .from('ai_playbooks')
          .select('version')
          .eq('tenant_id', tenantId)
          .eq('role_key', roleKey)
          .eq('title', title)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestRes.error) {
          throw new Error(`ai playbook latest version lookup failed: ${latestRes.error.message}`);
        }

        version = Math.max(1, Number(latestRes.data?.version || 0) + 1);
      }

      const complianceFlags = (req.body?.compliance_flags && typeof req.body.compliance_flags === 'object')
        ? req.body.compliance_flags
        : {};

      const insertRes = await supabaseAdmin
        .from('ai_playbooks')
        .insert({
          tenant_id: tenantId,
          role_key: roleKey,
          title,
          version,
          prompt_template: promptTemplate,
          compliance_flags: complianceFlags,
          is_active: asBool(req.body?.is_active, true),
        })
        .select('id,tenant_id,role_key,title,version,prompt_template,compliance_flags,is_active,created_at')
        .single();

      if (insertRes.error) throw new Error(`ai playbook upsert failed: ${insertRes.error.message}`);

      return reply.send({
        ok: true,
        playbook: insertRes.data,
        disclaimers: normalizedDisclaimers({ includeInvestment: roleKey === AI_ROLE_KEYS.INVESTMENT_ADVISOR }),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, role_key: roleKey, title }, 'ai playbook upsert failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/funding/checklist-prepare', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const contactId = asText(req.body?.contact_id);
    const lenderName = asText(req.body?.lender_name);
    const notes = asText(req.body?.notes) || null;

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });
    if (!lenderName) return reply.code(400).send({ ok: false, error: 'missing_lender_name' });

    try {
      const profile = await getProfile({ tenantId, contactId });
      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'client_profile_not_found' });
      }

      const tier = normalizeTier(profile.membership_tier);
      if (tier !== 'tier3') {
        return reply.code(403).send({ ok: false, error: 'tier_not_allowed', details: { required_tier: 'tier3' } });
      }

      const checklistItems = Array.isArray(req.body?.checklist_items)
        ? req.body.checklist_items.map((value) => asText(value)).filter(Boolean)
        : [];

      const activeCase = await ensureActiveCaseForContact({
        tenantId,
        contactId,
        phase: 'funding',
        roleKey: AI_ROLE_KEYS.FUNDING_SPECIALIST,
      });

      const taskTitle = `Funding checklist for ${lenderName}`;
      const taskDescription = checklistItems.length > 0
        ? checklistItems.map((item, index) => `${index + 1}. ${item}`).join('\n')
        : 'Prepare lender submission checklist and verify client-device submission readiness.';

      const tasks = await createTasks({
        tenantId,
        caseId: activeCase.id,
        tasks: [
          {
            role_key: AI_ROLE_KEYS.FUNDING_SPECIALIST,
            title: taskTitle,
            description: taskDescription,
            priority: 'high',
            metadata: {
              lender_name: lenderName,
              checklist_items: checklistItems,
            },
          },
        ],
      });

      const event = await insertFundingEvent({
        tenant_id: tenantId,
        contact_id: contactId,
        lender_name: lenderName,
        action_type: 'checklist_prepared',
        submitted_by: 'advisor',
        notes: buildSubmissionNote({
          notes,
          confirmationMethod: null,
          metadata: {
            checklist_count: checklistItems.length,
            task_id: tasks[0]?.id || null,
          },
        }),
        client_device_confirmed: false,
        captured_by: req.user?.id || null,
      });

      return reply.send({
        ok: true,
        case: activeCase,
        task: tasks[0] || null,
        event,
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai funding checklist prepare failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/funding/submission-capture', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const contactId = asText(req.body?.contact_id);
    const lenderName = asText(req.body?.lender_name);
    const confirmationMethod = asText(req.body?.confirmation_method).toLowerCase() || 'client_device';
    const notes = asText(req.body?.notes) || null;
    const clientDeviceConfirmed = asBool(req.body?.client_device_confirmed, false);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (!isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });
    if (!lenderName) return reply.code(400).send({ ok: false, error: 'missing_lender_name' });

    if (!clientDeviceConfirmed) {
      return reply.code(400).send({
        ok: false,
        error: 'client_device_confirmation_required',
        details: {
          message: 'Submission capture requires client_device_confirmed=true to prevent fraud-risk workflows.',
        },
      });
    }

    try {
      const profile = await getProfile({ tenantId, contactId });
      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'client_profile_not_found' });
      }

      const tier = normalizeTier(profile.membership_tier);
      if (tier !== 'tier3') {
        return reply.code(403).send({ ok: false, error: 'tier_not_allowed', details: { required_tier: 'tier3' } });
      }

      const confirmationMetadata = (req.body?.confirmation_metadata && typeof req.body.confirmation_metadata === 'object')
        ? req.body.confirmation_metadata
        : {};

      const event = await insertFundingEvent({
        tenant_id: tenantId,
        contact_id: contactId,
        lender_name: lenderName,
        action_type: 'submitted_confirmation_captured',
        submitted_by: 'client',
        notes: buildSubmissionNote({ notes, confirmationMethod, metadata: confirmationMetadata }),
        client_device_confirmed: true,
        confirmation_method: confirmationMethod,
        confirmation_metadata: confirmationMetadata,
        captured_by: req.user?.id || null,
      });

      return reply.send({
        ok: true,
        event,
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai funding submission capture failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/ai/funding/compliance-summary', {
    preHandler: [requireApiKey, roleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const contactId = asText(req.query?.contact_id);
    const lenderName = asText(req.query?.lender_name);
    const limit = clampInt(req.query?.limit, 200, 1, 500);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (contactId && !isUuid(contactId)) return reply.code(400).send({ ok: false, error: 'invalid_contact_id' });

    try {
      let query = supabaseAdmin
        .from('funding_application_events')
        .select('id,tenant_id,contact_id,lender_name,action_type,submitted_by,notes,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (contactId) query = query.eq('contact_id', contactId);
      if (lenderName) query = query.eq('lender_name', lenderName);

      const eventsRes = await query;
      if (eventsRes.error) {
        throw new Error(`funding compliance summary query failed: ${eventsRes.error.message}`);
      }

      const events = eventsRes.data || [];
      const byAction = events.reduce((acc, item) => {
        const key = asText(item?.action_type) || 'unknown';
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      }, {});

      const byLender = events.reduce((acc, item) => {
        const key = asText(item?.lender_name) || 'unknown';
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      }, {});

      const recentConfirmations = events
        .filter((item) => asText(item?.action_type) === 'submitted_confirmation_captured')
        .slice(0, 20);

      return reply.send({
        ok: true,
        summary: {
          total_events: events.length,
          by_action: byAction,
          by_lender: byLender,
          recent_confirmation_count: recentConfirmations.length,
          latest_confirmation_at: recentConfirmations[0]?.created_at || null,
        },
        recent_events: events.slice(0, 50),
        disclaimers: normalizedDisclaimers(),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, contact_id: contactId }, 'ai funding compliance summary failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/ai/funding/compliance-run', {
    preHandler: [requireApiKey, requireFundingComplianceRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = req.fundingComplianceTenantId || getTenantIdFromRequest(req);
    const limit = clampInt(req.body?.limit, 50, 1, 500);
    const staleMinutes = clampInt(req.body?.stale_minutes, 30, 1, 24 * 60);

    if (!isUuid(tenantId)) {
      return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    }

    const lock = await tryAcquireTenantOutboxLock({ tenantId });
    if (!lock.acquired) {
      if (lock.reason === 'lock_not_acquired') {
        return reply.send({ ok: true, skipped: true, reason: 'lock_not_acquired', tenant_id: tenantId });
      }

      return reply.code(500).send({ ok: false, error: 'lock_unavailable', reason: lock.reason || 'unknown' });
    }

    try {
      const result = await runFundingComplianceBatch({ tenantId, limit, staleMinutes });
      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        stale_minutes: staleMinutes,
        ...result,
      });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    } finally {
      try {
        await releaseTenantOutboxLock({ tenantId });
      } catch (releaseError) {
        req.log.warn({ err: releaseError, tenant_id: tenantId }, 'ai funding compliance lock release failed');
      }
    }
  });
}
