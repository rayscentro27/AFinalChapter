import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserTier, isSubscriptionEntitled, UserTierState } from '../billing/tier';
import { resolveTenantIdForUser } from '../../utils/tenantContext';
import { bpsToCents, toUsdFromCents } from '../utils/commissionMath';
import {
  CommissionAgreementRow,
  CommissionEventRow,
  FundingOutcomeRow,
  createFundingOutcome,
  listCommissionAgreementsForUser,
  listCommissionEventsForUser,
  listFundingOutcomes,
  uploadOutcomeEvidence,
} from '../services/commissionLedgerService';
import { supabase } from '../../lib/supabaseClient';

type ProductType = 'card' | 'loc' | 'loan';
type OutcomeStatus = 'planned' | 'applied' | 'approved' | 'denied';

const OUTCOME_STATUSES: OutcomeStatus[] = ['planned', 'applied', 'approved', 'denied'];

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FundingOutcomesPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tierState, setTierState] = useState<UserTierState | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [hasCommissionConsent, setHasCommissionConsent] = useState(false);
  const [agreements, setAgreements] = useState<CommissionAgreementRow[]>([]);

  const [outcomes, setOutcomes] = useState<FundingOutcomeRow[]>([]);
  const [events, setEvents] = useState<CommissionEventRow[]>([]);

  const [clientFileId, setClientFileId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [productType, setProductType] = useState<ProductType>('card');
  const [status, setStatus] = useState<OutcomeStatus>('planned');
  const [approvedAmountUsd, setApprovedAmountUsd] = useState('');
  const [notesMd, setNotesMd] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const eventByOutcomeId = useMemo(() => {
    const map = new Map<string, CommissionEventRow>();
    for (const row of events) {
      map.set(row.funding_outcome_id, row);
    }
    return map;
  }, [events]);

  const currentAgreement = agreements[0] || null;

  const premiumActive = Boolean(
    tierState
    && tierState.tier === 'PREMIUM'
    && isSubscriptionEntitled(tierState.status)
  );

  async function loadState() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [tier, resolvedTenantId, consentRes, rowsOutcomes, rowsEvents, rowsAgreements] = await Promise.all([
        getUserTier(user.id),
        resolveTenantIdForUser(user.id),
        supabase
          .from('consents')
          .select('id')
          .eq('user_id', user.id)
          .eq('consent_type', 'commission_disclosure')
          .order('accepted_at', { ascending: false })
          .limit(1),
        listFundingOutcomes(user.id),
        listCommissionEventsForUser(user.id),
        listCommissionAgreementsForUser(user.id),
      ]);

      setTierState(tier);
      setTenantId(resolvedTenantId);
      setHasCommissionConsent(Array.isArray(consentRes.data) && consentRes.data.length > 0);
      setOutcomes(rowsOutcomes);
      setEvents(rowsEvents);
      setAgreements(rowsAgreements);
    } catch (e: any) {
      setError(String(e?.message || e));
      setOutcomes([]);
      setEvents([]);
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [user?.id]);

  async function handleCreateOutcome() {
    if (!user?.id || !tenantId) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      if (!clientFileId.trim()) throw new Error('client_file_id is required.');
      if (!providerName.trim()) throw new Error('Provider name is required.');

      let approvedAmountCents: number | null = null;
      if (status === 'approved') {
        if (!premiumActive) {
          throw new Error('PREMIUM active subscription is required for approved outcomes that generate commission estimates.');
        }
        if (!hasCommissionConsent) {
          throw new Error('Commission disclosure consent is required before approved outcomes can be estimated.');
        }

        const usd = Number(approvedAmountUsd || 0);
        if (!Number.isFinite(usd) || usd <= 0) {
          throw new Error('Enter an approved amount greater than zero.');
        }
        approvedAmountCents = Math.round(usd * 100);
      }

      let evidenceUploadId: string | null = null;
      if (evidenceFile) {
        evidenceUploadId = await uploadOutcomeEvidence({
          tenantId,
          userId: user.id,
          file: evidenceFile,
        });
      }

      const result = await createFundingOutcome({
        client_file_id: clientFileId.trim(),
        provider_name: providerName.trim(),
        product_type: productType,
        outcome_status: status,
        approved_amount_cents: approvedAmountCents,
        evidence_upload_id: evidenceUploadId,
        notes_md: notesMd.trim() || undefined,
      });

      setSuccess(result.commission_event_id
        ? 'Outcome recorded and commission estimated based on information you provided.'
        : 'Outcome recorded successfully.');

      setApprovedAmountUsd('');
      setNotesMd('');
      setEvidenceFile(null);
      await loadState();
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funding outcomes...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Funding Outcomes</h1>
        <p className="text-sm text-slate-400 mt-2">
          Record client-reported funding outcomes and maintain a transparent commission ledger. Educational workflow only; no funding guarantees.
        </p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Tier</div>
          <div className={`mt-2 text-sm font-semibold ${premiumActive ? 'text-emerald-300' : 'text-amber-300'}`}>
            {premiumActive ? 'PREMIUM Active' : 'PREMIUM Required For Estimation'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Commission Disclosure</div>
          <div className={`mt-2 text-sm font-semibold ${hasCommissionConsent ? 'text-emerald-300' : 'text-amber-300'}`}>
            {hasCommissionConsent ? 'Accepted' : 'Missing'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Agreement</div>
          <div className={`mt-2 text-sm font-semibold ${currentAgreement ? 'text-emerald-300' : 'text-amber-300'}`}>
            {currentAgreement ? `${currentAgreement.version} (${currentAgreement.rate_bps / 100}% rate)` : 'Will be created from accepted disclosure'}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h2 className="text-lg font-semibold text-white">Add Outcome</h2>
        <p className="text-xs text-slate-400">
          Approved outcomes may create estimated commission entries based on client-provided data and accepted agreement terms.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            placeholder="client_file_id (uuid)"
            value={clientFileId}
            onChange={(e) => setClientFileId(e.target.value)}
          />
          <input
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            placeholder="Provider / Lender name"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
          />

          <select
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={productType}
            onChange={(e) => setProductType(e.target.value as ProductType)}
          >
            <option value="card">Card</option>
            <option value="loc">LOC</option>
            <option value="loan">Loan</option>
          </select>

          <select
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as OutcomeStatus)}
          >
            {OUTCOME_STATUSES.map((item) => (
              <option key={item} value={item}>{pretty(item)}</option>
            ))}
          </select>

          <input
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            placeholder="Approved amount (USD)"
            value={approvedAmountUsd}
            onChange={(e) => setApprovedAmountUsd(e.target.value)}
            disabled={status !== 'approved'}
          />

          <label className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300">
            Evidence upload (optional)
            <input
              type="file"
              className="mt-2 block w-full text-xs"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <textarea
          rows={3}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
          value={notesMd}
          onChange={(e) => setNotesMd(e.target.value)}
          placeholder="Notes (optional)"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Estimated commission entries are informational records based on information you provided and accepted terms. They are not funding guarantees.
          </p>
          <button
            onClick={() => void handleCreateOutcome()}
            disabled={busy || !tenantId}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save Outcome'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Outcome Ledger</h2>
        {outcomes.length === 0 ? <div className="text-sm text-slate-500">No outcomes logged yet.</div> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 pr-3">Date</th>
                <th className="text-left py-2 pr-3">Provider</th>
                <th className="text-left py-2 pr-3">Product</th>
                <th className="text-left py-2 pr-3">Outcome</th>
                <th className="text-left py-2 pr-3">Approved</th>
                <th className="text-left py-2 pr-3">Estimated Commission</th>
                <th className="text-left py-2 pr-3">Commission Status</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((row) => {
                const event = eventByOutcomeId.get(row.id) || null;
                const estimated = event
                  ? event.commission_amount_cents
                  : (row.outcome_status === 'approved' && currentAgreement && row.approved_amount_cents
                    ? bpsToCents(row.approved_amount_cents, currentAgreement.rate_bps, currentAgreement.cap_cents)
                    : null);

                return (
                  <tr key={row.id} className="border-b border-slate-800">
                    <td className="py-2 pr-3 text-slate-300">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3 text-white">{row.provider_name}</td>
                    <td className="py-2 pr-3 text-slate-300">{pretty(row.product_type)}</td>
                    <td className="py-2 pr-3 text-slate-300">{pretty(row.outcome_status)}</td>
                    <td className="py-2 pr-3 text-slate-300">{toUsdFromCents(row.approved_amount_cents)}</td>
                    <td className="py-2 pr-3 text-slate-200">{estimated !== null ? toUsdFromCents(estimated) : '-'}</td>
                    <td className="py-2 pr-3">
                      <span className="text-xs rounded-full border border-slate-600 px-2 py-1 text-slate-300">
                        {event ? pretty(event.status) : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
