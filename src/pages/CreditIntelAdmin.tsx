import React, { useMemo, useState } from 'react';

type AnyJson = Record<string, unknown>;

const SAMPLE_DATAPOINT = {
  source_name: 'Community DPs Group A',
  source_type: 'manual_community_submission',
  community_context: 'Verified user-shared approval datapoint from private community.',
  profile_signals: {
    fico: 705,
    inquiries_6_12: 2,
    inquiries_12_24: 4,
    oldest_account_months: 84,
    total_income_annual: 90000,
  },
  screenshot_urls: [],
  screenshot_verified: true,
  redaction_confirmed: true,
  verification_notes: 'SSN and account numbers redacted prior to submission.',
  reported_at: new Date().toISOString(),
  metadata: {
    terms_safe: true,
    consent_based: true,
  },
};

export default function CreditIntelAdmin() {
  const [tenantId, setTenantId] = useState('');
  const [createdByUserId, setCreatedByUserId] = useState('');
  const [datapointJson, setDatapointJson] = useState(JSON.stringify(SAMPLE_DATAPOINT, null, 2));

  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);

  const [createdDatapointId, setCreatedDatapointId] = useState('');
  const [createResult, setCreateResult] = useState<AnyJson | null>(null);
  const [matchResult, setMatchResult] = useState<AnyJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedDatapoint = useMemo(() => {
    try {
      return JSON.parse(datapointJson);
    } catch {
      return null;
    }
  }, [datapointJson]);

  async function onCreateDatapoint() {
    setError(null);
    setCreateResult(null);

    if (!tenantId.trim() || !createdByUserId.trim()) {
      setError('tenant_id and created_by_user_id are required.');
      return;
    }

    if (!parsedDatapoint || typeof parsedDatapoint !== 'object') {
      setError('Datapoint JSON is invalid.');
      return;
    }

    setLoadingCreate(true);
    try {
      const res = await fetch('/.netlify/functions/credit_intel_create_datapoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          created_by_user_id: createdByUserId.trim(),
          datapoint: parsedDatapoint,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Create failed (${res.status})`);

      setCreateResult(json);
      const id = String(json?.datapoint?.id || '');
      if (id) setCreatedDatapointId(id);
    } catch (e: any) {
      setError(e?.message || 'Create datapoint failed');
    } finally {
      setLoadingCreate(false);
    }
  }

  async function onMatchAndAlert() {
    setError(null);
    setMatchResult(null);

    if (!tenantId.trim()) {
      setError('tenant_id is required.');
      return;
    }

    setLoadingMatch(true);
    try {
      const res = await fetch('/.netlify/functions/credit_intel_match_and_alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          datapoint_id: createdDatapointId.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Match & alert failed (${res.status})`);

      setMatchResult(json);
    } catch (e: any) {
      setError(e?.message || 'Match & alert failed');
    } finally {
      setLoadingMatch(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Credit Intel Admin</h1>
        <p className="text-sm text-slate-400 mt-2">
          Manual intake only. Verified/redacted datapoints are matched against ready clients and consent-based SMS alerts are sent.
        </p>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">tenant_id</label>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">created_by_user_id</label>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            value={createdByUserId}
            onChange={(e) => setCreatedByUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Datapoint JSON</label>
          <textarea
            className="w-full min-h-[260px] rounded-xl bg-black/30 border border-white/10 px-3 py-2 font-mono text-xs"
            value={datapointJson}
            onChange={(e) => setDatapointJson(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onCreateDatapoint}
            disabled={loadingCreate}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
          >
            {loadingCreate ? 'Creating…' : 'Create Datapoint'}
          </button>

          <button
            onClick={onMatchAndAlert}
            disabled={loadingMatch}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
          >
            {loadingMatch ? 'Matching…' : 'Match & Alert'}
          </button>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Last datapoint_id</label>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            value={createdDatapointId}
            onChange={(e) => setCreatedDatapointId(e.target.value)}
            placeholder="Auto-filled after create, editable"
          />
        </div>

        {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Create Result</h2>
          <pre className="text-xs text-slate-200 bg-black/30 border border-white/10 rounded-xl p-3 overflow-auto max-h-[340px]">
            {JSON.stringify(createResult, null, 2) || 'No create result yet.'}
          </pre>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Match & Alert Result</h2>
          <pre className="text-xs text-slate-200 bg-black/30 border border-white/10 rounded-xl p-3 overflow-auto max-h-[340px]">
            {JSON.stringify(matchResult, null, 2) || 'No match result yet.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
