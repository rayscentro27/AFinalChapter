import { Contact, Message } from '../types';
import { LifecycleReminder, ReminderPriority, ReminderTarget } from './lifecycleReminderService';

export type InternalMessageType = 'reminder' | 'follow_up' | 'system_prompt' | 'ai_guidance' | 'task_nudge' | 'system_update' | 'approval_needed' | 'status_change';
export type InternalMessagePriority = 'normal' | 'high' | 'urgent';
export type InternalMessageActor = 'system' | 'ai_employee' | 'user' | 'admin';

export type InternalCommunicationMessage = {
  threadId: string;
  messageId: string;
  threadTitle: string;
  title: string;
  body: string;
  messageType: InternalMessageType;
  relatedTaskId: string | null;
  relatedStage: string;
  relatedClientId: string;
  priority: InternalMessagePriority;
  createdBy: InternalMessageActor;
  read: boolean;
  createdAt: string;
  destination: ReminderTarget;
  reminderId: string | null;
  status: 'active' | 'dismissed' | 'resolved' | 'suppressed';
  reason: string;
};

export type InternalCommunicationThread = {
  threadId: string;
  title: string;
  priority: InternalMessagePriority;
  unreadCount: number;
  lastMessage: InternalCommunicationMessage;
  messages: InternalCommunicationMessage[];
};

function formatStage(value: string) {
  return String(value || 'untracked').replace(/_/g, ' ');
}

function formatMessageType(value: InternalMessageType) {
  return String(value).replace(/_/g, ' ');
}

function toPriority(priority: ReminderPriority): InternalMessagePriority {
  if (priority === 'urgent') return 'urgent';
  if (priority === 'recommended') return 'high';
  return 'normal';
}

function toMessageType(reminder: LifecycleReminder): InternalMessageType {
  if (reminder.type === 'funding_followup_reminder' || reminder.type === 'funding_result_log_reminder' || reminder.type === 'credit_review_followup') {
    return 'follow_up';
  }
  if (reminder.type === 'business_setup_reminder' || reminder.type === 'capital_allocation_reminder') {
    return 'task_nudge';
  }
  if (reminder.type === 'trading_reengagement_reminder' || reminder.type === 'grant_reengagement_reminder') {
    return 'system_prompt';
  }
  return 'reminder';
}

function toStatus(reminder: LifecycleReminder): InternalCommunicationMessage['status'] {
  if (reminder.status === 'completed') return 'resolved';
  if (reminder.status === 'dismissed') return 'dismissed';
  if (reminder.status === 'suppressed') return 'suppressed';
  return 'active';
}

function threadTitle(reminder: LifecycleReminder) {
  if (reminder.target === 'creditCenter') return 'Credit Guidance';
  if (reminder.target === 'businessFoundation') return 'Business Foundation Guidance';
  if (reminder.target === 'fundingRoadmap') return 'Funding Follow-Up';
  if (reminder.target === 'capitalProtection' || reminder.target === 'capitalAllocation') return 'Capital Setup Guidance';
  if (reminder.target === 'tradingAccess') return 'Trading Education Guidance';
  if (reminder.target === 'grants') return 'Grant Workflow Guidance';
  return 'Action Center Guidance';
}

function threadId(reminder: LifecycleReminder) {
  return `portal:${reminder.tenantId}:${reminder.target}`;
}

function statusLine(reminder: LifecycleReminder) {
  if (reminder.status === 'completed') return 'This communication is marked resolved.';
  if (reminder.status === 'dismissed') return 'This communication was dismissed for now.';
  if (reminder.status === 'suppressed') return 'This communication is currently snoozed.';
  if (reminder.status === 'sent') return 'This communication is already active in the portal thread.';
  return 'This communication is active in your portal guidance thread.';
}

function buildBody(reminder: LifecycleReminder) {
  return [
    reminder.summary,
    `Why this exists: ${reminder.reason}`,
    `Current stage: ${formatStage(reminder.currentStage)}.`,
    statusLine(reminder),
  ].join(' ');
}

function buildAiGuidanceBody(reminder: LifecycleReminder) {
  return [
    `Nexus Guide: ${reminder.title}.`,
    `Start in ${formatStage(reminder.target)} and handle the linked step before moving to the next stage.`,
    `This guidance is grounded in the current task and stage state only: ${reminder.reason}`,
  ].join(' ');
}

function priorityWeight(priority: InternalMessagePriority) {
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  return 2;
}

function toPortalMessage(message: InternalCommunicationMessage): Message {
  const sender = message.createdBy === 'ai_employee' ? 'bot' : 'system';
  const senderName = message.createdBy === 'ai_employee' ? 'Nexus Guide' : 'Nexus System';

  return {
    id: `internal:${message.messageId}`,
    sender,
    senderName,
    content: message.body,
    timestamp: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: message.createdAt,
    read: message.read,
    threadId: message.threadId,
    messageType: message.messageType,
    relatedTaskId: message.relatedTaskId || undefined,
    relatedStage: message.relatedStage,
    relatedClientId: message.relatedClientId,
    priority: message.priority,
    createdBy: message.createdBy,
    destination: message.destination,
    internalOnly: true,
    actionRequired: {
      reason: message.reason,
      threadTitle: message.threadTitle,
      messageType: message.messageType,
      priority: message.priority,
      destination: message.destination,
      status: message.status,
      relatedTaskId: message.relatedTaskId,
    },
  };
}

