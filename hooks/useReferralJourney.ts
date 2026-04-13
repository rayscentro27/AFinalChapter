import { useEffect, useMemo, useState } from 'react';
import { Contact } from '../types';
import { listCommissionEventsForUser } from '../src/services/commissionLedgerService';

type ReferralJourneyState = {
  referralLink: string;
  totalClicks: number;
  totalSignups: number;
  activeReferrals: number;
  fundedReferrals: number;
  commissionPending: number;
  commissionPaid: number;
  estimatedEarnings: number;
  level: 'Starter' | 'Builder' | 'Connector' | 'Partner';
  progressPercent: number;
  nextTierLabel: string;
  promptUnlocked: boolean;
  triggerLabel: string;
  leads: Array<{
    id: string;
    name: string;
    date: string;
    status: string;
    commission: number;
  }>;
};

function deriveLevel(totalSignups: number): Pick<ReferralJourneyState, 'level' | 'progressPercent' | 'nextTierLabel'> {
  if (totalSignups >= 12) {
    return { level: 'Partner', progressPercent: 100, nextTierLabel: 'Top tier reached' };
  }
  if (totalSignups >= 6) {
    return {
      level: 'Connector',
      progressPercent: Math.min(100, Math.round(((totalSignups - 6) / 6) * 100)),
      nextTierLabel: `${12 - totalSignups} more referrals to reach Partner`,
    };
  }
  if (totalSignups >= 3) {
    return {
      level: 'Builder',
      progressPercent: Math.min(100, Math.round(((totalSignups - 3) / 3) * 100)),
      nextTierLabel: `${6 - totalSignups} more referrals to reach Connector`,
    };
  }
  return {
    level: 'Starter',
    progressPercent: Math.min(100, Math.round((totalSignups / 3) * 100)),
    nextTierLabel: `${3 - totalSignups} more referrals to reach Builder`,
  };
}

export default function useReferralJourney(input: {
  contact: Contact;
  userId?: string;
  promptUnlocked: boolean;
}) {
  const [commissionPendingFromLedger, setCommissionPendingFromLedger] = useState(0);
  const [commissionPaidFromLedger, setCommissionPaidFromLedger] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!input.userId) return;
      setLoading(true);
      setError('');
      try {
        const rows = await listCommissionEventsForUser(input.userId);
        if (!active) return;
        const pending = rows
          .filter((row) => row.status === 'estimated' || row.status === 'invoiced')
          .reduce((sum, row) => sum + Number(row.commission_amount_cents || 0), 0);
        const paid = rows
          .filter((row) => row.status === 'paid')
          .reduce((sum, row) => sum + Number(row.commission_amount_cents || 0), 0);
        setCommissionPendingFromLedger(Math.round(pending / 100));
        setCommissionPaidFromLedger(Math.round(paid / 100));
      } catch (err: any) {
        if (!active) return;
        setError(String(err?.message || 'Unable to load referral earnings.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [input.userId]);

  const data = useMemo<ReferralJourneyState>(() => {
    const fallback = input.contact.referralData || {
      totalClicks: 0,
      totalSignups: 0,
      commissionPending: 0,
      commissionPaid: 0,
      referralLink: `https://goclearonline.cc/signup?ref=${input.contact.id}`,
      leads: [],
    };

    const totalSignups = Number(fallback.totalSignups || 0);
    const totalClicks = Number(fallback.totalClicks || 0);
    const fundedReferrals = (fallback.leads || []).filter((lead) => String(lead.status || '').toLowerCase() === 'funded').length;
    const activeReferrals = (fallback.leads || []).filter((lead) => {
      const status = String(lead.status || '').toLowerCase();
      return status && status !== 'funded' && status !== 'closed';
    }).length;
    const earnedFromReferralData = Number(fallback.commissionPaid || 0) + Number(fallback.commissionPending || 0);
    const earnedFromLedger = commissionPaidFromLedger + commissionPendingFromLedger;
    const estimatedEarnings = Math.max(earnedFromReferralData, earnedFromLedger);
    const commissionPaid = Math.max(Number(fallback.commissionPaid || 0), commissionPaidFromLedger);
    const commissionPending = Math.max(Number(fallback.commissionPending || 0), commissionPendingFromLedger);
    const levelData = deriveLevel(totalSignups);

    return {
      referralLink: fallback.referralLink || `https://goclearonline.cc/signup?ref=${input.contact.id}`,
      totalClicks,
      totalSignups,
      activeReferrals,
      fundedReferrals,
      commissionPending,
      commissionPaid,
      estimatedEarnings,
      level: levelData.level,
      progressPercent: levelData.progressPercent,
      nextTierLabel: levelData.nextTierLabel,
      promptUnlocked: input.promptUnlocked,
      triggerLabel: input.promptUnlocked
        ? fundedReferrals > 0
          ? 'Unlocked after your first funding win'
          : 'Unlocked after your funding estimate appeared'
        : 'Locked until estimate or approval',
      leads: fallback.leads || [],
    };
  }, [commissionPaidFromLedger, commissionPendingFromLedger, input.contact, input.promptUnlocked]);

  return {
    data,
    loading,
    error,
  };
}
