import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type ConsentStatusRow = {
  user_id: string;
  tenant_id: string | null;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  ai_disclosure_accepted: boolean;
  disclaimers_accepted: boolean;
  comms_email_accepted: boolean;
  has_required_consents: boolean;
  last_accepted_at: string | null;
};

type ConsentRow = {
  id: string;
  consent_type: string;
  version: string;
  accepted_at: string;
  user_agent: string | null;
};

function dot(ok: boolean) {
  return ok ? 'text-emerald-400' : 'text-rose-400';
}

export default function AdminConsentViewer() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ConsentStatusRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [details, setDetails] = useState<ConsentRow[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsSuperAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);
      const { data, error: accessError } = await supabase.rpc('nexus_is_master_admin_compat');

      if (!active) return;

      if (accessError) {
        // Compatibility fallback for older environments where role strings map master admin to "admin".
        const fallback = user.role === 'admin';
        setIsSuperAdmin(fallback);
        if (!fallback) {
          setError(accessError.message || 'Unable to verify super admin access.');
        }
        setCheckingAccess(false);
        return;
      }

      setIsSuperAdmin(Boolean(data));
      setCheckingAccess(false);
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      if (checkingAccess) return;

      if (!isSuperAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      const { data, error: readError } = await supabase
        .from('user_consent_status')
        .select('user_id,tenant_id,terms_accepted,privacy_accepted,ai_disclosure_accepted,disclaimers_accepted,comms_email_accepted,has_required_consents,last_accepted_at')
        .order('last_accepted_at', { ascending: false, nullsFirst: false });

      if (!active) return;

      if (readError) {
        setError(readError.message || 'Unable to load consent status.');
        setRows([]);
        setLoading(false);
        return;
      }

      const nextRows = (data || []) as ConsentStatusRow[];
      setRows(nextRows);
      if (!selectedUserId && nextRows.length > 0) {
        setSelectedUserId(nextRows[0].user_id);
      }
      setLoading(false);
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [checkingAccess, isSuperAdmin]);

  useEffect(() => {
    let active = true;

    async function loadDetails() {
      if (!isSuperAdmin || !selectedUserId) {
        setDetails([]);
        return;
      }

      const { data, error: detailError } = await supabase
        .from('consents')
        .select('id,consent_type,version,accepted_at,user_agent')
        .eq('user_id', selectedUserId)
        .order('accepted_at', { ascending: false });

      if (!active) return;
      if (detailError) {
        setError(detailError.message || 'Unable to load consent records.');
        setDetails([]);
        return;
      }

      setDetails((data || []) as ConsentRow[]);
    }

    void loadDetails();

    return () => {
      active = false;
    };
  }, [isSuperAdmin, selectedUserId]);

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying super admin access...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 text-slate-200">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm">
          Super admin access required.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading consent ledger...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Consent Ledger</h1>
        <p className="text-sm text-slate-400 mt-1">Track required legal and communication consent acceptance by user.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Tenant</th>
                  <th className={`px-4 py-3 text-left ${dot(true)}`}>Terms</th>
                  <th className={`px-4 py-3 text-left ${dot(true)}`}>Privacy</th>
                  <th className={`px-4 py-3 text-left ${dot(true)}`}>AI</th>
                  <th className={`px-4 py-3 text-left ${dot(true)}`}>Disclaimers</th>
                  <th className={`px-4 py-3 text-left ${dot(true)}`}>Email</th>
                  <th className="px-4 py-3 text-left">Required Complete</th>
                  <th className="px-4 py-3 text-left">Last Accepted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => {
                  const selected = row.user_id === selectedUserId;
                  return (
                    <tr
                      key={row.user_id}
                      className={`cursor-pointer ${selected ? 'bg-cyan-900/20' : 'hover:bg-slate-800/60'}`}
                      onClick={() => setSelectedUserId(row.user_id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{row.user_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.tenant_id || '-'}</td>
                      <td className={`px-4 py-3 ${dot(row.terms_accepted)}`}>{row.terms_accepted ? 'Yes' : 'No'}</td>
                      <td className={`px-4 py-3 ${dot(row.privacy_accepted)}`}>{row.privacy_accepted ? 'Yes' : 'No'}</td>
                      <td className={`px-4 py-3 ${dot(row.ai_disclosure_accepted)}`}>{row.ai_disclosure_accepted ? 'Yes' : 'No'}</td>
                      <td className={`px-4 py-3 ${dot(row.disclaimers_accepted)}`}>{row.disclaimers_accepted ? 'Yes' : 'No'}</td>
                      <td className={`px-4 py-3 ${dot(row.comms_email_accepted)}`}>{row.comms_email_accepted ? 'Yes' : 'No'}</td>
                      <td className={`px-4 py-3 font-semibold ${dot(row.has_required_consents)}`}>{row.has_required_consents ? 'Complete' : 'Missing'}</td>
                      <td className="px-4 py-3 text-slate-300">{row.last_accepted_at ? new Date(row.last_accepted_at).toLocaleString() : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-bold text-white">Consent Record Details</h2>
          <p className="text-xs text-slate-400 break-all">User: {selectedUserId || '-'}</p>
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {details.length === 0 ? (
              <div className="text-xs text-slate-500">No consent rows found.</div>
            ) : details.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-xs">
                <div className="font-semibold text-cyan-300">{item.consent_type} ({item.version})</div>
                <div className="text-slate-300 mt-1">{new Date(item.accepted_at).toLocaleString()}</div>
                <div className="text-slate-500 mt-1 line-clamp-2">UA: {item.user_agent || 'unknown'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
