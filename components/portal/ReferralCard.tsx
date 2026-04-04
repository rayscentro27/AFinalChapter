import React, { useMemo, useState } from 'react';
import { Copy, Gift, Sparkles, Users } from 'lucide-react';
import EarningsDashboard from './EarningsDashboard';
import ReferralProgress from './ReferralProgress';

type ReferralCardProps = {
  unlocked: boolean;
  triggerLabel: string;
  referralLink: string;
  totalClicks: number;
  totalSignups: number;
  fundedReferrals: number;
  activeReferrals: number;
  commissionPending: number;
  commissionPaid: number;
  estimatedEarnings: number;
  level: string;
  progressPercent: number;
  nextTierLabel: string;
  loading?: boolean;
  error?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function ReferralCard(props: ReferralCardProps) {
  const [copied, setCopied] = useState(false);
  const inviteReason = useMemo(() => {
    if (props.fundedReferrals > 0) return 'You already proved the workflow works. Invite others while momentum is high.';
    if (props.totalSignups > 0) return 'Your referral link is already moving. Keep sharing after each progress win.';
    return 'Invite friends after a progress win so the referral loop feels earned, not random.';
  }, [props.fundedReferrals, props.totalSignups]);

  if (!props.unlocked) {
    return null;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-[radial-gradient(circle_at_top_left,rgba(206,225,255,0.45),transparent_38%),linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Invite & earn</p>
          <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Referral Rewards Unlocked</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">
            Share Nexus after a real progress moment. Referral earnings are shown as a 2% educational reward loop, not a payout engine.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE7F8] bg-white px-4 py-2 text-sm text-[#61769D]">
          <Gift className="h-4 w-4 text-[#46A2E7]" />
          <span className="font-black text-[#17233D]">{props.triggerLabel}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.7rem] border border-[#DAE6FB] bg-white p-5 shadow-[0_18px_40px_rgba(78,111,212,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Your referral link</p>
              <p className="mt-3 break-all rounded-[1rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3 text-sm font-medium text-[#29417E]">
                {props.referralLink}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-[1rem] bg-[linear-gradient(90deg,#3A67E6_0%,#4EC2F3_100%)] px-4 py-3 text-sm font-black text-white shadow-[0_14px_32px_rgba(76,125,239,0.22)]"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Estimated earnings</p>
              <p className="mt-2 text-[1.5rem] font-black tracking-tight text-[#17233D]">{formatCurrency(props.estimatedEarnings)}</p>
            </div>
            <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Clicks</p>
              <p className="mt-2 text-[1.5rem] font-black tracking-tight text-[#17233D]">{props.totalClicks}</p>
            </div>
            <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Funded referrals</p>
              <p className="mt-2 text-[1.5rem] font-black tracking-tight text-[#17233D]">{props.fundedReferrals}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[1.35rem] border border-[#E4ECF8] bg-[linear-gradient(180deg,#FFFFFF_0%,#F7FBFF_100%)] p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#46A2E7]" />
              <p className="text-sm font-black tracking-tight text-[#17233D]">Why show this now?</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#61769D]">{inviteReason}</p>
            <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">
              Next step: copy your link and share after an estimate, approval, or strategy win
            </p>
          </div>
        </article>

        <div className="space-y-4">
          <ReferralProgress
            level={props.level}
            progressPercent={props.progressPercent}
            nextTierLabel={props.nextTierLabel}
          />
          <article className="rounded-[1.35rem] border border-[#E4ECF8] bg-white p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#4677E6]" />
              <p className="text-sm font-black tracking-tight text-[#17233D]">Reward loop</p>
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-[#61769D]">
              <p>• Share your link after a real milestone.</p>
              <p>• Referred users who join the journey count toward your progress.</p>
              <p>• Earnings stay visible as educational referral tracking, not a payout processor.</p>
            </div>
            {props.loading ? <p className="mt-3 text-sm text-[#61769D]">Loading earnings context…</p> : null}
            {props.error ? <p className="mt-3 text-sm text-[#C75873]">{props.error}</p> : null}
          </article>
        </div>
      </div>

      <div className="mt-6">
        <EarningsDashboard
          totalSignups={props.totalSignups}
          fundedReferrals={props.fundedReferrals}
          activeReferrals={props.activeReferrals}
          commissionPending={props.commissionPending}
          commissionPaid={props.commissionPaid}
        />
      </div>
    </section>
  );
}
