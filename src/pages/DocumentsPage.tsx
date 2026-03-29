import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  approveDocument,
  DocumentApprovalRow,
  DocumentCategory,
  DocumentRow,
  DocumentStatus,
  getSignedDocumentUrl,
} from '../services/documentCenterService';

const CATEGORY_FILTERS: Array<'all' | DocumentCategory> = ['all', 'credit', 'funding', 'grants', 'sba', 'legal'];
const STATUS_FILTERS: Array<'all' | DocumentStatus> = ['all', 'draft', 'needs_review', 'approved', 'finalized', 'mailed', 'archived'];

function prettyLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function toneForStatus(status: string): string {
  if (status === 'mailed' || status === 'finalized' || status === 'approved') return 'text-emerald-300';
  if (status === 'needs_review') return 'text-amber-300';
  if (status === 'draft') return 'text-cyan-300';
  return 'text-slate-300';
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [note, setNote] = useState('');

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [approvals, setApprovals] = useState<DocumentApprovalRow[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<'all' | DocumentCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentStatus>('all');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState<string>('');
  const [mailingHref, setMailingHref] = useState('/mailing-authorization');

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      return true;
    });
  }, [documents, categoryFilter, statusFilter]);

  const selectedDocument = useMemo(() => {
    if (!selectedDocumentId) return null;
    return documents.find((doc) => doc.id === selectedDocumentId) || null;
  }, [documents, selectedDocumentId]);

  const selectedApprovals = useMemo(() => {
    if (!selectedDocument) return [];
    return approvals
      .filter((item) => item.document_id === selectedDocument.id)
      .sort((a, b) => String(b.approved_at).localeCompare(String(a.approved_at)));
  }, [approvals, selectedDocument]);

  async function loadDocuments() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const docsRes = await supabase
        .from('documents')
        .select('id,tenant_id,user_id,category,title,status,source_type,source_id,storage_path,content_hash,created_at,updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (docsRes.error) {
        throw new Error(docsRes.error.message || 'Unable to load documents.');
      }

      const nextDocs = (docsRes.data || []) as DocumentRow[];
      setDocuments(nextDocs);

      if (!selectedDocumentId && nextDocs.length > 0) {
        setSelectedDocumentId(nextDocs[0].id);
      }

      if (nextDocs.length > 0) {
        const docIds = nextDocs.map((doc) => doc.id);
        const approvalsRes = await supabase
          .from('document_approvals')
          .select('id,tenant_id,user_id,document_id,approval_type,policy_version_id,approved_at,ip_hash,user_agent,notes')
          .in('document_id', docIds)
          .order('approved_at', { ascending: false })
          .limit(800);

        if (approvalsRes.error) {
          throw new Error(approvalsRes.error.message || 'Unable to load document approvals.');
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
    void loadDocuments();
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (!selectedDocument) {
        if (!active) return;
        setPreviewUrl(null);
        setPreviewMarkdown('');
        setMailingHref('/mailing-authorization');
        return;
      }

      setPreviewUrl(null);
      setPreviewMarkdown('');

      if (selectedDocument.storage_path) {
        try {
          const signed = await getSignedDocumentUrl(selectedDocument.storage_path);
          if (!active) return;
          setPreviewUrl(signed);
        } catch {
          if (!active) return;
          setPreviewUrl(null);
        }
      }

      if (!selectedDocument.storage_path && selectedDocument.source_type === 'ai_artifact' && selectedDocument.source_id) {
        const draftRes = await supabase
          .from('ai_letter_drafts')
          .select('draft_md')
          .eq('id', selectedDocument.source_id)
          .eq('user_id', user?.id || '')
          .maybeSingle();

        if (!active) return;
        if (!draftRes.error && draftRes.data?.draft_md) {
          setPreviewMarkdown(String(draftRes.data.draft_md));
        }
      }

      if (selectedDocument.source_type === 'finalized_letter' && selectedDocument.source_id) {
        const finalizedRes = await supabase
          .from('finalized_letters')
          .select('dispute_packet_id')
          .eq('id', selectedDocument.source_id)
          .limit(1)
          .maybeSingle();

        if (!active) return;
        if (!finalizedRes.error && finalizedRes.data?.dispute_packet_id) {
          setMailingHref(`/dispute-letter-preview?packet_id=${encodeURIComponent(String(finalizedRes.data.dispute_packet_id))}`);
        } else {
          setMailingHref('/mailing-authorization');
        }
      } else {
        setMailingHref('/mailing-authorization');
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [selectedDocument?.id, user?.id]);

  async function handleApproval(approvalType: 'review_ack' | 'authorize_mailing') {
    if (!user?.id || !selectedDocument) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await approveDocument({
        document_id: selectedDocument.id,
        user_id: user.id,
        approval_type: approvalType,
        notes: note || null,
      });

      setSuccess(approvalType === 'review_ack'
        ? 'Review acknowledgment recorded with proof log.'
        : 'Mailing authorization recorded with proof log.');
      setNote('');
      await loadDocuments();
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading Document Center...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Document Center</h1>
        <p className="text-sm text-slate-400 mt-2">
          Review, approve, preview, and download your generated educational documents with proof logs.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Category</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | DocumentCategory)}
          >
            {CATEGORY_FILTERS.map((item) => (
              <option key={item} value={item}>{prettyLabel(item)}</option>
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
            {STATUS_FILTERS.map((item) => (
              <option key={item} value={item}>{prettyLabel(item)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={() => void loadDocuments()}
            className="w-full rounded-md border border-cyan-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200"
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 lg:col-span-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">My Documents</h2>
          <div className="mt-3 space-y-2 max-h-[36rem] overflow-y-auto pr-1">
            {filteredDocuments.length === 0 ? (
              <div className="text-sm text-slate-400">No documents found for current filters.</div>
            ) : filteredDocuments.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocumentId(doc.id)}
                className={`w-full text-left rounded-lg border px-3 py-3 transition ${selectedDocumentId === doc.id
                  ? 'border-cyan-400/60 bg-cyan-950/20'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wider text-white">{doc.title}</p>
                <p className="text-[11px] text-slate-400 mt-1">{prettyLabel(doc.category)} · {prettyLabel(doc.source_type)}</p>
                <p className={`text-[11px] mt-1 font-semibold uppercase tracking-wide ${toneForStatus(doc.status)}`}>{prettyLabel(doc.status)}</p>
                <p className="text-[10px] text-slate-500 mt-1">{new Date(doc.updated_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 lg:col-span-2 space-y-4">
          {!selectedDocument ? (
            <div className="text-sm text-slate-400">Select a document to preview and approve.</div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-sm space-y-1">
                <p className="text-white font-semibold">{selectedDocument.title}</p>
                <p className="text-xs text-slate-400">Document ID: <span className="font-mono">{selectedDocument.id}</span></p>
                <p className="text-xs text-slate-400">Category: {prettyLabel(selectedDocument.category)} · Status: {prettyLabel(selectedDocument.status)}</p>
                <p className="text-xs text-slate-400">Source: {prettyLabel(selectedDocument.source_type)}{selectedDocument.source_id ? ` (${selectedDocument.source_id})` : ''}</p>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden min-h-[22rem]">
                {previewUrl ? (
                  <iframe title="Document Preview" src={previewUrl} className="w-full min-h-[22rem] bg-slate-950" />
                ) : previewMarkdown ? (
                  <pre className="p-4 text-xs text-slate-200 whitespace-pre-wrap">{previewMarkdown}</pre>
                ) : (
                  <div className="min-h-[22rem] flex items-center justify-center text-slate-500 text-sm">Preview unavailable for this document.</div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Educational-only documents and templates. Review carefully before any optional submission or mailing. Results vary.
              </p>

              <div className="flex flex-wrap gap-2">
                {previewUrl ? (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-slate-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-200"
                  >
                    Open Preview
                  </a>
                ) : null}

                {previewUrl ? (
                  <a
                    href={previewUrl}
                    download
                    className="rounded-md border border-cyan-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200"
                  >
                    Download
                  </a>
                ) : null}

                {(selectedDocument.category === 'credit' || selectedDocument.category === 'grants') ? (
                  <button
                    disabled={busy}
                    onClick={() => void handleApproval('review_ack')}
                    className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
                  >
                    {busy ? 'Saving...' : 'Acknowledge Review'}
                  </button>
                ) : null}

                {selectedDocument.source_type === 'finalized_letter' ? (
                  <button
                    disabled={busy}
                    onClick={() => void handleApproval('authorize_mailing')}
                    className="rounded-md border border-amber-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-200 disabled:opacity-50"
                  >
                    {busy ? 'Saving...' : 'Authorize Mailing'}
                  </button>
                ) : null}

                {selectedDocument.source_type === 'finalized_letter' ? (
                  <a
                    href={mailingHref}
                    className="rounded-md border border-emerald-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-200"
                  >
                    Open Mailing Gate
                  </a>
                ) : null}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional approval notes"
                className="w-full min-h-[70px] rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              />

              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300">Proof Logs</h3>
                <div className="mt-2 space-y-2">
                  {selectedApprovals.length === 0 ? (
                    <p className="text-xs text-slate-500">No approvals recorded yet.</p>
                  ) : selectedApprovals.map((approval) => (
                    <div key={approval.id} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-200">{prettyLabel(approval.approval_type)}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Approved: {new Date(approval.approved_at).toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500">IP Hash: {approval.ip_hash || '-'}</p>
                      <p className="text-[11px] text-slate-500">Policy Version ID: {approval.policy_version_id || '-'}</p>
                      {approval.notes ? <p className="text-[11px] text-slate-400 mt-1">Notes: {approval.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
