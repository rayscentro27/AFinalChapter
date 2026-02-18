
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, Bot, ChevronDown, CheckCircle, Activity as ActivityIcon, RefreshCw, FileText } from 'lucide-react';
import { Contact, ChatMessage, Activity } from '../types';
import * as geminiService from '../services/geminiService';
import { sanitizeAIHtml } from '../utils/security';

type AgentFnResponse = {
  employee: string;
  version: number;
  tool_requests: Array<{ name: string; args: Record<string, unknown>; reason: string }>;
  final_answer: string;
  cached?: boolean;
  drift?: { severity: 'none' | 'yellow' | 'orange' | 'red'; category: string; message: string };
  supervisor?: { approved: boolean; risk_level: 'low' | 'moderate' | 'high' | 'critical' };
};

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

async function runArbitratedAgentPipeline(user_message: string, contacts: Contact[]): Promise<AgentFnResponse> {
  const res = await fetch('/.netlify/functions/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employees: ['Forensic Bot', 'Lex Ledger', 'Nexus Analyst', 'Ghost Hunter'],
      arbitrate: true,
      approval_mode: true,
      mode: 'live',
      user_message,
      context: { contacts: compactContactsForContext(contacts) },
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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      id: '1', 
      role: 'assistant', 
      content: 'Hello! I am your Nexus Co-Pilot. I can analyze your pipeline, draft legal documents, or update deal scores. How can I assist?' 
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const executeToolCalls = async (actions: any[]) => {
    if (!actions || actions.length === 0) return;

    for (const action of actions) {
      if (action.name === 'draftDocument') {
          const { contactName, type } = action.args;
          const contact = contacts.find(c => c.name.toLowerCase().includes(contactName.toLowerCase()) || c.company.toLowerCase().includes(contactName.toLowerCase()));
          
          if (contact) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `⚡ **Autonomous Action**: Drafting a "${type}" agreement for **${contact.company}**. One moment...`
            }]);
            
            const content = await geminiService.generateLegalDocumentContent(type, { company: contact.company, name: contact.name }, "Standard Agreement");
            const newDoc = {
                id: `ai_draft_${Date.now()}`,
                name: `${type} - AI Generated.txt`,
                type: 'Legal' as const,
                status: 'Pending Review' as const,
                uploadDate: new Date().toLocaleDateString(),
                fileUrl: 'internal://draft'
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
                        user: 'Co-Pilot'
                    }
                ]
            });

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `✅ Done! The **${type}** has been placed in **${contact.company}'s** Subject Vault for review.`
            }]);
          }
      }
      else if (action.name === 'updateStatus') {
        const { contactName, newStatus } = action.args;
        const contact = contacts.find(c => c.name.toLowerCase().includes(contactName.toLowerCase()) || c.company.toLowerCase().includes(contactName.toLowerCase()));
        
        if (contact) {
          onUpdateContact({ ...contact, status: newStatus });
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: `✅ Updated status for **${contact.name}** to **${newStatus}**.`
          }]);
        }
      } 
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Primary: server-side multi-employee pipeline with drift gating + arbitration + supervisor checks.
      const response = await runArbitratedAgentPipeline(userMsg.content, contacts);
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: response.final_answer };
      setMessages(prev => [...prev, aiMsg]);

      if (Array.isArray(response.tool_requests) && response.tool_requests.length > 0) {
        await executeToolCalls(
          response.tool_requests.map((t) => ({
            name: t.name,
            args: t.args,
          }))
        );
      }
    } catch (error) {
      // Fallback: legacy Gemini CRM chat (client-side). This avoids breaking the UI if OPENAI_API_KEY
      // isn't set in Netlify yet.
      try {
        const response = await geminiService.chatWithCRM(userMsg.content, contacts);
        const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: response.text };
        setMessages(prev => [...prev, aiMsg]);
        if (response.actions) await executeToolCalls(response.actions);
      } catch {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Neural handshake failed. Please try again." }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="bg-white rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.2)] w-[400px] h-[600px] flex flex-col border border-slate-200 animate-slide-in-right overflow-hidden">
          <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20"><Bot size={24} /></div>
              <div>
                <h3 className="font-black text-xs uppercase tracking-widest leading-none">Autonomous Core</h3>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Protocol Active</span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-xl"><ChevronDown size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 custom-scrollbar">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[90%] rounded-3xl p-4 text-xs font-medium leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'}`}>
                   <div dangerouslySetInnerHTML={{ __html: sanitizeAIHtml(msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')) }} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start animate-fade-in"><div className="bg-white rounded-2xl p-4 rounded-bl-none border border-slate-200 flex gap-1 items-center"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span></div></div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-100 flex gap-3">
            <input 
              type="text" 
              placeholder="Command Nexus Core..." 
              className="flex-1 bg-slate-100 border-none rounded-xl px-5 py-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-400 font-medium"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={isLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-3.5 rounded-xl transition-all shadow-lg active:scale-95"><Send size={20} /></button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AICommandCenter;
