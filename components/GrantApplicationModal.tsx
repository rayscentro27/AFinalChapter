
import React, { useState } from 'react';
import { Contact, Grant } from '../types';
import { X, Sparkles, Save, RefreshCw, Copy, CheckCircle, Briefcase, Calendar, DollarSign, Building, Heart } from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface GrantApplicationModalProps {
  grant: Grant;
  contact?: Contact;
  onClose: () => void;
  onUpdate: (grant: Grant) => void;
}

const GrantApplicationModal: React.FC<GrantApplicationModalProps> = ({ grant, contact, onClose, onUpdate }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [status, setStatus] = useState<Grant['status']>(grant.status);
  
  // Context Data (User can edit this) - Now including narrative fields
  const [contextData, setContextData] = useState({
    company: contact?.company || '',
    industry: contact?.businessProfile?.industry || '',
    revenue: contact?.revenue?.toString() || '',
    founded: contact?.businessProfile?.establishedDate || '',
    mission: contact?.businessProfile?.missionStatement || '',
    impact: contact?.businessProfile?.impactSummary || ''
  });
  
  const [showContext, setShowContext] = useState(false);

  const handleDraft = async () => {
    if (!question) return;
    setIsDrafting(true);
    // Draft with full narrative context
    const draft = await geminiService.draftGrantAnswer(question, contextData, grant.name);
    setAnswer(draft);
    setIsDrafting(false);
  };

  const handleSave = () => {
    onUpdate({ ...grant, status });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-fade-in">
        
        {/* Header */}
        <div className="bg-emerald-900 p-6 text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="text-yellow-400" /> Grant Writing Suite
            </h2>
            <p className="text-emerald-200 text-sm mt-1">{grant.name} • ${grant.amount.toLocaleString()} Goal</p>
          </div>
          <button onClick={onClose} className="relative z-10 text-emerald-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
          <div className="absolute top-0 right-0 p-4 opacity-10">
             <Sparkles size={100} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 relative custom-scrollbar">
           <div className="relative z-10 space-y-6">
               
               {/* Status & Match info */}
               <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex items-center gap-4">
                     <label className="text-sm font-bold text-slate-600">Phase:</label>
                     <select 
                       value={status} 
                       onChange={(e) => setStatus(e.target.value as any)}
                       className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold shadow-sm"
                     >
                        <option value="Identified">Identified</option>
                        <option value="Drafting">Drafting</option>
                        <option value="Submitted">Submitted</option>
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                     </select>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                    Neural Match Score: {grant.matchScore}%
                  </div>
               </div>

               {/* Business Context Section - Narrative focus */}
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between w-full mb-4">
                     <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Briefcase size={16} className="text-blue-500" /> Applicant Narrative
                     </span>
                     <button 
                       onClick={() => setShowContext(!showContext)}
                       className="text-xs text-blue-600 font-bold hover:underline"
                     >
                        {showContext ? 'Collapse Profile' : 'Edit Context'}
                     </button>
                  </div>
                  
                  {showContext ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in pb-2">
                        <div className="space-y-4">
                           <div className="relative"><Building size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" className="w-full pl-8 p-2 border border-slate-200 rounded text-xs" value={contextData.company} onChange={e => setContextData({...contextData, company: e.target.value})} placeholder="Company Name" /></div>
                           <div className="relative"><DollarSign size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" className="w-full pl-8 p-2 border border-slate-200 rounded text-xs" value={contextData.revenue} onChange={e => setContextData({...contextData, revenue: e.target.value})} placeholder="Annual Revenue" /></div>
                        </div>
                        <div className="space-y-4">
                           <textarea className="w-full p-3 border border-slate-200 rounded text-xs h-14 resize-none" value={contextData.mission} onChange={e => setContextData({...contextData, mission: e.target.value})} placeholder="Company Mission Statement..." />
                           <textarea className="w-full p-3 border border-slate-200 rounded text-xs h-14 resize-none" value={contextData.impact} onChange={e => setContextData({...contextData, impact: e.target.value})} placeholder="Community Impact Summary..." />
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <div className="text-xs"><span className="text-slate-400 font-medium">Mission:</span> <span className="text-slate-700 font-bold italic line-clamp-1">{contextData.mission || 'Awaiting entry...'}</span></div>
                        <div className="text-xs"><span className="text-slate-400 font-medium">Impact:</span> <span className="text-slate-700 font-bold italic line-clamp-1">{contextData.impact || 'Awaiting entry...'}</span></div>
                     </div>
                  )}
               </div>

               {/* AI Writer */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                     <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">1. Grant Question</label>
                     <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-full flex flex-col">
                        <textarea 
                           value={question}
                           onChange={(e) => setQuestion(e.target.value)}
                           placeholder="Paste the prompt from the grant application (e.g. 'How will these funds help you scale job creation in your district?')"
                           className="w-full p-4 text-sm text-slate-700 h-64 resize-none outline-none border-none bg-transparent"
                        />
                        <div className="p-3 border-t border-slate-100 flex justify-end">
                           <button 
                              onClick={handleDraft}
                              disabled={isDrafting || !question}
                              className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50 shadow-lg transition-all active:scale-95"
                           >
                              {isDrafting ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                              Synthesize Draft
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">2. AI Perspective</label>
                        {answer && (
                           <button onClick={() => navigator.clipboard.writeText(answer)} className="text-emerald-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:underline"><Copy size={12}/> Copy</button>
                        )}
                     </div>
                     <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-inner h-[324px] overflow-y-auto custom-scrollbar relative">
                        {!answer && !isDrafting ? (
                           <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-40">
                              <Sparkles size={48} className="mb-3" />
                              <p className="text-xs font-black uppercase tracking-[0.2em]">Awaiting Input</p>
                           </div>
                        ) : isDrafting ? (
                           <div className="h-full flex flex-col items-center justify-center text-emerald-600">
                              <RefreshCw size={32} className="animate-spin mb-3" />
                              <p className="text-[10px] font-black uppercase tracking-widest">Weaving Narrative...</p>
                           </div>
                        ) : (
                           <div className="prose prose-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap animate-fade-in">
                              {answer}
                           </div>
                        )}
                     </div>
                  </div>
               </div>
           </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
           <button onClick={onClose} className="px-6 py-2 rounded-xl font-bold text-slate-400 hover:text-slate-600 transition-colors">Discard</button>
           <button onClick={handleSave} className="px-10 py-3 bg-slate-950 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 flex items-center gap-2 shadow-2xl transition-all transform active:scale-95">
              <CheckCircle size={18} /> Commit Progress
           </button>
        </div>

      </div>
    </div>
  );
};

export default GrantApplicationModal;
