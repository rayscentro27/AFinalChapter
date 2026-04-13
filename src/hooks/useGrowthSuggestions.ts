import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { resolveInternalAccess } from './adminAccess';

type GrowthSuggestionType = 'upsell' | 'referral' | 'reengagement';
type SuggestionConfidence = 'low' | 'medium' | 'high';
type SuggestionUrgency = 'low' | 'medium' | 'high';

type ContactRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  client_id: string | null;
  updated_at: string | null;
};

type AuditRow = {
  actor_user_id: string | null;
  action: string | null;
  occurred_at: string;
};

type OutcomeRow = {
  user_id: string | null;
  outcome_status: string | null;
  approved_amount_cents: number | null;
  approval_date: string | null;
  created_at: string;
};

type CommissionRow = {
  user_id: string | null;
  status: string | null;
  commission_amount_cents: number | null;
  created_at: string;
};

export type GrowthSuggestion = {
  id: string;
  tenant_id: string;
  contact_id?: string;
  user_id?: string;
  suggestion_type: GrowthSuggestionType;
  title: string;
  explanation: string;
  confidence: SuggestionConfidence;
  urgency: SuggestionUrgency;
  recommended_action: string;
  created_at: string;
};

const TRACKED_ACTIONS = [
  'first_login',
  'credit_report_uploaded',
  'analysis_viewed',
  'funding_strategy_viewed',
  'funding_readiness_viewed',
  'application_started',
  'application_outcome_logged',
  'referral_prompt_shown',
  'referral_link_copied',
];

function toDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function daysSince(value?: string | null) {
  const dt = toDate(value);
  if (!dt) return null;
  return Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
}

function uniqueKey(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join('-');
}

