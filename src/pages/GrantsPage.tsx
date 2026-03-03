import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserTier, isSubscriptionEntitled, UserTierState } from '../billing/tier';
import { supabase } from '../../lib/supabaseClient';
import {
  createGrantDraft,
  GrantCatalogRow,
  GrantDraftRow,
  GrantMatchRow,
  GrantSubmissionRow,
  listGrantCatalog,
  listGrantDrafts,
  listGrantMatches,
  listGrantSubmissions,
  markGrantDraftApproved,
  markGrantSubmitted,
  shortlistGrants,
} from '../services/grantsEngineService';

type TabKey = 'catalog' | 'shortlist' | 'drafts' | 'submissions';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'catalog', label: 'Catalog' },
  { key: 'shortlist', label: 'My Shortlist' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'submissions', label: 'Submissions' },
];

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysUntil(dateInput: string | null | undefined): string {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '-';
  const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `Past due (${Math.abs(days)}d)`;
  return `${days} day(s)`;
}

export default function GrantsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activeTab, setActiveTab] = useState<TabKey>('shortlist');
  const [tierState, setTierState] = useState<UserTierState | null>(null);

  const [catalog, setCatalog] = useState<GrantCatalogRow[]>([]);
  const [matches, setMatches] = useState<GrantMatchRow[]>([]);
  const [drafts, setDrafts] = useState<GrantDraftRow[]>([]);
  const [submissions, setSubmissions] = useState<GrantSubmissionRow[]>([]);

  const [clientFileId, setClientFileId] = useState('');
  const [geoFilter, setGeoFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const [documentByDraft, setDocumentByDraft] = useState<Record<string, string>>({});
  const [authorizedDocuments, setAuthorizedDocuments] = useState<Record<string, boolean>>({});

  const [submissionMethodByMatch, setSubmissionMethodByMatch] = useState<Record<string, 'client_self_submit' | 'assisted_submit'>>({});
  const [confirmationByMatch, setConfirmationByMatch] = useState<Record<string, string>>({});

  const isPremium = Boolean(tierState?.tier === 'PREMIUM' && isSubscriptionEntitled(tierState.status));

  const latestDraftByMatch = useMemo(() => {
    const map: Record<string, GrantDraftRow> = {};
    drafts.forEach((draft) => {
      if (!map[draft.grant_match_id]) {
        map[draft.grant_match_id] = draft;
        return;
      }
      const curr = new Date(draft.updated_at).getTime();
      const prev = new Date(map[draft.grant_match_id].updated_at).getTime();
      if (curr > prev) {
        map[draft.grant_match_id] = draft;
      }
    });
    return map;
  }, [drafts]);

  async function loadApprovalsForDrafts(userId: string, nextDrafts: GrantDraftRow[]) {
    if (nextDrafts.length === 0) {
      setDocumentByDraft({});
      setAuthorizedDocuments({});
      return;
    }

    const sourceIds = nextDrafts.map((draft) => draft.id);
    const docsRes = await supabase
      .from('documents')
      .select('id,source_id')
      .eq('user_id', userId)
      .eq('category', 'grants')
      .eq('source_type', 'manual')
      .in('source_id', sourceIds);

    if (docsRes.error) {
      throw new Error(docsRes.error.message || 'Unable to load grant draft documents.');
    }

    const byDraft: Record<string, string> = {};
    const docIds: string[] = [];

    (docsRes.data || []).forEach((row: any) => {
      const sourceId = String(row.source_id || '');
      const docId = String(row.id || '');
      if (sourceId && docId) {
        byDraft[sourceId] = docId;
        docIds.push(docId);
      }
    });

    setDocumentByDraft(byDraft);

    if (docIds.length === 0) {
      setAuthorizedDocuments({});
      return;
    }

    const approvalsRes = await supabase
      .from('document_approvals')
      .select('document_id')
      .eq('user_id', userId)
      .eq('approval_type', 'authorize_submit')
      .in('document_id', docIds);

    if (approvalsRes.error) {
      throw new Error(approvalsRes.error.message || 'Unable to load grant draft approvals.');
    }

    const approved: Record<string, boolean> = {};
    (approvalsRes.data || []).forEach((row: any) => {
      const id = String(row.document_id || '');
      if (id) approved[id] = true;
    });

    setAuthorizedDocuments(approved);
  }

  async function loadAll() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [nextTier, nextCatalog, nextMatches, nextDrafts, nextSubmissions] = await Promise.all([
        getUserTier(user.id),
        listGrantCatalog(),
        listGrantMatches(user.id),
        listGrantDrafts(user.id),
        listGrantSubmissions(user.id),
      ]);

      setTierState(nextTier);
      setCatalog(nextCatalog);
      setMatches(nextMatches);
      setDrafts(nextDrafts);
      setSubmissions(nextSubmissions);

      await loadApprovalsForDrafts(user.id, nextDrafts);
    } catch (e: any) {
      setError(String(e?.message || e));
      setCatalog([]);
      setMatches([]);
      setDrafts([]);
      setSubmissions([]);
      setDocumentByDraft({});
      setAuthorizedDocuments({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [user?.id]);

  async function handleShortlist() {
    if (!user?.id) return;

    if (!isPremium) {
      setError('Upgrade to PREMIUM to generate grant shortlists and drafts.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const geography = geoFilter.split(',').map((v) => v.trim()).filter(Boolean);
      const tags = tagFilter.split(',').map((v) => v.trim()).filter(Boolean);

      const result = await shortlistGrants({
        client_file_id: clientFileId.trim(),
        filters: { geography, tags },
      });

      setSuccess(`Shortlist created with ${result.match_ids.length} match(es). Educational matches only; no award guarantees.`);
      setActiveTab('shortlist');
      await loadAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDraft(matchId: string) {
    if (!isPremium) {
      setError('PREMIUM is required to generate grant drafts.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const result = await createGrantDraft(matchId);
      setSuccess(`Draft created (${result.draft_id}). Review and approve before submission.`);
      setActiveTab('drafts');
      await loadAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveDraft(draft: GrantDraftRow) {
    const reviewed = Boolean(reviewChecks[draft.id]);
    if (!reviewed) {
      setError('Check "I reviewed for accuracy" before approving submission authorization.');
      return;
    }

    const documentId = documentByDraft[draft.id];
    if (!documentId) {
      setError('Draft document record not found. Reload and try again.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await markGrantDraftApproved(documentId);
      setSuccess('Draft review and submit authorization recorded.');
      await loadAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkSubmitted(match: GrantMatchRow) {
    const method = submissionMethodByMatch[match.id] || 'client_self_submit';
    const confirmationRef = confirmationByMatch[match.id] || '';

    if (method === 'assisted_submit') {
      const latestDraft = latestDraftByMatch[match.id];
      const docId = latestDraft ? documentByDraft[latestDraft.id] : '';
      if (!docId || !authorizedDocuments[docId]) {
        setError('Assisted submit requires client authorize-submit approval on the draft document.');
        return;
      }
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const result = await markGrantSubmitted({
        grant_match_id: match.id,
        submission_method: method,
        confirmation_ref: confirmationRef,
      });

      setSuccess(`Submission recorded (${result.submission_id}). Status: ${result.status}.`);
      setActiveTab('submissions');
      await loadAll();
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading grants engine...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Grants Engine</h1>
        <p className="text-sm text-slate-400 mt-2">
          Educational grant matching and draft workflow. Client reviews and submits. No award or timeline guarantees.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Access</div>
          <div className={`mt-1 text-sm font-semibold ${isPremium ? 'text-emerald-300' : 'text-amber-300'}`}>
            {isPremium ? 'PREMIUM Grants Engine enabled' : 'Educational lessons only (upgrade for shortlist + drafts)'}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Educational Lessons</div>
          <ul className="mt-1 text-xs text-slate-300 list-disc pl-4 space-y-1">
            <li>How to evaluate eligibility criteria line-by-line.</li>
            <li>How to map sponsor goals to measurable outcomes.</li>
            <li>How to submit accurate client-verified applications.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wider ${activeTab === tab.key ? 'bg-cyan-500 text-slate-950' : 'border border-slate-600 text-slate-200 hover:bg-slate-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {activeTab === 'catalog' ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-300 border-b border-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Grant</th>
                <th className="px-3 py-2 text-left">Sponsor</th>
                <th className="px-3 py-2 text-left">Geography</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-3 py-2 text-left">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((grant) => (
                <tr key={grant.id} className="border-b border-slate-800 align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-white">{grant.name}</div>
                    <a href={grant.url || '#'} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline underline-offset-2">{grant.url || 'No URL'}</a>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{grant.sponsor}</td>
                  <td className="px-3 py-2 text-slate-300">{(grant.geography || []).join(', ') || '-'}</td>
                  <td className="px-3 py-2 text-slate-300">{(grant.industry_tags || []).join(', ') || '-'}</td>
                  <td className="px-3 py-2 text-slate-300">{grant.deadline_date || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === 'shortlist' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-white">Generate Shortlist</h2>
            <p className="text-xs text-slate-400">Premium-only action. Uses sanitized profile snapshot and educational ranking logic.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={clientFileId}
                onChange={(e) => setClientFileId(e.target.value)}
                placeholder="client_file_id (uuid)"
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
              <input
                value={geoFilter}
                onChange={(e) => setGeoFilter(e.target.value)}
                placeholder="geography filter (CSV, optional)"
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="industry tags (CSV, optional)"
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => void handleShortlist()}
              disabled={busy || !isPremium || !clientFileId.trim()}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            >
              {busy ? 'Working...' : 'Create Shortlist'}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-300 border-b border-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Match</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">Reasons</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id} className="border-b border-slate-800 align-top">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-white">{match.grants_catalog?.name || match.grant_id}</div>
                      <div className="text-xs text-slate-400">{match.grants_catalog?.sponsor || '-'}</div>
                      <div className="text-xs text-slate-500 mt-1">Deadline: {match.grants_catalog?.deadline_date || '-'} ({daysUntil(match.grants_catalog?.deadline_date)})</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{pretty(match.status)}</td>
                    <td className="px-3 py-2 text-cyan-300 font-semibold">{match.match_score}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {(match.match_reasons || []).map((reason) => `${reason.code}: ${reason.detail}`).join(' | ') || '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => void handleCreateDraft(match.id)}
                        disabled={busy || !isPremium}
                        className="rounded-md border border-cyan-500/50 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                      >
                        Create Draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === 'drafts' ? (
        <div className="space-y-4">
          {drafts.length === 0 ? <div className="text-sm text-slate-500">No drafts yet.</div> : null}
          {drafts.map((draft) => {
            const documentId = documentByDraft[draft.id] || '';
            const isAuthorized = Boolean(documentId && authorizedDocuments[documentId]);
            return (
              <div key={draft.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Draft {draft.id.slice(0, 8)}...{draft.id.slice(-4)}</div>
                    <div className="text-xs text-slate-400">Status: {pretty(draft.status)}</div>
                  </div>
                  <div className={`text-xs font-semibold ${isAuthorized ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {isAuthorized ? 'Authorize Submit: Recorded' : 'Authorize Submit: Pending'}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">{draft.draft_md}</pre>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(reviewChecks[draft.id])}
                    onChange={(e) => setReviewChecks((prev) => ({ ...prev, [draft.id]: e.target.checked }))}
                  />
                  <span>I reviewed for accuracy. This is educational template content and I approve submit authorization with no guarantee of outcomes.</span>
                </label>

                <div className="flex justify-end">
                  <button
                    onClick={() => void handleApproveDraft(draft)}
                    disabled={busy || isAuthorized}
                    className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
                  >
                    {isAuthorized ? 'Approved' : 'Approve for Submit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {activeTab === 'submissions' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-300 border-b border-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Grant Match</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Confirmation</th>
                  <th className="px-3 py-2 text-left">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-300">{submission.grant_match_id}</td>
                    <td className="px-3 py-2 text-slate-300">{pretty(submission.submission_method)}</td>
                    <td className="px-3 py-2 text-slate-300">{pretty(submission.status)}</td>
                    <td className="px-3 py-2 text-slate-300">{submission.confirmation_ref || '-'}</td>
                    <td className="px-3 py-2 text-slate-300">{submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Record Submission</h2>
            <p className="text-xs text-slate-400">
              Record a client self-submit or assisted submit event. Assisted submit requires prior authorize-submit approval.
            </p>

            <div className="space-y-3">
              {matches.map((match) => {
                const method = submissionMethodByMatch[match.id] || 'client_self_submit';
                const latestDraft = latestDraftByMatch[match.id];
                const docId = latestDraft ? documentByDraft[latestDraft.id] : '';
                const assistedReady = Boolean(docId && authorizedDocuments[docId]);
                return (
                  <div key={`submit-${match.id}`} className="rounded-lg border border-slate-700 bg-slate-800 p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div>
                      <div className="text-xs text-slate-400">Match</div>
                      <div className="text-sm text-white font-semibold">{match.grants_catalog?.name || match.grant_id}</div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Method</label>
                      <select
                        value={method}
                        onChange={(e) => setSubmissionMethodByMatch((prev) => ({ ...prev, [match.id]: e.target.value as 'client_self_submit' | 'assisted_submit' }))}
                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
                      >
                        <option value="client_self_submit">Client Self Submit</option>
                        <option value="assisted_submit">Assisted Submit</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Confirmation Ref</label>
                      <input
                        value={confirmationByMatch[match.id] || ''}
                        onChange={(e) => setConfirmationByMatch((prev) => ({ ...prev, [match.id]: e.target.value }))}
                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
                        placeholder="optional"
                      />
                    </div>
                    <div className="text-right">
                      <button
                        onClick={() => void handleMarkSubmitted(match)}
                        disabled={busy || (method === 'assisted_submit' && !assistedReady)}
                        className="rounded-md border border-cyan-500/50 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                      >
                        Mark Submitted
                      </button>
                      {method === 'assisted_submit' && !assistedReady ? (
                        <div className="text-[10px] text-amber-300 mt-1">Needs authorize-submit approval</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Educational grants workflow only. Sponsors and program administrators make all eligibility and award decisions. Results vary.
      </p>
    </div>
  );
}
