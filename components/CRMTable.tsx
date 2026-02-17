
import React, { useState } from 'react';
import { Contact, ClientTask, EnrichedData, FundedDeal, ApplicationSubmission, AiIntensity } from '../types';
import { 
  MoreHorizontal, Search, Sparkles, X, LayoutList, Kanban, 
  Target, Video, RefreshCw, Check, ArrowRight, Globe, 
  UserPlus, ShieldAlert, BarChart3, TrendingUp, Zap, Users, Phone, Mail, Building2, Award,
  CheckCircle, Activity, Gift, BrainCircuit, Layers, Briefcase, FileText, ExternalLink, ChevronRight,
  Filter, Star, PhoneCall, Ghost, ShieldCheck
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import ActivityTimeline from './ActivityTimeline';
import MessageCenter from './MessageCenter';
import DocumentVault from './DocumentVault';
import SalesBattleCard from './SalesBattleCard';
import FundabilityDashboard from './FundabilityDashboard';
import CapitalAllocationSimulator from './CapitalAllocationSimulator';

interface CRMTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onAddContact: (contact: Partial<Contact>) => void;
}

const CRMTable: React.FC<CRMTableProps> = ({ contacts = [], onUpdateContact, onAddContact }) => {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'fundability' | 'simulator' | 'relations' | 'roadmap' | 'messages' | 'documents'>('overview');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'ready'>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [showBattleCard, setShowBattleCard] = useState(false);
  
  const displayContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterMode === 'all' || c.aiPriority === 'Hot';
    return matchesSearch && matchesFilter;
  });

  const updateIntensity = (intensity: AiIntensity) => {
    if (!selectedContact) return;
    const updated = { 
        ...selectedContact, 
        automationMetadata: { 
            ...(selectedContact.automationMetadata || {}),
            intensity 
        } 
    };
    onUpdateContact(updated);
    setSelectedContact(updated);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Closed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Negotiation': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Lead': return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-white text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative overflow-hidden">
       {/* Global Header */}
       <div className="p-4 md:p-6 border-b border-slate-200 bg-white flex flex-col xl:flex-row justify-between items-center rounded-t-[2.5rem] shadow-sm gap-4">
          <div className="flex w-full xl:w-auto gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => setViewMode('list')} className={`flex-1 xl:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${viewMode === 'list' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}><LayoutList size={14}/> List</button>
            <button onClick={() => setViewMode('board')} className={`flex-1 xl:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${viewMode === 'board' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}><Kanban size={14}/> Board</button>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
             <div className="flex bg-indigo-50 border border-indigo-100 rounded-xl p-1 w-full md:w-auto">
                <button 
                  onClick={() => setFilterMode('all')}
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filterMode === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-indigo-400'}`}
                >All</button>
                <button 
                  onClick={() => setFilterMode('ready')}
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${filterMode === 'ready' ? 'bg-[#059669] text-white shadow-lg' : 'text-[#059669]/50'}`}
                >
                  <Zap size={10} fill="currentColor"/> Autopilot
                </button>
             </div>
             
             <div className="relative w-full md:w-80 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Search pipeline..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-inner" />
             </div>
             
             <button onClick={() => onAddContact({ name: 'New Lead', company: 'Draft Entity', status: 'Lead', value: 0 })} className="w-full md:w-auto bg-slate-950 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl active:scale-95"><UserPlus size={16}/> New Entity</button>
          </div>
       </div>

       {/* Viewport Area */}
       <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-50/40 custom-scrollbar">
          {displayContacts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-30">
                <Users size={64} className="mb-4" />
                <p className="text-sm font-black uppercase tracking-[0.2em]">Zero Entities detected</p>
            </div>
          ) : viewMode === 'list' ? (
             <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Entity Signature</th>
                            <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Readiness Index</th>
                            <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Phase</th>
                            <th className="p-6 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Magnitude</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displayContacts.map((c, i) => (
                            <tr key={c.id} onClick={() => setSelectedContact(c)} className={`hover:bg-slate-50/80 cursor-pointer transition-all group relative animate-fade-in ${c.aiPriority === 'Hot' ? 'bg-emerald-50/20' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                                <td className="p-6 relative">
                                    {c.aiPriority === 'Hot' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#66FCF1] shadow-[0_0_10px_#66FCF1]"></div>}
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black group-hover:rotate-6 transition-transform">{c.company.charAt(0)}</div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="font-black text-slate-900 uppercase tracking-tight text-sm group-hover:text-blue-600 transition-colors">{c.company}</div>
                                                {c.aiPriority === 'Hot' && (
                                                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-[#66FCF1] text-slate-950 shadow-lg">Sentinel Hot</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{c.name} • {c.source}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-6 text-center">
                                    <div className="flex items-center justify-center gap-4">
                                        <div className={`text-sm font-black ${c.aiScore && c.aiScore > 75 ? 'text-emerald-500' : 'text-blue-600'}`}>{c.aiScore || 50}%</div>
                                        <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full transition-all duration-100 ${c.aiScore && c.aiScore > 75 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${c.aiScore || 50}%` }}></div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-6 text-center">
                                    <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full border ${getStatusBadgeColor(c.status)} shadow-sm`}>{c.status}</span>
                                </td>
                                <td className="p-6 text-right font-black text-slate-900 text-sm tracking-tight">${c.value?.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          ) : (
             <div className="flex gap-8 h-full overflow-x-auto no-scrollbar pb-6">
                {['Lead', 'Active', 'Negotiation', 'Closed'].map(status => (
                    <div key={status} className="w-80 flex-shrink-0 space-y-4">
                        <h4 className="font-black text-[10px] uppercase tracking-[0.3em] text-slate-400 px-4 flex justify-between items-center">
                            {status}
                            <span className="bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full text-[9px]">{displayContacts.filter(c => c.status === status).length}</span>
                        </h4>
                        <div className="bg-slate-200/30 p-3 rounded-[2.5rem] border border-dashed border-slate-300 min-h-[500px] space-y-3">
                            {displayContacts.filter(c => c.status === status).map((c, i) => (
                                <div key={c.id} onClick={() => setSelectedContact(c)} className={`bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden animate-fade-in ${c.aiPriority === 'Hot' ? 'ring-2 ring-[#66FCF1] ring-offset-4 ring-offset-slate-50' : 'border-slate-100'}`} style={{ animationDelay: `${i * 50}ms` }}>
                                    <h5 className="font-black text-slate-900 uppercase tracking-tight text-xs truncate group-hover:text-blue-600 transition-colors">{c.company}</h5>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">${c.value?.toLocaleString()} Magnitude</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
             </div>
          )}
       </div>

       {/* Detail Panel */}
       {selectedContact && (
          <div className="fixed inset-0 z-[100] flex justify-end">
             <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity duration-300" onClick={() => {setSelectedContact(null); setShowBattleCard(false);}} />
             <div className={`relative bg-white h-full shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ${
                'w-full md:w-4/5 xl:max-w-4xl md:rounded-l-[3rem] animate-slide-in-right'
             }`}>
                
                {showBattleCard && selectedContact.battleCard ? (
                    <SalesBattleCard card={selectedContact.battleCard} onLaunchMeeting={() => { setSelectedContact(null); setShowBattleCard(false); }} />
                ) : (
                  <>
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-950 text-white shrink-0 pt-10">
                        <div className="flex items-center gap-6 min-w-0">
                            <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-4xl font-black shadow-2xl transform rotate-3 flex-shrink-0">{selectedContact.company.charAt(0)}</div>
                            <div className="min-w-0">
                                <h2 className="text-4xl font-black uppercase tracking-tighter truncate">{selectedContact.company}</h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{selectedContact.name}</p>
                                   {selectedContact.aiPriority === 'Hot' && (
                                       <span className="bg-[#66FCF1] text-slate-950 px-2 py-0.5 rounded text-[8px] font-black uppercase animate-pulse shrink-0">Sentinel Critical</span>
                                   )}
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedContact(null)} className="p-4 hover:bg-white/10 rounded-2xl transition-all text-white ml-2"><X size={24}/></button>
                    </div>

                    <div className="flex bg-white border-b border-slate-100 px-4 overflow-x-auto no-scrollbar shrink-0">
                        {['overview', 'relations', 'roadmap', 'messages', 'documents'].map((t) => (
                            <button key={t} onClick={() => setActiveTab(t as any)} className={`px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 transition-all whitespace-nowrap ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-10 bg-slate-50/30 custom-scrollbar">
                        {activeTab === 'fundability' && <FundabilityDashboard contact={selectedContact} />}
                        {activeTab === 'simulator' && <CapitalAllocationSimulator contact={selectedContact} />}
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 animate-fade-in">
                                <div className="xl:col-span-4 space-y-8">
                                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group border border-white/5 transition-colors">
                                        <div className="relative z-10">
                                            <p className="text-[10px] font-black uppercase tracking-widest mb-6 opacity-60">Neural Intel HUD</p>
                                            <div className="space-y-6">
                                                <div>
                                                    <p className="text-[10px] uppercase font-black opacity-60 mb-1">Bankability</p>
                                                    <h4 className="text-5xl font-black tracking-tighter">{selectedContact.aiScore || 50}%</h4>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-black opacity-60 mb-1">Exposure Limit</p>
                                                    <div className="text-3xl font-black tracking-tighter">${selectedContact.value.toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
                                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6"><Sparkles size={14} className="text-indigo-500"/> Tactical Intensity</h5>
                                        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                                            {(['Ghost', 'Concierge', 'Hunter'] as AiIntensity[]).map((int) => (
                                                <button 
                                                    key={int}
                                                    onClick={() => updateIntensity(int)}
                                                    className={`py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1 ${selectedContact.automationMetadata?.intensity === int ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    {int === 'Ghost' && <Ghost size={12} />}
                                                    {int === 'Concierge' && <ShieldCheck size={12} />}
                                                    {int === 'Hunter' && <Zap size={12} />}
                                                    {int}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="xl:col-span-8">
                                    <ActivityTimeline contact={selectedContact} onAddActivity={(id, act) => onUpdateContact({...selectedContact, activities: [...(selectedContact.activities || []), act]})} />
                                </div>
                            </div>
                        )}
                        {activeTab === 'documents' && <DocumentVault contact={selectedContact} onUpdateContact={onUpdateContact} />}
                        {activeTab === 'messages' && <div className="h-[65vh]"><MessageCenter contact={selectedContact} onUpdateContact={onUpdateContact} currentUserRole="admin" /></div>}
                    </div>
                  </>
                )}
             </div>
          </div>
       )}
    </div>
  );
};

export default CRMTable;
