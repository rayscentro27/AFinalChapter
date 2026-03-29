import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

type MatchRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  status: 'shortlisted' | 'dismissed' | 'drafting' | 'submitted' | 'awarded' | 'denied';
  grant_id: string;
  match_score: number;
  created_at: string;
  updated_at: string;
  grants_catalog?: {
    name?: string | null;
    sponsor?: string | null;
    deadline_date?: string | null;
  } | null;
};

type SubmissionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  grant_match_id: string;
  submission_method: 'client_self_submit' | 'assisted_submit';
  submitted_at: string | null;
  confirmation_ref: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'awarded' | 'denied';
  updated_at: string;
};

const MATCH_STATUSES: MatchRow['status'][] = ['shortlisted', 'dismissed', 'drafting', 'submitted', 'awarded', 'denied'];
const SUBMISSION_STATUSES: SubmissionRow['status'][] = ['pending', 'accepted', 'rejected', 'awarded', 'denied'];

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminGrantsTrackingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [statusFilter, setStatusFilter] = useState<'all' | MatchRow['status']>('all');
  const [submissionFilter, setSubmissionFilter] = useState<'all' | SubmissionRow['status']>('all');

  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);

  const visibleMatches = useMemo(() => {
    return matches.filter((row) => statusFilter === 'all' ? true : row.status === statusFilter);
  }, [matches, statusFilter]);

  const visibleSubmissions = useMemo(() => {
    return submissions.filter((row) => submissionFilter === 'all' ? true : row.status === submissionFilter);
  }, [submissions, submissionFilter]);

  async function loadData() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [matchesRes, submissionsRes] = await Promise.all([
        supabase
          .from('grant_matches')
          .select('id,tenant_id,user_id,client_file_id,status,grant_id,match_score,created_at,updated_at,grants_catalog(name,sponsor,deadline_date)')
          .order('updated_at', { ascending: false })
          .limit(1000),
        supabase
          .from('grant_submissions')
          .select('id,tenant_id,user_id,grant_match_id,submission_method,submitted_at,confirmation_ref,status,updated_at')
          .order('updated_at', { ascending: false })
          .limit(1000),
      ]);

      if (matchesRes.error) throw new Error(matchesRes.error.message || 'Unable to load grant matches.');
      if (submissionsRes.error) throw new Error(submissionsRes.error.message || 'Unable to load grant submissions.');

      setMatches((matchesRes.data || []) as MatchRow[]);
      setSubmissions((submissionsRes.data || []) as SubmissionRow[]);
    } catch (e: any) {
      setError(String(e?.message || e));
      setMatches([]);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [isAdmin]);

  async function updateMatchStatus(row: MatchRow, status: MatchRow['status']) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('grant_matches')
        .update({ status })
        .eq('id', row.id);

      if (updateError) throw new Error(updateError.message || 'Unable to update grant match status.');

      setSuccess('Grant match status updated.');
      await loadData();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function updateSubmissionStatus(row: SubmissionRow, status: SubmissionRow['status']) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('grant_submissions')
        .update({ status })
        .eq('id', row.id);

      if (updateError) throw new Error(updateError.message || 'Unable to update grant submission status.');

      setSuccess('Grant submission status updated.');
      await loadData();
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading grants tracking...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin Grants Tracking</h1>
        <p className="text-sm text-slate-400 mt-1">Monitor shortlist, draft, submit, and final outcome statuses across tenants.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Match Status Filter</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | MatchRow['status'])}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {MATCH_STATUSES.map((status) => (
              <option key={status} value={status}>{pretty(status)}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Submission Status Filter</label>
          <select
            value={submissionFilter}
            onChange={(e) => setSubmissionFilter(e.target.value as 'all' | SubmissionRow['status'])}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {SUBMISSION_STATUSES.map((status) => (
              <option key={status} value={status}>{pretty(status)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-x-auto">
        <div className="px-4 py-3 text-sm font-bold uppercase tracking-wider text-cyan-300 border-b border-slate-700">Grant Matches</div>
        <table className="w-full text-sm">
          <thead className="text-slate-300 border-b border-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Grant</th>
              <th className="px-3 py-2 text-left">Tenant</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Score</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Update</th>
            </tr>
          </thead>
          <tbody>
            {visibleMatches.map((row) => (
              <tr key={row.id} className="border-b border-slate-800">
                <td className="px-3 py-2">
                  <div className="font-semibold text-white">{row.grants_catalog?.name || row.grant_id}</div>
                  <div className="text-xs text-slate-400">{row.grants_catalog?.sponsor || '-'}</div>
                </td>
                <td className="px-3 py-2 text-slate-300">{row.tenant_id}</td>
                <td className="px-3 py-2 text-slate-300">{row.user_id}</td>
                <td className="px-3 py-2 text-cyan-300 font-semibold">{row.match_score}</td>
                <td className="px-3 py-2 text-slate-300">{pretty(row.status)}</td>
                <td className="px-3 py-2 text-right">
                  <select
                    value={row.status}
                    onChange={(e) => void updateMatchStatus(row, e.target.value as MatchRow['status'])}
                    disabled={busy}
                    className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                  >
                    {MATCH_STATUSES.map((status) => (
                      <option key={status} value={status}>{pretty(status)}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-x-auto">
        <div className="px-4 py-3 text-sm font-bold uppercase tracking-wider text-cyan-300 border-b border-slate-700">Grant Submissions</div>
        <table className="w-full text-sm">
          <thead className="text-slate-300 border-b border-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Submission</th>
              <th className="px-3 py-2 text-left">Method</th>
              <th className="px-3 py-2 text-left">Confirmation Ref</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Update</th>
            </tr>
          </thead>
          <tbody>
            {visibleSubmissions.map((row) => (
              <tr key={row.id} className="border-b border-slate-800">
                <td className="px-3 py-2 text-slate-300">{row.id}</td>
                <td className="px-3 py-2 text-slate-300">{pretty(row.submission_method)}</td>
                <td className="px-3 py-2 text-slate-300">{row.confirmation_ref || '-'}</td>
                <td className="px-3 py-2 text-slate-300">{pretty(row.status)}</td>
                <td className="px-3 py-2 text-right">
                  <select
                    value={row.status}
                    onChange={(e) => void updateSubmissionStatus(row, e.target.value as SubmissionRow['status'])}
                    disabled={busy}
                    className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                  >
                    {SUBMISSION_STATUSES.map((status) => (
                      <option key={status} value={status}>{pretty(status)}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
