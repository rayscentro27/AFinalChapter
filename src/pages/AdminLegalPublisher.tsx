import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BACKEND_CONFIG } from '../../adapters/config';
import { supabase } from '../../lib/supabaseClient';
import LegalMarkdownContent from '../../components/legal/LegalMarkdownContent';
import {
  LEGAL_DOCUMENT_KEYS,
  LEGAL_DOCUMENT_LABELS,
  LegalDocumentKey,
  suggestNextVersionTag,
} from '../../components/legal/legalDocuments';

type PolicyVersionSummary = {
  id: string;
  document_id: string;
  version: string;
  content_hash: string;
  published_at: string | null;
  published_by: string | null;
  is_published: boolean;
  created_at: string;
};

type PolicyRow = {
  id: string;
  key: LegalDocumentKey;
  title: string;
  is_active: boolean;
  require_reaccept_on_publish: boolean;
  created_at: string;
  updated_at: string;
  latest_published: PolicyVersionSummary | null;
  versions: PolicyVersionSummary[];
};

type PolicyLatestPayload = {
  title: string;
  version: string;
  content_md: string;
  content_hash: string;
  policy_version_id: string;
  published_at: string | null;
};

function shortHash(hash: string | null | undefined): string {
  const value = String(hash || '').trim();
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function parsePoliciesPayload(payload: any): PolicyRow[] {
  const raw = Array.isArray(payload?.policies) ? payload.policies : [];
  return raw as PolicyRow[];
}

async function getAccessToken(): Promise<string> {
  const sessionRes = await supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  return token;
}

async function policyAdminRequest(path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const baseUrl = String(BACKEND_CONFIG.supabase.url || '').replace(/\/+$/, '');
  const anonKey = String(BACKEND_CONFIG.supabase.key || '');

  if (!baseUrl || baseUrl.includes('placeholder')) {
    throw new Error('Supabase URL is not configured.');
  }

  const response = await fetch(`${baseUrl}/functions/v1/policy-admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || `Request failed (${response.status})`));
  }
  return payload;
}

export default function AdminLegalPublisher() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('terms');

  const [titleInput, setTitleInput] = useState(LEGAL_DOCUMENT_LABELS.terms);
  const [versionInput, setVersionInput] = useState('v1');
  const [publishVersionInput, setPublishVersionInput] = useState('');
  const [markdownInput, setMarkdownInput] = useState('');
  const [requireReacceptInput, setRequireReacceptInput] = useState(true);

  const selectedPolicy = useMemo(
    () => policies.find((item) => item.key === selectedKey) || null,
    [policies, selectedKey],
  );

  async function checkAccess() {
    if (!user?.id) {
      setIsSuperAdmin(false);
      setCheckingAccess(false);
      return;
    }

    setCheckingAccess(true);
    const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
    if (accessRes.error) {
      const fallback = user.role === 'admin';
      setIsSuperAdmin(fallback);
      if (!fallback) {
        setError(accessRes.error.message || 'Unable to verify super admin access.');
      }
    } else {
      setIsSuperAdmin(Boolean(accessRes.data));
    }
    setCheckingAccess(false);
  }

  async function loadPolicies(preserveSelected = true) {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = await policyAdminRequest('/policies', { method: 'GET' });
      const rows = parsePoliciesPayload(payload);
      setPolicies(rows);

      if (!preserveSelected || !rows.some((item) => item.key === selectedKey)) {
        const first = rows[0]?.key || 'terms';
        setSelectedKey(first);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadLatestForSelected(docKey: LegalDocumentKey) {
    setError('');

    try {
      const payload = (await policyAdminRequest(`/policies/${docKey}/latest`, { method: 'GET' })) as PolicyLatestPayload;

      const selected = policies.find((item) => item.key === docKey) || null;
      const allVersions = selected?.versions?.map((item) => item.version) || [];

      setTitleInput(payload?.title || LEGAL_DOCUMENT_LABELS[docKey]);
      setVersionInput(suggestNextVersionTag(allVersions));
      setPublishVersionInput(payload?.version || '');
      setMarkdownInput(payload?.content_md || '');
      setRequireReacceptInput(selected?.require_reaccept_on_publish ?? ['terms', 'privacy', 'ai_disclosure', 'disclaimers'].includes(docKey));
    } catch {
      const selected = policies.find((item) => item.key === docKey) || null;
      const allVersions = selected?.versions?.map((item) => item.version) || [];
      setTitleInput(selected?.title || LEGAL_DOCUMENT_LABELS[docKey]);
      setVersionInput(suggestNextVersionTag(allVersions));
      setPublishVersionInput(selected?.latest_published?.version || '');
      setMarkdownInput('');
      setRequireReacceptInput(selected?.require_reaccept_on_publish ?? ['terms', 'privacy', 'ai_disclosure', 'disclaimers'].includes(docKey));
    }
  }

  async function loadVersionIntoEditor(versionId: string) {
    const res = await supabase
      .from('policy_versions')
      .select('id,version,content_md')
      .eq('id', versionId)
      .maybeSingle();

    if (res.error) {
      throw new Error(res.error.message || 'Unable to load policy version content.');
    }

    if (!res.data) {
      throw new Error('Policy version not found.');
    }

    setVersionInput(String(res.data.version || 'v1'));
    setMarkdownInput(String((res.data as any).content_md || ''));
  }

  useEffect(() => {
    void checkAccess();
  }, [user?.id]);

  useEffect(() => {
    if (checkingAccess) return;
    void loadPolicies(false);
  }, [checkingAccess, isSuperAdmin]);

  useEffect(() => {
    if (loading || policies.length === 0) return;
    void loadLatestForSelected(selectedKey);
  }, [selectedKey, loading, policies.length]);

  async function saveDraft() {
    const version = versionInput.trim();
    const title = titleInput.trim();
    const contentMd = markdownInput.trim();

    if (!version) {
      setError('Version is required.');
      return;
    }

    if (!title) {
      setError('Title is required.');
      return;
    }

    if (!contentMd) {
      setError('Markdown content is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await policyAdminRequest(`/policies/${selectedKey}/draft`, {
        method: 'POST',
        body: JSON.stringify({
          version,
          title,
          content_md: contentMd,
          require_reaccept_on_publish: requireReacceptInput,
          is_active: true,
        }),
      });

      setSuccess(`Saved ${selectedKey} ${version} draft.`);
      setPublishVersionInput(version);
      await loadPolicies();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function publishVersion(versionOverride?: string) {
    const version = String(versionOverride || publishVersionInput || '').trim();
    if (!version) {
      setError('Select a version to publish.');
      return;
    }

    setPublishing(true);
    setError('');
    setSuccess('');

    try {
      await policyAdminRequest(`/policies/${selectedKey}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          version,
          require_reaccept_on_publish: requireReacceptInput,
        }),
      });

      setSuccess(`Published ${selectedKey} ${version}.`);
      setPublishVersionInput(version);
      await loadPolicies();
      await loadLatestForSelected(selectedKey);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPublishing(false);
    }
  }

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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading policy documents...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Policy Documents</h1>
        <p className="text-sm text-slate-400 mt-1">Versioned legal content with immutable history, publish hashes, and consent linkage.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-bold text-white">Policy Keys</h2>
          <div className="space-y-2">
            {LEGAL_DOCUMENT_KEYS.map((key) => {
              const item = policies.find((p) => p.key === key) || null;
              const selected = selectedKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${selected ? 'border-cyan-400/50 bg-cyan-900/20' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
                >
                  <div className="text-sm font-semibold text-white">{item?.title || LEGAL_DOCUMENT_LABELS[key]}</div>
                  <div className="mt-1 text-xs text-slate-400">Latest: {item?.latest_published?.version || 'none'}</div>
                  <div className="mt-1 text-[11px] text-slate-500">Re-accept on publish: {item?.require_reaccept_on_publish ? 'yes' : 'no'}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-9 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Title</label>
              <input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Draft Version</label>
                <input
                  value={versionInput}
                  onChange={(e) => setVersionInput(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                  placeholder="v2"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Publish Version</label>
                <select
                  value={publishVersionInput}
                  onChange={(e) => setPublishVersionInput(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                >
                  <option value="">-</option>
                  {(selectedPolicy?.versions || []).map((version) => (
                    <option key={version.id} value={version.version}>
                      {version.version}{version.is_published ? ' (published)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={requireReacceptInput}
              onChange={(e) => setRequireReacceptInput(e.target.checked)}
            />
            Require re-acceptance when this policy is republished.
          </label>

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Markdown</label>
            <textarea
              value={markdownInput}
              onChange={(e) => setMarkdownInput(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void saveDraft()}
              disabled={saving || publishing}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => void publishVersion()}
              disabled={publishing || saving}
              className="rounded-lg border border-emerald-400/40 bg-emerald-900/30 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-100 disabled:opacity-50"
            >
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 space-y-3">
            <div className="text-xs uppercase tracking-widest text-slate-400">Preview</div>
            {markdownInput.trim() ? (
              <LegalMarkdownContent markdown={markdownInput} />
            ) : (
              <div className="text-sm text-slate-500">Enter markdown to preview.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Version</th>
                <th className="px-4 py-3 text-left">Published</th>
                <th className="px-4 py-3 text-left">Hash</th>
                <th className="px-4 py-3 text-left">Published At</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(selectedPolicy?.versions || []).map((version) => (
                <tr key={version.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-200">{version.version}</td>
                  <td className="px-4 py-3 text-slate-300">{version.is_published ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{shortHash(version.content_hash)}</td>
                  <td className="px-4 py-3 text-slate-300">{version.published_at ? new Date(version.published_at).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(version.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          void loadVersionIntoEditor(version.id).catch((e: any) => setError(String(e?.message || e)));
                          setPublishVersionInput(version.version);
                        }}
                        className="rounded-md border border-slate-500/40 bg-slate-700/70 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-100"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => void publishVersion(version.version)}
                        disabled={publishing}
                        className="rounded-md border border-emerald-400/40 bg-emerald-900/30 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-100 disabled:opacity-50"
                      >
                        Publish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(selectedPolicy?.versions || []).length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={6}>No versions yet for this policy key.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
