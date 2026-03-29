import React, { useEffect, useMemo, useState } from 'react';
import { PlanCode } from '../../src/billing/types';
import {
  MEMBERSHIP_AGREEMENT_VERSION,
  REFUND_POLICY_VERSION,
} from '../../src/billing/contractConsents';

type UpgradeModalProps = {
  open: boolean;
  loading?: boolean;
  targetPlan: PlanCode | null;
  targetPriceCents: number;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export default function UpgradeModal({
  open,
  loading = false,
  targetPlan,
  targetPriceCents,
  error,
  onClose,
  onConfirm,
}: UpgradeModalProps) {
  const [membershipAgreementAccepted, setMembershipAgreementAccepted] = useState(false);
  const [refundAcknowledged, setRefundAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) {
      setMembershipAgreementAccepted(false);
      setRefundAcknowledged(false);
    }
  }, [open]);

  const canSubmit = useMemo(
    () => membershipAgreementAccepted && refundAcknowledged && !loading,
    [membershipAgreementAccepted, refundAcknowledged, loading]
  );

  if (!open || !targetPlan) return null;

  return (
    <div className="fixed inset-0 z-[210] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black tracking-tight">Upgrade to {targetPlan}</h3>
            <p className="text-sm text-slate-400 mt-1">
              ${Math.round(targetPriceCents / 100)}/month. Educational templates and workflow tools only. Results vary and are never guaranteed.
            </p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1 rounded-lg border border-slate-700 hover:border-slate-500">Close</button>
        </div>

        <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-xs leading-relaxed text-cyan-100">
          <p className="font-bold uppercase tracking-wider mb-2">Membership Agreement Summary</p>
          <p>
            Auto-renew monthly until canceled. Cancel anytime for future periods. No performance-based refunds for credit,
            funding, grant, or timeline outcomes. Limitation of liability applies. Educational use only.
          </p>
        </div>

        <div className="mt-5 space-y-4 text-sm">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={membershipAgreementAccepted}
              onChange={() => setMembershipAgreementAccepted((v) => !v)}
            />
            <span>
              I accept the <a href="/membership-agreement" className="text-cyan-300 hover:text-cyan-200">Membership Agreement</a>
              {' '}(auto-renew, cancel anytime, no guaranteed outcomes, limitation of liability).
              <span className="ml-2 text-xs text-cyan-200">{MEMBERSHIP_AGREEMENT_VERSION}</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={refundAcknowledged}
              onChange={() => setRefundAcknowledged((v) => !v)}
            />
            <span>
              I acknowledge the <a href="/refund-policy" className="text-cyan-300 hover:text-cyan-200">Refund Policy</a>
              {' '}and agree refunds are not performance-based.
              <span className="ml-2 text-xs text-cyan-200">{REFUND_POLICY_VERSION}</span>
            </span>
          </label>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</div> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold">Cancel</button>
          <button
            onClick={() => void onConfirm()}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black uppercase tracking-wider disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Accept and Upgrade'}
          </button>
        </div>
      </div>
    </div>
  );
}
