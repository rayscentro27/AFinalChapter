import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { requireStaffUser, getBearerToken } from './_shared/staff_auth';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { buildExecutiveCommandCenterPayload } from './_shared/admin_command_center';
import {
  createEmailOutboxDraft,
  getEmailPolicy,
  getEmailRuleByCategory,
  getEmailTemplate,
} from './_shared/email_policy';
import { z as zod } from 'zod';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional().default(24),
  limit: z.coerce.number().int().min(3).max(20).optional().default(6),
  status: z.enum(['draft', 'queued']).optional(),
});

const STAFF_ROLES = new Set(['owner', 'super_admin', 'admin', 'supervisor', 'agent', 'sales', 'salesperson']);
const INTERNAL_API_KEY = String(process.env.INTERNAL_API_KEY || '').trim();
const INTERNAL_KEY_HEADER = 'x-internal-api-key';

const InternalBodySchema = BodySchema.extend({
  mode: zod.literal('internal').optional().default('internal'),
});

type CountResult = { count: number | null; error?: any };

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const internalKey = Object.entries(event.headers || {})
      .find(([k]) => k.toLowerCase() === INTERNAL_KEY_HEADER)?.[1] || '';

    const isInternal = INTERNAL_API_KEY && internalKey && String(internalKey).trim() === INTERNAL_API_KEY;
    const body = (isInternal ? InternalBodySchema : BodySchema).parse(JSON.parse(event.body || '{}'));

    let actorUserId: string | null = null;
    if (!isInternal) {
      const actor = await requireStaffUser(event);
      actorUserId = actor.userId;
    }

    const admin = getAdminSupabaseClient();
    const tenantId = isInternal
      ? await resolveInternalTenant(admin, body.tenant_id || null)
      : await resolveStaffTenant(admin, actorUserId, body.tenant_id || null);

    const snapshot = await buildExecutiveCommandCenterPayload(admin as any, event, {
      tenantId,
      hours: body.hours,
      limit: body.limit,
    });

    const [
      inboxNew,
      inboxActive,
      inboxWaiting,
      inboxQualified,
      inboxClosed,
      portalThreads,
    ] = await Promise.all([
      countConversations(admin, tenantId, { thread_status: 'new' }),
      countConversations(admin, tenantId, { thread_status: 'active' }),
      countConversations(admin, tenantId, { thread_status: 'waiting' }),
      countQualifiedLeads(admin, tenantId),
      countConversations(admin, tenantId, { thread_status: 'closed' }),
      countConversations(admin, tenantId, { channel_type: 'nexus_chat' }),
    ]);

    const reviewNeedsAttention = sumReviewCounts(snapshot.reviewWorkload || []);
    const criticalIssues = sumSystemIssues(snapshot.systemHealth || [], 'danger');
    const warningIssues = sumSystemIssues(snapshot.systemHealth || [], 'warning');

    const overallStatus = deriveOverallStatus(snapshot, criticalIssues);
    const priorities = buildPriorityList(snapshot);

    const template = await getEmailTemplate(admin as any, 'daily_founder_summary');
    const aliasRule = await getEmailRuleByCategory(admin as any, 'report_digest');
    const founderPolicy = await getEmailPolicy(admin as any, 'founder_direct_email');
    const defaultDestination = await getEmailPolicy(admin as any, 'default_destination_email');

    const toEmail = normalizeEmail(
      asText(founderPolicy?.policy_value_json)
      || asText(defaultDestination?.policy_value_json)
      || aliasRule?.destination_email
      || 'goclearonline@gmail.com'
    );
    const fromAlias = normalizeEmail(aliasRule?.alias_email || 'reports@goclearonline.cc');

    const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
    const summaryBody = buildSummaryBody({
      overallStatus,
      inbox: {
        newCount: inboxNew.count ?? 0,
        activeCount: inboxActive.count ?? 0,
        waitingCount: inboxWaiting.count ?? 0,
        qualifiedCount: inboxQualified.count ?? 0,
        closedCount: inboxClosed.count ?? 0,
      },
      portalThreads: portalThreads.count ?? 0,
      reviewNeedsAttention,
      criticalIssues,
      warningIssues,
      priorities,
      dependencyNotes: snapshot.dependencyNotes || [],
    });

    const subjectTemplate = template?.subject_template || 'Nexus Daily Founder Summary — {{date}}';
    const bodyTemplate = template?.body_template || defaultBodyTemplate();

    const subject = renderTemplate(subjectTemplate, {
      date: dateLabel,
      summary: summaryBody,
    });

    const bodyText = renderTemplate(bodyTemplate, {
      date: dateLabel,
      summary: summaryBody,
      overall_status: overallStatus,
      inbox_snapshot: formatInboxSnapshot(inboxNew, inboxActive, inboxWaiting, inboxQualified, inboxClosed),
      portal_chat_snapshot: `Active portal threads: ${portalThreads.count ?? 0}`,
      content_review_queue: `Needs review: ${reviewNeedsAttention}`,
      alerts_issues: formatAlerts(criticalIssues, warningIssues),
      priorities: priorities.length ? priorities.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No priorities flagged.',
    });

    const draft = await createEmailOutboxDraft(admin as any, {
      tenantId,
      toEmail,
      fromAlias,
      category: 'report_digest',
      subject,
      body: bodyText,
      createdBy: actorUserId || null,
      requiresReview: true,
      status: body.status || 'draft',
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      outbox_id: draft.id,
      status: draft.status,
      to_email: draft.to_email,
      from_alias: draft.from_alias,
      subject: draft.subject,
      requires_review: draft.requires_review,
      summary: {
        overall_status: overallStatus,
        inbox: {
          new: inboxNew.count ?? 0,
          active: inboxActive.count ?? 0,
          waiting: inboxWaiting.count ?? 0,
          qualified: inboxQualified.count ?? 0,
          closed: inboxClosed.count ?? 0,
        },
        portal_threads: portalThreads.count ?? 0,
        review_needs_attention: reviewNeedsAttention,
        critical_issues: criticalIssues,
        warning_issues: warningIssues,
        priorities,
      },
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(e?.message || 'bad_request') });
  }
};

