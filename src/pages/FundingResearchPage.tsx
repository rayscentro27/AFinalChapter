import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserTier, isSubscriptionEntitled, UserTierState } from '../billing/tier';
import { resolveTenantIdForUser } from '../../utils/tenantContext';
import { supabase } from '../../lib/supabaseClient';
import {
  FundingApplicationRow,
  FundingRecommendation,
  FundingResearchPacketRow,
  generateFundingResearchPacket,
  listFundingPackets,
  listFundingTracker,
  updateFundingTrackerRow,
  upsertFundingTrackerRow,
} from '../services/fundingResearchService';

const STATUS_OPTIONS: Array<FundingApplicationRow['client_status']> = ['planned', 'applied', 'approved', 'denied'];

function money(value: number | null | undefined): string {
  if (!value || value <= 0) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value / 100);
}

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FundingResearchPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tierState, setTierState] = useState<UserTierState | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [disclaimersAccepted, setDisclaimersAccepted] = useState(false);
  const [commissionAccepted, setCommissionAccepted] = useState(false);

  const [clientFileId, setClientFileId] = useState('');

  const [packets, setPackets] = useState<FundingResearchPacketRow[]>([]);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [trackerRows, setTrackerRows] = useState<FundingApplicationRow[]>([]);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});

  const selectedPacket = useMemo(
    () => packets.find((packet) => packet.id === selectedPacketId) || null,
    [packets, selectedPacketId]
  );

  const recommendations = useMemo<FundingRecommendation[]>(() => {
    return selectedPacket?.recommendations || [];
  }, [selectedPacket?.id]);

  const entitlementOk = Boolean(
    tierState
    && tierState.tier === 'PREMIUM'
    && isSubscriptionEntitled(tierState.status)
  );
  const consentOk = disclaimersAccepted && commissionAccepted;
  const canGenerate = Boolean(user?.id && tenantId && clientFileId.trim() && entitlementOk && consentOk && !busy);

  async function loadState() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [nextTier, nextTenantId, statusRes, commissionRes, packetRows] = await Promise.all([
        getUserTier(user.id),
        resolveTenantIdForUser(user.id),
        supabase
          .from('user_consent_status')
          .select('disclaimers_accepted')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('consents')
          .select('id')
          .eq('user_id', user.id)
          .eq('consent_type', 'commission_disclosure')
          .order('accepted_at', { ascending: false })
          .limit(1),
        listFundingPackets(user.id),
      ]);

      setTierState(nextTier);
      setTenantId(nextTenantId);
      setDisclaimersAccepted(Boolean((statusRes.data as any)?.disclaimers_accepted));
      setCommissionAccepted(Array.isArray(commissionRes.data) && commissionRes.data.length > 0);

      setPackets(packetRows);
      if (!selectedPacketId && packetRows.length > 0) {
        setSelectedPacketId(packetRows[0].id);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setPackets([]);
      setSelectedPacketId(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadTracker(packetId: string) {
    try {
      const rows = await listFundingTracker(packetId);
      setTrackerRows(rows);
      const nextDrafts: Record<string, string> = {};
      rows.forEach((row) => {
        if (row.approved_amount_cents && row.approved_amount_cents > 0) {
          nextDrafts[row.id] = String(Math.round(row.approved_amount_cents / 100));
        }
      });
      setAmountDrafts(nextDrafts);
    } catch (e: any) {
      setError(String(e?.message || e));
      setTrackerRows([]);
    }
  }

  useEffect(() => {
    void loadState();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedPacketId) {
      setTrackerRows([]);
      setAmountDrafts({});
      return;
    }

    void loadTracker(selectedPacketId);
  }, [selectedPacketId]);

  async function handleGenerate() {
    if (!canGenerate || !user?.id) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const result = await generateFundingResearchPacket(clientFileId.trim());
      setSuccess(`Research packet generated (${result.recommendation_count} recommendations). Educational guidance only; approvals are not guaranteed.`);
      const nextPackets = await listFundingPackets(user.id);
      setPackets(nextPackets);
      setSelectedPacketId(result.packet_id || nextPackets[0]?.id || null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function addRecommendationToTracker(rec: FundingRecommendation) {
    if (!selectedPacket || !tenantId || !user?.id) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await upsertFundingTrackerRow({
        packet_id: selectedPacket.id,
        tenant_id: tenantId,
        user_id: user.id,
        bank_id: rec.bank_id,
        product_key: rec.product_key,
        client_status: 'planned',
        approved_amount_cents: null,
      });
      setSuccess('Application tracker updated. This log reflects your choices and outcomes.');
      await loadTracker(selectedPacket.id);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function updateTrackerStatus(row: FundingApplicationRow, status: FundingApplicationRow['client_status']) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const amount = status === 'approved'
        ? Math.max(0, Math.round(Number(amountDrafts[row.id] || 0) * 100))
        : null;

      await updateFundingTrackerRow({
        id: row.id,
        client_status: status,
        approved_amount_cents: amount,
      });

      setSuccess('Application status saved.');
      if (selectedPacket) {
        await loadTracker(selectedPacket.id);
      }
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funding research engine...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Funding Research Engine</h1>
        <p className="text-sm text-slate-400 mt-2">
          Educational Tier 1 research for 0% APR business cards and LOC options. Client decides and submits all applications.
          Results vary and approvals are not guaranteed.
        </p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Tier Gate</div>
          <div className={`mt-2 text-sm font-semibold ${entitlementOk ? 'text-emerald-300' : 'text-amber-300'}`}>
            {entitlementOk ? 'PREMIUM Active' : 'PREMIUM Required'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Disclaimers Consent</div>
          <div className={`mt-2 text-sm font-semibold ${disclaimersAccepted ? 'text-emerald-300' : 'text-amber-300'}`}>
            {disclaimersAccepted ? 'Accepted' : 'Missing'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Commission Disclosure</div>
          <div className={`mt-2 text-sm font-semibold ${commissionAccepted ? 'text-emerald-300' : 'text-amber-300'}`}>
            {commissionAccepted ? 'Accepted' : 'Missing'}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h2 className="text-lg font-semibold text-white">Generate Bank Research Packet</h2>
        <p className="text-xs text-slate-400">
          Use your client file id from intake/workflow records. The packet uses sanitized readiness data only.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={clientFileId}
            onChange={(e) => setClientFileId(e.target.value)}
            placeholder="client_file_id (uuid)"
          />
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            {busy ? 'Generating...' : 'Generate Packet'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Research Packets</h2>
          {packets.length === 0 ? <div className="text-sm text-slate-500">No packets yet.</div> : null}
          <div className="space-y-2 max-h-[28rem] overflow-y-auto custom-scrollbar pr-1">
            {packets.map((packet) => (
              <button
                key={packet.id}
                onClick={() => setSelectedPacketId(packet.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${selectedPacketId === packet.id ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}
              >
                <div className="text-xs text-slate-400">{new Date(packet.created_at).toLocaleString()}</div>
                <div className="text-sm font-semibold text-white mt-1">{packet.id.slice(0, 8)}...{packet.id.slice(-4)}</div>
                <div className="text-xs text-slate-400 mt-1">Status: {pretty(packet.status)}</div>
                <div className="text-xs text-slate-400">Recommendations: {packet.recommendations.length}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Packet Detail</h2>

          {!selectedPacket ? <div className="text-sm text-slate-500">Select a packet to view recommendations.</div> : null}

          {selectedPacket ? (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-xs text-slate-300">
                <div className="font-semibold text-white mb-2">Client Application Checklist</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Review ranked educational recommendations and select preferred banks/products.</li>
                  <li>Complete your own application package and verify lender requirements.</li>
                  <li>Submit applications directly to lenders (Nexus does not submit for you).</li>
                  <li>Log outcomes in My Applications for your proof trail.</li>
                </ol>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Sanitized Input Snapshot</div>
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">{JSON.stringify(selectedPacket.input_snapshot, null, 2)}</pre>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Rank</th>
                      <th className="px-3 py-2 text-left">Bank / Product</th>
                      <th className="px-3 py-2 text-left">Intro</th>
                      <th className="px-3 py-2 text-left">Est. Limit</th>
                      <th className="px-3 py-2 text-left">Reasons</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendations.map((rec) => {
                      const tracked = trackerRows.some((row) => row.bank_id === rec.bank_id && row.product_key === rec.product_key);
                      return (
                        <tr key={`${rec.bank_id}:${rec.product_key}`} className="border-t border-slate-700">
                          <td className="px-3 py-2 text-cyan-300 font-semibold">#{rec.rank}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-white">{rec.bank_name}</div>
                            <div className="text-xs text-slate-400">{rec.product_label} ({rec.product_type})</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-300">
                            {rec.intro_apr_percent === 0 ? '0% APR' : `${rec.intro_apr_percent ?? '-'}%`}
                            {rec.intro_apr_months ? ` for ${rec.intro_apr_months} months` : ''}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-300">{money(rec.estimated_max_limit_cents)}</td>
                          <td className="px-3 py-2 text-xs text-slate-400">{rec.reason_codes.join(', ')}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              disabled={busy || tracked}
                              onClick={() => void addRecommendationToTracker(rec)}
                              className="rounded-md border border-cyan-500/40 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                            >
                              {tracked ? 'Tracked' : 'Add to My Applications'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">My Applications</h2>
        {trackerRows.length === 0 ? <div className="text-sm text-slate-500">No application choices logged yet.</div> : null}

        {trackerRows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Approved Amount</th>
                  <th className="px-3 py-2 text-right">Save</th>
                </tr>
              </thead>
              <tbody>
                {trackerRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-700">
                    <td className="px-3 py-2 text-slate-200">{row.bank_catalog?.name || row.bank_id}</td>
                    <td className="px-3 py-2 text-slate-300">{row.product_key}</td>
                    <td className="px-3 py-2">
                      <select
                        value={row.client_status}
                        onChange={(e) => void updateTrackerStatus(row, e.target.value as FundingApplicationRow['client_status'])}
                        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{pretty(status)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={amountDrafts[row.id] || ''}
                        onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="USD"
                        className="w-28 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => void updateTrackerStatus(row, row.client_status)}
                        disabled={busy}
                        className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        Educational research output only. Nexus does not submit lender applications for clients and does not guarantee approval, amounts, or timelines.
      </p>
    </div>
  );
}
