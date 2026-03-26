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

type PrepChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  detail: string;
};

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
  if (days === 0) return 'Due today';
  return `${days} day(s)`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatPercent(score: number | null | undefined): string {
  if (typeof score !== 'number' || Number.isNaN(score)) return '-';
  return `${Math.round(score)}%`;
}

function compactId(value: string): string {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function includesQuery(parts: Array<string | null | undefined>, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function buildPrepChecklist(input: {
  grant: GrantCatalogRow | null;
  match: GrantMatchRow | null;
  draft: GrantDraftRow | null;
  submission: GrantSubmissionRow | null;
  isAuthorized: boolean;
}): PrepChecklistItem[] {
  const { grant, match, draft, submission, isAuthorized } = input;
  return [
    {
      key: 'deadline',
      label: 'Confirm deadline and channel',
      complete: Boolean(grant?.deadline_date),
      detail: grant?.deadline_date
        ? `Deadline ${grant.deadline_date} (${daysUntil(grant.deadline_date)}). Verify sponsor submission instructions before sending.`
        : 'No deadline is stored yet. Confirm the sponsor timeline manually.',
    },
    {
      key: 'fit',
      label: 'Validate grant fit against client profile',
      complete: Boolean(match),
      detail: match
        ? `${(match.match_reasons || []).length} match reason(s) logged. Re-check eligibility line-by-line before drafting.`
        : 'Shortlist this opportunity first so the workflow has a stored fit rationale.',
    },
    {
      key: 'draft',
      label: 'Prepare draft narrative and evidence set',
      complete: Boolean(draft),
      detail: draft
        ? `Draft updated ${formatDateTime(draft.updated_at)}. Review every claim against client-provided source material.`
        : 'No draft exists yet. Generate a draft only after fit and deadline checks are complete.',
    },
    {
      key: 'approval',
      label: 'Record client review / authorize-submit approval',
      complete: isAuthorized,
      detail: isAuthorized
        ? 'Authorize-submit approval is recorded for the current draft.'
        : 'Approval is still pending. Assisted submission should stay blocked until the client records authorization.',
    },
    {
      key: 'submission',
      label: 'Track submission confirmation',
      complete: Boolean(submission),
      detail: submission
        ? `Submission ${pretty(submission.status)}${submission.confirmation_ref ? ` with reference ${submission.confirmation_ref}` : ''}.`
        : 'Submission has not been recorded yet. Store a confirmation reference when available.',
    },
  ];
}

function buildGrantGuide(input: {
  grant: GrantCatalogRow | null;
  match: GrantMatchRow | null;
  draft: GrantDraftRow | null;
  submission: GrantSubmissionRow | null;
  isAuthorized: boolean;
  isPremium: boolean;
}) {
  const { grant, match, draft, submission, isAuthorized, isPremium } = input;

  if (!grant) {
    return {
      title: 'Select an opportunity',
      summary: 'Choose a grant from the catalog or shortlist to unlock the guided prep workflow.',
      nextAction: 'Start by selecting a catalog row and reviewing sponsor fit, deadline pressure, and required narrative evidence.',
      strengths: [] as string[],
      risks: ['No opportunity is selected yet.'],
    };
  }

  const strengths = [
    match ? `Stored match score: ${formatPercent(match.match_score)}.` : 'Catalog entry is available for review.',
    grant.deadline_date ? `Deadline tracked: ${grant.deadline_date} (${daysUntil(grant.deadline_date)}).` : 'Deadline still needs manual confirmation.',
  ].filter(Boolean);

  const risks = [
    !match ? 'This opportunity has not been shortlisted yet, so fit justification is not preserved.' : '',
    match && !draft ? 'No draft exists yet. Narrative work has not started.' : '',
    draft && !isAuthorized ? 'Client authorize-submit approval is not recorded for the current draft.' : '',
    submission ? '' : 'Submission confirmation has not been captured yet.',
    !isPremium ? 'Premium access is required for shortlist generation and draft creation.' : '',
  ].filter(Boolean);

  let nextAction = 'Review sponsor criteria against the client file before generating any draft content.';
  if (match && !draft) {
    nextAction = 'Generate a draft from the shortlisted opportunity, then validate each claim against source documents.';
  } else if (draft && !isAuthorized) {
    nextAction = 'Get the client to complete accuracy review and authorize-submit approval before any assisted submission step.';
  } else if (draft && isAuthorized && !submission) {
    nextAction = 'Record whether the client self-submitted or you assisted, then save the confirmation reference.';
  } else if (submission) {
    nextAction = 'Track sponsor responses and keep the workflow evidence attached to the submission record.';
  }

  return {
    title: match ? 'Grant Guide: Workflow Ready' : 'Grant Guide: Opportunity Review',
    summary: match
      ? 'Use the stored match rationale, draft state, and approval state to keep the workflow factual and auditable.'
      : 'This view stays deterministic: grant fit, prep steps, and deadlines are derived from catalog and workflow data only.',
    nextAction,
    strengths,
    risks,
  };
}

function MetricCard(props: { label: string; value: string; tone?: 'default' | 'good' | 'warn' }) {
  const toneClass =
    props.tone === 'good'
      ? 'border-[#DCEEDB] bg-[#EFFAF1] text-[#178D5B]'
      : props.tone === 'warn'
      ? 'border-[#F1E5BF] bg-[#FFF8E8] text-[#B7791F]'
      : 'border-[#E4ECF8] bg-white text-[#17233D]';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#91A1BC]">{props.label}</div>
      <div className="mt-2 text-2xl font-black">{props.value}</div>
    </div>
  );
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

  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');

  const [clientFileId, setClientFileId] = useState('');
  const [geoFilter, setGeoFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const [documentByDraft, setDocumentByDraft] = useState<Record<string, string>>({});
  const [authorizedDocuments, setAuthorizedDocuments] = useState<Record<string, boolean>>({});

  const [submissionMethodByMatch, setSubmissionMethodByMatch] = useState<Record<string, 'client_self_submit' | 'assisted_submit'>>({});
  const [confirmationByMatch, setConfirmationByMatch] = useState<Record<string, string>>({});

  const isPremium = Boolean(tierState?.tier === 'PREMIUM' && isSubscriptionEntitled(tierState.status));

  const catalogById = useMemo(() => {
    const map = new Map<string, GrantCatalogRow>();
    catalog.forEach((grant) => {
      map.set(grant.id, grant);
    });
    return map;
  }, [catalog]);

  const matchByGrantId = useMemo(() => {
    const map = new Map<string, GrantMatchRow>();
    matches.forEach((match) => {
      if (!map.has(match.grant_id)) {
        map.set(match.grant_id, match);
      }
    });
    return map;
  }, [matches]);

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

  const latestSubmissionByMatch = useMemo(() => {
    const map: Record<string, GrantSubmissionRow> = {};
    submissions.forEach((submission) => {
      if (!map[submission.grant_match_id]) {
        map[submission.grant_match_id] = submission;
        return;
      }
      const curr = new Date(submission.updated_at).getTime();
      const prev = new Date(map[submission.grant_match_id].updated_at).getTime();
      if (curr > prev) {
        map[submission.grant_match_id] = submission;
      }
    });
    return map;
  }, [submissions]);

  const filteredCatalog = useMemo(
    () =>
      catalog.filter((grant) =>
        includesQuery(
          [grant.name, grant.sponsor, ...(grant.geography || []), ...(grant.industry_tags || []), grant.eligibility_md, grant.award_range_md],
          catalogSearch
        )
      ),
    [catalog, catalogSearch]
  );

  const selectedCatalogGrant = useMemo(() => {
    return filteredCatalog.find((grant) => grant.id === selectedCatalogId) || filteredCatalog[0] || null;
  }, [filteredCatalog, selectedCatalogId]);

  const selectedMatch = useMemo(() => {
    return matches.find((match) => match.id === selectedMatchId) || matches[0] || null;
  }, [matches, selectedMatchId]);

  const selectedGrantForWorkflow = selectedMatch
    ? selectedMatch.grants_catalog || catalogById.get(selectedMatch.grant_id) || null
    : null;

  const selectedDraft = selectedMatch ? latestDraftByMatch[selectedMatch.id] || null : null;
  const selectedSubmission = selectedMatch ? latestSubmissionByMatch[selectedMatch.id] || null : null;
  const selectedDocumentId = selectedDraft ? documentByDraft[selectedDraft.id] || '' : '';
  const selectedIsAuthorized = Boolean(selectedDocumentId && authorizedDocuments[selectedDocumentId]);

  const selectedCatalogMatch = selectedCatalogGrant ? matchByGrantId.get(selectedCatalogGrant.id) || null : null;
  const selectedCatalogDraft = selectedCatalogMatch ? latestDraftByMatch[selectedCatalogMatch.id] || null : null;
  const selectedCatalogSubmission = selectedCatalogMatch ? latestSubmissionByMatch[selectedCatalogMatch.id] || null : null;
  const selectedCatalogDocumentId = selectedCatalogDraft ? documentByDraft[selectedCatalogDraft.id] || '' : '';
  const selectedCatalogAuthorized = Boolean(selectedCatalogDocumentId && authorizedDocuments[selectedCatalogDocumentId]);

  const workflowChecklist = useMemo(
    () =>
      buildPrepChecklist({
        grant: selectedGrantForWorkflow,
        match: selectedMatch,
        draft: selectedDraft,
        submission: selectedSubmission,
        isAuthorized: selectedIsAuthorized,
      }),
    [selectedDraft, selectedGrantForWorkflow, selectedIsAuthorized, selectedMatch, selectedSubmission]
  );

  const workflowGuide = useMemo(
    () =>
      buildGrantGuide({
        grant: selectedGrantForWorkflow,
        match: selectedMatch,
        draft: selectedDraft,
        submission: selectedSubmission,
        isAuthorized: selectedIsAuthorized,
        isPremium,
      }),
    [isPremium, selectedDraft, selectedGrantForWorkflow, selectedIsAuthorized, selectedMatch, selectedSubmission]
  );

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

  useEffect(() => {
    if (!filteredCatalog.length) {
      setSelectedCatalogId('');
      return;
    }
    if (!filteredCatalog.some((grant) => grant.id === selectedCatalogId)) {
      setSelectedCatalogId(filteredCatalog[0].id);
    }
  }, [filteredCatalog, selectedCatalogId]);

  useEffect(() => {
    if (!matches.length) {
      setSelectedMatchId('');
      return;
    }
    if (!matches.some((match) => match.id === selectedMatchId)) {
      setSelectedMatchId(matches[0].id);
    }
  }, [matches, selectedMatchId]);

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
      setSelectedMatchId(matchId);
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
      setSelectedMatchId(match.id);
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
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-900">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-500">Loading grants engine...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-900 space-y-5">
      <div>
        <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Grants workspace</p>
        <h1 className="mt-2 text-[2.4rem] font-black tracking-tight text-[#17233D]">Grant Discovery Insights</h1>
        <p className="text-sm text-[#61769D] mt-2 max-w-3xl">
          Educational grant matching, prep, and submission-tracking workflow. Business Growth remains the primary post-funding path; grants are an optional research branch that still requires client review and sponsor approval.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard label="Active Catalog" value={String(catalog.length)} />
        <MetricCard label="Shortlisted" value={String(matches.length)} tone={matches.length ? 'good' : 'default'} />
        <MetricCard
          label="Needs Approval"
          value={String(drafts.filter((draft) => !authorizedDocuments[documentByDraft[draft.id] || '']).length)}
          tone={drafts.length ? 'warn' : 'default'}
        />
        <MetricCard label="Submissions Logged" value={String(submissions.length)} tone={submissions.length ? 'good' : 'default'} />
      </div>

      <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-4 grid grid-cols-1 md:grid-cols-2 gap-3 shadow-sm">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#91A1BC]">Access</div>
          <div className={`mt-1 text-sm font-semibold ${isPremium ? 'text-emerald-700' : 'text-amber-700'}`}>
            {isPremium ? 'PREMIUM Grants Engine enabled' : 'Educational lessons only (upgrade for shortlist + drafts)'}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-[#91A1BC]">Workflow Guardrails</div>
          <ul className="mt-1 text-xs text-[#61769D] list-disc pl-4 space-y-1">
            <li>Opportunities are guidance, not award guarantees.</li>
            <li>Drafts must be reviewed against client-provided evidence.</li>
            <li>Assisted submit remains blocked until authorize-submit approval is recorded.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-[1.6rem] border border-[#E4ECF8] bg-white p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider ${activeTab === tab.key ? 'bg-[#4677E6] text-white' : 'border border-[#DDE7F4] bg-[#F8FBFF] text-[#5E7096] hover:bg-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{success}</div> : null}

      {activeTab === 'catalog' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
          <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-[#17233D]">Opportunity Catalog</h2>
                <p className="text-xs text-[#61769D]">Search the catalog, then open the matching workflow only when the opportunity genuinely fits.</p>
              </div>
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search sponsor, grant, geography, tags"
                className="w-full md:w-80 rounded-xl border border-[#DDE7F4] bg-[#F8FBFF] px-3 py-2.5 text-sm text-[#17233D]"
              />
            </div>

            <div className="space-y-2 max-h-[40rem] overflow-y-auto pr-1">
              {filteredCatalog.length === 0 ? <div className="text-sm text-[#61769D]">No catalog opportunities match this search.</div> : null}
              {filteredCatalog.map((grant) => {
                const isSelected = grant.id === selectedCatalogGrant?.id;
                const linkedMatch = matchByGrantId.get(grant.id);
                return (
                  <button
                    key={grant.id}
                    type="button"
                    onClick={() => setSelectedCatalogId(grant.id)}
                    className={`w-full rounded-[1.45rem] border p-4 text-left transition ${isSelected ? 'border-[#4A83F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F4F8FF_100%)]' : 'border-[#EEF2FA] bg-[#FBFDFF] hover:border-[#D7E3F5]'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#17233D]">{grant.name}</div>
                        <div className="text-xs text-[#61769D] mt-1">{grant.sponsor}</div>
                      </div>
                      {linkedMatch ? (
                        <span className="rounded-full border border-[#CBEFD9] bg-[#E8FAEF] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#178D5B]">
                          Shortlisted
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#61769D]">
                      <span>Deadline: {grant.deadline_date || '-'}</span>
                      <span>{daysUntil(grant.deadline_date)}</span>
                    </div>
                    <div className="mt-2 text-xs text-[#91A1BC] line-clamp-2">{(grant.industry_tags || []).join(', ') || 'No industry tags'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-4 space-y-4 shadow-sm">
            {selectedCatalogGrant ? (
              <>
                <div>
                  <div className="text-xs uppercase tracking-widest text-[#91A1BC]">Selected Opportunity</div>
                  <h2 className="mt-2 text-2xl font-black text-[#17233D]">{selectedCatalogGrant.name}</h2>
                  <div className="mt-2 text-sm text-[#61769D]">{selectedCatalogGrant.sponsor}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-[#EEF2FA] bg-[#FBFDFF] p-3">
                    <div className="text-[10px] uppercase tracking-widest text-[#91A1BC]">Award Range</div>
                    <div className="mt-1 text-[#17233D]">{selectedCatalogGrant.award_range_md || 'Not listed'}</div>
                  </div>
                  <div className="rounded-xl border border-[#EEF2FA] bg-[#FBFDFF] p-3">
                    <div className="text-[10px] uppercase tracking-widest text-[#91A1BC]">Deadline</div>
                    <div className="mt-1 text-[#17233D]">{selectedCatalogGrant.deadline_date || 'Not listed'}</div>
                    <div className="text-xs text-[#61769D] mt-1">{daysUntil(selectedCatalogGrant.deadline_date)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#EEF2FA] bg-[#FBFDFF] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[#91A1BC]">Geography + Tags</div>
                  <div className="mt-2 text-sm text-[#17233D]">{(selectedCatalogGrant.geography || []).join(', ') || 'No geography listed'}</div>
                  <div className="mt-1 text-sm text-[#61769D]">{(selectedCatalogGrant.industry_tags || []).join(', ') || 'No industry tags listed'}</div>
                </div>

                <div className="rounded-xl border border-[#EEF2FA] bg-[#FBFDFF] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[#91A1BC]">Eligibility Snapshot</div>
                  <p className="mt-2 text-sm text-[#61769D] whitespace-pre-wrap">{selectedCatalogGrant.eligibility_md || 'No eligibility notes provided.'}</p>
                </div>

                <div className="rounded-xl border border-[#EEF2FA] bg-[#FBFDFF] p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-[#91A1BC]">Workflow State</div>
                  {selectedCatalogMatch ? (
                    <>
                      <div className="text-sm text-emerald-700">Shortlisted with score {formatPercent(selectedCatalogMatch.match_score)}</div>
                      <div className="text-xs text-[#61769D]">Draft: {selectedCatalogDraft ? pretty(selectedCatalogDraft.status) : 'Not started'}</div>
                      <div className="text-xs text-[#61769D]">Submission: {selectedCatalogSubmission ? pretty(selectedCatalogSubmission.status) : 'Not recorded'}</div>
                    </>
                  ) : (
                    <div className="text-sm text-[#61769D]">This opportunity has not been shortlisted yet.</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  {selectedCatalogMatch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMatchId(selectedCatalogMatch.id);
                        setActiveTab('shortlist');
                      }}
                      className="rounded-lg border border-[#D5E4FF] bg-[#EEF4FF] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#4677E6] hover:bg-[#E8F0FF]"
                    >
                      Open Workflow
                    </button>
                  ) : null}

                  {selectedCatalogMatch ? (
                    <button
                      type="button"
                      onClick={() => void handleCreateDraft(selectedCatalogMatch.id)}
                      disabled={busy || !isPremium}
                      className="rounded-lg bg-[#4677E6] px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                    >
                      {busy ? 'Working...' : 'Create Draft'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('shortlist')}
                      className="rounded-lg border border-[#DDE7F4] bg-[#F8FBFF] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#5E7096] hover:bg-white"
                    >
                      Go To Shortlist Builder
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Select a grant to inspect fit and workflow state.</div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'shortlist' ? (
        <div className="space-y-4">
          <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-4 space-y-3 shadow-sm">
            <h2 className="text-lg font-semibold text-[#17233D]">Generate Shortlist</h2>
            <p className="text-xs text-[#61769D]">Premium-only action. Uses sanitized profile snapshot and educational ranking logic.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={clientFileId}
                onChange={(e) => setClientFileId(e.target.value)}
                placeholder="client_file_id (uuid)"
                className="rounded-xl border border-[#DDE7F4] bg-[#F8FBFF] px-3 py-2.5 text-sm text-[#17233D]"
              />
              <input
                value={geoFilter}
                onChange={(e) => setGeoFilter(e.target.value)}
                placeholder="geography filter (CSV, optional)"
                className="rounded-xl border border-[#DDE7F4] bg-[#F8FBFF] px-3 py-2.5 text-sm text-[#17233D]"
              />
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="industry tags (CSV, optional)"
                className="rounded-xl border border-[#DDE7F4] bg-[#F8FBFF] px-3 py-2.5 text-sm text-[#17233D]"
              />
            </div>
            <button
              onClick={() => void handleShortlist()}
              disabled={busy || !isPremium || !clientFileId.trim()}
              className="rounded-lg bg-[#4677E6] px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
            >
              {busy ? 'Working...' : 'Create Shortlist'}
            </button>
          </div>

          {matches.length === 0 ? (
            <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-6 text-sm text-[#61769D] shadow-sm">
              No shortlist matches yet. Generate one after you have a client file and optional geography/tag filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr,1.1fr] gap-4">
              <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-4 space-y-3 shadow-sm">
                <div>
                  <h2 className="text-lg font-semibold text-[#17233D]">Shortlisted Opportunities</h2>
                  <p className="text-xs text-[#61769D]">Pick one to review prep state, draft readiness, and submission controls.</p>
                </div>

                <div className="space-y-2 max-h-[44rem] overflow-y-auto pr-1">
                  {matches.map((match) => {
                    const grant = match.grants_catalog || catalogById.get(match.grant_id) || null;
                    const isSelected = match.id === selectedMatch?.id;
                    const draft = latestDraftByMatch[match.id];
                    const submission = latestSubmissionByMatch[match.id];
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setSelectedMatchId(match.id)}
                        className={`w-full rounded-[1.45rem] border p-4 text-left transition ${isSelected ? 'border-[#4A83F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F4F8FF_100%)]' : 'border-[#EEF2FA] bg-[#FBFDFF] hover:border-[#D7E3F5]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#17233D]">{grant?.name || match.grant_id}</div>
                            <div className="text-xs text-[#61769D] mt-1">{grant?.sponsor || '-'}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-[#4677E6]">{formatPercent(match.match_score)}</div>
                            <div className="text-[10px] uppercase tracking-wider text-[#91A1BC]">Fit</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#61769D]">
                          <span>{pretty(match.status)}</span>
                          <span>Draft: {draft ? pretty(draft.status) : 'Not started'}</span>
                          <span>Submission: {submission ? pretty(submission.status) : 'Not recorded'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-4 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-[#91A1BC]">Opportunity Workflow</div>
                      <h2 className="mt-2 text-2xl font-black text-[#17233D]">{selectedGrantForWorkflow?.name || 'Select a shortlist item'}</h2>
                      <div className="mt-1 text-sm text-[#61769D]">{selectedGrantForWorkflow?.sponsor || 'No sponsor selected'}</div>
                    </div>
                    {selectedMatch ? (
                      <button
                        type="button"
                        onClick={() => void handleCreateDraft(selectedMatch.id)}
                        disabled={busy || !isPremium}
                        className="rounded-lg bg-[#4677E6] px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                      >
                        {busy ? 'Working...' : selectedDraft ? 'Refresh Draft' : 'Create Draft'}
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Match Score</div>
                      <div className="mt-1 text-cyan-300 font-black">{selectedMatch ? formatPercent(selectedMatch.match_score) : '-'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Deadline</div>
                      <div className="mt-1 text-slate-200">{selectedGrantForWorkflow?.deadline_date || '-'}</div>
                      <div className="text-xs text-slate-500 mt-1">{daysUntil(selectedGrantForWorkflow?.deadline_date)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Draft Status</div>
                      <div className="mt-1 text-slate-200">{selectedDraft ? pretty(selectedDraft.status) : 'Not started'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Submission</div>
                      <div className="mt-1 text-slate-200">{selectedSubmission ? pretty(selectedSubmission.status) : 'Not recorded'}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Match Reasons</div>
                    <div className="mt-2 space-y-2">
                      {(selectedMatch?.match_reasons || []).length ? (
                        (selectedMatch?.match_reasons || []).map((reason) => (
                          <div key={`${reason.code}-${reason.detail}`} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                            <span className="font-semibold text-cyan-300">{reason.code}</span>: {reason.detail}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">No stored fit reasons yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Prep Checklist</div>
                    <div className="mt-3 space-y-2">
                      {workflowChecklist.map((item) => (
                        <div key={item.key} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white">{item.label}</div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${item.complete ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>
                              {item.complete ? 'Ready' : 'Pending'}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-400">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Grant Guide</div>
                    <h3 className="mt-2 text-lg font-semibold text-white">{workflowGuide.title}</h3>
                    <p className="mt-2 text-sm text-slate-300">{workflowGuide.summary}</p>
                    <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
                      <span className="font-semibold text-cyan-200">Next action:</span> {workflowGuide.nextAction}
                    </div>
                    {workflowGuide.strengths.length ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-widest text-slate-500">Grounded Signals</div>
                        <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1">
                          {workflowGuide.strengths.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {workflowGuide.risks.length ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-widest text-slate-500">Watchouts</div>
                        <ul className="mt-2 list-disc pl-5 text-sm text-amber-200 space-y-1">
                          {workflowGuide.risks.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedMatch ? (
                  <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Record Submission</h2>
                    <p className="text-xs text-slate-400">Client self-submit or assisted submit. Assisted submit requires prior authorize-submit approval.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Method</label>
                        <select
                          value={submissionMethodByMatch[selectedMatch.id] || 'client_self_submit'}
                          onChange={(e) => setSubmissionMethodByMatch((prev) => ({ ...prev, [selectedMatch.id]: e.target.value as 'client_self_submit' | 'assisted_submit' }))}
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs"
                        >
                          <option value="client_self_submit">Client Self Submit</option>
                          <option value="assisted_submit">Assisted Submit</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Confirmation Ref</label>
                        <input
                          value={confirmationByMatch[selectedMatch.id] || ''}
                          onChange={(e) => setConfirmationByMatch((prev) => ({ ...prev, [selectedMatch.id]: e.target.value }))}
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs"
                          placeholder="optional"
                        />
                      </div>
                      <div className="text-right">
                        <button
                          onClick={() => void handleMarkSubmitted(selectedMatch)}
                          disabled={busy || ((submissionMethodByMatch[selectedMatch.id] || 'client_self_submit') === 'assisted_submit' && !selectedIsAuthorized)}
                          className="rounded-md border border-cyan-500/50 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                        >
                          Mark Submitted
                        </button>
                        {(submissionMethodByMatch[selectedMatch.id] || 'client_self_submit') === 'assisted_submit' && !selectedIsAuthorized ? (
                          <div className="text-[10px] text-amber-300 mt-1">Needs authorize-submit approval</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === 'drafts' ? (
        <div className="space-y-4">
          {drafts.length === 0 ? <div className="text-sm text-slate-500">No drafts yet.</div> : null}
          {drafts.map((draft) => {
            const documentId = documentByDraft[draft.id] || '';
            const isAuthorized = Boolean(documentId && authorizedDocuments[documentId]);
            const match = matches.find((row) => row.id === draft.grant_match_id) || null;
            const grant = match?.grants_catalog || (match ? catalogById.get(match.grant_id) || null : null);
            return (
              <div key={draft.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{grant?.name || 'Grant Draft'} • {compactId(draft.id)}</div>
                    <div className="text-xs text-slate-400">Status: {pretty(draft.status)} • Updated: {formatDateTime(draft.updated_at)}</div>
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

                <div className="flex justify-end gap-3">
                  {match ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMatchId(match.id);
                        setActiveTab('shortlist');
                      }}
                      className="rounded-md border border-slate-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-800"
                    >
                      Open Workflow
                    </button>
                  ) : null}
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
                {submissions.map((submission) => {
                  const match = matches.find((row) => row.id === submission.grant_match_id) || null;
                  const grant = match?.grants_catalog || (match ? catalogById.get(match.grant_id) || null : null);
                  return (
                    <tr key={submission.id} className="border-b border-slate-800">
                      <td className="px-3 py-2 text-slate-300">
                        <div>{grant?.name || submission.grant_match_id}</div>
                        <div className="text-xs text-slate-500">{compactId(submission.id)}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{pretty(submission.submission_method)}</td>
                      <td className="px-3 py-2 text-slate-300">{pretty(submission.status)}</td>
                      <td className="px-3 py-2 text-slate-300">{submission.confirmation_ref || '-'}</td>
                      <td className="px-3 py-2 text-slate-300">{submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Educational grants workflow only. Sponsors and program administrators make all eligibility and award decisions. Results vary.
      </p>
    </div>
  );
}