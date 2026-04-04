import React, { useMemo, useState } from 'react';
import { Loader2, MessageSquare, Send, Sparkles } from 'lucide-react';
import { Contact, Message } from '../../types';
import { sendInboxMessage } from '../../lib/inboxSendClient';

type PortalChatPanelProps = {
  contact: Contact;
  messages: Message[];
  onMessagesChange: React.Dispatch<React.SetStateAction<Message[]>>;
};

function formatTimestamp(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function bubbleTone(message: Message) {
  if (message.sender === 'client') {
    return 'border-[#D7E8FF] bg-[linear-gradient(180deg,#EAF3FF_0%,#DBE9FF_100%)] text-[#203266]';
  }
  if (message.sender === 'bot') {
    return 'border-emerald-100 bg-emerald-50 text-emerald-900';
  }
  if (message.sender === 'system') {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'border-[#E7EDF7] bg-white text-[#203266]';
}

function deliveryLabel(message: Message): string {
  const status = String(message.deliveryStatus || '').toLowerCase();
  if (!status) return '';
  if (message.sender === 'client') {
    if (status === 'failed') return 'failed';
    if (status === 'queued' || status === 'sending') return 'sending';
    return 'sent';
  }
  if (status === 'sent' || status === 'received') return 'sent';
  return status;
}

export default function PortalChatPanel({
  contact,
  messages,
  onMessagesChange,
}: PortalChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tenantId = contact.tenantId || contact.inboxRouting?.tenant_id || '';
  const conversationId = contact.inboxRouting?.conversation_id || contact.inboxRouting?.conversationId || '';
  const unreadCount = useMemo(
    () => messages.filter((message) => message.sender !== 'client' && !message.read).length,
    [messages]
  );

  async function handleSend() {
    if (busy) return;
    const bodyText = String(draft || '').trim();
    if (!bodyText) return;
    if (!tenantId) {
      setError('Missing tenant context for portal chat.');
      return;
    }

    setBusy(true);
    setError('');
    const optimisticId = `tmp:${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      sender: 'client',
      senderName: contact.name || 'Client',
      content: bodyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false,
      deliveryStatus: 'queued',
      provider: 'nexus_chat',
      conversationId: conversationId || undefined,
    };

    onMessagesChange((prev) => [...prev, optimistic]);
    setDraft('');

    try {
      const response = await sendInboxMessage({
        tenant_id: tenantId,
        conversation_id: conversationId || undefined,
        contact_id: contact.id,
        body_text: bodyText,
        provider: 'nexus_chat',
        channel_preference: 'nexus_chat',
      });

      const nextConversationId = String(response.conversation_id || conversationId || '');
      onMessagesChange((prev) =>
        prev.map((message) => {
          if (message.id !== optimisticId) return message;
          return {
            ...message,
            id: response.message_id ? `db:${response.message_id}` : message.id,
            provider: response.provider || 'nexus_chat',
            conversationId: nextConversationId || message.conversationId,
            deliveryStatus: 'sent',
          };
        })
      );
    } catch (sendError: any) {
      const message = String(sendError?.message || 'Failed to send message');
      setError(message);
      onMessagesChange((prev) =>
        prev.map((item) => (item.id === optimisticId ? { ...item, deliveryStatus: 'failed' } : item))
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-white shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#EEF2FA] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] px-6 py-5">
        <div>
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Portal chat</p>
          <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Talk to the Nexus team</h2>
          <p className="mt-2 max-w-3xl text-sm text-[#61769D]">
            This chat writes into the shared inbox model so your conversation survives refreshes and can surface in the admin inbox.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
          <Sparkles size={12} />
          {unreadCount} unread
        </span>
      </div>

      <div className="max-h-[56vh] space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#F9FBFF_0%,#F3F7FF_100%)] p-6 custom-scrollbar">
        {messages.length > 0 ? (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[72%] rounded-[1.75rem] border px-4 py-3 shadow-sm ${bubbleTone(message)}`}>
                <div className="mb-2 flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                  <span>{message.sender === 'client' ? 'You' : message.senderName || 'Nexus'}</span>
                  <span>{formatTimestamp(message.createdAt || message.timestamp) || message.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap text-[0.98rem] leading-relaxed">{message.content}</p>
                {deliveryLabel(message) ? (
                  <div className="mt-2 text-[9px] font-black uppercase tracking-[0.16em] opacity-60">
                    {deliveryLabel(message)}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1.6rem] border border-dashed border-[#D9E5F8] bg-white/80 px-6 py-10 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-[#9FB2DD]" />
            <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-[#5C77BD]">No messages yet</p>
            <p className="mt-2 text-sm text-[#61769D]">Send the first message to open a durable portal conversation.</p>
          </div>
        )}
      </div>

      <div className="border-t border-[#EEF2FA] bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Write a message..."
              rows={3}
              disabled={busy}
              className="w-full resize-none rounded-[1.4rem] border border-[#DCE7FA] bg-[#F8FBFF] px-4 py-3 text-sm font-medium text-[#17233D] outline-none transition-all placeholder:text-[#93A6CA] focus:border-[#4A7AE8] disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy || !String(draft || '').trim()}
            className="inline-flex h-12 items-center gap-2 rounded-[1.2rem] bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(46,88,230,0.22)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
        {error ? <p className="mt-3 text-xs font-bold text-amber-700">{error}</p> : null}
        {!conversationId && !tenantId ? (
          <p className="mt-2 text-xs font-medium text-[#7A8EB4]">Portal chat will connect once your account context is loaded.</p>
        ) : null}
      </div>
    </section>
  );
}
