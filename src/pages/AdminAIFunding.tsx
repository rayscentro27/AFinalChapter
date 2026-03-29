import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
};

type ComplianceSummary = {
  total_events: number;
  by_action: Record<string, number>;
  by_lender: Record<string, number>;
  recent_confirmation_count: number;
  latest_confirmation_at: string | null;
};

type FundingEvent = {
  id: string;
  contact_id: string;
  lender_name: string;
  action_type: string;
  submitted_by: string;
  notes: string | null;
  created_at: string;
};

function jsonOrEmpty(value: string) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

export default function AdminAIFunding() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [contactId, setContactId] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [checklistText, setChecklistText] = useState('Confirm entity docs\nConfirm reserve account\nConfirm autopay setup');
  const [notes, setNotes] = useState('');

  const [clientDeviceConfirmed, setClientDeviceConfirmed] = useState(true);
  const [confirmationMethod, setConfirmationMethod] = useState('zoom_screenshare');
  const [confirmationMetadataText, setConfirmationMetadataText] = useState('{"verified_by":"advisor","source":"zoom"}');

  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [events, setEvents] = useState<FundingEvent[]>([]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data, error: tenantsError } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantsError) throw tenantsError;
        if (!active) return;

        const list = (data || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) setTenantId((prev) => prev || list[0].id);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in required.');
    return token;
  }

  async function refreshSummary() {
    if (!tenantId) return;
    setError('');

    const token = await getToken();
    const params = new URLSearchParams({ tenant_id: tenantId });
    if (contactId) params.set('contact_id', contactId);
    if (lenderName) params.set('lender_name', lenderName);
    params.set('limit', '200');

    const response = await fetch(`/.netlify/functions/admin-ai-funding-compliance-summary?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as any)?.error || `Compliance summary failed (${response.status})`));
    }

    setSummary(((payload as any)?.summary || null) as ComplianceSummary | null);
    setEvents((((payload as any)?.recent_events || []) as FundingEvent[]).slice(0, 50));
  }

  async function prepareChecklist() {
    if (!tenantId || !contactId || !lenderName) {
      setError('Tenant, Contact ID, and Lender are required.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const token = await getToken();
      const checklistItems = checklistText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);

      const response = await fetch('/.netlify/functions/admin-ai-funding-checklist-prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          contact_id: contactId,
          lender_name: lenderName,
          checklist_items: checklistItems,
          notes,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || `Checklist create failed (${response.status})`));
      }

      setMessage('Checklist prepared and logged.');
      await refreshSummary();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function captureSubmission() {
    if (!tenantId || !contactId || !lenderName) {
      setError('Tenant, Contact ID, and Lender are required.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const token = await getToken();
      const confirmationMetadata = jsonOrEmpty(confirmationMetadataText);

      const response = await fetch('/.netlify/functions/admin-ai-funding-submission-capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          contact_id: contactId,
          lender_name: lenderName,
          client_device_confirmed: clientDeviceConfirmed,
          confirmation_method: confirmationMethod,
          confirmation_metadata: confirmationMetadata,
          notes,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || `Submission capture failed (${response.status})`));
      }

      setMessage('Submission confirmation captured.');
      await refreshSummary();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading AI funding tools...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">AI Funding Compliance</h1>
        <p className="text-sm text-slate-400 mt-2">
          Prepare checklist tasks, capture client-device submission confirmations, and review compliance event history.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">{error}</div>
      ) : null}
      {message ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-2xl p-4 text-sm font-medium">{message}</div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
            <select
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Contact ID</label>
            <input
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              placeholder="uuid"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Lender</label>
            <input
              value={lenderName}
              onChange={(event) => setLenderName(event.target.value)}
              placeholder="Chase Ink"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Checklist Items (one per line)</label>
          <textarea
            value={checklistText}
            onChange={(event) => setChecklistText(event.target.value)}
            rows={4}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Confirmation Method</label>
            <input
              value={confirmationMethod}
              onChange={(event) => setConfirmationMethod(event.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div className="flex items-end gap-2">
            <input
              id="device-confirmed"
              type="checkbox"
              checked={clientDeviceConfirmed}
              onChange={(event) => setClientDeviceConfirmed(event.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="device-confirmed" className="text-sm text-slate-300">Client device confirmed</label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Confirmation Metadata (JSON)</label>
          <textarea
            value={confirmationMetadataText}
            onChange={(event) => setConfirmationMetadataText(event.target.value)}
            rows={3}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 font-mono text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void prepareChecklist()}
            disabled={busy}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            Prepare Checklist
          </button>
          <button
            onClick={() => void captureSubmission()}
            disabled={busy}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            Capture Submission
          </button>
          <button
            onClick={() => void refreshSummary()}
            disabled={busy}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            Refresh Summary
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Compliance Summary</h2>
        {!summary ? (
          <p className="text-sm text-slate-400">No summary loaded yet.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 p-3 bg-black/20">
              <div className="text-slate-400 text-xs uppercase tracking-widest">Total Events</div>
              <div className="text-lg font-black mt-1">{summary.total_events}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-3 bg-black/20">
              <div className="text-slate-400 text-xs uppercase tracking-widest">Confirmations</div>
              <div className="text-lg font-black mt-1">{summary.recent_confirmation_count}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-3 bg-black/20 lg:col-span-2">
              <div className="text-slate-400 text-xs uppercase tracking-widest">Latest Confirmation</div>
              <div className="text-sm mt-1">{summary.latest_confirmation_at ? new Date(summary.latest_confirmation_at).toLocaleString() : '-'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Recent Funding Events</h2>
          <span className="text-xs text-slate-500">{events.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">When</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3">Lender</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">By</th>
                <th className="px-6 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-slate-400">No rows loaded.</td>
                </tr>
              ) : (
                events.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4 text-slate-300">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-xs">{row.contact_id}</td>
                    <td className="px-6 py-4 text-slate-200">{row.lender_name}</td>
                    <td className="px-6 py-4 text-slate-200">{row.action_type}</td>
                    <td className="px-6 py-4 text-slate-300">{row.submitted_by}</td>
                    <td className="px-6 py-4 text-slate-400">{row.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
