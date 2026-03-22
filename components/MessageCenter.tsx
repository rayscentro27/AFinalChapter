import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message, TrainingPair } from '../types';
// Added Zap to imports
import { Send, User, Bot, CheckCheck, Sparkles, Upload, PenTool, Smartphone, RefreshCw, MessageSquare, Shield, Gavel, X, Zap } from 'lucide-react';
import * as geminiService from '../services/geminiService';


type AgentFnResponse = {
  employee: string;
  version: number;
  tool_requests: Array<{ name: string; args: Record<string, unknown>; reason: string }>;
  final_answer: string;
  cached?: boolean;
  drift?: { severity: 'none' | 'yellow' | 'orange' | 'red'; category: string; message: string };
  supervisor?: { approved: boolean; risk_level: 'low' | 'moderate' | 'high' | 'critical' };
};

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));

async function runConciergePipeline(args: {
  user_message: string;
  contact: Contact;
  messages: Message[];
}): Promise<AgentFnResponse> {
  const res = await fetch('/.netlify/functions/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employees: ['Forensic Bot', 'Lex Ledger', 'Nexus Analyst', 'Ghost Hunter'],
      arbitrate: true,
      approval_mode: true,
      mode: 'live',
      user_message: args.user_message,
      client_id: isUuid(args.contact.id) ? args.contact.id : undefined,
      context: {
        contact: {
          id: args.contact.id,
          company: args.contact.company,
          name: args.contact.name,
          status: args.contact.status,
          revenue: args.contact.revenue,
          value: args.contact.value,
          aiScore: args.contact.aiScore,
          automationMetadata: args.contact.automationMetadata,
          businessProfile: args.contact.businessProfile,
          creditAnalysis: args.contact.creditAnalysis,
          compliance: args.contact.compliance,
          financialSpreading: args.contact.financialSpreading,
        },
        message_history: args.messages.slice(-20),
      },
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface MessageCenterProps {
  contact: Contact;
  onUpdateContact?: (contact: Contact) => void;
  currentUserRole: 'admin' | 'client';
  onNavigateToAction?: (target: string) => void;
}

const MessageCenter: React.FC<MessageCenterProps> = ({ contact, onUpdateContact, currentUserRole, onNavigateToAction }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = contact.messageHistory || [];


  const getEscalationFromMessage = (msg: Message): { severity: 'orange' | 'red'; reason: string } | null => {
    const ar: any = (msg as any)?.actionRequired;
    const drift = ar?.drift;
    const supervisor = ar?.supervisor;

    const sev = String(drift?.severity || '').toLowerCase();
    if (sev === 'red' || sev === 'orange') {
      return {
        severity: sev as any,
        reason: String(drift?.message || drift?.category || 'Escalation required.'),
      };
    }

    if (supervisor && supervisor.approved === false) {
      const risk = String(supervisor?.risk_level || '').toLowerCase();
      return {
        severity: risk === 'critical' ? 'red' : 'orange',
        reason: `Supervisor rejected output (risk_level=${risk || 'unknown'}).`,
      };
    }

    return null;
  };

  const ensureHumanReviewTask = (c: Contact, args: { source_id: string; reason: string }) => {
    const id = `HUMAN_REVIEW_REQUIRED:${args.source_id}`;
    const existing = (c.clientTasks || []).some((t) => t.id === id);
    if (existing) return c;

    const task = {
      id,
      title: 'HUMAN_REVIEW_REQUIRED',
      description: args.reason,
      status: 'pending' as const,
      date: new Date().toISOString().slice(0, 10),
      type: 'review' as const,
    };

    return { ...c, clientTasks: [task, ...(c.clientTasks || [])] };
  };

  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messages, isBotTyping]);


  useEffect(() => {
    if (currentUserRole !== 'admin') return;
    if (!onUpdateContact) return;
    if (!messages.length) return;

    // Backfill tasks from existing conversation audit metadata.
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const esc = getEscalationFromMessage(msg);
      if (!esc) continue;

      const updated = ensureHumanReviewTask(contact, {
        source_id: msg.id || `msg_${i}`,
        reason: esc.reason,
      });

      if (updated !== contact) onUpdateContact(updated);
      break;
    }
  }, [currentUserRole, onUpdateContact, contact, messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !onUpdateContact) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      sender: currentUserRole,
      senderName: currentUserRole === 'client' ? contact.name : 'Advisor',
      content: newMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
      read: false
    };
    
    let updatedMessages = [...messages, userMsg];
    onUpdateContact({ ...contact, messageHistory: updatedMessages });
    setNewMessage('');

    if (currentUserRole === 'client') {
      setIsBotTyping(true);
      try {
          // Primary: server-side arbitration + drift gating + supervisor approval.
          const response = await runConciergePipeline({
              user_message: userMsg.content,
              contact,
              messages: updatedMessages
          });
          const botMsg: Message = { 
              id: `msg_bot_${Date.now()}`, 
              sender: 'bot', 
              senderName: 'Nexus Concierge',
              content: response.final_answer, 
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
              createdAt: new Date().toISOString(),
              read: false,
              actionRequired: {
                  tool_requests: response.tool_requests,
                  drift: response.drift,
                  supervisor: response.supervisor
              }
          };
          let nextContact: Contact = { ...contact, messageHistory: [...updatedMessages, botMsg] };
          const esc = getEscalationFromMessage(botMsg);
          if (esc) nextContact = ensureHumanReviewTask(nextContact, { source_id: botMsg.id, reason: esc.reason });

          onUpdateContact(nextContact);
      } catch (e) {
          // Fallback: legacy Gemini flow.
          try {
              const response = await geminiService.processAutonomousStaffResponse(updatedMessages, contact);
              const botMsg: Message = { 
                  id: `msg_bot_${Date.now()}`, 
                  sender: 'bot', 
                  senderName: 'Nexus Concierge',
                  content: response.text, 
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
                  createdAt: new Date().toISOString(),
                  read: false,
                  actionRequired: (response as any).action
              };
              let nextContact: Contact = { ...contact, messageHistory: [...updatedMessages, botMsg] };
              const esc = getEscalationFromMessage(botMsg);
              if (esc) nextContact = ensureHumanReviewTask(nextContact, { source_id: botMsg.id, reason: esc.reason });

              onUpdateContact(nextContact);
          } catch (fallbackErr) {
              console.error("Staff bot error", e, fallbackErr);
          }
      } finally {
          setIsBotTyping(false);
      }
    }
  };



  const handleDraftForAdmin = async () => {
    if (currentUserRole !== 'admin') return;
    if (isBotTyping) return;
    setIsBotTyping(true);
    try {
      const lastClientMsg = [...messages].reverse().find(m => m.sender === 'client');
      const prompt = lastClientMsg
        ? `Draft a compliant, calm advisor reply to the client's last message: "${lastClientMsg.content}". Keep it short and concrete.`
        : 'Draft a compliant, calm advisor reply asking one clarifying question and proposing next steps.';

      const response = await runConciergePipeline({ user_message: prompt, contact, messages });
      setNewMessage(response.final_answer || '');

      // If the draft itself triggers escalation, create a review task for staff.
      if (
        onUpdateContact &&
        (response.drift?.severity === 'red' || response.drift?.severity === 'orange' || response.supervisor?.approved === false)
      ) {
        const reason =
          response.drift?.message ||
          (response.supervisor?.approved === false
            ? `Supervisor rejected draft (risk_level=${response.supervisor?.risk_level}).`
            : 'Escalation required.');
        const updated = ensureHumanReviewTask(contact, { source_id: `draft_${Date.now()}`, reason });
        if (updated !== contact) onUpdateContact(updated);
      }
    } catch (e) {
      console.error('Draft reply failed', e);
      alert('AI draft failed. Please try again.');
    } finally {
      setIsBotTyping(false);
    }
  };

  const submitCorrection = (msg: Message) => {
      const vault: TrainingPair[] = JSON.parse(localStorage.getItem('nexus_training_vault') || '[]');
      const newPair: TrainingPair = {
          id: `tp_${Date.now()}`,
          scenario: `Client said: "${messages[messages.length-2]?.content || 'N/A'}"`,
          aiResponse: msg.content,
          humanCorrection: correctionText,
          date: new Date().toLocaleDateString()
      };
      localStorage.setItem('nexus_training_vault', JSON.stringify([newPair, ...vault]));
      setIsCorrecting(null);
      setCorrectionText('');
      alert("Neural correction vaulted. AI will use this example in future turns.");
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden animate-fade-in font-sans">
      <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
           <div className="relative">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 transform rotate-3">
                 <Bot size={32} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-4 border-slate-900 animate-pulse"></div>
           </div>
           <div>
              <h3 className="font-black text-lg uppercase tracking-tighter leading-none">Nexus Concierge</h3>
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                  <Sparkles size={10} /> Specialist Grounding Active
              </p>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 space-y-8 custom-scrollbar">
        {messages.map((msg) => {
          const isMe = msg.sender === currentUserRole;
          const isBot = msg.sender === 'bot';
          
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in group`}>
              <div className={`flex max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-xs font-black shadow-xl transform transition-transform group-hover:scale-110 ${isMe ? 'bg-slate-900 text-white rotate-3' : isBot ? 'bg-indigo-600 text-white -rotate-3' : 'bg-blue-100 text-blue-700'}`}>
                    {isMe ? 'ME' : isBot ? <Bot size={20}/> : msg.senderName?.[0]}
                </div>
                <div className="flex flex-col gap-1.5">
                    <div className={`p-5 rounded-[2rem] text-sm leading-relaxed shadow-sm border relative ${
                        isMe ? 'bg-slate-900 text-white rounded-br-none border-slate-900 shadow-slate-950/20' : 
                        isBot ? 'bg-white border-indigo-100 text-slate-700 rounded-bl-none shadow-indigo-100' : 
                        'bg-white border-slate-200 text-slate-800 rounded-bl-none'
                    }`}>
                        {(msg.messageType || msg.sender === 'system') && !isMe ? (
                          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-[9px] font-black uppercase tracking-widest">
                           <span className={`${isBot ? 'text-indigo-500' : 'text-slate-500'}`}>{msg.messageType ? String(msg.messageType).replace(/_/g, ' ') : 'system update'}</span>
                           {msg.priority ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{msg.priority}</span> : null}
                           {msg.relatedStage ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{String(msg.relatedStage).replace(/_/g, ' ')}</span> : null}
                          </div>
                        ) : null}
                       {isBot && currentUserRole === 'admin' && !isMe && (
                           <button 
                             onClick={() => setIsCorrecting(msg.id)}
                             className="absolute top-2 right-2 p-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-slate-100"
                             title="Correct AI Training"
                           >
                               <Gavel size={14} />
                           </button>
                       )}
                       <p className="font-medium whitespace-pre-wrap">{msg.content}</p>
                       {msg.actionRequired?.reason ? <p className="mt-3 text-xs opacity-70">Why this exists: {String(msg.actionRequired.reason)}</p> : null}
                       {onNavigateToAction && msg.destination ? (
                         <div className="mt-3">
                           <button
                             type="button"
                             onClick={() => onNavigateToAction(String(msg.destination))}
                             className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700"
                           >
                             Open Related Step
                           </button>
                         </div>
                       ) : null}
                       <div className={`text-[9px] mt-3 font-black uppercase opacity-40 flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {msg.timestamp} {isMe && <CheckCheck size={10} />}
                       </div>
                    </div>

                    {isCorrecting === msg.id && (
                        <div className="bg-indigo-950 p-6 rounded-[2rem] border border-white/10 shadow-2xl animate-slide-up mt-2">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><Zap size={10} fill="currentColor"/> Instant Retrain</span>
                                <button onClick={() => setIsCorrecting(null)} className="text-slate-500 hover:text-white"><X size={16}/></button>
                            </div>
                            <textarea 
                                value={correctionText}
                                onChange={e => setCorrectionText(e.target.value)}
                                placeholder="What should the AI have said instead?"
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-indigo-500 h-24 mb-4"
                            />
                            <button onClick={() => submitCorrection(msg)} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 transition-all">Commit Correction</button>
                        </div>
                    )}
                </div>
              </div>
            </div>
          );
        })}
        {isBotTyping && (
          <div className="flex justify-start animate-fade-in">
              <div className="bg-white border border-indigo-100 p-4 rounded-3xl rounded-bl-none flex gap-2 items-center shadow-lg shadow-indigo-100">
                  <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><Bot size={12}/></div>
                  <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>
              </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-6 bg-white border-t border-slate-100 shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-4 items-end">
          <div className="flex-1 relative">
             <textarea 
               value={newMessage} 
               onChange={(e) => setNewMessage(e.target.value)} 
               placeholder="Transmit message to advisor..." 
               className="w-full pl-6 pr-16 py-4 bg-slate-100 border-none rounded-[2rem] text-sm font-medium focus:ring-2 focus:ring-indigo-500 resize-none outline-none transition-all placeholder:text-slate-400 shadow-inner custom-scrollbar" 
               rows={1}
             />
             {currentUserRole === 'admin' && (
               <button
                 type="button"
                 onClick={handleDraftForAdmin}
                 disabled={isBotTyping}
                 className="absolute right-14 bottom-2.5 p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-60"
                 title="Draft AI reply (does not send)"
               >
                 <Sparkles size={18} />
               </button>
             )}
             <button type="submit" disabled={!newMessage.trim() || isBotTyping} className="absolute right-3 bottom-2.5 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition-all shadow-xl active:scale-95"><Send size={20} /></button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MessageCenter;