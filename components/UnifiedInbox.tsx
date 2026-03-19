import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Contact, InboxThread, UnifiedMessage, Message, InboxRouting, MessageAttachment } from '../types';
import { MessageSquare, Archive, Send, Zap, Bot, Eye, Ghost, Sparkles, FileText, Route, Loader2, Paperclip, X } from 'lucide-react';
import { sendInboxMessage, SendProvider } from '../lib/inboxSendClient';
import { claimConversation } from '../lib/claimConversation';
import { supabase } from '../lib/supabaseClient';
import { useAttachmentUpload, UploadAttachmentResult } from '../lib/useAttachmentUpload';
import AssignmentDrawer from './AssignmentDrawer';
import TagsPanel from './TagsPanel';
import QuickActionsBar from './QuickActionsBar';
import SlaBadges from './SlaBadges';
import InboxFiltersBar, { InboxFilters } from './InboxFiltersBar';
import AuditTimeline from './AuditTimeline';
import ContactDrawer from './ContactDrawer';

interface UnifiedInboxProps {
  contacts: Contact[];
  onUpdateContact?: (contact: Contact) => void;
}

type DbMessageRow = {
  id: string;
  tenant_id?: string;
  conversation_id?: string;
  direction?: 'in' | 'out';
  provider?: string;
  provider_message_id_real?: string | null;
  body?: string | null;
  content?: Record<string, unknown> | null;
  status?: string | null;
  received_at?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

type ConversationAssignment = {
  id: string;
  assignee_type?: 'contact' | 'agent' | 'ai' | null;
  assignee_user_id?: string | null;
  assignee_ai_key?: string | null;
};

type ConversationSlaMeta = {
  id: string;
  tenant_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  priority?: number | null;
  status?: string | null;
};

type RoutingRecommendation = {
  recommended_queue: string;
  confidence: number;
  reason: string;
  next_action: string;
  priority: 'normal' | 'high' | 'urgent';
};

const MARK_READ_ENDPOINT = '/.netlify/functions/messaging-mark-read';
const UNREAD_COUNTS_ENDPOINT = '/.netlify/functions/messaging-unread-counts';
const AI_SUGGESTIONS_ENDPOINT = '/.netlify/functions/messaging-ai-suggestions';
const SUMMARY_ENDPOINT = '/.netlify/functions/messaging-summary';
const ROUTING_RECOMMENDATION_ENDPOINT = '/.netlify/functions/messaging-routing-recommendation';
function toSendProvider(provider: InboxRouting['provider']): SendProvider | null {
  if (!provider) return null;
  return provider === 'meta' ? 'meta' : null;
}

function resolveOutboundRouting(contact: Contact) {
  const routing = (contact.inboxRouting || {}) as InboxRouting;
  const provider = toSendProvider(routing.provider);
  const conversation_id = routing.conversation_id || routing.conversationId;
  const tenant_id = routing.tenant_id || routing.tenantId || undefined;
  const to = routing.to || contact.phone || undefined;
  const recipient_id = routing.recipient_id || routing.recipientId || undefined;

  if (!provider || !conversation_id) return null;
  return { provider, conversation_id, tenant_id, to, recipient_id };
}

function formatTime(value?: string | null) {
  if (!value) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeMessageAttachments(content: unknown): MessageAttachment[] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const raw = (content as any).attachments;
  if (!Array.isArray(raw)) return [];

  const attachments: MessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const attachmentId = String((item as any).attachment_id || (item as any).id || '').trim();
    const storagePath = String((item as any).storage_path || '').trim();
    const storageBucket = String((item as any).storage_bucket || '').trim();
    const contentType = String((item as any).content_type || (item as any).mime_type || '').trim();
    const sizeValue = Number((item as any).size_bytes || (item as any).file_size || 0);

    if (!attachmentId && !storagePath) continue;
    attachments.push({
      attachmentId: attachmentId || undefined,
      storagePath: storagePath || undefined,
      storageBucket: storageBucket || undefined,
      contentType: contentType || undefined,
      sizeBytes: Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : undefined,
    });
  }

  return attachments;
}

function attachmentLabel(attachment: MessageAttachment, index: number) {
  if (attachment.storagePath) {
    const parts = attachment.storagePath.split('/').filter(Boolean);
    const tail = parts[parts.length - 1] || attachment.storagePath;
    return tail;
  }
  if (attachment.attachmentId) return `Attachment ${index + 1}`;
  return 'Attachment';
}

function mapDbMessage(row: DbMessageRow, contactName: string): Message {
  const isInbound = row.direction === 'in';
  const attachments = normalizeMessageAttachments(row.content);
  const body = String(row.body || '').trim();
  return {
    id: `db:${row.id}`,
    sender: isInbound ? 'client' : 'admin',
    senderName: isInbound ? contactName : 'Advisor',
    content: body || (attachments.length > 0 ? '[Attachment]' : '[No text body]'),
    timestamp: formatTime(row.received_at || row.sent_at || row.created_at),
    read: true,
    deliveryStatus: row.status || undefined,
    provider: row.provider || undefined,
    conversationId: row.conversation_id || undefined,
    providerMessageIdReal: row.provider_message_id_real || undefined,
    attachments,
  };
}

function mergeMessageHistory(history: Message[], incoming: Message): Message[] {
  const idx = history.findIndex(
    (msg) => msg.id === incoming.id || (!!incoming.providerMessageIdReal && msg.providerMessageIdReal === incoming.providerMessageIdReal)
  );

  if (idx === -1) return [...history, incoming];

  const next = [...history];
  next[idx] = { ...next[idx], ...incoming };
  return next;
}

function minutesSince(ts?: string | null): number | null {
  if (!ts) return null;
  const value = new Date(ts).getTime();
  if (!Number.isFinite(value)) return null;
  return Math.floor((Date.now() - value) / 60000);
}

