import React, { useEffect, useState } from 'react';
import { fetchIntegrationReadiness, fetchIntegrationSummary } from '../services/integrationManager';
import { fintechShell } from './portal/fintechStyles';
import { ShieldCheck, Rocket, Layers, BarChart3, Workflow, ArrowRight } from 'lucide-react';
import { AiEmployeeBadge } from './AiEmployeeBadge';

/**
 * Nexus Founder Panel: executive review layer for the "Nexus Founder" AI persona.
 * Surfaces readiness, blockers, and AI-prepared next actions for review.
 */
const founderTips = [
  'Eliminate low-value work before scaling.',
  'Automate repeatable tasks for leverage.',
  'Delegate by role, not by task.',
  'Reinvest founder time into acquisition and strategy.',
  'Enforce system-first recommendations before headcount growth.'
];

const readinessChecklist = [
  'Business entity registered and in good standing',
  'Domain email and business phone set up',
  'Website and online presence live',
  'Business bank account connected',
  'EIN and compliance docs ready'
];

function openWorkforceCenter() {
  window.history.pushState({}, '', '/admin/ai-command-center');
  window.location.hash = 'admin_super_admin_command_center';
}

export default function FounderPanel() {
  const [readiness, setReadiness] = useState<any>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [r, s] = await Promise.all([
          fetchIntegrationReadiness(),
          fetchIntegrationSummary()
        ]);
        setReadiness(r);
        setSummary(s.summary || []);
        setError('');
      } catch (e) {
        setError('Failed to load integration status');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-10 px-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-blue-900 mb-2 flex items-center gap-2">
          <AiEmployeeBadge employee="Nexus Founder" size={40} />
        </h1>
        <p className="text-slate-600 text-lg">Founder briefing layer: review the AI summary, blockers, approvals, and next actions.</p>
      </div>
      <div className="mb-8 rounded-2xl border border-blue-100 bg-white p-5 shadow-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-blue-700">AI Employees</div>
            <div className="mt-2 text-lg font-black text-slate-900">Open the employee command center</div>
            <p className="mt-2 text-sm text-slate-600">Review named employees, runtime services, recent reports, and the dependencies affecting the workforce.</p>
          </div>
          <button
            type="button"
            onClick={openWorkforceCenter}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white"
          >
            Open Command Center <ArrowRight size={14} />
          </button>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          <Workflow size={12} /> Review-first, not debug-first
        </div>
      </div>
      {loading ? (
        <div className="text-slate-500">Loading integration status...</div>
      ) : error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className={`${fintechShell} p-6 rounded-2xl border border-blue-100 bg-white shadow-md`}>
              <h2 className="text-lg font-bold text-blue-700 mb-3 flex items-center gap-2"><ShieldCheck /> Launch Readiness</h2>
              <ul className="list-disc ml-6 text-sm text-slate-700 space-y-2">
                <li>Core Services: <b className={readiness.core_services ? 'text-emerald-600' : 'text-red-600'}>{readiness.core_services ? 'Ready' : 'Not Ready'}</b></li>
                <li>AI Access: <b className={readiness.ai_access ? 'text-emerald-600' : 'text-red-600'}>{readiness.ai_access ? 'Ready' : 'Not Ready'}</b></li>
                <li>Client Portal: <b className={readiness.client_portal ? 'text-emerald-600' : 'text-red-600'}>{readiness.client_portal ? 'Ready' : 'Not Ready'}</b></li>
                <li>Notifications: <b className={readiness.notifications ? 'text-emerald-600' : 'text-red-600'}>{readiness.notifications ? 'Ready' : 'Not Ready'}</b></li>
                <li>Knowledge Layer: <b className={readiness.knowledge_layer ? 'text-emerald-600' : 'text-red-600'}>{readiness.knowledge_layer ? 'Ready' : 'Not Ready'}</b></li>
                <li>Overall: <b className={readiness.overall === 'ready_to_launch' ? 'text-emerald-600' : readiness.overall === 'partially_ready' ? 'text-yellow-600' : 'text-red-600'}>{readiness.overall.replace(/_/g, ' ')}</b></li>
              </ul>
            </div>
            <div className={`${fintechShell} p-6 rounded-2xl border border-emerald-100 bg-white shadow-md`}>
              <h2 className="text-lg font-bold text-emerald-700 mb-3 flex items-center gap-2"><Rocket /> Review Guidance</h2>
              <ul className="list-disc ml-6 text-sm text-slate-700 space-y-2">
                {readiness.blocking && readiness.blocking.length > 0 ? (
                  <li className="text-red-600">Blocking: {readiness.blocking.join(', ')}</li>
                ) : <li className="text-emerald-600">No blocking issues</li>}
                <li>Next Action: <b>{readiness.next_action}</b></li>
              </ul>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold text-blue-700 mb-2 flex items-center gap-2"><BarChart3 /> Executive Summary</h2>
            <div className="grid grid-cols-2 gap-6">
              {summary.map((s, i) => (
                <div key={s.provider || i}>
                  <div className="text-xs text-slate-500 font-bold uppercase mb-1">{s.provider}</div>
                  <div className={`text-2xl font-black ${s.status === 'ready' ? 'text-blue-900' : 'text-red-600'}`}>{s.status}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-emerald-700 mb-2 flex items-center gap-2"><Layers /> Next Actions</h2>
            <ol className="list-decimal ml-6 text-sm text-slate-700 space-y-2">
              <li>{readiness.next_action}</li>
              {readiness.blocking && readiness.blocking.map((b: string, i: number) => (
                <li key={b + i}>Resolve: {b}</li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
