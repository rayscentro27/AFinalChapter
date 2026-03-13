import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserTier, isSubscriptionEntitled, UserTierState } from '../billing/tier';
import {
  createSbaPlan,
  generateSbaPack,
  getSbaPackDocument,
  getSbaPackSignedUrl,
  listSbaDocumentLinks,
  listSbaPlansForUser,
  listSbaRequiredDocuments,
  SbaDocumentLinkRow,
  SbaMilestone,
  SbaMilestoneStatus,
  SbaPrepPlanRow,
  SbaRequiredDocumentRow,
  updateSbaMilestone,
  uploadSbaDocument,
} from '../services/sbaPrepService';

function money(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return 'Not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SBAPrepPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tierState, setTierState] = useState<UserTierState | null>(null);
  const [plans, setPlans] = useState<SbaPrepPlanRow[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<SbaRequiredDocumentRow[]>([]);
  const [links, setLinks] = useState<SbaDocumentLinkRow[]>([]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [packUrl, setPackUrl] = useState<string | null>(null);

  const [clientFileId, setClientFileId] = useState('');
  const [targetAmount, setTargetAmount] = useState('50000');
  const [targetTimeline, setTargetTimeline] = useState('9');

  const [fileByKey, setFileByKey] = useState<Record<string, File | null>>({});

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );

  const entitlementOk = Boolean(tierState?.tier === 'PREMIUM' && isSubscriptionEntitled(tierState.status));

  const nextMonthlyCheckin = useMemo(() => {
    if (!selectedPlan) return null;
    return selectedPlan.milestones
      .filter((m) => m.key.startsWith('month_') && m.status !== 'completed')
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;
  }, [selectedPlan?.id, selectedPlan?.milestones]);

  async function loadPlansAndDocs() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [tier, docs, nextPlans] = await Promise.all([
        getUserTier(user.id),
        listSbaRequiredDocuments(),
        listSbaPlansForUser(user.id),
      ]);

      setTierState(tier);
      setRequiredDocs(docs);
      setPlans(nextPlans);

      if (!selectedPlanId && nextPlans.length > 0) {
        setSelectedPlanId(nextPlans[0].id);
      } else if (selectedPlanId && !nextPlans.some((p) => p.id === selectedPlanId)) {
        setSelectedPlanId(nextPlans[0]?.id || null);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setPlans([]);
      setRequiredDocs([]);
      setSelectedPlanId(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlanDetails(planId: string | null) {
    if (!planId) {
      setLinks([]);
      setPackUrl(null);
      return;
    }

    try {
      const [nextLinks, packDoc] = await Promise.all([
        listSbaDocumentLinks(planId),
        getSbaPackDocument(planId),
      ]);

      setLinks(nextLinks);

      if (packDoc?.storage_path) {
        const signed = await getSbaPackSignedUrl(packDoc.storage_path);
        setPackUrl(signed || null);
      } else {
        setPackUrl(null);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setLinks([]);
      setPackUrl(null);
    }
  }

  useEffect(() => {
    void loadPlansAndDocs();
  }, [user?.id]);

  useEffect(() => {
    void loadPlanDetails(selectedPlanId);
  }, [selectedPlanId]);

  async function handleCreatePlan() {
    if (!entitlementOk) {
      setError('PREMIUM tier is required to create SBA prep outputs.');
      return;
    }

    if (!clientFileId.trim()) {
      setError('client_file_id is required.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const amountCents = Math.max(0, Math.round(Number(targetAmount || 0) * 100));
      const timelineMonths = Math.max(6, Math.min(12, Math.round(Number(targetTimeline || 9))));

      const result = await createSbaPlan({
        client_file_id: clientFileId.trim(),
        target_amount_cents: amountCents,
        target_timeline_months: timelineMonths,
      });

      setSuccess(`SBA prep plan created (${result.plan_id}). Educational prep only; no approval guarantees.`);
      setClientFileId('');
      await loadPlansAndDocs();
      setSelectedPlanId(result.plan_id);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleGeneratePack() {
    if (!selectedPlan) return;
    if (!entitlementOk) {
      setError('PREMIUM tier is required to generate the SBA checklist pack.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const result = await generateSbaPack(selectedPlan.id);
      setSuccess(`SBA checklist pack generated (${result.document_id}).`);
      await loadPlanDetails(selectedPlan.id);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadDoc(requiredDocKey: string) {
    if (!selectedPlan) return;
    const file = fileByKey[requiredDocKey] || null;
    if (!file) {
      setError('Select a file before uploading.');
      return;
    }

    if (!entitlementOk) {
      setError('PREMIUM tier is required for SBA vault outputs.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await uploadSbaDocument({
        plan: selectedPlan,
        required_doc_key: requiredDocKey,
        file,
      });

      setSuccess(`Uploaded document for ${requiredDocKey}.`);
      setFileByKey((prev) => ({ ...prev, [requiredDocKey]: null }));
      await loadPlansAndDocs();
      await loadPlanDetails(selectedPlan.id);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMilestoneUpdate(milestone: SbaMilestone, status: SbaMilestoneStatus) {
    if (!selectedPlan) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateSbaMilestone({
        plan_id: selectedPlan.id,
        milestone_key: milestone.key,
        status,
      });

      setSuccess(`Milestone updated. Readiness score: ${result.readiness_score}/100.`);
      await loadPlansAndDocs();
      await loadPlanDetails(selectedPlan.id);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading SBA prep module...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">SBA Prep Module</h1>
        <p className="text-sm text-slate-400 mt-2">
          Educational SBA prep workflow for checklist readiness, timeline milestones, and document organization over 6–12 months.
          No approval or funding amount guarantees.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Access</div>
          <div className={`mt-1 text-sm font-semibold ${entitlementOk ? 'text-emerald-300' : 'text-amber-300'}`}>
            {entitlementOk ? 'PREMIUM SBA outputs enabled' : 'Educational SBA lessons only (upgrade for prep outputs)'}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Educational Lessons</div>
          <ul className="mt-1 text-xs text-slate-300 list-disc pl-4 space-y-1">
            <li>How lenders evaluate document completeness and consistency.</li>
            <li>How to pace readiness milestones over a 6–12 month timeline.</li>
            <li>Why to validate final package details with your lender, CPA, and attorney.</li>
          </ul>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {!entitlementOk ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
          Upgrade to PREMIUM to create SBA prep plans, upload checklist documents, generate checklist packs, and track readiness scores.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Create SBA Prep Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={clientFileId}
                onChange={(e) => setClientFileId(e.target.value)}
                placeholder="client_file_id (uuid)"
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
              <input
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="Target amount (USD)"
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
              <input
                value={targetTimeline}
                onChange={(e) => setTargetTimeline(e.target.value)}
                placeholder="Timeline months (6-12)"
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => void handleCreatePlan()}
              disabled={busy}
              className="rounded-md bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            >
              {busy ? 'Working...' : 'Create Plan'}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">My SBA Plans</h2>
            {plans.length === 0 ? <div className="text-sm text-slate-500">No SBA plans yet.</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`text-left rounded-lg border px-3 py-3 ${selectedPlanId === plan.id ? 'border-cyan-400/60 bg-cyan-950/20' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'}`}
                >
                  <div className="text-xs text-slate-400">{plan.id}</div>
                  <div className="text-sm font-semibold text-white mt-1">Readiness: {plan.readiness_score}/100</div>
                  <div className="text-xs text-slate-300 mt-1">Status: {pretty(plan.status)}</div>
                  <div className="text-xs text-slate-400 mt-1">Target: {money(plan.target_amount_cents)} over {plan.target_timeline_months || '-'} month(s)</div>
                </button>
              ))}
            </div>
          </section>

          {selectedPlan ? (
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300">Checklist Vault</h3>
                  <button
                    onClick={() => void handleGeneratePack()}
                    disabled={busy}
                    className="rounded-md border border-cyan-500/50 px-3 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-50"
                  >
                    Generate Pack
                  </button>
                </div>

                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {requiredDocs.map((doc) => {
                    const link = links.find((row) => row.required_doc_key === doc.key);
                    const file = fileByKey[doc.key] || null;
                    return (
                      <div key={doc.key} className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-white">{doc.title}</div>
                            <div className="text-[11px] text-slate-400">{doc.key}</div>
                          </div>
                          <div className={`text-xs font-semibold ${link?.status === 'verified' ? 'text-emerald-300' : link?.status === 'uploaded' ? 'text-cyan-300' : 'text-amber-300'}`}>
                            {pretty(link?.status || 'missing')}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400">{doc.description_md}</p>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="file"
                            onChange={(e) => setFileByKey((prev) => ({ ...prev, [doc.key]: e.target.files?.[0] || null }))}
                            className="text-xs"
                          />
                          <button
                            onClick={() => void handleUploadDoc(doc.key)}
                            disabled={busy || !file}
                            className="rounded-md border border-slate-500 px-2 py-1 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
                          >
                            Upload
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {packUrl ? (
                  <a
                    href={packUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-md border border-cyan-500/50 px-3 py-1.5 text-xs font-semibold text-cyan-200"
                  >
                    Open Generated SBA Pack
                  </a>
                ) : (
                  <div className="text-xs text-slate-500">Generate checklist pack to create a downloadable SBA prep document.</div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300">Milestones + Monthly Check-In</h3>

                {nextMonthlyCheckin ? (
                  <div className="rounded-md border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
                    Next monthly check-in: <strong>{nextMonthlyCheckin.title}</strong> (due {nextMonthlyCheckin.due_date})
                  </div>
                ) : (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
                    All monthly check-ins marked complete.
                  </div>
                )}

                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {selectedPlan.milestones.map((milestone) => (
                    <MilestoneRow
                      key={milestone.key}
                      milestone={milestone}
                      busy={busy}
                      onSave={(status) => void handleMilestoneUpdate(milestone, status)}
                    />
                  ))}
                </div>

                <p className="text-xs text-slate-500">
                  Educational workflow only. Final loan application decisions remain with your lender. Consult your SBA lender, CPA, and attorney.
                </p>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function MilestoneRow(props: {
  milestone: SbaMilestone;
  busy: boolean;
  onSave: (status: SbaMilestoneStatus) => void;
}) {
  const [status, setStatus] = useState<SbaMilestoneStatus>(props.milestone.status);

  useEffect(() => {
    setStatus(props.milestone.status);
  }, [props.milestone.key, props.milestone.status]);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
      <div className="md:col-span-2">
        <div className="text-sm font-semibold text-white">{props.milestone.title}</div>
        <div className="text-[11px] text-slate-400">{props.milestone.key} · Due {props.milestone.due_date}</div>
      </div>
      <div>
        <label className="block text-[11px] text-slate-400 mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SbaMilestoneStatus)}
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>
      <div className="text-right">
        <button
          onClick={() => props.onSave(status)}
          disabled={props.busy}
          className="rounded-md border border-cyan-500/50 px-3 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
