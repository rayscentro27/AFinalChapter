import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  DocumentApprovalRow,
  DocumentCategory,
  DocumentRow,
  DocumentStatus,
  DocumentSourceType,
  getSignedDocumentUrl,
} from '../services/documentCenterService';

const CATEGORY_FILTERS: Array<'all' | DocumentCategory> = ['all', 'credit', 'funding', 'grants', 'sba', 'legal'];
const STATUS_FILTERS: Array<'all' | DocumentStatus> = ['all', 'draft', 'needs_review', 'approved', 'finalized', 'mailed', 'archived'];
const SOURCE_FILTERS: Array<'all' | DocumentSourceType> = ['all', 'ai_artifact', 'finalized_letter', 'upload', 'manual'];

function prettyLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminDocumentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [approvals, setApprovals] = useState<DocumentApprovalRow[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<'all' | DocumentCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentStatus>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | DocumentSourceType>('all');

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);
      const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
      if (!active) return;

      if (accessRes.error) {
        setIsAdmin(user.role === 'admin');
      } else {
        setIsAdmin(Boolean(accessRes.data) || user.role === 'admin');
      }

      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  async function loadData() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const docsRes = await supabase
        .from('documents')
        .select('id,tenant_id,user_id,category,title,status,source_type,source_id,storage_path,content_hash,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(800);

      if (docsRes.error) {
        throw new Error(docsRes.error.message || 'Unable to load documents.');
      }

      const rows = (docsRes.data || []) as DocumentRow[];
      setDocuments(rows);

      if (!selectedDocumentId && rows.length > 0) {
        setSelectedDocumentId(rows[0].id);
      }

      if (rows.length > 0) {
        const ids = rows.map((doc) => doc.id);
        const approvalsRes = await supabase
          .from('document_approvals')
          .select('id,tenant_id,user_id,document_id,approval_type,policy_version_id,approved_at,ip_hash,user_agent,notes')
          .in('document_id', ids)
          .order('approved_at', { ascending: false })
          .limit(1200);

        if (approvalsRes.error) {
          throw new Error(approvalsRes.error.message || 'Unable to load approvals.');
        }

        setApprovals((approvalsRes.data || []) as DocumentApprovalRow[]);
      } else {
        setApprovals([]);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setDocuments([]);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checkingAccess || !isAdmin) {
      setLoading(false);
      return;
    }

    void loadData();
  }, [checkingAccess, isAdmin]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && doc.source_type !== sourceFilter) return false;
      return true;
    });
  }, [documents, categoryFilter, statusFilter, sourceFilter]);

  const selectedDocument = useMemo(() => {
    if (!selectedDocumentId) return null;
    return documents.find((doc) => doc.id === selectedDocumentId) || null;
  }, [documents, selectedDocumentId]);

  const selectedApprovals = useMemo(() => {
    if (!selectedDocument) return [];
    return approvals
      .filter((approval) => approval.document_id === selectedDocument.id)
      .sort((a, b) => String(b.approved_at).localeCompare(String(a.approved_at)));
  }, [approvals, selectedDocument]);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (!selectedDocument?.storage_path) {
        if (!active) return;
        setPreviewUrl(null);
        return;
      }

      try {
        const signed = await getSignedDocumentUrl(selectedDocument.storage_path);
        if (!active) return;
        setPreviewUrl(signed);
      } catch {
        if (!active) return;
        setPreviewUrl(null);
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [selectedDocument?.id]);

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying admin access...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading admin documents...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin Documents</h1>
        <p className="text-sm text-slate-400 mt-1">Tenant document inventory with approval proof logs.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Category</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | DocumentCategory)}
          >
            {CATEGORY_FILTERS.map((value) => (
              <option key={value} value={value}>{prettyLabel(value)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Status</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | DocumentStatus)}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>{prettyLabel(value)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Source</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | DocumentSourceType)}
          >
            {SOURCE_FILTERS.map((value) => (
              <option key={value} value={value}>{prettyLabel(value)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={() => void loadData()}
            className="w-full rounded-md border border-cyan-500/40 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-left">Approvals</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredDocuments.map((doc) => {
                const count = approvals.filter((approval) => approval.document_id === doc.id).length;
                return (
                  <tr key={doc.id}>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-200">{doc.title}</p>
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">{doc.id}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">{prettyLabel(doc.category)}</td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wider text-cyan-300">{prettyLabel(doc.status)}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{prettyLabel(doc.source_type)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{doc.user_id}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(doc.updated_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedDocumentId(doc.id)}
                        className="rounded-md border border-slate-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-200"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDocument ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">Selected Document</h2>
            <div className="text-xs text-slate-400 space-y-1">
              <p>Title: <span className="text-slate-200">{selectedDocument.title}</span></p>
              <p>Status: <span className="text-slate-200">{prettyLabel(selectedDocument.status)}</span></p>
              <p>Source: <span className="text-slate-200">{prettyLabel(selectedDocument.source_type)}</span></p>
              <p>Storage: <span className="font-mono text-slate-300">{selectedDocument.storage_path || '-'}</span></p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden min-h-[20rem]">
              {previewUrl ? (
                <iframe title="Admin Document Preview" src={previewUrl} className="w-full min-h-[20rem]" />
              ) : (
                <div className="min-h-[20rem] flex items-center justify-center text-sm text-slate-500">Preview unavailable.</div>
              )}
            </div>

            <p className="text-xs text-slate-500">Educational-only output preview. No performance or outcome guarantees.</p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">Approval Logs</h2>
            <div className="mt-3 space-y-2 max-h-[30rem] overflow-y-auto pr-1">
              {selectedApprovals.length === 0 ? (
                <p className="text-sm text-slate-400">No approvals recorded for this document.</p>
              ) : selectedApprovals.map((approval) => (
                <div key={approval.id} className="rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-200">{prettyLabel(approval.approval_type)}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Approved: {new Date(approval.approved_at).toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500">User: <span className="font-mono">{approval.user_id}</span></p>
                  <p className="text-[11px] text-slate-500">IP Hash: {approval.ip_hash || '-'}</p>
                  <p className="text-[11px] text-slate-500">Policy Version ID: {approval.policy_version_id || '-'}</p>
                  {approval.notes ? <p className="text-[11px] text-slate-400 mt-1">Notes: {approval.notes}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
