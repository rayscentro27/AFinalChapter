import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Contact } from '../types';
import type { CapitalStepStatus } from '../services/capitalAccessService';
import useCapitalProfile from '../hooks/useCapitalProfile';

interface CapitalProtectionPanelProps {
  contact: Contact;
  onOpenAllocation?: () => void;
}

function prettyStepLabel(stepKey: string): string {
  return stepKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

function stepTone(status: CapitalStepStatus): string {
  if (status === 'completed') return 'text-emerald-600 border-emerald-200 bg-emerald-50';
  if (status === 'in_progress') return 'text-blue-600 border-blue-200 bg-blue-50';
  if (status === 'blocked') return 'text-red-600 border-red-200 bg-red-50';
  return 'text-slate-600 border-slate-200 bg-slate-50';
}

function nextStepStatus(status: CapitalStepStatus): CapitalStepStatus {
  if (status === 'not_started') return 'in_progress';
  if (status === 'in_progress') return 'completed';
  if (status === 'completed') return 'not_started';
  return 'in_progress';
}

const CapitalProtectionPanel: React.FC<CapitalProtectionPanelProps> = ({ contact, onOpenAllocation }) => {
  const { data, loading, saving, error, refresh, reserveDefaults, updateProfileValues, updateStep, setReserveConfirmed } =
    useCapitalProfile(contact.id);

  const [totalFunding, setTotalFunding] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [reserveMonths, setReserveMonths] = useState('6');
  const [recommendedReserve, setRecommendedReserve] = useState('');

  useEffect(() => {
    setTotalFunding(
      reserveDefaults.total_funding_received !== null ? String(reserveDefaults.total_funding_received) : ''
    );
    setMonthlyPayment(
      reserveDefaults.estimated_monthly_payment !== null
        ? String(reserveDefaults.estimated_monthly_payment)
        : ''
    );
    setReserveMonths(String(reserveDefaults.reserve_target_months ?? 6));
    setRecommendedReserve(
      reserveDefaults.recommended_reserve_amount !== null
        ? String(reserveDefaults.recommended_reserve_amount)
        : ''
    );
  }, [
    reserveDefaults.estimated_monthly_payment,
    reserveDefaults.recommended_reserve_amount,
    reserveDefaults.reserve_target_months,
    reserveDefaults.total_funding_received,
  ]);

  const isEligible = Boolean(data?.eligibility.eligible);
  const readiness = data?.readiness;
  const setupSteps = data?.setup_progress ?? [];

  const dominantAction = useMemo(() => {
    if (!isEligible) {
      return {
        title: 'Funding approval required',
        body: 'Capital protection unlocks after approved funding is logged.',
      };
    }
    if (!readiness?.reserve_guidance.reserve_confirmed) {
      return {
        title: 'Confirm reserve target',
        body: 'Reserve confirmation is the dominant next action before allocation opens.',
      };
    }
    if (readiness.context.missing_setup_steps.length > 0) {
      return {
        title: 'Finish setup checklist',
        body: 'Complete reserve-first setup steps to open allocation.',
      };
    }
    return {
      title: 'Open capital allocation',
      body: 'Capital protection is complete. Move into Business Growth path selection.',
    };
  }, [isEligible, readiness?.context.missing_setup_steps.length, readiness?.reserve_guidance.reserve_confirmed]);

  const onSaveProfile = async () => {
    const targetMonths = Number(reserveMonths);
    await updateProfileValues({
      total_funding_received: totalFunding.trim().length > 0 ? Number(totalFunding) : null,
      estimated_monthly_payment: monthlyPayment.trim().length > 0 ? Number(monthlyPayment) : null,
      reserve_target_months: Number.isFinite(targetMonths) ? targetMonths : 6,
      recommended_reserve_amount:
        recommendedReserve.trim().length > 0 ? Number(recommendedReserve) : null,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Post-Funding</div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight mt-2 flex items-center gap-2">
              <ShieldCheck size={24} /> Capital Protection
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-2 max-w-2xl">
              Reserve-first workflow: understand capital, confirm reserve, complete setup, then unlock allocation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            disabled={loading || saving}
            className="rounded-xl bg-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 border border-slate-200 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error ? <div className="mt-4 text-sm text-red-600 font-medium">{error}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Eligibility</div>
            <div className="text-xl font-black text-slate-900 mt-1">{isEligible ? 'Post-Funding' : 'Locked'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Readiness</div>
            <div className="text-xl font-black text-slate-900 mt-1">{readiness?.ready ? 'Complete' : 'In Progress'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reserve Confirmed</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {readiness?.reserve_guidance.reserve_confirmed ? 'Yes' : 'No'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Setup Steps</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {(readiness?.context.completed_setup_steps.length || 0)}/
              {Math.max(
                (readiness?.context.completed_setup_steps.length || 0) +
                  (readiness?.context.missing_setup_steps.length || 0),
                1
              )}
            </div>
          </div>
        </div>
      </div>

      {!isEligible ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50 p-8 text-sm text-slate-700 font-medium flex items-start gap-3">
          <Lock size={18} className="mt-0.5 text-slate-500" />
          <div>
            Capital protection activates after funding approval. Continue the roadmap and log outcomes first.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-4">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Reserve Guidance</div>

              <label className="block">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Funding</div>
                <input
                  type="number"
                  value={totalFunding}
                  onChange={(event) => setTotalFunding(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900"
                  placeholder="0"
                />
              </label>

              <label className="block">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Estimated Monthly Payment</div>
                <input
                  type="number"
                  value={monthlyPayment}
                  onChange={(event) => setMonthlyPayment(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900"
                  placeholder="0"
                />
              </label>

              <label className="block">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Reserve Months Target</div>
                <input
                  type="number"
                  value={reserveMonths}
                  onChange={(event) => setReserveMonths(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900"
                  min={1}
                  max={18}
                />
              </label>

              <label className="block">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Recommended Reserve Amount</div>
                <input
                  type="number"
                  value={recommendedReserve}
                  onChange={(event) => setRecommendedReserve(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900"
                  placeholder="0"
                />
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    void onSaveProfile();
                  }}
                  disabled={saving}
                  className="rounded-xl bg-slate-900 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Reserve Inputs'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void setReserveConfirmed(!Boolean(readiness?.reserve_guidance.reserve_confirmed));
                  }}
                  disabled={saving}
                  className="rounded-xl bg-emerald-600 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {readiness?.reserve_guidance.reserve_confirmed ? 'Mark Reserve Unconfirmed' : 'Confirm Reserve'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Capital Setup Checklist</div>

              <div className="space-y-3">
                {setupSteps.map((step) => (
                  <div key={step.step_key} className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-slate-900">{prettyStepLabel(step.step_key)}</div>
                        <div className="text-xs text-slate-500 font-medium mt-1">
                          Status: <span className="capitalize">{step.status.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${stepTone(step.status)}`}>
                        {step.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void updateStep(step.step_key, nextStepStatus(step.status));
                      }}
                      disabled={saving}
                      className="mt-3 rounded-xl bg-white border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
                    >
                      Advance Step
                    </button>
                  </div>
                ))}
              </div>

              {readiness?.blockers.length ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 font-medium space-y-2">
                  {readiness.blockers.map((blocker) => (
                    <div key={blocker} className="flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5" />
                      <span>{blocker}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 font-medium flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5" />
                  Capital protection blockers are clear.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Dominant Next Action</div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{dominantAction.title}</h3>
            <p className="text-sm text-slate-500 font-medium mt-2">{dominantAction.body}</p>

            {onOpenAllocation ? (
              <button
                type="button"
                onClick={onOpenAllocation}
                disabled={!readiness?.ready}
                className="mt-4 rounded-xl bg-slate-900 text-white px-5 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
              >
                Open Capital Allocation
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

export default CapitalProtectionPanel;
