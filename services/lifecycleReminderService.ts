export type ReminderType =
  | 'credit_upload_reminder'
  | 'credit_review_followup'
  | 'business_setup_reminder'
  | 'funding_followup_reminder'
  | 'funding_result_log_reminder'
  | 'capital_setup_reminder'
  | 'capital_allocation_reminder'
  | 'trading_reengagement_reminder'
  | 'grant_reengagement_reminder';

export type ReminderStatus = 'pending' | 'sent' | 'dismissed' | 'completed' | 'suppressed';

export type ReminderChannel = 'portal_thread' | 'action_center' | 'portal_inbox';

export type ReminderPriority = 'urgent' | 'recommended' | 'optional';

export type ReminderTarget =
  | 'actionCenter'
  | 'creditCenter'
  | 'businessFoundation'
  | 'fundingRoadmap'
  | 'capitalProtection'
  | 'capitalAllocation'
  | 'tradingAccess'
  | 'grants';

export type ReminderAction = 'mark_sent' | 'dismiss' | 'complete' | 'suppress_7d' | 'reactivate';

export type ReminderMetrics = {
  total: number;
  pending: number;
  sent: number;
  dismissed: number;
  completed: number;
  suppressed: number;
};

export type ReminderTaskInput = {
  task_id?: string;
  id?: string;
  title?: string;
  description?: string | null;
  due_date?: string | null;
  date?: string | null;
  signal?: string | null;
  group_key?: string | null;
  groupKey?: string | null;
  template_key?: string | null;
  templateKey?: string | null;
  type?: string | null;
  meta?: Record<string, unknown> | null;
};

export type TenantReminderInput = {
  tenantId: string;
  clientLabel: string;
  currentStage: string;
  pendingTasks: ReminderTaskInput[];
  creditReportCount: number;
  creditAnalysisCount: number;
  businessPath: string | null;
  businessMissingSteps: string[];
  pendingApplications: Array<{ submitted_at?: string | null; decision_status?: string | null }>;
  fundingResultCount: number;
  capitalProfile: {
    reserve_confirmed?: boolean | null;
    capital_setup_status?: string | null;
    business_growth_positioned?: boolean | null;
  } | null;
  capitalAllocation: {
    selected_path?: string | null;
    current_state?: string | null;
  } | null;
  tradingAccess: {
    opted_in?: boolean | null;
    intro_video_watched_at?: string | null;
    access_status?: string | null;
  } | null;
  grantMatchCount: number;
  grantDraftCount: number;
  grantSubmissionCount: number;
};

export type LifecycleReminder = {
  id: string;
  tenantId: string;
  clientLabel: string;
  type: ReminderType;
  title: string;
  summary: string;
  currentStage: string;
  reason: string;
  trigger: string;
  dueAt: string;
  suggestedSendAt: string;
  status: ReminderStatus;
  channel: ReminderChannel;
  lastSentAt: string | null;
  sendCount: number;
  cooldownHours: number;
  cooldownEndsAt: string | null;
  suppressedUntil: string | null;
  priority: ReminderPriority;
  source: 'task_brain' | 'stage_state';
  target: ReminderTarget;
  linkedTaskId: string | null;
  groupKey: string | null;
  internalReason: string;
  dependencyNote?: string;
};

type ReminderOverride = {
  lastSentAt?: string | null;
  sendCount?: number;
  dismissedAt?: string | null;
  completedAt?: string | null;
  suppressedUntil?: string | null;
};

const STORAGE_KEY = 'nexus_lifecycle_reminder_state_v1';

const DAY_MS = 24 * 60 * 60 * 1000;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeNowIso() {
  return new Date().toISOString();
}

