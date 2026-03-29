import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listSbaDocumentLinks,
  listSbaPlansForAdmin,
  markSbaDocumentVerified,
  runSbaReminderTick,
  SbaDocumentLinkRow,
  SbaPrepPlanRow,
} from '../services/sbaPrepService';

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function completionSummary(links: SbaDocumentLinkRow[]): { uploaded: number; verified: number; total: number } {
  const total = links.length;
  const uploaded = links.filter((l) => l.status === 'uploaded' || l.status === 'verified').length;
  const verified = links.filter((l) => l.status === 'verified').length;
  return { uploaded, verified, total };
}

export default function AdminSBAPrepPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [plans, setPlans] = useState<SbaPrepPlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [links, setLinks] = useState<SbaDocumentLinkRow[]>([]);

  const selectedPlan = useMemo(
    () => plans.find((row) => row.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );

  async function loadPlans() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const rows = await listSbaPlansForAdmin();
      setPlans(rows);
      if (!selectedPlanId && rows.length > 0) {
        setSelectedPlanId(rows[0].id);
      } else if (selectedPlanId && !rows.some((row) => row.id === selectedPlanId)) {
        setSelectedPlanId(rows[0]?.id || null);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setPlans([]);
      setSelectedPlanId(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlanLinks(planId: string | null) {
    if (!planId) {
      setLinks([]);
      return;
    }

    try {
      const rows = await listSbaDocumentLinks(planId);
      setLinks(rows);
    } catch (e: any) {
      setError(String(e?.message || e));
      setLinks([]);
    }
  }

  useEffect(() => {
    void loadPlans();
  }, [isAdmin]);

  useEffect(() => {
    void loadPlanLinks(selectedPlanId);
  }, [selectedPlanId]);

  async function handleVerify(link: SbaDocumentLinkRow, verified: boolean) {
    if (!user?.id) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await markSbaDocumentVerified({
        link_id: link.id,
        admin_user_id: user.id,
        verified,
      });

      setSuccess(verified ? 'Document marked verified.' : 'Document verification removed.');
      if (selectedPlanId) {
        await loadPlanLinks(selectedPlanId);
      }
      await loadPlans();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRunReminderTick() {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const result = await runSbaReminderTick(selectedPlanId || undefined);
      setSuccess(`Reminder tick completed. Plans scanned: ${result.plans_scanned}, tasks created: ${result.tasks_created}, emails queued: ${result.emails_queued}.`);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading SBA admin view...</div>;
  }

  const summary = completionSummary(links);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin SBA Prep</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor SBA prep plans, document completion, and verification progress. Educational workflow only.
          </p>
        </div>
        <button
          onClick={() => void handleRunReminderTick()}
          disabled={busy || plans.length === 0}
          className="rounded-lg border border-cyan-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200 disabled:opacity-50"
        >
          Run Monthly Reminder Tick
        </button>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Plans</h2>
          {plans.length === 0 ? <div className="text-sm text-slate-500">No SBA plans found.</div> : null}
          <div className="space-y-2 max-h-[38rem] overflow-y-auto pr-1">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`w-full text-left rounded-lg border px-3 py-3 ${selectedPlanId === plan.id ? 'border-cyan-400/60 bg-cyan-950/20' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'}`}
              >
                <div className="text-xs text-slate-400">{plan.id}</div>
                <div className="text-sm font-semibold text-white mt-1">{pretty(plan.status)} · {plan.readiness_score}/100</div>
                <div className="text-xs text-slate-300 mt-1">Tenant: {plan.tenant_id}</div>
                <div className="text-xs text-slate-400">Client: {plan.user_id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 lg:col-span-2 space-y-3">
          {!selectedPlan ? (
            <div className="text-sm text-slate-500">Select a plan to view checklist document links.</div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Readiness</div>
                  <div className="text-white font-semibold">{selectedPlan.readiness_score}/100</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Uploaded / Total</div>
                  <div className="text-cyan-300 font-semibold">{summary.uploaded}/{summary.total}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Verified / Total</div>
                  <div className="text-emerald-300 font-semibold">{summary.verified}/{summary.total}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-300 border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Required Doc</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Upload</th>
                      <th className="px-3 py-2 text-right">Verify</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((link) => (
                      <tr key={link.id} className="border-b border-slate-800 align-top">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-white">{link.sba_documents_required?.title || link.required_doc_key}</div>
                          <div className="text-xs text-slate-400">{link.required_doc_key}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{pretty(link.status)}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {link.uploads ? (
                            <span className="text-xs">{link.uploads.file_name || link.uploads.object_path}</span>
                          ) : (
                            <span className="text-xs text-slate-500">None</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {link.status === 'verified' ? (
                            <button
                              onClick={() => void handleVerify(link, false)}
                              disabled={busy}
                              className="rounded-md border border-amber-500/50 px-2 py-1 text-[11px] font-semibold text-amber-200 disabled:opacity-50"
                            >
                              Unverify
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleVerify(link, true)}
                              disabled={busy || link.status === 'missing'}
                              className="rounded-md border border-emerald-500/50 px-2 py-1 text-[11px] font-semibold text-emerald-200 disabled:opacity-50"
                            >
                              Mark Verified
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