async function resolveInternalTenant(admin: any, requestedTenantId: string | null): Promise<string> {
  if (requestedTenantId) return requestedTenantId;

  const { data, error } = await admin
    .from('tenants')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve tenant: ${error.message}`);
  if (!data?.id) throw statusError(400, 'tenant_required');
  return data.id;
}

async function resolveStaffTenant(admin: any, userId: string, requestedTenantId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('tenant_memberships')
    .select('tenant_id, role')
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to resolve memberships: ${error.message}`);

  const rows = (data || []) as Array<{ tenant_id: string; role: string | null }>;
  const allowedTenantIds = Array.from(
    new Set(
      rows
        .filter((row) => STAFF_ROLES.has(String(row.role || '').toLowerCase()))
        .map((row) => String(row.tenant_id || ''))
        .filter(Boolean)
    )
  );

  if (!allowedTenantIds.length) throw statusError(403, 'staff_tenant_membership_required');

  if (requestedTenantId) {
    if (!allowedTenantIds.includes(requestedTenantId)) throw statusError(403, 'requested_tenant_not_accessible');
    return requestedTenantId;
  }

  if (allowedTenantIds.length > 1) throw statusError(400, 'multiple_tenants_provide_tenant_id');
  return allowedTenantIds[0];
}

async function countConversations(
  admin: any,
  tenantId: string,
  filters: { thread_status?: string; channel_type?: string }
): Promise<CountResult> {
  let query = admin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (filters.thread_status) query = query.eq('thread_status', filters.thread_status);
  if (filters.channel_type) query = query.eq('channel_type', filters.channel_type);

  const { count, error } = await query;
  if (error) return { count: 0, error };
  return { count: count ?? 0 };
}

async function countQualifiedLeads(admin: any, tenantId: string): Promise<CountResult> {
  const { count, error } = await admin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .or('thread_status.eq.qualified,workflow_thread_type.eq.lead');

  if (error) return { count: 0, error };
  return { count: count ?? 0 };
}

