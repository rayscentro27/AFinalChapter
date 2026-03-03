import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  ConsentRequirementRow,
  LEGAL_DOCUMENT_KEYS,
  LEGAL_DOCUMENT_LABELS,
  LegalDocumentKey,
  LegalDocumentRow,
  LegalDocumentStatus,
  legalDocKeyToConsentType,
  suggestNextVersionTag,
} from '../../components/legal/legalDocuments';

type StatusOption = LegalDocumentStatus;

const STATUS_OPTIONS: StatusOption[] = ['draft', 'published', 'archived'];

function sortByCreatedAtDesc(a: LegalDocumentRow, b: LegalDocumentRow): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export default function AdminLegalPublisher() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [documents, setDocuments] = useState<LegalDocumentRow[]>([]);
  const [requirements, setRequirements] = useState<ConsentRequirementRow[]>([]);

  const [selectedDocKey, setSelectedDocKey] = useState<LegalDocumentKey>('terms');
  const [selectedVersion, setSelectedVersion] = useState('');

  const [versionInput, setVersionInput] = useState('v1');
  const [titleInput, setTitleInput] = useState(LEGAL_DOCUMENT_LABELS.terms);
  const [subtitleInput, setSubtitleInput] = useState('');
  const [markdownInput, setMarkdownInput] = useState('');
  const [statusInput, setStatusInput] = useState<StatusOption>('draft');

  const docsForSelectedKey = useMemo(() => {
    return documents
      .filter((doc) => doc.doc_key === selectedDocKey)
      .sort(sortByCreatedAtDesc);
  }, [documents, selectedDocKey]);

  const activeDocForSelectedKey = useMemo(() => {
    return docsForSelectedKey.find((doc) => doc.is_active) || null;
  }, [docsForSelectedKey]);

  const selectedDocRequirement = useMemo(() => {
    const consentType = legalDocKeyToConsentType(selectedDocKey);
    if (!consentType) return null;
    return requirements.find((row) => row.consent_type === consentType) || null;
  }, [requirements, selectedDocKey]);

  function applyEditorFromDoc(doc: LegalDocumentRow) {
    setSelectedVersion(doc.version);
    setVersionInput(doc.version);
    setTitleInput(doc.title || LEGAL_DOCUMENT_LABELS[doc.doc_key]);
    setSubtitleInput(doc.subtitle || '');
    setMarkdownInput(doc.markdown_body || '');
    setStatusInput(doc.status || 'draft');
  }

  function seedEditorForNewVersion(docKey: LegalDocumentKey, sourceDoc: LegalDocumentRow | null, existingVersions: string[]) {
    setSelectedVersion('');
    setVersionInput(suggestNextVersionTag(existingVersions));
    setTitleInput(sourceDoc?.title || LEGAL_DOCUMENT_LABELS[docKey]);
    setSubtitleInput(sourceDoc?.subtitle || '');
    setMarkdownInput(sourceDoc?.markdown_body || '');
    setStatusInput('draft');
  }

  async function loadData() {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [docsRes, reqRes] = await Promise.all([
        supabase
          .from('legal_documents')
          .select('id,doc_key,version,title,subtitle,markdown_body,status,is_active,created_at,updated_at')
          .order('doc_key', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase
          .from('consent_requirements')
          .select('consent_type,current_version,is_required'),
      ]);

      if (docsRes.error) throw new Error(docsRes.error.message || 'Unable to load legal documents.');
      if (reqRes.error) throw new Error(reqRes.error.message || 'Unable to load consent requirements.');

      const docs = (docsRes.data || []) as LegalDocumentRow[];
      const reqs = (reqRes.data || []) as ConsentRequirementRow[];

      setDocuments(docs);
      setRequirements(reqs);

      const selectedKeyDocs = docs.filter((doc) => doc.doc_key === selectedDocKey).sort(sortByCreatedAtDesc);
      const preferred = selectedKeyDocs.find((doc) => doc.is_active) || selectedKeyDocs[0] || null;
      if (preferred) {
        applyEditorFromDoc(preferred);
      } else {
        seedEditorForNewVersion(selectedDocKey, null, []);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [isSuperAdmin]);

  useEffect(() => {
    const keyDocs = documents.filter((doc) => doc.doc_key === selectedDocKey).sort(sortByCreatedAtDesc);
    if (keyDocs.length === 0) {
      seedEditorForNewVersion(selectedDocKey, null, []);
      return;
    }

    const preferred = keyDocs.find((doc) => doc.is_active) || keyDocs[0];
    applyEditorFromDoc(preferred);
  }, [selectedDocKey]);

  async function saveVersion() {
    if (!user?.id) return;

    const version = versionInput.trim();
    const title = titleInput.trim();
    const markdownBody = markdownInput.trim();

    if (!version) {
      setError('Version is required.');
      return;
    }

    if (!title) {
      setError('Title is required.');
      return;
    }

    if (!markdownBody) {
      setError('Document body is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const payload = {
      doc_key: selectedDocKey,
      version,
      title,
      subtitle: subtitleInput.trim() || null,
      markdown_body: markdownBody,
      status: statusInput,
      is_active: false,
      created_by_user_id: user.id,
    };

    const { error: saveError } = await supabase
      .from('legal_documents')
      .upsert(payload, { onConflict: 'doc_key,version' });

    if (saveError) {
      setSaving(false);
      setError(saveError.message || 'Unable to save legal document version.');
      return;
    }

    setSuccess(`Saved ${selectedDocKey} ${version}.`);
    setSelectedVersion(version);
    await loadData();
    setSaving(false);
  }

  async function publishVersion(versionOverride?: string) {
    const version = String(versionOverride || versionInput || '').trim();
    if (!version) {
      setError('Select or enter a version to publish.');
      return;
    }

    setPublishing(true);
    setError('');
    setSuccess('');

    const { error: publishError } = await supabase.rpc('admin_publish_legal_document', {
      p_doc_key: selectedDocKey,
      p_version: version,
    });

    if (publishError) {
      setPublishing(false);
      setError(publishError.message || 'Unable to publish legal document version.');
      return;
    }

    setSuccess(`Published ${selectedDocKey} ${version}.`);
    await loadData();
    setPublishing(false);
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading legal publisher...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin Legal Publisher</h1>
        <p className="text-sm text-slate-400 mt-1">Create, version, and publish legal documents with durable consent version control.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-bold text-white">Document Keys</h2>
          <div className="space-y-2">
            {LEGAL_DOCUMENT_KEYS.map((docKey) => {
              const activeDoc = documents.find((doc) => doc.doc_key === docKey && doc.is_active) || null;
              const isSelected = selectedDocKey === docKey;
              const consentType = legalDocKeyToConsentType(docKey);
              const requirement = consentType
                ? requirements.find((row) => row.consent_type === consentType) || null
                : null;

              return (
                <button
                  key={docKey}
                  onClick={() => setSelectedDocKey(docKey)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${isSelected ? 'border-cyan-400/50 bg-cyan-900/20' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
                >
                  <div className="text-sm font-semibold text-white">{LEGAL_DOCUMENT_LABELS[docKey]}</div>
                  <div className="mt-1 text-xs text-slate-400">Active: {activeDoc?.version || 'none'}</div>
                  {requirement ? (
                    <div className="text-[11px] text-cyan-300 mt-1">Required consent version: {requirement.current_version}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-white">{LEGAL_DOCUMENT_LABELS[selectedDocKey]}</h2>
            <button
              onClick={() => seedEditorForNewVersion(selectedDocKey, activeDocForSelectedKey, docsForSelectedKey.map((item) => item.version))}
              className="rounded-lg border border-cyan-400/40 bg-cyan-900/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100"
            >
              New Version Draft
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Select Existing Version</label>
              <select
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                value={selectedVersion}
                onChange={(e) => {
                  const nextVersion = e.target.value;
                  setSelectedVersion(nextVersion);
                  const found = docsForSelectedKey.find((item) => item.version === nextVersion);
                  if (found) applyEditorFromDoc(found);
                }}
              >
                <option value="">-</option>
                {docsForSelectedKey.map((item) => (
                  <option key={item.id} value={item.version}>
                    {item.version} ({item.status}{item.is_active ? ', active' : ''})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Version</label>
              <input
                value={versionInput}
                onChange={(e) => setVersionInput(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                placeholder="v2"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Title</label>
            <input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Subtitle</label>
            <input
              value={subtitleInput}
              onChange={(e) => setSubtitleInput(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Status</label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value as StatusOption)}
              className="w-full md:w-64 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Markdown Body</label>
            <textarea
              value={markdownInput}
              onChange={(e) => setMarkdownInput(e.target.value)}
              rows={14}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void saveVersion()}
              disabled={saving || publishing}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Version'}
            </button>
            <button
              onClick={() => void publishVersion()}
              disabled={publishing || saving}
              className="rounded-lg border border-emerald-400/40 bg-emerald-900/30 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-100 disabled:opacity-50"
            >
              {publishing ? 'Publishing...' : 'Publish Version'}
            </button>
            {selectedDocRequirement ? (
              <div className="self-center text-xs text-slate-400">
                Required consent version: <span className="text-cyan-300">{selectedDocRequirement.current_version}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Version</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Active</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {docsForSelectedKey.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-200">{doc.version}</td>
                  <td className="px-4 py-3 text-slate-300">{doc.status}</td>
                  <td className="px-4 py-3 text-slate-300">{doc.is_active ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(doc.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void publishVersion(doc.version)}
                      disabled={publishing}
                      className="rounded-md border border-emerald-400/40 bg-emerald-900/30 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-100 disabled:opacity-50"
                    >
                      Publish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
