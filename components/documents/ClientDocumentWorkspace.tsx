import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, FolderOpen, Loader2, RefreshCw, Upload } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useClientDocuments from '../../hooks/useClientDocuments';
import { ClientDocument, ClientTask, Contact, ExperienceConfig, PortalExperienceTarget } from '../../types';
import {
  DocumentCategory,
  DocumentRow,
  getSignedDocumentUrl,
} from '../../src/services/documentCenterService';
import DocumentVault, { DocumentVaultCategory } from '../DocumentVault';

type Props = {
  contact: Contact;
  currentStage?: string | null;
  experienceConfig?: ExperienceConfig;
  onUpdateContact: (contact: Contact) => void;
};

type DocumentRequirement = {
  id: string;
  label: string;
  category: DocumentCategory;
  vaultCategory: DocumentVaultCategory;
  stage: string;
  summary: string;
  matchedCount: number;
  requiredCount: number;
  status: 'missing' | 'partial' | 'ready';
};

type UploadIntent = {
  id: number;
  category: DocumentVaultCategory;
  label: string;
};

const STAGE_LABELS: Record<string, string> = {
  untracked: 'Document Intake',
  starting: 'Document Intake',
  credit_optimization: 'Credit Readiness',
  business_foundation: 'Business Foundation',
  funding_roadmap: 'Funding Readiness',
  application_loop: 'Application Loop',
  post_funding_capital: 'Post-Funding Capital',
};

const STAGE_TARGETS: Record<string, PortalExperienceTarget> = {
  untracked: 'documents',
  starting: 'documents',
  credit_optimization: 'creditCenter',
  business_foundation: 'businessFoundation',
  funding_roadmap: 'fundingRoadmap',
  application_loop: 'activity',
  post_funding_capital: 'capitalProtection',
};

function prettyLabel(value: string) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function inferCategory(label: string): DocumentCategory {
  const normalized = normalizeText(label);
  if (normalized.includes('grant')) return 'grants';
  if (normalized.includes('sba')) return 'sba';
  if (normalized.includes('credit') || normalized.includes('bureau') || normalized.includes('dispute')) return 'credit';
  if (
    normalized.includes('license') ||
    normalized.includes('identification') ||
    normalized.includes('driver') ||
    normalized.includes('ein') ||
    normalized.includes('articles') ||
    normalized.includes('incorporation') ||
    normalized.includes('certificate')
  ) {
    return 'legal';
  }
  return 'funding';
}

function inferVaultCategory(category: DocumentCategory, label: string): DocumentVaultCategory {
  const normalized = normalizeText(label);
  if (category === 'credit') return 'Credit';
  if (normalized.includes('driver') || normalized.includes('identification') || normalized.includes('license')) return 'Identification';
  if (
    normalized.includes('bank') ||
    normalized.includes('statement') ||
    normalized.includes('revenue') ||
    normalized.includes('financial') ||
    normalized.includes('invoice') ||
    category === 'funding' ||
    category === 'grants' ||
    category === 'sba'
  ) {
    return 'Financial';
  }
  return 'Legal';
}

function inferStage(task: ClientTask, currentStage?: string | null, category?: DocumentCategory) {
  const haystack = normalizeText([
    task.groupKey,
    task.templateKey,
    task.title,
    task.description,
    category,
  ]
    .filter(Boolean)
    .join(' '));

  if (haystack.includes('credit')) return 'credit_optimization';
  if (haystack.includes('business') || haystack.includes('ein') || haystack.includes('naics')) return 'business_foundation';
  if (haystack.includes('capital') || haystack.includes('reserve')) return 'post_funding_capital';
  if (haystack.includes('grant')) return 'funding_roadmap';
  return currentStage || 'untracked';
}

