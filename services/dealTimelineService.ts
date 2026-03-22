import { Contact, Message } from '../types';

export type DealTimelineCategory =
  | 'onboarding'
  | 'credit'
  | 'business_foundation'
  | 'funding'
  | 'capital'
  | 'trading'
  | 'grants'
  | 'communication'
  | 'ai_guidance'
  | 'system_update';

export type DealTimelineActor = 'system' | 'ai' | 'user' | 'admin';
export type DealTimelineVisibility = 'client' | 'internal';

export type DealTimelineEvent = {
  id: string;
  timestamp: string;
  sortAt: number;
  category: DealTimelineCategory;
  title: string;
  summary: string;
  actor: DealTimelineActor;
  source: string;
  relatedStage: string | null;
  relatedTaskId: string | null;
  relatedMessageId: string | null;
  destination: string | null;
  priority: 'normal' | 'high' | 'urgent';
  upcoming: boolean;
};

export type DealTimelineSnapshot = {
  currentStageLabel: string;
  nextStepLabel: string;
  events: DealTimelineEvent[];
  availableCategories: DealTimelineCategory[];
  availableActors: DealTimelineActor[];
};

type TimelineInputs = {
  contact: Contact;
  currentStage?: string | null;
  portalTasks?: {
    top_task?: any | null;
    urgent?: any[];
    recommended?: any[];
    completed?: any[];
  } | null;
  fundingHistory?: {
    applications?: any[];
    results?: any[];
    legacy_outcomes?: any[];
  } | null;
  business?: {
    profile?: any | null;
    progress?: any[];
    readiness?: {
      path?: string | null;
    } | null;
  } | null;
  credit?: {
    analysis?: {
      latest_report?: any | null;
      latest_analysis?: any | null;
    } | null;
    letters?: {
      letters?: any[];
    } | null;
  } | null;
  capital?: {
    profile?: any | null;
    allocation?: {
      selected_path?: string | null;
      selected_at?: string | null;
      current_state?: string | null;
    } | null;
    readiness?: {
      reserve_guidance?: {
        reserve_confirmed?: boolean;
        reserve_confirmed_at?: string | null;
      } | null;
      context?: {
        capital_setup_status?: string | null;
      } | null;
    } | null;
  } | null;
  visibility?: DealTimelineVisibility;
};

const MAX_EVENT_COUNT = 60;

