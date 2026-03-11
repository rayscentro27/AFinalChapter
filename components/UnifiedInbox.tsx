import React, { useState, useEffect, useRef } from 'react';
import { Contact, InboxThread, UnifiedMessage, Message } from '../types';
import { 
  Mail, MessageSquare, MessageCircle, Search, Filter, Archive, Send, 
  MoreVertical, User, Sparkles, RefreshCw, X, Instagram, Facebook, Zap, Bot,
  Paperclip, Tag, ArrowRight, ZapOff, CheckCircle, Smartphone, Eye, Ghost
} from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface UnifiedInboxProps {
  contacts: Contact[];
  onUpdateContact?: (contact: Contact) => void;
}

const UnifiedInbox: React.FC<UnifiedInboxProps> = ({ contacts, onUpdateContact }) => {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'bot' | 'human'>('all');
  const [inputText, setInputText] = useState('');
  const [isBotResponding, setIsBotResponding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate threads from contacts who have message history
    const data: InboxThread[] = contacts
      .filter(c => c.messageHistory && c.messageHistory.length > 0)
      .map(c => {
        // Fix: Explicitly map internal Message objects to UnifiedMessage objects to satisfy InboxThread type requirements
        const mappedMessages: UnifiedMessage[] = (c.messageHistory || []).map(m => ({
          ...m,
          threadId: `th_${c.id}`,
          channel: 'portal',
          direction: m.sender === 'client' ? 'inbound' : 'outbound',
          sender: m.sender === 'admin' ? 'me' : (m.sender as any),
          senderName: m.senderName || (m.sender === 'client' ? c.name : 'Advisor')
        }));

        return {
          id: `th_${c.id}`,
          contactId: c.id,
          contactName: c.name,
          contactAvatar: c.name[0],
          unreadCount: c.messageHistory?.filter(m => !m.read && m.sender === 'client').length || 0,
          channel: 'portal',
          autoPilot: true,
          messages: mappedMessages,
          lastMessage: mappedMessages[mappedMessages.length - 1]
        };
      });
    setThreads(data);
  }, [contacts]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThreadId, threads]);

  const handleSendMessage = async (text: string, isBot = false) => {
    if (!text.trim() || !selectedThreadId || !onUpdateContact) return;
    
    const thread = threads.find(t => t.id === selectedThreadId);
    if (!thread) return;
    const contact = contacts.find(c => c.id === thread.contactId);
    if (!contact) return;

    // Added explicit type for newMessage to match imports
    const newMessage: Message = {
        id: `msg_${Date.now()}`,
        sender: isBot ? 'bot' : 'admin',
        senderName: isBot ? 'Nexus Concierge' : 'Advisor',
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: true
    };

    onUpdateContact({
        ...contact,
        messageHistory: [...(contact.messageHistory || []), newMessage]
    });
    
    setInputText('');
  };

  const selectedThread = threads.find(t => t.id === selectedThreadId);
  const filteredThreads = threads.filter(t => {
      if (filter === 'all') return true;
      if (filter === 'bot') return t.autoPilot;
      return !t.autoPilot;
  });

  return (
    <div className="flex h-[calc(100vh-100px)] bg-slate-50 animate-fade-in overflow-hidden rounded-[3rem] border border-slate-200 shadow-2xl">
      
      {/* Thread Sidebar */}
      <div className="w-96 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
         <div className="p-8 border-b border-slate-100">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Neural Inbox</h2>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><MessageSquare size={20}/></div>
            </div>
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Search interactions..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-inner" />
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                {(['all', 'bot', 'human'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                        {f === 'bot' ? <Zap size={10} className="inline mr-1"/> : null}
                        {f}
                    </button>
                ))}
            </div>
         </div>

         <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredThreads.map(thread => (
                <div 
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
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
                            {thread.unreadCount > 0 && <span className="bg-red-500 text-white w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center animate-bounce">{thread.unreadCount}</span>}
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1 font-medium italic">"{thread.lastMessage.content}"</p>
                    {thread.autoPilot && (
                        <div className="mt-3 flex items-center gap-1.5 text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 w-fit px-2 py-0.5 rounded-full border border-emerald-100">
                           <Bot size={10} /> Concierge Active
                        </div>
                    )}
                </div>
            ))}
            {filteredThreads.length === 0 && (
                <div className="py-24 text-center opacity-20 flex flex-col items-center">
                    <Ghost size={48} className="mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Active Conversations</p>
                </div>
            )}
         </div>
      </div>

      {/* Interaction Pane */}
      {selectedThread ? (
          <div className="flex-1 flex flex-col min-w-0 bg-white relative">
              <div className="h-24 border-b border-slate-200 flex justify-between items-center px-10 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
                  <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm uppercase shadow-2xl transform rotate-3">{selectedThread.contactAvatar}</div>
                      <div>
                          <h3 className="font-black text-xl uppercase tracking-tighter text-slate-900">{selectedThread.contactName}</h3>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Session: Active</span>
                            {selectedThread.autoPilot && <span className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-lg animate-pulse border border-indigo-100"><Bot size={12} /> AI Monitoring</span>}
                          </div>
                      </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <button className="p-3 bg-slate-100 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-2xl transition-all" title="View Full CRM Dossier"><Eye size={20}/></button>
                     <div className="h-8 w-px bg-slate-100 mx-2"></div>
                     <button 
                        onClick={() => onUpdateContact!({...contacts.find(c=>c.id===selectedThread.contactId)!, aiReason: 'Intervened by human admin'})} 
                        className="bg-slate-950 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-xl active:scale-95"
                     >
                        Take Control
                     </button>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-50/30 custom-scrollbar">
                  {selectedThread.messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[70%] p-6 rounded-[2.5rem] text-sm font-medium leading-relaxed shadow-sm relative animate-fade-in ${
                              msg.sender !== 'client' ? 'bg-slate-900 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-slate-100'
                          }`}>
                              {msg.sender === 'bot' && (
                                  <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-indigo-400 mb-3 border-b border-white/10 pb-2"><Bot size={12} /> Nexus Autonomous Proxy</div>
                              )}
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              <div className={`text-[9px] mt-4 font-black uppercase opacity-30 text-right ${msg.sender !== 'client' ? 'text-slate-300' : 'text-slate-400'}`}>{msg.timestamp}</div>
                          </div>
                      </div>
                  ))}
                  <div ref={messagesEndRef} />
              </div>

              {/* Staff Intervention Area */}
              <div className="p-8 bg-white border-t border-slate-100 shadow-2xl">
                  <div className="flex gap-4 items-center">
                      <div className="flex-1 relative">
                          <input 
                            type="text" 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
                            placeholder="Type an intervention message... (AI monitoring will pause)"
                            className="w-full pl-6 pr-16 py-5 bg-slate-100 border-none rounded-[2rem] text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none shadow-inner" 
                          />
                          <button onClick={() => handleSendMessage(inputText)} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95">
                              <Send size={20} />
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-20 opacity-10 rotate-12"><MessageSquare size={320}/></div>
              <div className="w-32 h-32 rounded-[3.5rem] bg-white shadow-2xl flex items-center justify-center mb-8 border border-slate-100 transform rotate-3"><Archive size={48} className="opacity-10" /></div>
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-30">Select a Secure Pipeline</p>
          </div>
      )}

    </div>
  );
};

export default UnifiedInbox;