function matchesAttachment(label: string, category: DocumentCategory, localDocuments: ClientDocument[], persistedDocuments: DocumentRow[]) {
  const normalized = normalizeText(label);
  const tokens = normalized.split(' ').filter((token) => token.length >= 4);

  const localMatch = localDocuments.some((document) => {
    if (document.status === 'Missing') return false;
    const text = normalizeText(`${document.name} ${document.type}`);
    const categoryMatch = category === 'credit' ? document.type === 'Credit' : true;
    return categoryMatch && (tokens.some((token) => text.includes(token)) || text.includes(normalized));
  });

  if (localMatch) return true;

  return persistedDocuments.some((document) => {
    const title = normalizeText(document.title);
    return document.category === category && (tokens.some((token) => title.includes(token)) || title.includes(normalized));
  });
}

function buildRequirements(contact: Contact, currentStage: string | null | undefined, persistedDocuments: DocumentRow[]) {
  const localDocuments = contact.documents || [];
  const groups = new Map<string, DocumentRequirement>();

  for (const task of contact.clientTasks || []) {
    if (task.status === 'completed') continue;
    for (const attachment of task.requiredAttachments || []) {
      const key = normalizeText(attachment);
      if (!key) continue;
      const category = inferCategory(attachment);
      const vaultCategory = inferVaultCategory(category, attachment);
      const stage = inferStage(task, currentStage, category);
      const matched = matchesAttachment(attachment, category, localDocuments, persistedDocuments);
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          id: key,
          label: attachment,
          category,
          vaultCategory,
          stage,
          summary: task.description || `Driven by task: ${task.title}`,
          matchedCount: matched ? 1 : 0,
          requiredCount: 1,
          status: matched ? 'ready' : 'missing',
        });
        continue;
      }

      existing.requiredCount += 1;
      if (matched) existing.matchedCount += 1;
      if (!existing.summary && task.description) {
        existing.summary = task.description;
      }
    }
  }

  return Array.from(groups.values())
    .map((requirement) => ({
      ...requirement,
      status:
        requirement.matchedCount === 0
          ? 'missing'
          : requirement.matchedCount >= requirement.requiredCount
          ? 'ready'
          : 'partial',
    }))
    .sort((left, right) => {
      const stageCompare = (STAGE_LABELS[left.stage] || prettyLabel(left.stage)).localeCompare(STAGE_LABELS[right.stage] || prettyLabel(right.stage));
      if (stageCompare !== 0) return stageCompare;
      return left.label.localeCompare(right.label);
    });
}

function statusTone(status: DocumentRequirement['status']) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function documentTone(status: string) {
  if (['approved', 'finalized', 'mailed'].includes(status)) return 'text-emerald-700';
  if (status === 'needs_review') return 'text-amber-700';
  return 'text-slate-600';
}

