
import React from 'react';
import { Sparkles, ArrowRight, Zap, AlertTriangle, TrendingUp, CheckCircle, BrainCircuit } from 'lucide-react';
import { Contact } from '../types';

interface GlobalDirectivesProps {
  contacts: Contact[];
  onAction: (contact: Contact) => void;
}

const GlobalDirectives: React.FC<GlobalDirectivesProps> = ({ contacts, onAction }) => {
  // Logic: Extract high-priority "directives" from contact metadata
  const directives = contacts
    .filter(c => c.aiPriority === 'Hot' || c.callReady)
    .map(c => ({
      id: c.id,
      contact: c,
      type: c.callReady ? 'closing' : 'escalation',
      title: c.callReady ? 'Ready for Closing' : 'Stale Lead Escalation',
      desc: c.aiReason || `Entity ${c.company} showing high velocity patterns.`,
      icon: c.callReady ? <Zap size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-amber-400" />
    }))
    .slice(0, 3);

  if (directives.length === 0) return null;

  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-4 px-2">
        <BrainCircuit size={16} className="text-indigo-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-blue-500">
          Neural Directives Output
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {directives.map((dir) => (
          <div 
            key={dir.id} 
            onClick={() => onAction(dir.contact)}
            className="bg-white border-2 border-slate-200 p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden holographic-edge"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <Sparkles size={60} />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  {dir.icon}
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{dir.title}</span>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
              </div>
              <h4 className="font-black text-slate-900 uppercase text-xs truncate mb-2">{dir.contact.company}</h4>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic line-clamp-2">"{dir.desc}"</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
               <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Execute Node</span>
               <div className="flex -space-x-1">
                  <div className="w-4 h-4 rounded-full bg-slate-100 border border-white"></div>
                  <div className="w-4 h-4 rounded-full bg-indigo-100 border border-white"></div>
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GlobalDirectives;