function sumReviewCounts(rows: Array<{ label: string; count: number }>): number {
  return rows
    .filter((row) => /pending|stale|unpublished/i.test(String(row.label || '')))
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
}

function sumSystemIssues(rows: Array<{ label: string; count: number; tone?: string }>, tone: string): number {
  return rows
    .filter((row) => String(row.tone || '').toLowerCase() === tone)
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
}

function deriveOverallStatus(snapshot: any, criticalIssues: number): string {
  if (criticalIssues > 0 || Number(snapshot?.escalationSummary?.escalated || 0) > 0) return 'Blocked';
  if (Number(snapshot?.escalationSummary?.at_risk || 0) > 0 || Number(snapshot?.escalationSummary?.pending_reviews || 0) > 0) return 'Warning';
  return 'Ready';
}

function buildPriorityList(snapshot: any): string[] {
  const blockers = Array.isArray(snapshot?.commonBlockers) ? snapshot.commonBlockers : [];
  const priorities = blockers
    .filter((row: any) => row?.label)
    .map((row: any) => `${row.label} (${row.count || 0})`)
    .slice(0, 3);

  if (!priorities.length && Number(snapshot?.escalationSummary?.at_risk || 0) > 0) {
    priorities.push('Review at-risk client escalations');
  }

  return priorities;
}

function buildSummaryBody(input: {
  overallStatus: string;
  inbox: { newCount: number; activeCount: number; waitingCount: number; qualifiedCount: number; closedCount: number };
  portalThreads: number;
  reviewNeedsAttention: number;
  criticalIssues: number;
  warningIssues: number;
  priorities: string[];
  dependencyNotes: string[];
}): string {
  return [
    'Overall Status',
    `- ${input.overallStatus}`,
    '',
    'Inbox Snapshot',
    `- New conversations: ${input.inbox.newCount}`,
    `- Active conversations: ${input.inbox.activeCount}`,
    `- Waiting conversations: ${input.inbox.waitingCount}`,
    `- Qualified leads: ${input.inbox.qualifiedCount}`,
    `- Closed conversations: ${input.inbox.closedCount}`,
    '',
    'Portal Chat Snapshot',
    `- Active portal threads: ${input.portalThreads}`,
    '',
    'Content Review Queue',
    `- Needs review: ${input.reviewNeedsAttention}`,
    '',
    'Alerts / Issues',
    `- Critical issues: ${input.criticalIssues}`,
    `- Warnings: ${input.warningIssues}`,
    '',
    'Recommended Priorities',
    ...(input.priorities.length ? input.priorities.map((item, idx) => `${idx + 1}. ${item}`) : ['1. No priorities flagged.']),
    '',
    input.dependencyNotes.length ? 'Notes' : null,
    ...input.dependencyNotes.map((note) => `- ${note}`),
  ].filter(Boolean).join('\n');
}

function formatInboxSnapshot(
  inboxNew: CountResult,
  inboxActive: CountResult,
  inboxWaiting: CountResult,
  inboxQualified: CountResult,
  inboxClosed: CountResult
): string {
  return [
    `New: ${inboxNew.count ?? 0}`,
    `Active: ${inboxActive.count ?? 0}`,
    `Waiting: ${inboxWaiting.count ?? 0}`,
    `Qualified: ${inboxQualified.count ?? 0}`,
    `Closed: ${inboxClosed.count ?? 0}`,
  ].join('\n');
}

function formatAlerts(critical: number, warning: number): string {
  if (critical === 0 && warning === 0) return 'No active issues.';
  return [
    `Critical issues: ${critical}`,
    `Warnings: ${warning}`,
  ].join('\n');
}

function defaultBodyTemplate(): string {
  return [
    'Nexus Daily Founder Summary — {{date}}',
    '',
    '{{summary}}',
    '',
    '---',
    'Generated by Nexus. Internal use only.',
  ].join('\n');
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let output = String(template || '');
  Object.entries(values).forEach(([key, value]) => {
    const safeValue = String(value ?? '');
    output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), safeValue);
  });
  return output;
}

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function statusError(statusCode: number, message: string) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