export default function ClientDocumentWorkspace({ contact, currentStage, experienceConfig, onUpdateContact }: Props) {
  const { user } = useAuth();
  const { documents, loading, error, refresh } = useClientDocuments(user?.id);
  const [uploadIntent, setUploadIntent] = useState<UploadIntent>({ id: 0, category: 'All', label: '' });
  const [openingId, setOpeningId] = useState('');
  const vaultRef = useRef<HTMLDivElement | null>(null);
  const generatedRef = useRef<HTMLDivElement | null>(null);

  const requirements = useMemo(() => buildRequirements(contact, currentStage, documents), [contact, currentStage, documents]);

  const stageGroups = useMemo(() => {
    const groups = new Map<string, DocumentRequirement[]>();
    for (const requirement of requirements) {
      const bucket = groups.get(requirement.stage) || [];
      bucket.push(requirement);
      groups.set(requirement.stage, bucket);
    }
    const targetOrder = experienceConfig?.taskPriority.targetOrder || [];
    return Array.from(groups.entries()).sort(([leftStage], [rightStage]) => {
      const leftTarget = STAGE_TARGETS[leftStage] || 'documents';
      const rightTarget = STAGE_TARGETS[rightStage] || 'documents';
      const leftRank = targetOrder.indexOf(leftTarget);
      const rightRank = targetOrder.indexOf(rightTarget);
      const normalizedLeft = leftRank === -1 ? targetOrder.length : leftRank;
      const normalizedRight = rightRank === -1 ? targetOrder.length : rightRank;
      if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
      return (STAGE_LABELS[leftStage] || prettyLabel(leftStage)).localeCompare(STAGE_LABELS[rightStage] || prettyLabel(rightStage));
    });
  }, [experienceConfig, requirements]);

  const generatedDocuments = useMemo(
    () => documents.filter((document) => ['ai_artifact', 'finalized_letter'].includes(document.source_type)),
    [documents]
  );

  const recentCapturedDocuments = useMemo(
    () => (contact.documents || []).filter((document) => document.status !== 'Missing').slice(0, 6),
    [contact.documents]
  );

  const openTaskCount = useMemo(
    () => (contact.clientTasks || []).filter((task) => task.status !== 'completed').length,
    [contact.clientTasks]
  );

  const approvedCount = useMemo(
    () => documents.filter((document) => ['approved', 'finalized', 'mailed'].includes(document.status)).length,
    [documents]
  );

  const outstandingCount = useMemo(
    () => requirements.filter((requirement) => requirement.status !== 'ready').length,
    [requirements]
  );

  const highlightedDocumentRecommendation = useMemo(
    () => experienceConfig?.recommendations.find((recommendation) => recommendation.target === 'documents'),
    [experienceConfig]
  );

  const orchestrationSummary = experienceConfig
    ? `${experienceConfig.messaging.summary} Upload guidance is reordered to support ${experienceConfig.emphasis.primaryGoal.toLowerCase()}`
    : 'Upload priorities stay tied to the current workflow, while generated and approved artifacts stay visible in one client-safe surface.';

  const guidanceSummary = highlightedDocumentRecommendation?.body ||
    (experienceConfig
      ? `Current document guidance follows ${experienceConfig.messaging.toneLabel.toLowerCase()} priorities and the active portal experience.`
      : 'Derived only from active task attachment requirements, then grouped by workflow stage.');

  async function openStoredDocument(document: DocumentRow) {
    if (!document.storage_path) return;

    setOpeningId(document.id);
    try {
      const signedUrl = await getSignedDocumentUrl(document.storage_path);
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setOpeningId('');
    }
  }

  function requestUpload(requirement: DocumentRequirement) {
    setUploadIntent({
      id: Date.now(),
      category: requirement.vaultCategory,
      label: requirement.label,
    });
    vaultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openGeneratedSection() {
    generatedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Document Orchestration</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Stage-aware upload and document workspace</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              {orchestrationSummary}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={12} /> Refresh Stored Docs
            </span>
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Current Stage</p>
            <p className="mt-2 text-lg font-black text-slate-900">{STAGE_LABELS[currentStage || ''] || prettyLabel(currentStage || 'untracked')}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Outstanding Items</p>
            <p className="mt-2 text-lg font-black text-slate-900">{outstandingCount}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Generated Docs</p>
            <p className="mt-2 text-lg font-black text-slate-900">{generatedDocuments.length}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Approved / Final</p>
            <p className="mt-2 text-lg font-black text-slate-900">{approvedCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Missing-Document Guidance</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Task-linked upload priorities</h3>
            <p className="mt-2 text-sm text-slate-500">{guidanceSummary}</p>
          </div>
          <button
            type="button"
            onClick={openGeneratedSection}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
          >
            Review Generated Docs
          </button>
        </div>

        {stageGroups.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-black tracking-tight text-slate-900">No upload requests are assigned yet</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This workspace only shows document requests when your active workflow tasks declare required uploads. If you expected a document request here, review the Action Center first and ask support to attach the requirement to the active task.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Open Tasks</p>
                    <p className="mt-2 text-base font-black text-slate-900">{openTaskCount}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Stored Docs</p>
                    <p className="mt-2 text-base font-black text-slate-900">{documents.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Current Stage</p>
                    <p className="mt-2 text-base font-black text-slate-900">{STAGE_LABELS[currentStage || ''] || prettyLabel(currentStage || 'untracked')}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openGeneratedSection}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
                  >
                    Review Generated Docs
                  </button>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
                  >
                    Refresh Document State
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {stageGroups.map(([stage, items]) => (
              <div key={stage}>
                <div className="mb-3 flex items-center gap-2">
                  <FolderOpen size={16} className="text-slate-400" />
                  <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{STAGE_LABELS[stage] || prettyLabel(stage)}</h4>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {items.map((requirement) => (
                    <article key={requirement.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone(requirement.status)}`}>
                              {requirement.status}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                              {prettyLabel(requirement.category)}
                            </span>
                          </div>
                          <h5 className="mt-3 text-base font-black tracking-tight text-slate-900">{requirement.label}</h5>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{requirement.summary}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{requirement.matchedCount}/{requirement.requiredCount} matched</div>
                          <div className="mt-1">Vault target: {requirement.vaultCategory}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => requestUpload(requirement)}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Upload size={12} /> Upload In Vault
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={openGeneratedSection}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
                        >
                          Review Generated Docs
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {highlightedDocumentRecommendation ? (
        <section className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Experience-Aligned Focus</p>
          <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">{highlightedDocumentRecommendation.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{highlightedDocumentRecommendation.body}</p>
        </section>
      ) : null}

      <section ref={generatedRef} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Generated Visibility</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Generated and workflow-managed documents</h3>
            <p className="mt-2 text-sm text-slate-500">Pulled from the persisted document center so generated artifacts do not disappear from the portal workflow.</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={14} /> Loading stored documents...
          </div>
        ) : error ? (
          <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : generatedDocuments.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            No generated documents are stored yet for this user.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {generatedDocuments.slice(0, 8).map((document) => (
              <article key={document.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{prettyLabel(document.source_type)}</p>
                    <h4 className="mt-2 text-base font-black tracking-tight text-slate-900">{document.title}</h4>
                    <p className={`mt-2 text-sm font-semibold ${documentTone(document.status)}`}>{prettyLabel(document.status)}</p>
                    <p className="mt-2 text-xs text-slate-500">{prettyLabel(document.category)} · Updated {new Date(document.updated_at).toLocaleString()}</p>
                  </div>
                  <FileText size={18} className="text-slate-400" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openStoredDocument(document)}
                    disabled={!document.storage_path || openingId === document.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 disabled:opacity-50"
                  >
                    {openingId === document.id ? 'Opening...' : 'Open Stored Copy'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Recent Capture</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Latest client-uploaded vault items</h3>
            <p className="mt-2 text-sm text-slate-500">These are the client-facing vault artifacts currently attached to the contact record.</p>
          </div>
        </div>

        {recentCapturedDocuments.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            No verified or in-flight vault documents are attached to this contact yet.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {recentCapturedDocuments.map((document) => (
              <article key={document.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{document.type}</p>
                    <h4 className="mt-2 text-base font-black tracking-tight text-slate-900">{document.name}</h4>
                    <p className="mt-2 text-sm text-slate-600">Status: {document.status}</p>
                    <p className="mt-1 text-xs text-slate-500">Uploaded {document.uploadDate || 'recently'}</p>
                  </div>
                  {document.status === 'Verified' ? <CheckCircle2 size={18} className="text-emerald-500" /> : <AlertTriangle size={18} className="text-amber-500" />}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div ref={vaultRef} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
        <DocumentVault
          contact={contact}
          onUpdateContact={onUpdateContact}
          readOnly={true}
          defaultCategory={uploadIntent.category}
          uploadRequestId={uploadIntent.id}
          uploadIntentLabel={uploadIntent.label}
        />
      </div>
    </div>
  );
}