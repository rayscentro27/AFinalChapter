import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Lock, PieChart, RefreshCw } from 'lucide-react';
import type { Contact } from '../types';
import type { CapitalPath } from '../services/capitalAccessService';
import useCapitalAllocation from '../hooks/useCapitalAllocation';

interface CapitalAllocationPanelProps {
  contact: Contact;
  onOpenProtection?: () => void;
  onOpenSimulator?: () => void;
  onOpenTrading?: () => void;
  onOpenGrants?: () => void;
}

const pathMeta: Record<CapitalPath, { title: string; body: string; tone: string }> = {
  business_growth: {
    title: 'Business Growth',
    body: 'Primary/default path after reserve-first protection is complete.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  trading_education: {
    title: 'Trading Education',
    body: 'Optional and locked in this phase. Educational only.',
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  grant_funding: {
    title: 'Grant Funding',
    body: 'Optional post-funding path for grant research, prep, and submission tracking.',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

const orderedPaths: CapitalPath[] = ['business_growth', 'trading_education', 'grant_funding'];

const CapitalAllocationPanel: React.FC<CapitalAllocationPanelProps> = ({
  contact,
  onOpenProtection,
  onOpenSimulator,
  onOpenTrading,
  onOpenGrants,
}) => {
  const { data, loading, saving, error, refresh, selectPath } = useCapitalAllocation(contact.id);

  const readiness = data?.readiness;
  const allocation = data?.allocation;
  const isEligible = Boolean(data?.eligibility.eligible);

  const dominantAction = useMemo(() => {
    if (!isEligible) {
      return {
        title: 'Funding approval required first',
        body: 'Allocation unlocks only after post-funding eligibility is active.',
      };
    }
    if (!readiness?.ready) {
      return {
        title: 'Complete capital protection',
        body: 'Reserve confirmation and setup checklist must be completed before path selection.',
      };
    }
    if (allocation?.selected_path === 'grant_funding') {
      return {
        title: 'Review grant pipeline',
        body: 'Treat grants as an optional branch: verify fit, prepare evidence, and keep Business Growth as the primary execution path.',
      };
    }
    if (allocation?.selected_path !== 'business_growth') {
      return {
        title: 'Activate Business Growth path',
        body: 'Business Growth remains the primary post-funding path in this phase.',
      };
    }
    return {
      title: 'Execute growth plan',
      body: 'Continue with simulation-first allocation and business growth execution.',
    };
  }, [allocation?.selected_path, isEligible, readiness?.ready]);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Post-Funding</div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight mt-2 flex items-center gap-2">
              <PieChart size={24} /> Capital Allocation
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-2 max-w-2xl">
              Business Growth is primary. Grant Funding is an optional post-funding branch after reserve-first protection is complete. Trading remains educational and gated.
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
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capital Protection</div>
            <div className="text-xl font-black text-slate-900 mt-1">{readiness?.ready ? 'Complete' : 'Blocked'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected Path</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {(allocation?.selected_path || 'not_selected').replace(/_/g, ' ')}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Blockers</div>
            <div className="text-xl font-black text-slate-900 mt-1">{readiness?.blockers.length || 0}</div>
          </div>
        </div>
      </div>

      {!isEligible ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50 p-8 text-sm text-slate-700 font-medium flex items-start gap-3">
          <Lock size={18} className="mt-0.5 text-slate-500" />
          Allocation becomes available after funding is approved and post-funding stage is active.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {orderedPaths.map((path) => {
              const option = allocation?.options.find((row) => row.path === path);
              const isLocked = option?.gated ?? true;
              const isSelected = allocation?.selected_path === path;
              const isPrimary = path === 'business_growth';
              const isGrantPath = path === 'grant_funding';

              return (
                <div key={path} className={`rounded-[2rem] border p-6 ${pathMeta[path].tone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-black tracking-tight">{pathMeta[path].title}</div>
                    {isSelected ? (
                      <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-300 bg-white text-emerald-700">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium mt-3">{pathMeta[path].body}</p>

                  {option?.reason ? (
                    <div className="mt-3 text-xs font-semibold opacity-80">{option.reason}</div>
                  ) : null}

                  {isPrimary ? (
                    <button
                      type="button"
                      onClick={() => {
                        void selectPath('business_growth');
                      }}
                      disabled={isLocked || isSelected || saving}
                      className="mt-4 rounded-xl bg-slate-900 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                    >
                      {isSelected ? 'Business Growth Active' : saving ? 'Saving...' : 'Select Business Growth'}
                    </button>
                  ) : isGrantPath ? (
                    <button
                      type="button"
                      onClick={() => {
                        void selectPath('grant_funding');
                      }}
                      disabled={isLocked || isSelected || saving}
                      className="mt-4 rounded-xl bg-slate-900 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                    >
                      {isSelected ? 'Grant Funding Active' : saving ? 'Saving...' : 'Select Grant Funding'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Locked
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Dominant Next Action</div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{dominantAction.title}</h3>
            <p className="text-sm text-slate-500 font-medium mt-2">{dominantAction.body}</p>

            {readiness?.blockers.length ? (
              <div className="mt-4 space-y-2">
                {readiness.blockers.map((blocker) => (
                  <div key={blocker} className="flex items-start gap-2 text-sm text-amber-700 font-medium">
                    <AlertTriangle size={14} className="mt-0.5" />
                    <span>{blocker}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-2 text-sm text-emerald-700 font-medium">
                <CheckCircle2 size={15} className="mt-0.5" />
                No active blockers in capital allocation stage.
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-5">
              {onOpenProtection ? (
                <button
                  type="button"
                  onClick={onOpenProtection}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700"
                >
                  Open Capital Protection
                </button>
              ) : null}

              {onOpenSimulator ? (
                <button
                  type="button"
                  onClick={onOpenSimulator}
                  disabled={!readiness?.ready}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40"
                >
                  Open Allocation Simulator
                </button>
              ) : null}

              {onOpenTrading ? (
                <button
                  type="button"
                  onClick={onOpenTrading}
                  disabled={!readiness?.ready}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40"
                >
                  Open Trading Module
                </button>
              ) : null}

              {onOpenGrants ? (
                <button
                  type="button"
                  onClick={onOpenGrants}
                  disabled={!readiness?.ready}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40"
                >
                  Open Grants Workflow
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CapitalAllocationPanel;
