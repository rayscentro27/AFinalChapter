import React, { useMemo, useState } from 'react';
import { CheckCircle, ClipboardList, Info, Save, ShieldAlert, Target } from 'lucide-react';
import type { Contact } from '../types';
import { computeFundability } from '../services/fundabilityEngine';
import { computeRiskProfile } from '../services/riskProfileEngine';
import { arbitrateRecommendations } from '../services/decisionArbitration';
import { writeAuditLog } from '../services/auditTrail';

interface FundabilityDashboardProps {
  contact: Contact;
}

const bandStyles: Record<string, { ring: string; text: string; track: string }> = {
  Red: { ring: '#ef4444', text: 'text-red-600', track: 'bg-red-50' },
  Amber: { ring: '#f59e0b', text: 'text-amber-600', track: 'bg-amber-50' },
  Blue: { ring: '#3b82f6', text: 'text-blue-600', track: 'bg-blue-50' },
  Emerald: { ring: '#10b981', text: 'text-emerald-600', track: 'bg-emerald-50' },
};

function Gauge({ value, color }: { value: number; color: string }) {
  const size = 170;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="transparent" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-black tracking-tighter text-slate-900">{pct}</div>
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Fundability</div>
      </div>
    </div>
  );
}

const statusPill = (status: string) => {
  if (status === 'Stable') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'Monitor') return 'bg-blue-50 text-blue-700 border-blue-100';
  if (status === 'Needs Optimization') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-red-50 text-red-700 border-red-100';
};

const criHint: Record<string, string> = {
  Build: 'Build signals before accelerating funding velocity.',
  Repair: 'Repair weak points; focus on stability before expansion.',
  Prepare: 'Prepare documentation and tighten execution discipline.',
  Deploy: 'Deploy strategy, but keep guardrails and monitoring active.',
};

