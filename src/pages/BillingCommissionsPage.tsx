import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { toUsdFromCents } from '../utils/commissionMath';
import {
  CommissionAgreementRow,
  CommissionEventRow,
  listCommissionAgreementsForUser,
  listCommissionEventsForUser,
} from '../services/commissionLedgerService';

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BillingCommissionsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [agreements, setAgreements] = useState<CommissionAgreementRow[]>([]);
  const [events, setEvents] = useState<CommissionEventRow[]>([]);

  const latestAgreement = agreements[0] || null;

  const summary = useMemo(() => {
    const totals = {
      estimated: 0,
      invoiced: 0,
      paid: 0,
      waived: 0,
      disputed: 0,
    } as Record<string, number>;

    for (const row of events) {
      totals[row.status] = (totals[row.status] || 0) + Number(row.commission_amount_cents || 0);
    }

    return totals;
  }, [events]);

  async function loadState() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [rowsAgreements, rowsEvents] = await Promise.all([
        listCommissionAgreementsForUser(user.id),
        listCommissionEventsForUser(user.id),
      ]);

      setAgreements(rowsAgreements);
      setEvents(rowsEvents);
    } catch (e: any) {
      setError(String(e?.message || e));
      setAgreements([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading commission billing...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Commission Billing</h1>
        <p className="text-sm text-slate-400 mt-2">
          Transparent ledger of commission estimates, invoice states, and payment records.
          This is based on client-reported outcomes and agreed terms. No guarantee of funding results.
        </p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {(['estimated', 'invoiced', 'paid', 'waived', 'disputed'] as const).map((key) => (
          <div key={key} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-400">{pretty(key)}</div>
            <div className="mt-2 text-base font-semibold text-white">{toUsdFromCents(summary[key])}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Current Agreement</h2>
        {!latestAgreement ? (
          <p className="text-sm text-slate-500 mt-2">No commission agreement found yet. Accept commission disclosure in billing to establish terms.</p>
        ) : (
          <div className="mt-2 text-sm text-slate-300 space-y-1">
            <p>Version: <span className="text-white">{latestAgreement.version}</span></p>
            <p>Rate: <span className="text-white">{latestAgreement.rate_bps / 100}%</span></p>
            <p>Cap: <span className="text-white">{latestAgreement.cap_cents ? toUsdFromCents(latestAgreement.cap_cents) : 'No cap'}</span></p>
            <p>Effective: <span className="text-white">{new Date(latestAgreement.effective_at).toLocaleString()}</span></p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Invoices and Status</h2>

        {events.length === 0 ? <div className="text-sm text-slate-500">No commission events yet.</div> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 pr-3">Created</th>
                <th className="text-left py-2 pr-3">Provider</th>
                <th className="text-left py-2 pr-3">Product</th>
                <th className="text-left py-2 pr-3">Base</th>
                <th className="text-left py-2 pr-3">Commission</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Invoice</th>
                <th className="text-left py-2 pr-3">Due</th>
                <th className="text-left py-2 pr-3">Paid</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row) => (
                <tr key={row.id} className="border-b border-slate-800">
                  <td className="py-2 pr-3 text-slate-300">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-3 text-white">{row.funding_outcomes?.provider_name || '-'}</td>
                  <td className="py-2 pr-3 text-slate-300">{pretty(row.funding_outcomes?.product_type || '-')}</td>
                  <td className="py-2 pr-3 text-slate-300">{toUsdFromCents(row.base_amount_cents)}</td>
                  <td className="py-2 pr-3 text-slate-200">{toUsdFromCents(row.commission_amount_cents)}</td>
                  <td className="py-2 pr-3"><span className="text-xs rounded-full border border-slate-600 px-2 py-1 text-slate-300">{pretty(row.status)}</span></td>
                  <td className="py-2 pr-3 text-slate-300">{row.invoice_provider.toUpperCase()} {row.invoice_id ? `#${row.invoice_id}` : ''}</td>
                  <td className="py-2 pr-3 text-slate-300">{row.due_date || '-'}</td>
                  <td className="py-2 pr-3 text-slate-300">{row.paid_at ? new Date(row.paid_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 text-xs text-cyan-100">
        Payment instructions are provided on invoiced records. Ledger values are based on information you provided and accepted disclosure terms. Outcomes vary and are not guaranteed.
      </div>
    </div>
  );
}