function compareMessages(left: Message, right: Message) {
  return [
    left.id === right.id,
    left.content === right.content,
    left.messageType === right.messageType,
    left.priority === right.priority,
    left.destination === right.destination,
    left.read === right.read,
    left.createdBy === right.createdBy,
    left.relatedTaskId === right.relatedTaskId,
    left.relatedStage === right.relatedStage,
  ].every(Boolean);
}

export function historiesMatch(left: Message[] = [], right: Message[] = []) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!compareMessages(left[index], right[index])) return false;
  }
  return true;
}

export function buildInternalCommunicationMessages(reminders: LifecycleReminder[], options: { includeAiGuidance?: boolean } = {}) {
  const baseMessages = reminders.map<InternalCommunicationMessage>((reminder) => ({
    threadId: threadId(reminder),
    messageId: reminder.id,
    threadTitle: threadTitle(reminder),
    title: reminder.title,
    body: buildBody(reminder),
    messageType: toMessageType(reminder),
    relatedTaskId: reminder.linkedTaskId,
    relatedStage: reminder.currentStage,
    relatedClientId: reminder.tenantId,
    priority: toPriority(reminder.priority),
    createdBy: 'system',
    read: reminder.status !== 'pending',
    createdAt: reminder.suggestedSendAt,
    destination: reminder.target,
    reminderId: reminder.id,
    status: toStatus(reminder),
    reason: reminder.reason,
  }));

  if (options.includeAiGuidance !== false) {
    const topReminder = reminders.find((reminder) => reminder.status === 'pending' && reminder.priority !== 'optional');
    if (topReminder) {
      baseMessages.push({
        threadId: threadId(topReminder),
        messageId: `${topReminder.id}:ai-guidance`,
        threadTitle: `${threadTitle(topReminder)} Thread`,
        title: `Why ${topReminder.title.toLowerCase()} matters`,
        body: buildAiGuidanceBody(topReminder),
        messageType: 'ai_guidance',
        relatedTaskId: topReminder.linkedTaskId,
        relatedStage: topReminder.currentStage,
        relatedClientId: topReminder.tenantId,
        priority: toPriority(topReminder.priority),
        createdBy: 'ai_employee',
        read: false,
        createdAt: topReminder.suggestedSendAt,
        destination: topReminder.target,
        reminderId: topReminder.id,
        status: 'active',
        reason: topReminder.reason,
      });
    }
  }

  return [...baseMessages].sort((left, right) => {
    const priorityCompare = priorityWeight(left.priority) - priorityWeight(right.priority);
    if (priorityCompare !== 0) return priorityCompare;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

export function buildInternalCommunicationThreads(messages: InternalCommunicationMessage[]): InternalCommunicationThread[] {
  const grouped = new Map<string, InternalCommunicationMessage[]>();
  for (const message of messages) {
    const bucket = grouped.get(message.threadId) || [];
    bucket.push(message);
    grouped.set(message.threadId, bucket);
  }

  return Array.from(grouped.entries())
    .map(([id, items]) => {
      const sorted = [...items].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
      const lastMessage = sorted[sorted.length - 1];
      return {
        threadId: id,
        title: lastMessage.threadTitle,
        priority: sorted.reduce<InternalMessagePriority>((current, item) => (priorityWeight(item.priority) < priorityWeight(current) ? item.priority : current), 'normal'),
        unreadCount: sorted.filter((item) => !item.read).length,
        lastMessage,
        messages: sorted,
      };
    })
    .sort((left, right) => {
      const priorityCompare = priorityWeight(left.priority) - priorityWeight(right.priority);
      if (priorityCompare !== 0) return priorityCompare;
      return new Date(right.lastMessage.createdAt).getTime() - new Date(left.lastMessage.createdAt).getTime();
    });
}

export function getActionableCommunicationMessages(messages: InternalCommunicationMessage[]) {
  return messages
    .filter((message) => message.status === 'active' && message.messageType !== 'ai_guidance')
    .sort((left, right) => {
      const priorityCompare = priorityWeight(left.priority) - priorityWeight(right.priority);
      if (priorityCompare !== 0) return priorityCompare;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    })
    .slice(0, 3);
}

export function syncInternalMessagesIntoHistory(history: Message[] = [], messages: InternalCommunicationMessage[]) {
  const externalHistory = history.filter((message) => !String(message.id || '').startsWith('internal:'));
  const generated = messages.map(toPortalMessage);
  return [...externalHistory, ...generated];
}

export function formatInternalPriority(priority: InternalMessagePriority) {
  return priority;
}

export function formatInternalMessageType(value: InternalMessageType) {
  return formatMessageType(value);
}

export function summarizeReusePlan(reminders: LifecycleReminder[]) {
  return {
    sourceCount: reminders.length,
    threadCount: new Set(reminders.map((reminder) => threadId(reminder))).size,
  };
}

export function canSyncInternalMessages(contact: Contact | undefined, reminders: LifecycleReminder[]) {
  if (!contact) return false;
  return reminders.length > 0 || Boolean(contact.messageHistory?.some((message) => String(message.id || '').startsWith('internal:')));
}