import { useMemo } from 'react';
import { Contact } from '../types';
import { LifecycleReminder } from '../services/lifecycleReminderService';
import {
  buildInternalCommunicationMessages,
  buildInternalCommunicationThreads,
  canSyncInternalMessages,
  getActionableCommunicationMessages,
  historiesMatch,
  summarizeReusePlan,
  syncInternalMessagesIntoHistory,
} from '../services/internalCommunicationService';

export default function useInternalThreads(contact?: Contact, reminders: LifecycleReminder[] = []) {
  const messages = useMemo(() => buildInternalCommunicationMessages(reminders), [reminders]);
  const threads = useMemo(() => buildInternalCommunicationThreads(messages), [messages]);
  const actionableMessages = useMemo(() => getActionableCommunicationMessages(messages), [messages]);
  const syncedHistory = useMemo(() => syncInternalMessagesIntoHistory(contact?.messageHistory || [], messages), [contact?.messageHistory, messages]);
  const needsHistorySync = useMemo(() => canSyncInternalMessages(contact, reminders) && !historiesMatch(contact?.messageHistory || [], syncedHistory), [contact, reminders, syncedHistory]);
  const reuseSummary = useMemo(() => summarizeReusePlan(reminders), [reminders]);

  return {
    messages,
    threads,
    actionableMessages,
    syncedHistory,
    needsHistorySync,
    reuseSummary,
  };
}