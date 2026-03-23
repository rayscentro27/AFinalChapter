import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { toUsdFromCents } from '../utils/commissionMath';
import {
  CommissionEventRow,
  CommissionStatus,
  commissionEventsToCsv,
  listAvailableTenants,
  listCommissionEventsAdmin,
  markCommissionInvoiced,
  markCommissionPaid,
  markCommissionStatus,
} from '../services/commissionLedgerService';

const STATUS_OPTIONS: Array<CommissionStatus | 'all'> = ['all', 'estimated', 'invoiced', 'paid', 'waived', 'disputed'];

function readInitialFilters() {
  if (typeof window === 'undefined') {
    return { status: 'all' as CommissionStatus | 'all', tenantId: 'all', dateFrom: '', dateTo: '' };
  }

  const params = new URLSearchParams(window.location.search || '');
  const status = String(params.get('status') || 'all');
  return {
    status: STATUS_OPTIONS.includes(status as CommissionStatus | 'all') ? (status as CommissionStatus | 'all') : 'all',
    tenantId: String(params.get('tenant_id') || 'all'),
    dateFrom: String(params.get('date_from') || ''),
    dateTo: String(params.get('date_to') || ''),
  };
}

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export default function AdminCommissionsPage() {
  const initialFilters = readInitialFilters();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [rows, setRows] = useState<CommissionEventRow[]>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);

  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'all'>(initialFilters.status);
  const [tenantFilter, setTenantFilter] = useState<string>(initialFilters.tenantId);
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.count += 1;
      acc.amount += Number(row.commission_amount_cents || 0);
      return acc;
    }, { count: 0, amount: 0 });
  }, [rows]);

  async function loadRows() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [tenantRows, eventRows] = await Promise.all([
        listAvailableTenants(),
        listCommissionEventsAdmin({
          status: statusFilter,
          tenant_id: tenantFilter,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
      ]);

      setTenants(tenantRows);
      setRows(eventRows);
    } catch (e: any) {
      setError(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, [isAdmin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    if (statusFilter !== 'all') params.set('status', statusFilter); else params.delete('status');
    if (tenantFilter !== 'all') params.set('tenant_id', tenantFilter); else params.delete('tenant_id');
    if (dateFrom) params.set('date_from', dateFrom); else params.delete('date_from');
    if (dateTo) params.set('date_to', dateTo); else params.delete('date_to');
    const query = params.toString();
    window.history.replaceState({}, '', query ? `/admin/commissions?${query}` : '/admin/commissions');
  }, [statusFilter, tenantFilter, dateFrom, dateTo]);

  async function applyFilters() {
    await loadRows();
  }

  async function handleMarkInvoiced(row: CommissionEventRow) {
    const invoiceId = window.prompt('Invoice ID (optional)', row.invoice_id || '') || '';
    const dueDate = window.prompt('Due date YYYY-MM-DD (optional)', row.due_date || '') || '';

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await markCommissionInvoiced({
        commission_event_id: row.id,
        invoice_provider: row.invoice_provider || 'manual',
        invoice_id: invoiceId || null,
        due_date: dueDate || null,
      });
      setSuccess('Commission event marked invoiced.');
      await loadRows();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkPaid(row: CommissionEventRow) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await markCommissionPaid({
        commission_event_id: row.id,
      });
      setSuccess('Commission event marked paid.');
      await loadRows();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetStatus(row: CommissionEventRow, status: CommissionStatus) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await markCommissionStatus({
        commission_event_id: row.id,
        status,
      });
      setSuccess(`Commission event marked ${status}.`);
      await loadRows();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const csv = commissionEventsToCsv(rows);
    const suffix = new Date().toISOString().slice(0, 10);
    downloadCsv(`commission-ledger-${suffix}.csv`, csv);
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading commission ledger admin...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Commission Ledger Admin</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track estimated, invoiced, paid, waived, and disputed commission records from client-reported outcomes.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
        >
          Export CSV
        </button>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Status</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CommissionStatus | 'all')}
          >
            {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Tenant</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
          >
            <option value="all">All tenants</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">From</label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">To</label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => void applyFilters()}
            disabled={busy}
            className="w-full rounded-md border border-cyan-400/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200 disabled:opacity-50"
          >
            Apply Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Rows</div>
          <div className="mt-2 text-xl font-bold text-white">{totals.count}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Total Commission Amount</div>
          <div className="mt-2 text-xl font-bold text-white">{toUsdFromCents(totals.amount)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 pr-3">Created</th>
                <th className="text-left py-2 pr-3">Tenant</th>
                <th className="text-left py-2 pr-3">User</th>
                <th className="text-left py-2 pr-3">Provider</th>
                <th className="text-left py-2 pr-3">Commission</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-800 align-top">
                  <td className="py-2 pr-3 text-slate-300">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-3 text-slate-300">{row.tenant_id.slice(0, 8)}...</td>
                  <td className="py-2 pr-3 text-slate-300">{row.user_id.slice(0, 8)}...</td>
                  <td className="py-2 pr-3 text-white">{row.funding_outcomes?.provider_name || '-'}</td>
                  <td className="py-2 pr-3 text-slate-200">{toUsdFromCents(row.commission_amount_cents)}</td>
                  <td className="py-2 pr-3">
                    <span className="text-xs rounded-full border border-slate-600 px-2 py-1 text-slate-300">{pretty(row.status)}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleMarkInvoiced(row)}
                        disabled={busy}
                        className="rounded-md border border-cyan-500/50 px-2 py-1 text-xs text-cyan-200 disabled:opacity-50"
                      >
                        Invoiced
                      </button>
                      <button
                        onClick={() => void handleMarkPaid(row)}
                        disabled={busy}
                        className="rounded-md border border-emerald-500/50 px-2 py-1 text-xs text-emerald-200 disabled:opacity-50"
                      >
                        Paid
                      </button>
                      <button
                        onClick={() => void handleSetStatus(row, 'waived')}
                        disabled={busy}
                        className="rounded-md border border-amber-500/50 px-2 py-1 text-xs text-amber-200 disabled:opacity-50"
                      >
                        Waived
                      </button>
                      <button
                        onClick={() => void handleSetStatus(row, 'disputed')}
                        disabled={busy}
                        className="rounded-md border border-rose-500/50 px-2 py-1 text-xs text-rose-200 disabled:opacity-50"
                      >
                        Disputed
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Commission ledger reflects client-reported outcomes and agreed disclosure terms. It does not represent guaranteed funding results.
      </p>
    </div>
  );
}