function toIso(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toSortAt(value?: string | null) {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : null;
}

function trimText(value: unknown, maxLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function titleCase(value: string) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatTimelineCategory(category: DealTimelineCategory) {
  return titleCase(category);
}

export function formatTimelineActor(actor: DealTimelineActor) {
  if (actor === 'ai') return 'AI';
  return titleCase(actor);
}

export function formatTimelineStage(value?: string | null) {
  if (!value) return 'Lifecycle';
  return titleCase(value);
}

function pushEvent(target: DealTimelineEvent[], event: DealTimelineEvent | null) {
  if (!event) return;
  if (target.some((existing) => existing.id === event.id)) return;
  target.push(event);
}

function buildEvent(input: Omit<DealTimelineEvent, 'timestamp' | 'sortAt'> & { timestamp: string | null }) {
  const iso = toIso(input.timestamp);
  if (!iso) return null;

  return {
    ...input,
    timestamp: iso,
    sortAt: new Date(iso).getTime(),
  } satisfies DealTimelineEvent;
}

function taskCategory(task: any): DealTimelineCategory {
  const haystack = [
    String(task?.task_category || ''),
    String(task?.group_key || task?.groupKey || ''),
    String(task?.template_key || task?.templateKey || ''),
    String(task?.meta?.category || ''),
    String(task?.title || ''),
  ]
    .join(' ')
    .toLowerCase();

  if (haystack.includes('credit')) return 'credit';
  if (haystack.includes('business')) return 'business_foundation';
  if (haystack.includes('capital')) return 'capital';
  if (haystack.includes('grant')) return 'grants';
  if (haystack.includes('trading')) return 'trading';
  return 'funding';
}

function taskDestination(task: any) {
  const category = taskCategory(task);
  if (category === 'credit') return 'creditCenter';
  if (category === 'business_foundation') return 'businessFoundation';
  if (category === 'capital') {
    const haystack = [String(task?.task_category || ''), String(task?.meta?.category || ''), String(task?.title || '')].join(' ').toLowerCase();
    return haystack.includes('allocation') ? 'capitalAllocation' : 'capitalProtection';
  }
  if (category === 'grants') return 'grants';
  if (category === 'trading') return 'tradingAccess';
  return 'fundingRoadmap';
}

function stageForCategory(category: DealTimelineCategory) {
  if (category === 'credit') return 'credit_optimization';
  if (category === 'business_foundation') return 'business_foundation';
  if (category === 'capital') return 'post_funding_capital';
  if (category === 'funding') return 'funding_roadmap';
  if (category === 'grants') return 'grants';
  if (category === 'trading') return 'trading_access';
  if (category === 'communication') return 'messages';
  if (category === 'ai_guidance') return 'action_center';
  return 'lifecycle';
}

function normalizeTaskStatus(task: any, fallback: 'pending' | 'completed') {
  const status = String(task?.status || fallback).toLowerCase();
  return status === 'completed' ? 'completed' : 'pending';
}

function buildTaskEvents(tasks: TimelineInputs['portalTasks']) {
  const next: DealTimelineEvent[] = [];
  const seen = new Set<string>();
  const buckets = [
    ...(tasks?.urgent || []).map((task) => ({ ...task, __bucket: 'urgent' })),
    ...(tasks?.recommended || []).map((task) => ({ ...task, __bucket: 'recommended' })),
    ...(tasks?.completed || []).map((task) => ({ ...task, __bucket: 'completed' })),
  ];

  for (const task of buckets) {
    const key = String(task.task_id || task.id || task.title || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const category = taskCategory(task);
    const status = normalizeTaskStatus(task, task.__bucket === 'completed' ? 'completed' : 'pending');
    const timestamp = task.updated_at || task.completed_at || task.created_at || task.due_date || task.date || null;
    const priority = status === 'completed' ? 'normal' : task.__bucket === 'urgent' ? 'urgent' : 'high';
    const dueAt = toSortAt(task.due_date || task.date || null);
    const now = Date.now();

    pushEvent(
      next,
      buildEvent({
        id: `task:${key}`,
        timestamp,
        category,
        title:
          status === 'completed'
            ? `Task completed: ${String(task.title || 'Workflow step')}`
            : dueAt !== null && dueAt > now
            ? `Upcoming task: ${String(task.title || 'Workflow step')}`
            : `Task active: ${String(task.title || 'Workflow step')}`,
        summary: trimText(task.description || 'Task state is reflected from the current workflow queue.'),
        actor: 'system',
        source: 'Task Brain',
        relatedStage: stageForCategory(category),
        relatedTaskId: String(task.task_id || task.id || '') || null,
        relatedMessageId: null,
        destination: taskDestination(task),
        priority,
        upcoming: status !== 'completed' && dueAt !== null && dueAt > now,
      })
    );
  }

  return next;
}

function messageActor(message: Message): DealTimelineActor {
  if (message.createdBy === 'ai_employee' || message.sender === 'bot') return 'ai';
  if (message.createdBy === 'admin' || message.sender === 'admin') return 'admin';
  if (message.sender === 'client') return 'user';
  return 'system';
}

function messageCategory(message: Message): DealTimelineCategory {
  if (message.messageType === 'ai_guidance' || message.createdBy === 'ai_employee' || message.sender === 'bot') return 'ai_guidance';
  if (message.messageType === 'system_update' || message.sender === 'system') return 'system_update';
  return 'communication';
}

function buildMessageEvents(messages: Message[] = [], visibility: DealTimelineVisibility = 'client') {
  const next: DealTimelineEvent[] = [];

  for (const message of messages) {
    if (!message.createdAt) continue;
    const actor = messageActor(message);
    const category = messageCategory(message);

    if (visibility === 'client' && actor === 'admin' && message.internalOnly && message.createdBy === 'admin') {
      continue;
    }

    pushEvent(
      next,
      buildEvent({
        id: `message:${message.id}`,
        timestamp: message.createdAt,
        category,
        title:
          actor === 'user'
            ? 'You added a message'
            : actor === 'admin'
            ? 'Advisor message added'
            : actor === 'ai'
            ? 'AI guidance added'
            : 'System message added',
        summary: trimText(message.content),
        actor,
        source: message.senderName || (actor === 'ai' ? 'Nexus Guide' : 'Portal Messages'),
        relatedStage: message.relatedStage || stageForCategory(category),
        relatedTaskId: message.relatedTaskId || null,
        relatedMessageId: message.id,
        destination: message.destination || 'messages',
        priority: message.priority || (actor === 'ai' ? 'high' : 'normal'),
        upcoming: false,
      })
    );
  }

  return next;
}

function fundingPriority(value: string) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'approved') return 'high';
  if (normalized === 'denied') return 'high';
  return 'normal';
}

function buildFundingEvents(history: TimelineInputs['fundingHistory']) {
  const next: DealTimelineEvent[] = [];

  for (const row of history?.applications || []) {
    const status = String(row?.decision_status || 'submitted').toLowerCase();
    const provider = String(row?.provider_name || 'Funding provider');
    const product = String(row?.product_name || 'application');

    pushEvent(
      next,
      buildEvent({
        id: `funding-application:${String(row?.id || `${provider}:${product}:${row?.submitted_at || row?.created_at || ''}`)}`,
        timestamp: row?.submitted_at || row?.created_at || null,
        category: 'funding',
        title:
          status === 'approved'
            ? `Funding approved by ${provider}`
            : status === 'denied'
            ? `Funding decision: denied by ${provider}`
            : `Funding application submitted to ${provider}`,
        summary: trimText(`${provider} · ${product}${row?.bureau_used ? ` · Bureau: ${row.bureau_used}` : ''}${row?.notes ? ` · ${row.notes}` : ''}`),
        actor: 'user',
        source: 'Funding History',
        relatedStage: 'funding_roadmap',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'fundingRoadmap',
        priority: fundingPriority(status),
        upcoming: false,
      })
    );
  }

  for (const row of history?.results || []) {
    const status = String(row?.result_status || 'logged').toLowerCase();
    pushEvent(
      next,
      buildEvent({
        id: `funding-result:${String(row?.id || `${status}:${row?.outcome_at || row?.created_at || ''}`)}`,
        timestamp: row?.outcome_at || row?.created_at || null,
        category: 'funding',
        title:
          status === 'approved'
            ? 'Funding result recorded: approved'
            : status === 'denied'
            ? 'Funding result recorded: denied'
            : `Funding result recorded: ${titleCase(status)}`,
        summary: trimText(row?.result_notes || 'A funding result was logged for this client.'),
        actor: 'system',
        source: 'Funding Results',
        relatedStage: 'funding_roadmap',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'fundingRoadmap',
        priority: fundingPriority(status),
        upcoming: false,
      })
    );
  }

  for (const row of history?.legacy_outcomes || []) {
    const status = String(row?.outcome_status || 'logged').toLowerCase();
    pushEvent(
      next,
      buildEvent({
        id: `funding-outcome:${String(row?.id || `${status}:${row?.approval_date || row?.created_at || ''}`)}`,
        timestamp: row?.approval_date || row?.created_at || null,
        category: 'funding',
        title:
          status === 'approved'
            ? `Legacy funding outcome: approved${row?.provider_name ? ` by ${row.provider_name}` : ''}`
            : `Legacy funding outcome: ${titleCase(status)}`,
        summary: trimText(`${String(row?.provider_name || 'Provider')} · ${String(row?.product_type || 'funding outcome')}`),
        actor: 'system',
        source: 'Funding Outcomes',
        relatedStage: 'funding_roadmap',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'fundingRoadmap',
        priority: fundingPriority(status),
        upcoming: false,
      })
    );
  }

  return next;
}

function buildBusinessEvents(business: TimelineInputs['business']) {
  const next: DealTimelineEvent[] = [];

  if (business?.readiness?.path) {
    pushEvent(
      next,
      buildEvent({
        id: `business-path:${String(business.profile?.id || business.readiness.path)}`,
        timestamp: business.profile?.updated_at || business.profile?.created_at || null,
        category: 'business_foundation',
        title: 'Business path selected',
        summary: trimText(`Current business foundation path: ${titleCase(String(business.readiness.path))}.`),
        actor: 'user',
        source: 'Business Foundation',
        relatedStage: 'business_foundation',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'businessFoundation',
        priority: 'normal',
        upcoming: false,
      })
    );
  }

  for (const row of business?.progress || []) {
    if (String(row?.step_status || '').toLowerCase() !== 'completed') continue;

    pushEvent(
      next,
      buildEvent({
        id: `business-step:${String(row?.id || row?.step_key || row?.updated_at || '')}`,
        timestamp: row?.updated_at || null,
        category: 'business_foundation',
        title: `Completed business milestone: ${titleCase(String(row?.step_key || 'workflow step'))}`,
        summary: trimText(row?.notes || 'A business foundation step was completed.'),
        actor: 'user',
        source: 'Business Foundation',
        relatedStage: 'business_foundation',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'businessFoundation',
        priority: 'normal',
        upcoming: false,
      })
    );
  }

  return next;
}

function buildCreditEvents(credit: TimelineInputs['credit']) {
  const next: DealTimelineEvent[] = [];
  const latestReport = credit?.analysis?.latest_report;
  const latestAnalysis = credit?.analysis?.latest_analysis;

  pushEvent(
    next,
    buildEvent({
      id: `credit-report:${String(latestReport?.id || latestReport?.created_at || '')}`,
      timestamp: latestReport?.created_at || null,
      category: 'credit',
      title: 'Credit report uploaded',
      summary: trimText(latestReport?.report_name || latestReport?.bureau_name || 'A credit report is on file.'),
      actor: 'user',
      source: 'Credit Center',
      relatedStage: 'credit_optimization',
      relatedTaskId: null,
      relatedMessageId: null,
      destination: 'creditCenter',
      priority: 'normal',
      upcoming: false,
    })
  );

  pushEvent(
    next,
    buildEvent({
      id: `credit-analysis:${String(latestAnalysis?.id || latestAnalysis?.created_at || '')}`,
      timestamp: latestAnalysis?.created_at || null,
      category: 'credit',
      title: 'Credit analysis generated',
      summary: trimText(latestAnalysis?.summary || latestAnalysis?.analysis_summary || 'Credit recommendations are available.'),
      actor: 'system',
      source: 'Credit Center',
      relatedStage: 'credit_optimization',
      relatedTaskId: null,
      relatedMessageId: null,
      destination: 'creditCenter',
      priority: 'high',
      upcoming: false,
    })
  );

  return next;
}

function buildCapitalEvents(capital: TimelineInputs['capital']) {
  const next: DealTimelineEvent[] = [];
  const reserveConfirmedAt = capital?.readiness?.reserve_guidance?.reserve_confirmed_at || capital?.profile?.reserve_confirmed_at || null;
  const setupStatus = String(capital?.readiness?.context?.capital_setup_status || capital?.profile?.capital_setup_status || '').toLowerCase();

  if (capital?.readiness?.reserve_guidance?.reserve_confirmed || capital?.profile?.reserve_confirmed) {
    pushEvent(
      next,
      buildEvent({
        id: `capital-reserve:${String(capital?.profile?.id || reserveConfirmedAt || '')}`,
        timestamp: reserveConfirmedAt,
        category: 'capital',
        title: 'Capital reserve confirmed',
        summary: 'Reserve-first capital protection is confirmed for this client.',
        actor: 'user',
        source: 'Capital Protection',
        relatedStage: 'post_funding_capital',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'capitalProtection',
        priority: 'high',
        upcoming: false,
      })
    );
  }

  if (setupStatus === 'ready' || setupStatus === 'completed') {
    pushEvent(
      next,
      buildEvent({
        id: `capital-ready:${String(capital?.profile?.id || capital?.profile?.updated_at || '')}`,
        timestamp: capital?.profile?.updated_at || null,
        category: 'capital',
        title: 'Capital protection ready',
        summary: 'Post-funding capital protection is ready for allocation decisions.',
        actor: 'system',
        source: 'Capital Readiness',
        relatedStage: 'post_funding_capital',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'capitalProtection',
        priority: 'high',
        upcoming: false,
      })
    );
  }

  if (capital?.allocation?.selected_path) {
    pushEvent(
      next,
      buildEvent({
        id: `capital-path:${String(capital?.allocation?.selected_path)}:${String(capital?.allocation?.selected_at || '')}`,
        timestamp: capital?.allocation?.selected_at || null,
        category: 'capital',
        title: `Capital path selected: ${titleCase(String(capital.allocation.selected_path))}`,
        summary: trimText(`Current allocation state: ${titleCase(String(capital.allocation.current_state || 'active'))}.`),
        actor: 'user',
        source: 'Capital Allocation',
        relatedStage: 'post_funding_capital',
        relatedTaskId: null,
        relatedMessageId: null,
        destination: 'capitalAllocation',
        priority: 'normal',
        upcoming: false,
      })
    );
  }

  return next;
}

export function buildDealTimelineSnapshot(input: TimelineInputs): DealTimelineSnapshot {
  const currentStageLabel = formatTimelineStage(input.currentStage || 'funding_roadmap');
  const nextStepLabel = String(input.portalTasks?.top_task?.title || 'Follow the top Action Center task').trim();
  const visibility = input.visibility || 'client';

  const events = [
    ...buildTaskEvents(input.portalTasks),
    ...buildMessageEvents(input.contact.messageHistory || [], visibility),
    ...buildFundingEvents(input.fundingHistory),
    ...buildBusinessEvents(input.business),
    ...buildCreditEvents(input.credit),
    ...buildCapitalEvents(input.capital),
  ]
    .sort((left, right) => right.sortAt - left.sortAt)
    .slice(0, MAX_EVENT_COUNT);

  return {
    currentStageLabel,
    nextStepLabel,
    events,
    availableCategories: Array.from(new Set(events.map((event) => event.category))),
    availableActors: Array.from(new Set(events.map((event) => event.actor))),
  };
}