function toIso(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addDays(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function addHours(dateIso: string, hours: number) {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeStage(stage?: string | null) {
  return String(stage || 'untracked').trim() || 'untracked';
}

export function formatReminderLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function readReminderOverrides(): Record<string, ReminderOverride> {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeReminderOverrides(state: Record<string, ReminderOverride>) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function applyReminderAction(reminderId: string, action: ReminderAction) {
  const overrides = readReminderOverrides();
  const current = overrides[reminderId] || {};
  const nowIso = safeNowIso();

  if (action === 'mark_sent') {
    overrides[reminderId] = {
      ...current,
      lastSentAt: nowIso,
      sendCount: Number(current.sendCount || 0) + 1,
      dismissedAt: null,
      completedAt: null,
    };
  } else if (action === 'dismiss') {
    overrides[reminderId] = {
      ...current,
      dismissedAt: nowIso,
      completedAt: null,
    };
  } else if (action === 'complete') {
    overrides[reminderId] = {
      ...current,
      completedAt: nowIso,
      dismissedAt: null,
      suppressedUntil: null,
    };
  } else if (action === 'suppress_7d') {
    overrides[reminderId] = {
      ...current,
      suppressedUntil: addDays(7),
      dismissedAt: null,
      completedAt: null,
    };
  } else {
    overrides[reminderId] = {
      ...current,
      dismissedAt: null,
      completedAt: null,
      suppressedUntil: null,
    };
  }

  writeReminderOverrides(overrides);
}

function statusFromOverride(base: LifecycleReminder, override?: ReminderOverride): LifecycleReminder {
  const lastSentAt = toIso(override?.lastSentAt || null);
  const suppressedUntil = toIso(override?.suppressedUntil || null);
  const cooldownEndsAt = lastSentAt ? addHours(lastSentAt, base.cooldownHours) : null;
  const sendCount = Number(override?.sendCount || 0);
  const nowMs = Date.now();

  let status: ReminderStatus = 'pending';
  if (override?.completedAt) {
    status = 'completed';
  } else if (override?.dismissedAt) {
    status = 'dismissed';
  } else if (suppressedUntil && new Date(suppressedUntil).getTime() > nowMs) {
    status = 'suppressed';
  } else if (cooldownEndsAt && new Date(cooldownEndsAt).getTime() > nowMs) {
    status = 'sent';
  }

  return {
    ...base,
    status,
    lastSentAt,
    sendCount,
    cooldownEndsAt,
    suppressedUntil,
  };
}

export function syncReminderState(reminders: LifecycleReminder[]) {
  const overrides = readReminderOverrides();
  return reminders.map((reminder) => statusFromOverride(reminder, overrides[reminder.id]));
}

function readTaskText(task: ReminderTaskInput, keys: Array<keyof ReminderTaskInput>) {
  for (const key of keys) {
    const value = task[key];
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function taskMatches(task: ReminderTaskInput, tokens: string[]) {
  const haystack = [
    readTaskText(task, ['title']),
    readTaskText(task, ['description']),
    readTaskText(task, ['group_key', 'groupKey']),
    readTaskText(task, ['template_key', 'templateKey']),
    readTaskText(task, ['type']),
  ]
    .join(' ')
    .toLowerCase();

  return tokens.some((token) => haystack.includes(token));
}

function taskPriority(task?: ReminderTaskInput | null): ReminderPriority {
  const signal = String(task?.signal || '').toLowerCase();
  if (signal === 'red') return 'urgent';
  if (signal === 'yellow') return 'recommended';
  return 'recommended';
}

function prettyStage(stage: string) {
  return formatReminderLabel(stage || 'untracked');
}

function buildReminder(input: {
  tenantId: string;
  clientLabel: string;
  type: ReminderType;
  currentStage: string;
  title: string;
  summary: string;
  reason: string;
  trigger: string;
  dueAt?: string | null;
  suggestedSendAt?: string | null;
  priority: ReminderPriority;
  source: 'task_brain' | 'stage_state';
  target: ReminderTarget;
  linkedTaskId?: string | null;
  groupKey?: string | null;
  channel?: ReminderChannel;
  cooldownHours?: number;
  dependencyNote?: string;
}): LifecycleReminder {
  const stage = normalizeStage(input.currentStage);
  const dueAt = toIso(input.dueAt || null) || addDays(input.priority === 'urgent' ? 1 : input.priority === 'recommended' ? 3 : 7);
  const suggestedSendAt = toIso(input.suggestedSendAt || null) || safeNowIso();
  const linkedTaskId = String(input.linkedTaskId || '').trim() || null;

  return {
    id: `${input.tenantId}:${input.type}:${linkedTaskId || stage}`,
    tenantId: input.tenantId,
    clientLabel: input.clientLabel,
    type: input.type,
    title: input.title,
    summary: input.summary,
    currentStage: stage,
    reason: input.reason,
    trigger: input.trigger,
    dueAt,
    suggestedSendAt,
    status: 'pending',
    channel: input.channel || 'portal_thread',
    lastSentAt: null,
    sendCount: 0,
    cooldownHours: input.cooldownHours || (input.priority === 'optional' ? 168 : 72),
    cooldownEndsAt: null,
    suppressedUntil: null,
    priority: input.priority,
    source: input.source,
    target: input.target,
    linkedTaskId,
    groupKey: input.groupKey || null,
    internalReason: input.reason,
    dependencyNote: input.dependencyNote,
  };
}

function maybePushReminder(target: LifecycleReminder[], reminder: LifecycleReminder | null) {
  if (!reminder) return;
  if (!target.some((existing) => existing.id === reminder.id)) {
    target.push(reminder);
  }
}

export function summarizeReminderMetrics(reminders: LifecycleReminder[]): ReminderMetrics {
  return {
    total: reminders.length,
    pending: reminders.filter((reminder) => reminder.status === 'pending').length,
    sent: reminders.filter((reminder) => reminder.status === 'sent').length,
    dismissed: reminders.filter((reminder) => reminder.status === 'dismissed').length,
    completed: reminders.filter((reminder) => reminder.status === 'completed').length,
    suppressed: reminders.filter((reminder) => reminder.status === 'suppressed').length,
  };
}

function priorityWeight(priority: ReminderPriority) {
  if (priority === 'urgent') return 0;
  if (priority === 'recommended') return 1;
  return 2;
}

export function sortLifecycleReminders(reminders: LifecycleReminder[]) {
  return [...reminders].sort((left, right) => {
    const priorityCompare = priorityWeight(left.priority) - priorityWeight(right.priority);
    if (priorityCompare !== 0) return priorityCompare;
    return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
  });
}

export function getReminderTone(priority: ReminderPriority) {
  if (priority === 'urgent') return 'danger';
  if (priority === 'recommended') return 'warning';
  return 'default';
}

export function getReminderTypeLabel(type: ReminderType) {
  return formatReminderLabel(type);
}

export function buildLifecycleReminders(input: TenantReminderInput): LifecycleReminder[] {
  const reminders: LifecycleReminder[] = [];
  const stage = normalizeStage(input.currentStage);
  const creditTask = input.pendingTasks.find((task) => taskMatches(task, ['credit', 'upload', 'dispute']));
  const businessTask = input.pendingTasks.find((task) => taskMatches(task, ['business', 'ein', 'naics', 'bank']));
  const fundingTask = input.pendingTasks.find((task) => taskMatches(task, ['funding', 'application', 'follow up', 'followup']));
  const capitalTask = input.pendingTasks.find((task) => taskMatches(task, ['capital', 'reserve', 'allocation']));
  const grantTask = input.pendingTasks.find((task) => taskMatches(task, ['grant']));

  if (input.creditReportCount === 0) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'credit_upload_reminder',
        currentStage: stage,
        title: 'Upload your latest credit report',
        summary: creditTask?.description || 'A current credit report is required before credit review and funding sequencing can move forward.',
        reason: 'No credit report is stored for this client yet.',
        trigger: 'credit_report_missing',
        dueAt: creditTask?.due_date || creditTask?.date,
        priority: stage === 'credit_optimization' || stage === 'untracked' ? taskPriority(creditTask) : 'recommended',
        source: creditTask ? 'task_brain' : 'stage_state',
        target: 'creditCenter',
        linkedTaskId: creditTask?.task_id || creditTask?.id,
        groupKey: readTaskText(creditTask || {}, ['group_key', 'groupKey']) || 'credit_optimization',
      })
    );
  }

  if (input.creditReportCount > 0 && input.creditAnalysisCount === 0) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'credit_review_followup',
        currentStage: stage,
        title: 'Review credit follow-up actions',
        summary: creditTask?.description || 'A credit report is on file, but the analysis or dispute follow-up actions are still unresolved.',
        reason: 'Credit report exists, but no credit analysis is stored yet.',
        trigger: 'credit_analysis_missing',
        dueAt: creditTask?.due_date || creditTask?.date,
        priority: taskPriority(creditTask),
        source: creditTask ? 'task_brain' : 'stage_state',
        target: 'creditCenter',
        linkedTaskId: creditTask?.task_id || creditTask?.id,
        groupKey: readTaskText(creditTask || {}, ['group_key', 'groupKey']) || 'credit_optimization',
      })
    );
  }

  if (!input.businessPath || input.businessMissingSteps.length > 0) {
    const missingStepLabel = input.businessMissingSteps.length ? input.businessMissingSteps.slice(0, 2).map(formatReminderLabel).join(', ') : 'business path selection';
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'business_setup_reminder',
        currentStage: stage,
        title: 'Finish business foundation steps',
        summary: businessTask?.description || `Complete the missing business setup items: ${missingStepLabel}.`,
        reason: !input.businessPath ? 'Business path is not selected yet.' : `Missing required business setup steps: ${input.businessMissingSteps.join(', ')}.`,
        trigger: !input.businessPath ? 'business_path_missing' : 'business_setup_incomplete',
        dueAt: businessTask?.due_date || businessTask?.date,
        priority: taskPriority(businessTask),
        source: businessTask ? 'task_brain' : 'stage_state',
        target: 'businessFoundation',
        linkedTaskId: businessTask?.task_id || businessTask?.id,
        groupKey: readTaskText(businessTask || {}, ['group_key', 'groupKey']) || 'business_foundation',
      })
    );
  }

  if (fundingTask && ['funding_roadmap', 'application_loop', 'business_foundation'].includes(stage)) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'funding_followup_reminder',
        currentStage: stage,
        title: fundingTask.title || 'Complete your next funding follow-up',
        summary: fundingTask.description || 'Keep the funding workflow moving by handling the next pending application or follow-up step.',
        reason: 'A funding-related task is still pending in the task brain.',
        trigger: 'funding_task_pending',
        dueAt: fundingTask.due_date || fundingTask.date,
        priority: taskPriority(fundingTask),
        source: 'task_brain',
        target: 'fundingRoadmap',
        linkedTaskId: fundingTask.task_id || fundingTask.id,
        groupKey: readTaskText(fundingTask, ['group_key', 'groupKey']) || 'funding_journey',
      })
    );
  }

  if (input.pendingApplications.length > 0 && input.fundingResultCount === 0) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'funding_result_log_reminder',
        currentStage: stage,
        title: 'Log your latest funding result',
        summary: 'An application appears to be in progress, but no result has been logged yet.',
        reason: 'Funding applications exist without any recorded funding result rows.',
        trigger: 'funding_result_missing',
        priority: 'urgent',
        source: 'stage_state',
        target: 'fundingRoadmap',
        linkedTaskId: null,
        groupKey: 'funding_journey',
      })
    );
  }

  if ((stage === 'post_funding_capital' || input.capitalProfile) && !Boolean(input.capitalProfile?.reserve_confirmed)) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'capital_setup_reminder',
        currentStage: stage,
        title: 'Complete capital protection setup',
        summary: capitalTask?.description || 'Reserve-first protection should be completed before expanding into optional post-funding paths.',
        reason: 'Capital profile exists, but reserve confirmation is still incomplete.',
        trigger: 'capital_protection_incomplete',
        dueAt: capitalTask?.due_date || capitalTask?.date,
        priority: capitalTask ? taskPriority(capitalTask) : 'urgent',
        source: capitalTask ? 'task_brain' : 'stage_state',
        target: 'capitalProtection',
        linkedTaskId: capitalTask?.task_id || capitalTask?.id,
        groupKey: readTaskText(capitalTask || {}, ['group_key', 'groupKey']) || 'capital_protection',
      })
    );
  }

  if (Boolean(input.capitalProfile?.reserve_confirmed) && !String(input.capitalAllocation?.selected_path || '').trim()) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'capital_allocation_reminder',
        currentStage: stage,
        title: 'Choose a post-funding capital path',
        summary: 'Capital protection is in place. The next step is selecting the most appropriate post-funding path.',
        reason: 'Reserve is confirmed, but no capital allocation path is selected.',
        trigger: 'capital_path_missing',
        dueAt: capitalTask?.due_date || capitalTask?.date,
        priority: 'recommended',
        source: capitalTask ? 'task_brain' : 'stage_state',
        target: 'capitalAllocation',
        linkedTaskId: capitalTask?.task_id || capitalTask?.id,
        groupKey: readTaskText(capitalTask || {}, ['group_key', 'groupKey']) || 'capital',
      })
    );
  }

  if (Boolean(input.tradingAccess?.opted_in) && !input.tradingAccess?.intro_video_watched_at && !['ready', 'unlocked'].includes(String(input.tradingAccess?.access_status || '').toLowerCase())) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'trading_reengagement_reminder',
        currentStage: stage,
        title: 'Return to trading education when ready',
        summary: 'This is optional. If you still want the trading track, complete the next education checkpoint first.',
        reason: 'Trading track was opted into, but the education video checkpoint is still incomplete.',
        trigger: 'trading_opt_in_no_progress',
        priority: 'optional',
        source: 'stage_state',
        target: 'tradingAccess',
        linkedTaskId: null,
        groupKey: 'trading_education',
        dependencyNote: 'Paper-trading progress is not platform-wide persisted yet, so optional trading reminders use access-state milestones only.',
      })
    );
  }

  if ((input.grantMatchCount > 0 || input.grantDraftCount > 0 || grantTask) && input.grantSubmissionCount === 0) {
    maybePushReminder(
      reminders,
      buildReminder({
        tenantId: input.tenantId,
        clientLabel: input.clientLabel,
        type: 'grant_reengagement_reminder',
        currentStage: stage,
        title: 'Revisit your grant workflow if it still fits',
        summary: grantTask?.description || 'This is optional. Review the shortlist or draft only if grant prep still fits the current plan.',
        reason: 'Grant workflow activity exists, but no submission is recorded yet.',
        trigger: 'grant_workflow_no_submission',
        dueAt: grantTask?.due_date || grantTask?.date,
        priority: 'optional',
        source: grantTask ? 'task_brain' : 'stage_state',
        target: 'grants',
        linkedTaskId: grantTask?.task_id || grantTask?.id,
        groupKey: readTaskText(grantTask || {}, ['group_key', 'groupKey']) || 'grants',
        dependencyNote: 'Grant opportunity views and saved-opportunity events are not persisted yet, so grant reminders use shortlist, draft, and submission state only.',
      })
    );
  }

  return sortLifecycleReminders(syncReminderState(reminders));
}

export function getClientVisibleReminders(reminders: LifecycleReminder[]) {
  return reminders.filter((reminder) => reminder.status === 'pending');
}