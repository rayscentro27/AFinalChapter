
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  Bot,
  Send,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Bell,
  FileText,
} from 'lucide-react';
import { Contact, ChatMessage } from '../types';
import * as geminiService from '../services/geminiService';
import { sanitizeAIHtml } from '../utils/security';
import { supabase } from '../lib/supabaseClient';
import TaskStatusPill from './TaskStatusPill';
import AskAssignedEmployeeButton from './AskAssignedEmployeeButton';

type AgentFnResponse = {
  employee: string;
  version: number;
  tool_requests: Array<{ name: string; args: Record<string, unknown>; reason: string }>;
  final_answer: string;
  cached?: boolean;
  drift?: { severity: 'none' | 'yellow' | 'orange' | 'red'; category: string; message: string };
  supervisor?: { approved: boolean; risk_level: 'low' | 'moderate' | 'high' | 'critical' };
};

type TenantTaskRow = {
  tenant_id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed';
  due_date: string;
  type: string;
  signal?: 'red' | 'yellow' | 'green' | null;
  assigned_employee?: string | null;
  group_key?: string | null;
  template_key?: string | null;
  updated_at?: string | null;
};

type TenantNotificationRow = {
  id: string;
  tenant_id: string;
  type: string;
  severity: 'info' | 'warn' | 'danger' | string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

const compactContactsForContext = (contacts: Contact[]) =>
  contacts.map((c) => ({
    id: c.id,
    company: c.company,
    name: c.name,
    status: c.status,
    value: c.value,
    revenue: c.revenue,
    aiScore: c.aiScore,
    automationMetadata: c.automationMetadata,
  }));

async function runArbitratedAgentPipeline(params: {
  user_message: string;
  contacts: Contact[];
  tenant_id?: string | null;
  tenant_tasks?: TenantTaskRow[];
}): Promise<AgentFnResponse> {
  const res = await fetch('/.netlify/functions/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employees: ['Forensic Bot', 'Lex Ledger', 'Nexus Analyst', 'Ghost Hunter'],
      arbitrate: true,
      approval_mode: true,
      mode: 'live',
      user_message: params.user_message,
      context: {
        contacts: compactContactsForContext(params.contacts),
        tenant_id: params.tenant_id || null,
        tenant_tasks: (params.tenant_tasks || []).map((t) => ({
          task_id: t.task_id,
          title: t.title,
          status: t.status,
          signal: t.signal || null,
          assigned_employee: t.assigned_employee || null,
          group_key: t.group_key || null,
          due_date: t.due_date,
        })),
      },
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface AICommandCenterProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
}

const AICommandCenter: React.FC<AICommandCenterProps> = ({ contacts, onUpdateContact }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pane, setPane] = useState<'chat' | 'tasks'>('chat');

  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantTasks, setTenantTasks] = useState<TenantTaskRow[]>([]);
  const [tenantNotifs, setTenantNotifs] = useState<TenantNotificationRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Hello! I am your Nexus Co-Pilot. I can analyze your pipeline, draft legal documents, or update deal scores. How can I assist?',
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedTenantId && contacts.length > 0) {
      setSelectedTenantId(contacts[0].id);
    }
  }, [contacts.length]);

  const selectedTenant = useMemo(() => contacts.find((c) => c.id === selectedTenantId) || null, [contacts, selectedTenantId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, pane]);

  const loadTenantOps = async () => {
    if (!selectedTenantId) return;
    setTasksLoading(true);
    setTasksError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Missing access token');

      const [tasksRes, notifRes] = await Promise.all([
        fetch(`/.netlify/functions/list_client_tasks?tenant_id=${encodeURIComponent(selectedTenantId)}&limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/.netlify/functions/list_notifications?tenant_id=${encodeURIComponent(selectedTenantId)}&limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!tasksRes.ok) {
        const j = await tasksRes.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to load tasks');
      }
      const tasksJson = await tasksRes.json();
      setTenantTasks((tasksJson?.tasks || []) as TenantTaskRow[]);

      if (notifRes.ok) {
        const notifJson = await notifRes.json().catch(() => ({}));
        setTenantNotifs((notifJson?.notifications || []) as TenantNotificationRow[]);
      } else {
        setTenantNotifs([]);
      }
    } catch (e: any) {
      setTasksError(e?.message || 'Failed to load tenant ops');
      setTenantTasks([]);
      setTenantNotifs([]);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (pane !== 'tasks') return;
    loadTenantOps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pane, selectedTenantId]);

  const updateTask = async (task_id: string, patch: { status?: 'pending' | 'completed'; signal?: 'red' | 'yellow' | 'green' }) => {
    if (!selectedTenantId) return;

    const token = await getAccessToken();
    if (!token) throw new Error('Missing access token');

    const body: any = { tenant_id: selectedTenantId, task_id };
    if (patch.status) body.status = patch.status;
    if (patch.signal) body.status_signal = patch.signal;

    const res = await fetch('/.netlify/functions/update_task_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || 'Failed to update task');
    }

    const j = await res.json();
    const updated = j?.task as TenantTaskRow | undefined;

    if (updated?.task_id) {
      setTenantTasks((prev) => prev.map((t) => (t.task_id === updated.task_id ? updated : t)));
    } else {
      await loadTenantOps();
    }
  };

  const executeToolCalls = async (actions: any[]) => {
    if (!actions || actions.length === 0) return;

    for (const action of actions) {
      if (action.name === 'draftDocument') {
        const { contactName, type } = action.args;
        const contact = contacts.find(
          (c) => c.name.toLowerCase().includes(String(contactName).toLowerCase()) || c.company.toLowerCase().includes(String(contactName).toLowerCase())
        );

        if (contact) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: `⚡ **Autonomous Action**: Drafting a "${type}" agreement for **${contact.company}**. One moment...`,
            },
          ]);

          await geminiService.generateLegalDocumentContent(type, { company: contact.company, name: contact.name }, 'Standard Agreement');
          const newDoc = {
            id: `ai_draft_${Date.now()}`,
            name: `${type} - AI Generated.txt`,
            type: 'Legal' as const,
            status: 'Pending Review' as const,
            uploadDate: new Date().toLocaleDateString(),
            fileUrl: 'internal://draft',
          };

          onUpdateContact({
            ...contact,
            documents: [...(contact.documents || []), newDoc],
            activities: [
              ...(contact.activities || []),
              {
                id: `act_ai_gen_${Date.now()}`,
                type: 'legal' as const,
                description: `AI autonomously drafted "${type}" and pushed to vault.`,
                date: new Date().toLocaleString(),
                user: 'Co-Pilot',
              },
            ],
          });

          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `✅ Done! The **${type}** has been placed in **${contact.company}'s** Subject Vault for review.`,
            },
          ]);
        }
      } else if (action.name === 'updateStatus') {
        const { contactName, newStatus } = action.args;
        const contact = contacts.find(
          (c) => c.name.toLowerCase().includes(String(contactName).toLowerCase()) || c.company.toLowerCase().includes(String(contactName).toLowerCase())
        );

        if (contact) {
          onUpdateContact({ ...contact, status: newStatus });
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: `✅ Updated status for **${contact.name}** to **${newStatus}**.`,
            },
          ]);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await runArbitratedAgentPipeline({
        user_message: userMsg.content,
        contacts,
        tenant_id: selectedTenantId || null,
        tenant_tasks: tenantTasks,
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.final_answer,
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (Array.isArray(response.tool_requests) && response.tool_requests.length > 0) {
        await executeToolCalls(
          response.tool_requests.map((t) => ({
            name: t.name,
            args: t.args,
          }))
        );
      }
    } catch (error) {
      // Fallback: legacy Gemini CRM chat (client-side).
      try {
        const response = await geminiService.chatWithCRM(userMsg.content, contacts);
        const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: response.text };
        setMessages((prev) => [...prev, aiMsg]);
        if (response.actions) await executeToolCalls(response.actions);
      } catch {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Neural handshake failed. Please try again.' }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const groupedTasks = useMemo(() => {
    const m = new Map<string, TenantTaskRow[]>();
    for (const t of tenantTasks) {
      const key = String(t.group_key || 'general');
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [tenantTasks]);

  const notifUnread = tenantNotifs.filter((n) => !n.read).length;
  const tenantOpsSummary = useMemo(() => {
    const pending = tenantTasks.filter((task) => task.status !== 'completed').length;
    const approvals = tenantTasks.filter((task) => String(task.type || '').toLowerCase() === 'review').length;
    const attention = tenantTasks.filter((task) => String(task.signal || '').toLowerCase() === 'red').length;
    return { pending, approvals, attention, unread: notifUnread };
  }, [tenantTasks, notifUnread]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] font-sans">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-2xl shadow-blue-900/30 transition-all hover:scale-110 flex items-center gap-2 group animate-float"
        >
          <Sparkles size={24} className="group-hover:animate-spin-slow" />
          <span className="font-bold pr-1">Nexus Co-Pilot</span>
        </button>
      )}

      {isOpen && (
        <div className="bg-white rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.2)] w-[420px] h-[640px] flex flex-col border border-slate-200 animate-slide-in-right overflow-hidden">
          <div className="bg-slate-900 p-5 flex justify-between items-center text-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20 shrink-0">
                <Bot size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-xs uppercase tracking-widest leading-none">Autonomous Core</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Protocol Active</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-xl"
              title="Minimize"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPane('chat')}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                pane === 'chat' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setPane('tasks')}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all inline-flex items-center gap-2 ${
                pane === 'tasks'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 size={14} /> Tasks
              {notifUnread > 0 ? <span className="ml-1 text-[9px] font-black text-amber-300">({notifUnread})</span> : null}
            </button>

            <div className="flex-1" />

            <div className="min-w-0">
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="max-w-[180px] text-[10px] font-black uppercase tracking-widest bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700"
                title="Select tenant"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {pane === 'chat' ? (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 custom-scrollbar">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div
                      className={`max-w-[90%] rounded-3xl p-4 text-xs font-medium leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'
                      }`}
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: sanitizeAIHtml(msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')),
                        }}
                      />
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="bg-white rounded-2xl p-4 rounded-bl-none border border-slate-200 flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-100 flex gap-3">
                <input
                  type="text"
                  placeholder={selectedTenant ? `Command ${selectedTenant.company}...` : 'Command Nexus Core...'}
                  className="flex-1 bg-slate-100 border-none rounded-xl px-5 py-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-400 font-medium"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-3.5 rounded-xl transition-all shadow-lg active:scale-95"
                  title="Send"
                >
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50 custom-scrollbar">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-700">Tenant Ops</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Updates persist to Supabase. Signals are educational and do not imply guarantees of funding approvals.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadTenantOps}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 inline-flex items-center gap-2"
                  disabled={tasksLoading}
                >
                  <RefreshCw size={14} className={tasksLoading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {tasksError ? (
                <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" /> {tasksError}
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-1 gap-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pending</div>
                    <div className="mt-2 text-xl font-black tracking-tight text-slate-900">{tenantOpsSummary.pending}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Approvals</div>
                    <div className="mt-2 text-xl font-black tracking-tight text-slate-900">{tenantOpsSummary.approvals}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Needs Attention</div>
                    <div className="mt-2 text-xl font-black tracking-tight text-amber-700">{tenantOpsSummary.attention}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Unread</div>
                    <div className="mt-2 text-xl font-black tracking-tight text-slate-900">{tenantOpsSummary.unread}</div>
                  </div>
                </div>

                {tenantOpsSummary.attention > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><AlertTriangle size={14} /> Workforce Attention</div>
                    <div className="mt-2">One or more AI-assisted tasks are flagged red and need operator review now.</div>
                  </div>
                ) : null}

                {groupedTasks.length === 0 && !tasksLoading ? (
                  <div className="p-8 rounded-2xl bg-white border border-slate-200 text-slate-500 text-sm">
                    No tasks found for this tenant.
                  </div>
                ) : null}

                {groupedTasks.map(([groupKey, items]) => (
                  <div key={groupKey} className="bg-white border border-slate-200 rounded-3xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-600">{groupKey.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{items.length} tasks</div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {items.map((t) => (
                        <div key={t.task_id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <TaskStatusPill signal={(t.signal as any) || undefined} />
                                <div className="text-xs font-black text-slate-900 truncate">{t.title}</div>
                              </div>
                              {t.description ? <div className="mt-2 text-xs text-slate-600">{t.description}</div> : null}
                              <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Due: {t.due_date}{t.assigned_employee ? ` · ${t.assigned_employee}` : ''}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateTask(t.task_id, { status: t.status === 'completed' ? 'pending' : 'completed' })}
                                className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100"
                                title={t.status === 'completed' ? 'Mark pending' : 'Mark completed'}
                              >
                                {t.status === 'completed' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-slate-400" />}
                              </button>

                              <AskAssignedEmployeeButton
                                employee={t.assigned_employee || undefined}
                                taskTitle={t.title}
                                context={{ tenant_id: selectedTenantId, task: t, tenant: selectedTenant ? { id: selectedTenant.id, company: selectedTenant.company } : null }}
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => updateTask(t.task_id, { signal: 'red' })}
                              className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/15"
                            >
                              Red
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTask(t.task_id, { signal: 'yellow' })}
                              className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-200 text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/15"
                            >
                              Yellow
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTask(t.task_id, { signal: 'green' })}
                              className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/15"
                            >
                              Green
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-white border border-slate-200 rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
                    <Bell size={14} /> Notifications
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{tenantNotifs.length}</div>
                </div>

                <div className="mt-4 space-y-2">
                  {tenantNotifs.length === 0 ? (
                    <div className="text-xs text-slate-500">No notifications yet.</div>
                  ) : (
                    tenantNotifs.slice(0, 8).map((n) => (
                      <div key={n.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-800 truncate">{n.title}</div>
                            <div className="mt-1 text-xs text-slate-600">{n.message}</div>
                            <div className="mt-2 text-[10px] text-slate-400 font-mono">
                              {new Date(n.created_at).toLocaleString([], { hour12: false })}
                            </div>
                          </div>
                          {n.read ? null : <span className="mt-1 w-2 h-2 rounded-full bg-amber-400" title="Unread" />}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-5 text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} /> Tasks are tenant-scoped (`public.client_tasks`) and persist across sessions.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AICommandCenter;