const FundabilityDashboard: React.FC<FundabilityDashboardProps> = ({ contact }) => {
  const fund = useMemo(() => computeFundability(contact), [contact]);
  const risk = useMemo(() => computeRiskProfile(contact), [contact]);

  const arbitration = useMemo(() => {
    const recs: any[] = [];

    recs.push({
      agent_name: 'Ghost Hunter',
      tier: 'SalesVelocity',
      recommendation: fund.fundability_score >= 70
        ? 'Sequence applications with guardrails; prioritize clean documentation and stability monitoring.'
        : 'Build signals first; prioritize structure, infrastructure, and utilization stabilization before applications.',
    });

    if (risk.score >= 50) {
      recs.push({
        agent_name: 'Forensic Bot',
        tier: 'ComplianceRisk',
        recommendation: 'Delay new applications until utilization and cash flow stability improve; focus on stabilization protocols first.',
      });
    }

    return arbitrateRecommendations(recs);
  }, [fund.fundability_score, risk.score]);

  const [snapshotStatus, setSnapshotStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [snapshotError, setSnapshotError] = useState<string>('');

  const style = bandStyles[fund.band];
  const canSave = contact.id && contact.id !== 'new';

  const handleSave = async () => {
    if (!canSave) return;
    setSnapshotStatus('saving');
    setSnapshotError('');

    const res = await writeAuditLog({
      tenant_id: contact.id,
      action: 'fundability_snapshot',
      entity_type: 'tenant',
      entity_id: contact.id,
      meta: {
        fundability: fund,
        risk_profile: risk,
        contact_name: contact.name,
        company: contact.company,
      },
    });

    if (res.ok) setSnapshotStatus('saved');
    else {
      setSnapshotStatus('error');
      setSnapshotError(res.error);
    }

    window.setTimeout(() => setSnapshotStatus('idle'), 2500);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
            <Target className="text-slate-900" size={30} /> Fundability Dashboard
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-2xl">
            Educational readiness view for structural, credit, and financial signals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave || snapshotStatus === 'saving'}
            className="bg-slate-950 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            <Save size={16} />
            {snapshotStatus === 'saving'
              ? 'Saving...'
              : snapshotStatus === 'saved'
                ? 'Snapshot Saved'
                : 'Save Snapshot'}
          </button>
        </div>
      </div>

      {snapshotStatus === 'error' ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-medium">
          Snapshot failed: {snapshotError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl" style={{ background: `${style.ring}1A` }}>
                <ShieldAlert size={18} style={{ color: style.ring }} />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Fundability Score</div>
                <div className={`text-sm font-black uppercase tracking-tight ${style.text}`}>{fund.band} Band</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center py-4">
            <Gauge value={fund.fundability_score} color={style.ring} />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-slate-500 mt-0.5" />
              <p className="text-xs text-slate-600 font-medium leading-relaxed">{fund.note}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Capital Readiness Index</div>
              <div className="text-3xl font-black uppercase tracking-tighter text-slate-900 mt-1">{fund.cri}</div>
              <p className="text-sm text-slate-500 font-medium mt-2 max-w-xl">{criHint[fund.cri]}</p>
            </div>

            <div className="w-full md:w-72">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                <span>Build</span>
                <span>Deploy</span>
              </div>
              <div className={`h-3 rounded-full overflow-hidden border border-slate-200 ${style.track}`}>
                <div className="h-full" style={{ width: `${fund.fundability_score}%`, background: style.ring }} />
              </div>
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 text-right">
                {fund.fundability_score}/100
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Signal Breakdown</div>
              <div className="space-y-3">
                {fund.breakdown.map((b) => (
                  <div key={b.category} className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{b.category}</div>
                      <div className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${statusPill(b.status)}`}>
                        {b.status}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black tracking-tighter text-slate-900">
                        {b.score}
                        {b.max > 0 ? <span className="text-slate-400 text-sm">/{b.max}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Active Improvement Tasks</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                {fund.improvement_tasks.length === 0 ? (
                  <div className="flex items-center gap-3 text-emerald-700">
                    <CheckCircle size={18} />
                    <div className="text-sm font-black uppercase tracking-tight">No tasks detected</div>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {fund.improvement_tasks.map((t) => (
                      <li key={t} className="flex items-start gap-3">
                        <ClipboardList size={16} className="text-slate-500 mt-0.5" />
                        <span className="text-sm text-slate-700 font-medium leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Eligibility Band (Educational)</div>
                <div className="mt-2 text-sm font-black text-slate-900 uppercase tracking-tight">{fund.eligibility_band}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 bg-slate-950 text-white rounded-[2.5rem] p-8 shadow-2xl border border-white/5">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Client Risk Profile Engine</div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <div className="text-5xl font-black tracking-tighter">{risk.score}</div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mt-1">Risk Score (0-100)</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black uppercase tracking-tight">{risk.classification}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Stability classification</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {Object.entries(risk.dimensions).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                  {k.replace(/_/g, ' ')}
                </div>
                <div className="text-sm font-black text-white">{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Detected Signals</div>
          {risk.signals.length === 0 ? (
            <div className="text-sm text-slate-600 font-medium">No explicit risk signals detected from current data.</div>
          ) : (
            <ul className="space-y-3">
              {risk.signals.map((s) => (
                <li key={s} className="flex items-start gap-3">
                  <ShieldAlert size={16} className="text-amber-500 mt-0.5" />
                  <span className="text-sm text-slate-700 font-medium leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-slate-500 mt-0.5" />
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                If risk is Elevated/High, strategy velocity should slow: emphasize stabilization, increase scenario difficulty,
                and reinforce constraints.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">AI Employee Decision Arbitration</div>
            <div className="mt-2 text-2xl font-black text-slate-900 uppercase tracking-tight">Decision Arbitration</div>
            <div className="mt-2 text-sm text-slate-600 font-medium max-w-3xl">
              Unified guidance when recommendations conflict. Priority hierarchy: Compliance/Risk, Structural, Strategy, Growth, Sales/Velocity.
            </div>
          </div>
          <div className="text-right">
            <div
              className={
                'inline-flex items-center px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ' +
                (arbitration.conflict_detected
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200')
              }
            >
              {arbitration.conflict_detected ? 'Conflict Detected' : 'Unified'}
            </div>
            <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Consensus: {Math.round(arbitration.consensus_score * 100)}%
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Arbitration Result</div>
            <div className="mt-2 text-lg font-black text-slate-900 uppercase tracking-tight">{arbitration.final_guidance}</div>
            <div className="mt-3 text-xs text-slate-600 font-medium">{arbitration.rationale}</div>
            <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Applied Priority Tier: {arbitration.applied_priority_tier}</div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inputs</div>
            <div className="mt-4 space-y-3">
              {arbitration.recommendations.map((r) => (
                <div key={r.agent_name} className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{r.agent_name}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{r.tier}</div>
                  <div className="mt-2 text-xs text-slate-700 font-medium leading-relaxed">{r.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundabilityDashboard;