export default function useGrowthSuggestions(tenantId?: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<GrowthSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setItems([]);
      return;
    }
    if (!user?.id) {
      setItems([]);
      return;
    }

    const authorized = await resolveInternalAccess(user?.id, user?.role);
    if (!authorized) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const since = new Date();
      since.setDate(since.getDate() - 45);
      const sinceIso = since.toISOString();

      const [contactRes, auditRes, outcomesRes, commissionRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id,display_name,email,client_id,updated_at')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(400),
        supabase
          .from('audit_events')
          .select('actor_user_id,action,occurred_at')
          .eq('tenant_id', tenantId)
          .eq('entity_type', 'client_journey')
          .in('action', TRACKED_ACTIONS)
          .gte('occurred_at', sinceIso)
          .order('occurred_at', { ascending: false })
          .limit(5000),
        supabase
          .from('funding_outcomes')
          .select('user_id,outcome_status,approved_amount_cents,approval_date,created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('commission_events')
          .select('user_id,status,commission_amount_cents,created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);

      if (contactRes.error) throw new Error(contactRes.error.message || 'Unable to load contacts.');
      if (auditRes.error) throw new Error(auditRes.error.message || 'Unable to load audit events.');
      if (outcomesRes.error) throw new Error(outcomesRes.error.message || 'Unable to load funding outcomes.');
      if (commissionRes.error) throw new Error(commissionRes.error.message || 'Unable to load commission events.');

      const contacts = (contactRes.data || []) as ContactRow[];
      const auditRows = (auditRes.data || []) as AuditRow[];
      const outcomes = (outcomesRes.data || []) as OutcomeRow[];
      const commissions = (commissionRes.data || []) as CommissionRow[];

      const contactByClientId = new Map<string, ContactRow>();
      contacts.forEach((row) => {
        if (row.client_id) contactByClientId.set(String(row.client_id), row);
      });

      const userEvents = new Map<string, Record<string, string>>();
      const userLastEvent = new Map<string, string>();
      auditRows.forEach((row) => {
        if (!row.actor_user_id) return;
        const userId = String(row.actor_user_id);
        const action = String(row.action || '');
        const existing = userEvents.get(userId) || {};
        if (!existing[action]) existing[action] = row.occurred_at;
        userEvents.set(userId, existing);
        if (!userLastEvent.get(userId) || row.occurred_at > String(userLastEvent.get(userId))) {
          userLastEvent.set(userId, row.occurred_at);
        }
      });

      const approvedOutcomesByUser = new Map<string, OutcomeRow[]>();
      outcomes.forEach((row) => {
        if (!row.user_id) return;
        const userId = String(row.user_id);
        if (String(row.outcome_status || '').toLowerCase() !== 'approved') return;
        const list = approvedOutcomesByUser.get(userId) || [];
        list.push(row);
        approvedOutcomesByUser.set(userId, list);
      });

      const commissionPaidByUser = new Map<string, number>();
      commissions.forEach((row) => {
        if (!row.user_id) return;
        if (String(row.status || '') !== 'paid') return;
        const userId = String(row.user_id);
        commissionPaidByUser.set(userId, (commissionPaidByUser.get(userId) || 0) + Number(row.commission_amount_cents || 0));
      });

      const suggestions: GrowthSuggestion[] = [];
      const nowIso = new Date().toISOString();

      userEvents.forEach((events, userId) => {
        const lastAt = userLastEvent.get(userId);
        const daysIdle = daysSince(lastAt);
        const contact = contactByClientId.get(userId);
        const contactId = contact?.id;

        const hasCredit = Boolean(events.credit_report_uploaded);
        const hasAnalysis = Boolean(events.analysis_viewed);
        const hasStrategy = Boolean(events.funding_strategy_viewed);
        const hasApplication = Boolean(events.application_started);
        const hasOutcome = Boolean(events.application_outcome_logged);
        const promptShown = Boolean(events.referral_prompt_shown);
        const linkCopied = Boolean(events.referral_link_copied);

        if (!hasCredit && events.first_login && (daysIdle ?? 0) >= 7) {
          suggestions.push({
            id: uniqueKey(['reengage', userId, events.first_login]),
            tenant_id: tenantId,
            contact_id: contactId,
            user_id: userId,
            suggestion_type: 'reengagement',
            title: 'Re-engage stalled onboarding client',
            explanation: 'Client completed first login but has not uploaded a credit report. Outreach now can restart the funding journey.',
            confidence: 'high',
            urgency: (daysIdle ?? 0) >= 14 ? 'high' : 'medium',
            recommended_action: 'Send a personalized nudge to complete credit upload and reopen the funding readiness path.',
            created_at: nowIso,
          });
        }

        if (hasStrategy && !hasApplication && (daysIdle ?? 0) >= 5) {
          suggestions.push({
            id: uniqueKey(['upsell', userId, events.funding_strategy_viewed]),
            tenant_id: tenantId,
            contact_id: contactId,
            user_id: userId,
            suggestion_type: 'upsell',
            title: 'Convert strategy review into execution',
            explanation: 'Funding strategy is viewed but no application was started. Offer the execution path or premium support to move forward.',
            confidence: 'medium',
            urgency: (daysIdle ?? 0) >= 14 ? 'high' : 'medium',
            recommended_action: 'Offer a funding execution session and highlight the next lender-ready action list.',
            created_at: nowIso,
          });
        }

        if (promptShown && !linkCopied && (daysIdle ?? 0) >= 2) {
          suggestions.push({
            id: uniqueKey(['referral', userId, events.referral_prompt_shown]),
            tenant_id: tenantId,
            contact_id: contactId,
            user_id: userId,
            suggestion_type: 'referral',
            title: 'Referral prompt needs follow-up',
            explanation: 'Client saw the referral prompt but did not copy the link. A short follow-up could unlock the referral loop.',
            confidence: 'medium',
            urgency: 'low',
            recommended_action: 'Send a short reminder to copy the referral link after their next milestone.',
            created_at: nowIso,
          });
        }

        const approvedOutcomes = approvedOutcomesByUser.get(userId) || [];
        const highValueOutcome = approvedOutcomes.find((row) => Number(row.approved_amount_cents || 0) >= 2500000);
        if (highValueOutcome && !linkCopied) {
          suggestions.push({
            id: uniqueKey(['referral', userId, highValueOutcome.created_at]),
            tenant_id: tenantId,
            contact_id: contactId,
            user_id: userId,
            suggestion_type: 'referral',
            title: 'High-value approval ready for referral ask',
            explanation: 'Client secured a meaningful approval and is a strong candidate for a referral ask tied to their win.',
            confidence: 'high',
            urgency: 'medium',
            recommended_action: 'Ask for a referral and remind them of the invite reward loop after the approval moment.',
            created_at: nowIso,
          });
        }

        if (hasApplication && !hasOutcome && (daysIdle ?? 0) >= 10) {
          suggestions.push({
            id: uniqueKey(['upsell', userId, events.application_started]),
            tenant_id: tenantId,
            contact_id: contactId,
            user_id: userId,
            suggestion_type: 'upsell',
            title: 'Application in progress without outcome',
            explanation: 'A funding application has started but no outcome was logged. Offer escalation support or additional prep.',
            confidence: 'medium',
            urgency: (daysIdle ?? 0) >= 20 ? 'high' : 'medium',
            recommended_action: 'Schedule a check-in and offer upgraded support for documentation and lender follow-through.',
            created_at: nowIso,
          });
        }
      });

      if (suggestions.length === 0 && contacts.length > 0) {
        const fallbackContact = contacts[0];
        suggestions.push({
          id: uniqueKey(['reengage', fallbackContact.id, nowIso]),
          tenant_id: tenantId,
          contact_id: fallbackContact.id,
          suggestion_type: 'reengagement',
          title: 'Re-engage first inactive client',
          explanation: 'No recent journey signals were found. Start with the most recently updated contact.',
          confidence: 'low',
          urgency: 'low',
          recommended_action: 'Send a general check-in and request the next required upload to restart progress.',
          created_at: nowIso,
        });
      }

      const uniqueById = new Map<string, GrowthSuggestion>();
      suggestions.forEach((item) => {
        uniqueById.set(item.id, item);
      });

      setItems(Array.from(uniqueById.values()));
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load growth suggestions.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, user?.id, user?.role]);

  useEffect(() => {
    if (!tenantId) return;
    void refresh();
  }, [tenantId, refresh]);

  return useMemo(() => ({
    items,
    loading,
    error,
    refresh,
  }), [items, loading, error, refresh]);
}