function isStale(meta?: ConversationSlaMeta | null, staleMinutes = 120): boolean {
  if (!meta) return false;
  const age = minutesSince(meta.last_message_at || meta.updated_at);
  return age != null && age >= staleMinutes;
}

function isBreach(meta?: ConversationSlaMeta | null, breachMinutes = 240, priorityThreshold = 10): boolean {
  if (!meta) return false;
  const age = minutesSince(meta.last_message_at || meta.updated_at);
  const priority = Number(meta.priority ?? 9999);
  return age != null && age >= breachMinutes && priority <= priorityThreshold;
}

function normalizeProviderForFilter(provider: SendProvider | null): string {
  return provider || '';
}

const UnifiedInbox: React.FC<UnifiedInboxProps> = ({ contacts, onUpdateContact }) => {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'bot' | 'human'>('all');
  const [inputText, setInputText] = useState('');
  const [channelPreference, setChannelPreference] = useState<'auto' | SendProvider>('auto');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [assignmentDrawerOpen, setAssignmentDrawerOpen] = useState(false);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [conversationAssignments, setConversationAssignments] = useState<Record<string, ConversationAssignment>>({});
  const [conversationTags, setConversationTags] = useState<Record<string, string[]>>({});
  const [conversationStatuses, setConversationStatuses] = useState<Record<string, string>>({});
  const [conversationPriorities, setConversationPriorities] = useState<Record<string, number>>({});
  const [conversationSlaMeta, setConversationSlaMeta] = useState<Record<string, ConversationSlaMeta>>({});
  const [meUserId, setMeUserId] = useState<string>('');
  const [inboxFilters, setInboxFilters] = useState<InboxFilters>({
    q: '',
    status: 'any',
    provider: 'any',
    assigned: 'any',
    sla: 'any',
  });
  const [dbUnreadCounts, setDbUnreadCounts] = useState<Record<string, number>>({});
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiSuggestionsError, setAiSuggestionsError] = useState<string | null>(null);
  const [summaryByConversation, setSummaryByConversation] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [routingByConversation, setRoutingByConversation] = useState<Record<string, RoutingRecommendation>>({});
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<UploadAttachmentResult[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contactsRef = useRef<Contact[]>(contacts);
  const { uploadAttachment, getSignedUrl } = useAttachmentUpload();

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data?.user?.id) setMeUserId(String(data.user.id));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const data: InboxThread[] = contacts
      .filter((c) => c.messageHistory && c.messageHistory.length > 0)
      .map((c) => {
        const mappedMessages: UnifiedMessage[] = (c.messageHistory || []).map((m) => ({
          ...m,
          threadId: `th_${c.id}`,
          channel: 'portal',
          direction: m.sender === 'client' ? 'inbound' : 'outbound',
          sender: m.sender === 'admin' ? 'me' : (m.sender as any),
          senderName: m.senderName || (m.sender === 'client' ? c.name : 'Advisor'),
        }));

        return {
          id: `th_${c.id}`,
          contactId: c.id,
          contactName: c.name,
          contactAvatar: c.name[0],
          unreadCount: c.messageHistory?.filter((m) => !m.read && m.sender === 'client').length || 0,
          channel: 'portal',
          autoPilot: true,
          messages: mappedMessages,
          lastMessage: mappedMessages[mappedMessages.length - 1],
        };
      });

    setThreads(data);
  }, [contacts]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThreadId, threads]);

  const contactsById = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const contact of contacts) map.set(contact.id, contact);
    return map;
  }, [contacts]);

  const selectedThread = threads.find((t) => t.id === selectedThreadId);
  const selectedContact = selectedThread ? contactsById.get(selectedThread.contactId) : undefined;
  const selectedRouting = selectedContact ? resolveOutboundRouting(selectedContact) : null;
  const selectedConversationId = selectedRouting?.conversation_id;
  const selectedTenantId = selectedRouting?.tenant_id;

  const availableSendProviders = useMemo(() => {
    const set = new Set<SendProvider>();

    if (selectedRouting?.provider) set.add(selectedRouting.provider);

    const history = selectedContact?.messageHistory || [];
    for (const msg of history) {
      const provider = String(msg.provider || '').toLowerCase();
      if (provider === 'meta') set.add('meta');
    }

    return Array.from(set);
  }, [selectedContact, selectedRouting?.provider]);
  const selectedConversationAssignment = selectedConversationId
    ? (conversationAssignments[selectedConversationId] || { id: selectedConversationId })
    : null;
  const selectedConversationTags = selectedConversationId
    ? (conversationTags[selectedConversationId] || [])
    : [];
  const selectedConversationStatus = selectedConversationId
    ? (conversationStatuses[selectedConversationId] || 'open')
    : 'open';
  const selectedConversationPriority = selectedConversationId
    ? (conversationPriorities[selectedConversationId] || 3)
    : 3;
  const selectedSummary = selectedConversationId ? (summaryByConversation[selectedConversationId] || '') : '';
  const selectedRoutingRecommendation = selectedConversationId
    ? (routingByConversation[selectedConversationId] || null)
    : null;

  const selectedAssignmentLabel = selectedConversationAssignment
    ? selectedConversationAssignment.assignee_type === 'ai'
      ? ('AI' + (selectedConversationAssignment.assignee_ai_key ? ': ' + selectedConversationAssignment.assignee_ai_key : ''))
      : selectedConversationAssignment.assignee_user_id
        ? 'Agent Assigned'
        : 'Unassigned'
    : 'Unassigned';

  const postAuthedJson = async <T,>(endpoint: string, payload: Record<string, any>): Promise<T> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in required');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !(json as any)?.ok) {
      throw new Error(String((json as any)?.error || (endpoint + ' failed (' + response.status + ')')));
    }

    return json as T;
  };

  const markConversationRead = async (tenantId: string | undefined, conversationId: string, lastReadMessageId?: string) => {
    try {
      await postAuthedJson(MARK_READ_ENDPOINT, {
        tenant_id: tenantId,
        conversation_id: conversationId,
        last_read_message_id: lastReadMessageId || undefined,
      });
      setDbUnreadCounts((prev) => ({ ...prev, [conversationId]: 0 }));
    } catch (error: any) {
      console.warn('UnifiedInbox: mark read failed', String(error?.message || error));
    }
  };

  const requestAiSuggestions = async () => {
    if (!selectedConversationId || !selectedTenantId) return;
    setAiSuggestionsLoading(true);
    setAiSuggestionsError(null);

    try {
      const response = await postAuthedJson<{ suggestions?: string[] }>(AI_SUGGESTIONS_ENDPOINT, {
        tenant_id: selectedTenantId,
        conversation_id: selectedConversationId,
        count: 3,
      });

      const suggestions = Array.isArray(response?.suggestions)
        ? response.suggestions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
        : [];

      setAiSuggestions(suggestions);
      if (!suggestions.length) setAiSuggestionsError('No suggestions returned for this thread.');
    } catch (error: any) {
      setAiSuggestionsError(String(error?.message || 'Failed to fetch suggestions'));
    } finally {
      setAiSuggestionsLoading(false);
    }
  };

  const requestThreadSummary = async () => {
    if (!selectedConversationId || !selectedTenantId) return;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const response = await postAuthedJson<{ summary?: string }>(SUMMARY_ENDPOINT, {
        tenant_id: selectedTenantId,
        conversation_id: selectedConversationId,
        persist: true,
      });

      const summary = String(response?.summary || '').trim();
      setSummaryByConversation((prev) => ({
        ...prev,
        [selectedConversationId]: summary,
      }));

      if (!summary) setSummaryError('Summary generation returned no content.');
    } catch (error: any) {
      setSummaryError(String(error?.message || 'Failed to generate summary'));
    } finally {
      setSummaryLoading(false);
    }
  };

  const requestRoutingRecommendation = async () => {
    if (!selectedConversationId || !selectedTenantId) return;
    setRoutingLoading(true);
    setRoutingError(null);

    try {
      const response = await postAuthedJson<{ recommendation?: RoutingRecommendation }>(ROUTING_RECOMMENDATION_ENDPOINT, {
        tenant_id: selectedTenantId,
        conversation_id: selectedConversationId,
        persist: true,
      });

      const recommendation = response?.recommendation;
      if (!recommendation) throw new Error('No routing recommendation returned');

      setRoutingByConversation((prev) => ({
        ...prev,
        [selectedConversationId]: recommendation,
      }));
    } catch (error: any) {
      setRoutingError(String(error?.message || 'Failed to generate routing recommendation'));
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleSelectThread = (thread: InboxThread) => {
    setSelectedThreadId(thread.id);

    const threadContact = contactsById.get(thread.contactId);
    const routing = threadContact ? resolveOutboundRouting(threadContact) : null;
    if (!routing?.conversation_id) return;

    const latestDbMessageId = [...(thread.messages || [])]
      .map((msg) => String(msg.id || ''))
      .reverse()
      .find((id) => id.startsWith('db:'));

    void markConversationRead(
      routing.tenant_id,
      routing.conversation_id,
      latestDbMessageId ? latestDbMessageId.slice(3) : undefined
    );
  };

  useEffect(() => {
    setChannelPreference('auto');
    setPendingAttachments([]);
    setAttachmentsError(null);
  }, [selectedThreadId]);

  useEffect(() => {
    setAiSuggestions([]);
    setAiSuggestionsError(null);
    setSummaryError(null);
    setRoutingError(null);
  }, [selectedConversationId]);

  useEffect(() => {
    const routingTargets = contacts
      .map((contact) => resolveOutboundRouting(contact))
      .filter((routing): routing is NonNullable<ReturnType<typeof resolveOutboundRouting>> => !!routing?.conversation_id);

    if (!routingTargets.length) {
      setDbUnreadCounts({});
      return;
    }

    let active = true;

    const loadUnreadCounts = async () => {
      try {
        const grouped = new Map<string, { tenantId?: string; conversationIds: string[] }>();

        for (const routing of routingTargets) {
          const tenantId = routing.tenant_id;
          const key = tenantId || '__auto__';
          const entry = grouped.get(key) || { tenantId, conversationIds: [] };
          entry.conversationIds.push(routing.conversation_id);
          grouped.set(key, entry);
        }

        const merged: Record<string, number> = {};

        for (const entry of grouped.values()) {
          const uniqueIds = Array.from(new Set(entry.conversationIds)).filter(Boolean);
          if (!uniqueIds.length) continue;

          const response = await postAuthedJson<{ unread_counts?: Record<string, number> }>(UNREAD_COUNTS_ENDPOINT, {
            tenant_id: entry.tenantId,
            conversation_ids: uniqueIds,
          });

          const unread = response?.unread_counts || {};
          for (const [conversationId, unreadCount] of Object.entries(unread)) {
            merged[String(conversationId)] = Number(unreadCount || 0);
          }
        }

        if (!active) return;
        setDbUnreadCounts((prev) => ({ ...prev, ...merged }));
      } catch (error: any) {
        console.warn('UnifiedInbox: unread count sync failed', String(error?.message || error));
      }
    };

    void loadUnreadCounts();

    return () => {
      active = false;
    };
  }, [contacts]);

  useEffect(() => {
    const routingTargets = contacts
      .map((contact) => resolveOutboundRouting(contact))
      .filter((routing): routing is NonNullable<ReturnType<typeof resolveOutboundRouting>> => !!routing?.conversation_id);

    const conversationIds = Array.from(new Set(routingTargets.map((routing) => routing.conversation_id)));
    if (conversationIds.length === 0) return;

    let active = true;

    const loadConversationMeta = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, tenant_id, created_at, updated_at, last_message_at, priority, status, tags, assignee_type, assignee_user_id, assignee_ai_key')
        .in('id', conversationIds);

      if (error) {
        console.error('UnifiedInbox: failed to load conversation SLA metadata', error.message);
        return;
      }

      if (!active || !data) return;

      setConversationAssignments((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          if (!row?.id) continue;
          next[row.id] = {
            id: row.id,
            assignee_type: row.assignee_type || null,
            assignee_user_id: row.assignee_user_id || null,
            assignee_ai_key: row.assignee_ai_key || null,
          };
        }
        return next;
      });

      setConversationTags((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          if (!row?.id || !Array.isArray(row.tags)) continue;
          next[row.id] = row.tags as string[];
        }
        return next;
      });

      setConversationStatuses((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          if (!row?.id || !row.status) continue;
          next[row.id] = String(row.status);
        }
        return next;
      });

      setConversationPriorities((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          if (!row?.id || typeof row.priority !== 'number') continue;
          next[row.id] = Number(row.priority);
        }
        return next;
      });

      setConversationSlaMeta((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          if (!row?.id) continue;
          next[row.id] = {
            id: row.id,
            tenant_id: row.tenant_id || null,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            last_message_at: row.last_message_at || null,
            priority: typeof row.priority === 'number' ? row.priority : null,
            status: row.status || null,
          };
        }
        return next;
      });
    };

    void loadConversationMeta();

    return () => {
      active = false;
    };
  }, [contacts]);

  useEffect(() => {
    if (!selectedRouting?.conversation_id) return;

    const conversationId = selectedRouting.conversation_id;
    const tenantId = selectedRouting.tenant_id;
    let active = true;

    const applyConversationMeta = (row: any) => {
      if (!active || !row?.id) return;
      if (tenantId && row.tenant_id && row.tenant_id !== tenantId) return;

      setConversationAssignments((prev) => ({
        ...prev,
        [row.id]: {
          id: row.id,
          assignee_type: row.assignee_type || null,
          assignee_user_id: row.assignee_user_id || null,
          assignee_ai_key: row.assignee_ai_key || null,
        },
      }));

      if (Array.isArray(row.tags)) {
        setConversationTags((prev) => ({
          ...prev,
          [row.id]: row.tags as string[],
        }));
      }

      if (row.status) {
        setConversationStatuses((prev) => ({
          ...prev,
          [row.id]: String(row.status),
        }));
      }

      if (typeof row.priority === 'number') {
        setConversationPriorities((prev) => ({
          ...prev,
          [row.id]: Number(row.priority),
        }));
      }

      setConversationSlaMeta((prev) => ({
        ...prev,
        [row.id]: {
          id: row.id,
          tenant_id: row.tenant_id || null,
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
          last_message_at: row.last_message_at || null,
          priority: typeof row.priority === 'number' ? Number(row.priority) : null,
          status: row.status ? String(row.status) : null,
        },
      }));
    };

    const loadAssignment = async () => {
      let query: any = supabase
        .from('conversations')
        .select('id, tenant_id, created_at, updated_at, last_message_at, assignee_type, assignee_user_id, assignee_ai_key, tags, status, priority')
        .eq('id', conversationId)
        .limit(1);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      let data: any = null;
      let error: any = null;
      ({ data, error } = await query.maybeSingle());

      // Backward compatibility before assignee_ai_key migration is applied.
      if (error && String(error.message || '').toLowerCase().includes('assignee_ai_key')) {
        let fallbackQuery: any = supabase
          .from('conversations')
          .select('id, tenant_id, created_at, updated_at, last_message_at, assignee_type, assignee_user_id, tags, status, priority')
          .eq('id', conversationId)
          .limit(1);
        if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId);

        const fallback = await fallbackQuery.maybeSingle();
        data = fallback.data ? { ...fallback.data, assignee_ai_key: null } : null;
        error = fallback.error;
      }

      if (error) {
        console.error('UnifiedInbox: failed to load conversation assignment', error.message);
        return;
      }

      if (data) applyConversationMeta(data);
    };

    void loadAssignment();

    const channel = supabase
      .channel(`unified-inbox-assignment-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
        (payload) => applyConversationMeta((payload as any).new)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [selectedRouting?.conversation_id, selectedRouting?.tenant_id]);

  useEffect(() => {
    if (!onUpdateContact || !selectedContact || !selectedRouting?.conversation_id) return;

    const contactId = selectedContact.id;
    const contactName = selectedContact.name;
    const conversationId = selectedRouting.conversation_id;
    const tenantId = selectedRouting.tenant_id;
    let active = true;

    const upsertRow = (row: DbMessageRow) => {
      if (!active || !row?.id) return;
      if (tenantId && row.tenant_id && row.tenant_id !== tenantId) return;

      const currentContact = contactsRef.current.find((c) => c.id === contactId);
      if (!currentContact) return;

      const incoming = mapDbMessage(row, contactName);
      const merged = mergeMessageHistory(currentContact.messageHistory || [], incoming);
      onUpdateContact({ ...currentContact, messageHistory: merged });
    };

    const loadExisting = async () => {
      let query: any = supabase
        .from('messages')
        .select('id, tenant_id, conversation_id, direction, provider, provider_message_id_real, body, content, status, received_at, sent_at, created_at')
        .eq('conversation_id', conversationId)
        .order('received_at', { ascending: true })
        .limit(300);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, error } = await query;
      if (error) {
        console.error('UnifiedInbox: failed to load DB messages', error.message);
        return;
      }

      for (const row of data || []) upsertRow(row as DbMessageRow);
    };

    loadExisting();

    const channel = supabase
      .channel(`unified-inbox-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => upsertRow((payload as any).new as DbMessageRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => upsertRow((payload as any).new as DbMessageRow)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [onUpdateContact, selectedContact?.id, selectedContact?.name, selectedRouting?.conversation_id, selectedRouting?.tenant_id]);

  const handleAttachmentFilesPicked = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!selectedRouting?.tenant_id || !selectedRouting?.conversation_id || !selectedContact?.id) {
      setAttachmentsError('Select a routed thread before uploading attachments.');
      return;
    }

    setAttachmentsBusy(true);
    setAttachmentsError(null);

    try {
      const uploads: UploadAttachmentResult[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadAttachment({
          file,
          tenantId: selectedRouting.tenant_id,
          contactId: selectedContact.id,
          conversationId: selectedRouting.conversation_id,
        });
        uploads.push(uploaded);
      }

      setPendingAttachments((prev) => {
        const merged = [...prev, ...uploads];
        const dedup = new Map<string, UploadAttachmentResult>();
        for (const item of merged) dedup.set(String(item.attachment_id), item);
        return Array.from(dedup.values());
      });
    } catch (error: any) {
      setAttachmentsError(String(error?.message || 'Attachment upload failed'));
    } finally {
      setAttachmentsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((item) => String(item.attachment_id) !== String(attachmentId)));
  };

  const openAttachment = async (attachment: MessageAttachment) => {
    if (!selectedTenantId) {
      setSendError('Missing tenant context for attachment access.');
      return;
    }

    if (!attachment.attachmentId) {
      setSendError('Attachment is missing an attachment ID.');
      return;
    }

    setOpeningAttachmentId(attachment.attachmentId);
    setSendError(null);

    try {
      const signedUrl = await getSignedUrl(selectedTenantId, attachment.attachmentId, 600);
      if (!signedUrl) throw new Error('Signed URL missing from response');
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      setSendError(String(error?.message || 'Unable to open attachment'));
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const handleSendMessage = async (text: string, isBot = false) => {
    if (!selectedThreadId || !onUpdateContact || isSending || attachmentsBusy) return;

    const trimmed = String(text || '').trim();
    const outboundAttachments = pendingAttachments.map((item) => ({
      attachment_id: item.attachment_id,
      storage_path: item.storage_path,
    }));

    if (!trimmed && outboundAttachments.length === 0) return;

    const thread = threads.find((t) => t.id === selectedThreadId);
    if (!thread) return;

    const contact = contactsRef.current.find((c) => c.id === thread.contactId);
    if (!contact) return;

    setSendError(null);
    setAttachmentsError(null);

    const optimisticMessage: Message = {
      id: `tmp_${Date.now()}`,
      sender: isBot ? 'bot' : 'admin',
      senderName: isBot ? 'Nexus Concierge' : 'Advisor',
      content: trimmed || '[Attachment]',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: true,
      deliveryStatus: isBot ? 'sent' : 'queued',
      attachments: outboundAttachments.map((item) => ({
        attachmentId: String(item.attachment_id),
        storagePath: String(item.storage_path),
      })),
    };

    const nextHistory = [...(contact.messageHistory || []), optimisticMessage];
    onUpdateContact({ ...contact, messageHistory: nextHistory });
    setInputText('');
    setPendingAttachments([]);

    if (isBot) return;

    const routing = resolveOutboundRouting(contact);
    if (!routing) {
      setSendError('Live channel routing not configured for this thread. Message saved locally only.');
      return;
    }

    setIsSending(true);
    try {
      const response = await sendInboxMessage({
        tenant_id: routing.tenant_id,
        conversation_id: routing.conversation_id,
        contact_id: contact.id,
        body_text: trimmed,
        attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
        channel_preference: channelPreference === 'auto' ? undefined : channelPreference,
      });

      const latest = contactsRef.current.find((c) => c.id === contact.id);
      const outboundStatus = String(response?.status || 'queued');
      const outboundProvider = String(response?.provider || (channelPreference === 'auto' ? routing.provider : channelPreference) || routing.provider);
      if (latest) {
        const upgradedHistory = (latest.messageHistory || []).map((msg) => {
          if (msg.id !== optimisticMessage.id) return msg;
          return {
            ...msg,
            id: response.message_id ? `db:${response.message_id}` : msg.id,
            deliveryStatus: outboundStatus,
            provider: outboundProvider,
            conversationId: routing.conversation_id,
            providerMessageIdReal:
              response.provider_message_id_real ||
              response.provider_message_id ||
              msg.providerMessageIdReal,
          } as Message;
        });

        onUpdateContact({ ...latest, messageHistory: upgradedHistory });
      }

      if (routing.conversation_id) {
        void markConversationRead(
          routing.tenant_id,
          routing.conversation_id,
          response.message_id ? String(response.message_id) : undefined
        );
      }
    } catch (err: any) {
      const message = String(err?.message || 'Failed to send outbound message');
      setSendError(message);
      const latest = contactsRef.current.find((c) => c.id === contact.id) || contact;
      const failedHistory = (latest.messageHistory || []).map((msg) =>
        msg.id === optimisticMessage.id ? { ...msg, deliveryStatus: 'failed' } : msg
      );
      const failNote: Message = {
        id: `msg_fail_${Date.now()}`,
        sender: 'system',
        senderName: 'System',
        content: `Send failed: ${message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: true,
      };
      onUpdateContact({ ...latest, messageHistory: [...failedHistory, failNote] });
    } finally {
      setIsSending(false);
    }
  };

  const retryFailedMessage = async (msg: Message) => {
    if (!msg?.content || isSending || attachmentsBusy) return;
    await handleSendMessage(String(msg.content), false);
  };

  const handleClaimThread = async (thread: InboxThread) => {
    const threadContact = contactsById.get(thread.contactId);
    const routing = threadContact ? resolveOutboundRouting(threadContact) : null;

    if (!routing?.tenant_id || !routing.conversation_id) {
      setSendError('This conversation is missing tenant or routing context for claim.');
      return;
    }

    try {
      const result = await claimConversation({
        tenantId: routing.tenant_id,
        conversationId: routing.conversation_id,
      });

      if (!result.ok) {
        if (result.reason === 'already_claimed') {
          setSendError('Conversation is already claimed by another assignee.');
          return;
        }
        setSendError('Claim failed: ' + result.reason);
        return;
      }

      setConversationAssignments((prev) => ({
        ...prev,
        [routing.conversation_id]: {
          id: routing.conversation_id,
          assignee_type: 'agent',
          assignee_user_id: meUserId || prev[routing.conversation_id]?.assignee_user_id || null,
          assignee_ai_key: null,
        },
      }));

      setSendError(null);
    } catch (e: any) {
      setSendError(String(e?.message || e));
    }
  };

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (filter === 'bot' && !thread.autoPilot) return false;
      if (filter === 'human' && thread.autoPilot) return false;

      const threadContact = contactsById.get(thread.contactId);
      const threadRouting = threadContact ? resolveOutboundRouting(threadContact) : null;
      const conversationId = threadRouting?.conversation_id || null;
      const assignment = conversationId ? conversationAssignments[conversationId] : null;
      const tags = conversationId ? conversationTags[conversationId] || [] : [];
      const slaMeta = conversationId ? conversationSlaMeta[conversationId] : null;
      const provider = normalizeProviderForFilter(threadRouting?.provider || null);
      const status = String(conversationId ? conversationStatuses[conversationId] || slaMeta?.status || '' : '').toLowerCase();

      if (inboxFilters.status !== 'any' && status !== inboxFilters.status) return false;
      if (inboxFilters.provider !== 'any' && provider !== inboxFilters.provider) return false;

      if (inboxFilters.assigned !== 'any') {
        if (inboxFilters.assigned === 'unassigned') {
          if (assignment?.assignee_user_id || assignment?.assignee_type === 'ai' || assignment?.assignee_ai_key) return false;
        }

        if (inboxFilters.assigned === 'mine') {
          if (!inboxFilters.meUserId || String(assignment?.assignee_user_id || '') !== String(inboxFilters.meUserId)) return false;
        }

        if (inboxFilters.assigned === 'ai' && String(assignment?.assignee_type || '') !== 'ai') return false;

        if (inboxFilters.assigned === 'agent') {
          if (!(assignment?.assignee_user_id && String(assignment?.assignee_type || '') === 'agent')) return false;
        }
      }

      if (inboxFilters.sla === 'stale' && !isStale(slaMeta)) return false;
      if (inboxFilters.sla === 'breach' && !isBreach(slaMeta)) return false;

      if (inboxFilters.q) {
        const q = inboxFilters.q.toLowerCase();
        const haystack = [
          thread.contactName,
          thread.lastMessage?.content,
          ...(Array.isArray(tags) ? tags : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    threads,
    filter,
    contactsById,
    conversationAssignments,
    conversationTags,
    conversationSlaMeta,
    conversationStatuses,
    inboxFilters,
  ]);

  return (
    <div className="flex h-[calc(100vh-100px)] bg-slate-50 animate-fade-in overflow-hidden rounded-[3rem] border border-slate-200 shadow-2xl">
      <div className="w-96 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-8 border-b border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Neural Inbox</h2>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><MessageSquare size={20} /></div>
          </div>
          <div className="mb-4">
            <InboxFiltersBar
              meUserId={meUserId}
              onChange={setInboxFilters}
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
            {(['all', 'bot', 'human'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                {f === 'bot' ? <Zap size={10} className="inline mr-1" /> : null}
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredThreads.map((thread) => {
            const threadContact = contactsById.get(thread.contactId);
            const threadRouting = threadContact ? resolveOutboundRouting(threadContact) : null;
            const threadConversationId = threadRouting?.conversation_id || null;
            const threadSla = threadConversationId ? conversationSlaMeta[threadConversationId] || null : null;
            const threadAssignment = threadConversationId ? conversationAssignments[threadConversationId] || null : null;
            const alreadyHumanAssigned = Boolean(threadAssignment?.assignee_user_id && threadAssignment?.assignee_type === 'agent');
            const canClaim = Boolean(threadRouting?.tenant_id && threadConversationId && !alreadyHumanAssigned);
            const unreadCount = threadConversationId ? (dbUnreadCounts[threadConversationId] ?? thread.unreadCount) : thread.unreadCount;

            return (
              <div
                key={thread.id}
                onClick={() => handleSelectThread(thread)}
                className={`p-6 border-b border-slate-50 cursor-pointer transition-all relative group ${selectedThreadId === thread.id ? 'bg-blue-50/50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shadow-lg transform rotate-3 group-hover:rotate-0 transition-transform">{thread.contactAvatar}</div>
                    <div>
                      <span className="font-black text-sm uppercase text-slate-900 truncate block max-w-[120px]">{thread.contactName}</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{thread.channel}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap mb-1">{thread.lastMessage.timestamp}</span>
                    {unreadCount > 0 && <span className="bg-red-500 text-white w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center animate-bounce">{unreadCount}</span>}
                  </div>
                </div>
                <p className="text-xs text-slate-500 line-clamp-1 font-medium italic">"{thread.lastMessage.content}"</p>
                {threadSla ? (
                  <SlaBadges
                    conversation={threadSla}
                    staleMinutes={120}
                    breachMinutes={240}
                    breachPriorityThreshold={10}
                    newMinutes={10}
                    emphasizePending={true}
                  />
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {threadAssignment?.assignee_type === 'ai' ? 'AI Assigned' : threadAssignment?.assignee_user_id ? 'Agent Assigned' : 'Unassigned'}
                  </span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleClaimThread(thread);
                    }}
                    disabled={!canClaim}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40"
                  >
                    Claim
                  </button>
                </div>
                {thread.autoPilot && (
                  <div className="mt-3 flex items-center gap-1.5 text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 w-fit px-2 py-0.5 rounded-full border border-emerald-100">
                    <Bot size={10} /> Concierge Active
                  </div>
                )}
              </div>
            );
          })}
          {filteredThreads.length === 0 && (
            <div className="py-24 text-center opacity-20 flex flex-col items-center">
              <Ghost size={48} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No Active Conversations</p>
            </div>
          )}
        </div>
      </div>

      {selectedThread ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white relative">
          <div className="h-24 border-b border-slate-200 flex justify-between items-center px-10 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm uppercase shadow-2xl transform rotate-3">{selectedThread.contactAvatar}</div>
              <div>
                <h3 className="font-black text-xl uppercase tracking-tighter text-slate-900">{selectedThread.contactName}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Session: Active</span>
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    {selectedAssignmentLabel}
                  </span>
                  {selectedThread.autoPilot && <span className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-lg animate-pulse border border-indigo-100"><Bot size={12} /> AI Monitoring</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-3 bg-slate-100 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-2xl transition-all" title="View Full CRM Dossier"><Eye size={20} /></button>
              <button
                onClick={() => setContactDrawerOpen(true)}
                disabled={!selectedConversationId || !selectedTenantId}
                className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Contact
              </button>
              <button
                onClick={() => setAssignmentDrawerOpen(true)}
                disabled={!selectedConversationAssignment || !selectedRouting?.tenant_id}
                className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign
              </button>
              <div className="h-8 w-px bg-slate-100 mx-2"></div>
              <button
                onClick={() => onUpdateContact?.({ ...contacts.find((c) => c.id === selectedThread.contactId)!, aiReason: 'Intervened by human admin' })}
                className="bg-slate-950 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-xl active:scale-95"
              >
                Take Control
              </button>
            </div>
          </div>

          {selectedTenantId && selectedConversationId ? (
            <div className="px-10 pb-3 pt-4 border-b border-slate-100 bg-white space-y-3">
              <TagsPanel
                tenantId={selectedTenantId}
                conversationId={selectedConversationId}
                tags={selectedConversationTags}
                onUpdated={(nextTags) => {
                  setConversationTags((prev) => {
                    if (!selectedConversationId) return prev;
                    return {
                      ...prev,
                      [selectedConversationId]: nextTags,
                    };
                  });
                }}
                enableRoutingButton={true}
                autoRunRoutingOnUpdate={true}
              />
            </div>
          ) : null}

          {selectedTenantId && selectedConversationId ? (
            <div className="px-10 pb-3 bg-white">
              <AuditTimeline tenantId={selectedTenantId} conversationId={selectedConversationId} />
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-50/30 custom-scrollbar">
            {selectedThread.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[70%] p-6 rounded-[2.5rem] text-sm font-medium leading-relaxed shadow-sm relative animate-fade-in ${
                  msg.sender !== 'client' ? 'bg-slate-900 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-slate-100'
                }`}>
                  {msg.sender === 'bot' && (
                    <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-indigo-400 mb-3 border-b border-white/10 pb-2"><Bot size={12} /> Nexus Autonomous Proxy</div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.attachments.map((attachment, index) => {
                        const key = `${msg.id}-att-${attachment.attachmentId || attachment.storagePath || index}`;
                        const canOpen = Boolean(attachment.attachmentId);
                        return (
                          <button
                            key={key}
                            onClick={() => void openAttachment(attachment)}
                            disabled={!canOpen || openingAttachmentId === attachment.attachmentId}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${
                              msg.sender !== 'client'
                                ? 'border-white/20 bg-white/10 text-white'
                                : 'border-slate-200 bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Paperclip size={11} />
                            {attachmentLabel(attachment, index)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className={`text-[9px] mt-4 font-black uppercase opacity-50 text-right ${msg.sender !== 'client' ? 'text-slate-300' : 'text-slate-400'}`}>
                    {msg.timestamp}{msg.deliveryStatus ? ` • ${msg.deliveryStatus}` : ''}
                  </div>
                  {msg.sender !== 'client' && String(msg.deliveryStatus || '').toLowerCase() === 'failed' ? (
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => void retryFailedMessage(msg)}
                        disabled={isSending}
                        className="rounded-lg border border-white/20 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/90 disabled:opacity-40"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-8 bg-white border-t border-slate-100 shadow-2xl">
            {selectedTenantId && selectedConversationId ? (
              <div className="mb-4">
                <QuickActionsBar
                  tenantId={selectedTenantId}
                  conversation={{
                    id: selectedConversationId,
                    tags: selectedConversationTags,
                    status: selectedConversationStatus,
                    priority: selectedConversationPriority,
                    assignee_type: selectedConversationAssignment?.assignee_type || null,
                    assignee_user_id: selectedConversationAssignment?.assignee_user_id || null,
                    assignee_ai_key: selectedConversationAssignment?.assignee_ai_key || null,
                  }}
                  onUpdated={(updated) => {
                    if (!selectedConversationId) return;

                    if (Array.isArray(updated.tags)) {
                      setConversationTags((prev) => ({
                        ...prev,
                        [selectedConversationId]: updated.tags as string[],
                      }));
                    }

                    setConversationAssignments((prev) => ({
                      ...prev,
                      [selectedConversationId]: {
                        id: selectedConversationId,
                        assignee_type: (updated.assignee_type as 'contact' | 'agent' | 'ai' | null) || null,
                        assignee_user_id: (updated.assignee_user_id as string | null) || null,
                        assignee_ai_key: (updated.assignee_ai_key as string | null) || null,
                      },
                    }));

                    if (updated.status) {
                      setConversationStatuses((prev) => ({
                        ...prev,
                        [selectedConversationId]: String(updated.status),
                      }));
                    }

                    if (typeof updated.priority === 'number') {
                      setConversationPriorities((prev) => ({
                        ...prev,
                        [selectedConversationId]: Number(updated.priority),
                      }));
                    }
                  }}
                />
              </div>
            ) : null}
            {selectedTenantId && selectedConversationId ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void requestAiSuggestions()}
                    disabled={aiSuggestionsLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
                  >
                    {aiSuggestionsLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Suggest Reply
                  </button>
                  <button
                    onClick={() => void requestThreadSummary()}
                    disabled={summaryLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
                  >
                    {summaryLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                    Summarize
                  </button>
                  <button
                    onClick={() => void requestRoutingRecommendation()}
                    disabled={routingLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
                  >
                    {routingLoading ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
                    Route Suggestion
                  </button>
                </div>

                {aiSuggestionsError ? <p className="text-[11px] font-bold text-amber-700">{aiSuggestionsError}</p> : null}
                {summaryError ? <p className="text-[11px] font-bold text-amber-700">{summaryError}</p> : null}
                {routingError ? <p className="text-[11px] font-bold text-amber-700">{routingError}</p> : null}

                {aiSuggestions.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {aiSuggestions.map((suggestion, index) => (
                      <button
                        key={selectedConversationId + '-suggestion-' + index}
                        onClick={() => setInputText(suggestion)}
                        className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                {selectedSummary ? (
                  <div className="mb-2 rounded-lg border border-slate-200 bg-white p-2">
                    <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Thread Summary</p>
                    <p className="whitespace-pre-wrap text-[11px] font-medium text-slate-700">{selectedSummary}</p>
                  </div>
                ) : null}

                {selectedRoutingRecommendation ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Routing Recommendation</p>
                    <p className="text-[11px] font-semibold text-slate-700">
                      Queue: {selectedRoutingRecommendation.recommended_queue} · Priority: {selectedRoutingRecommendation.priority} · Confidence: {selectedRoutingRecommendation.confidence}%
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-slate-600">Reason: {selectedRoutingRecommendation.reason}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-600">Next: {selectedRoutingRecommendation.next_action}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Sending via: {channelPreference === 'auto' ? `Auto${selectedRouting?.provider ? ` (${selectedRouting.provider})` : ''}` : channelPreference}
              </span>
              {availableSendProviders.length > 1 ? (
                <select
                  value={channelPreference}
                  onChange={(event) => setChannelPreference(event.target.value as 'auto' | SendProvider)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700"
                >
                  <option value="auto">Auto</option>
                  {availableSendProviders.map((provider) => (
                    <option key={provider} value={provider}>{provider}</option>
                  ))}
                </select>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleAttachmentFilesPicked(event.target.files);
              }}
            />

            {pendingAttachments.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {pendingAttachments.map((attachment, index) => (
                  <span
                    key={`pending-${attachment.attachment_id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-700"
                  >
                    <Paperclip size={11} />
                    {attachmentLabel({
                      attachmentId: String(attachment.attachment_id),
                      storagePath: String(attachment.storage_path || ''),
                    }, index)}
                    <button
                      onClick={() => removePendingAttachment(String(attachment.attachment_id))}
                      className="rounded p-0.5 hover:bg-cyan-100"
                      aria-label="Remove attachment"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex gap-4 items-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || attachmentsBusy || !selectedRouting?.tenant_id || !selectedRouting?.conversation_id}
                className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm disabled:opacity-50"
              >
                {attachmentsBusy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                Attach
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
                  placeholder="Type an intervention message or send attachments..."
                  disabled={isSending || attachmentsBusy}
                  className="w-full pl-6 pr-16 py-5 bg-slate-100 border-none rounded-[2rem] text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none shadow-inner disabled:opacity-60"
                />
                <button
                  onClick={() => handleSendMessage(inputText)}
                  disabled={isSending || attachmentsBusy || (!String(inputText || '').trim() && pendingAttachments.length === 0)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95 disabled:opacity-60"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
            {(isSending || attachmentsBusy || sendError || attachmentsError) && (
              <div className="mt-3 text-xs font-bold">
                {isSending && <span className="text-blue-600">Sending through unified gateway...</span>}
                {attachmentsBusy && <span className="text-blue-600"> Uploading attachments...</span>}
                {!attachmentsBusy && attachmentsError && <span className="text-amber-700">{attachmentsError}</span>}
                {!isSending && sendError && <span className="text-amber-700">{sendError}</span>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-20 opacity-10 rotate-12"><MessageSquare size={320} /></div>
          <div className="w-32 h-32 rounded-[3.5rem] bg-white shadow-2xl flex items-center justify-center mb-8 border border-slate-100 transform rotate-3"><Archive size={48} className="opacity-10" /></div>
          <p className="text-sm font-black uppercase tracking-[0.3em] opacity-30">Select a Secure Pipeline</p>
        </div>
      )}

      <ContactDrawer
        open={contactDrawerOpen}
        onClose={() => setContactDrawerOpen(false)}
        tenantId={selectedTenantId || null}
        conversationId={selectedConversationId || null}
      />

      <AssignmentDrawer
        open={assignmentDrawerOpen}
        onClose={() => setAssignmentDrawerOpen(false)}
        tenantId={selectedRouting?.tenant_id}
        conversation={selectedConversationAssignment}
        onUpdated={(updated) => {
          setConversationAssignments((prev) => ({ ...prev, [updated.id]: updated }));
        }}
      />
    </div>
  );
};

export default UnifiedInbox;
