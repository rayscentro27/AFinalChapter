
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
    const activeCount = contacts.filter(c => c.status === 'Lead' || c.status === 'Negotiation').length;
    const closedCount = contacts.filter(c => c.status === 'Closed').length;

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
                    <div className="flex w-full flex-col gap-4 xl:w-auto">
                        <div>
                            <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Relationship command</p>
                            <h1 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Clients</h1>
                        </div>

                        <div className="flex w-full xl:w-auto gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                            <button onClick={() => setViewMode('list')} className={`flex-1 xl:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${viewMode === 'list' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}><LayoutList size={14}/> List</button>
                            <button onClick={() => setViewMode('board')} className={`flex-1 xl:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${viewMode === 'board' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}><Kanban size={14}/> Board</button>
                        </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
             <div className="flex bg-indigo-50 border border-indigo-100 rounded-xl p-1 w-full md:w-auto">
                <button 
                  onClick={() => setFilterMode('all')}
                                    className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filterMode === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-indigo-400'}`}
                                >All ({contacts.length})</button>
                <button 
                  onClick={() => setFilterMode('ready')}
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${filterMode === 'ready' ? 'bg-[#059669] text-white shadow-lg' : 'text-[#059669]/50'}`}
                >
                                    <Zap size={10} fill="currentColor"/> Priority ({contacts.filter(c => c.aiPriority === 'Hot').length})
                </button>
             </div>

                         <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 md:flex">
                                <span className="rounded-full bg-[#EEF4FF] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]">Active {activeCount}</span>
                                <span className="rounded-full bg-[#F4F7FB] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Closed {closedCount}</span>
                         </div>
             
             <div className="relative w-full md:w-80 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input type="text" placeholder="Search clients..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-inner" />
             </div>
             
             <button onClick={() => onAddContact({ name: 'New Lead', company: 'Draft Entity', status: 'Lead', value: 0 })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_16px_30px_rgba(46,88,230,0.24)] transition-all active:scale-95 md:w-auto"><UserPlus size={16}/> New Entity</button>
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
                         <div className="space-y-3">
                                <div className="hidden grid-cols-[1.45fr,0.95fr,0.95fr,0.8fr] gap-3 rounded-[1.4rem] border border-[#E4ECF8] bg-white px-5 py-3 shadow-sm lg:grid">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#91A1BC]">Client</p>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#91A1BC]">Status</p>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#91A1BC]">Readiness</p>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#91A1BC] text-right">Value</p>
                                </div>
                                {displayContacts.map((c, i) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelectedContact(c)}
                                        className={`w-full rounded-[1.65rem] border bg-white px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${c.aiPriority === 'Hot' ? 'border-[#CFE0FF] bg-[linear-gradient(180deg,#FFFFFF_0%,#F7FAFF_100%)]' : 'border-slate-200'}`}
                                        style={{ animationDelay: `${i * 30}ms` }}
                                    >
                                        <div className="grid gap-4 lg:grid-cols-[1.45fr,0.95fr,0.95fr,0.8fr] lg:items-center">
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#EAF2FF,#F9FCFF)] text-sm font-black text-[#3B65D8]">
                                                    {c.name.split(' ').map((part) => part[0]).slice(0, 2).join('') || c.company.charAt(0)}
                                                </div>

                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="truncate text-[1.12rem] font-black tracking-tight text-[#17233D]">{c.name}</p>
                                                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getStatusBadgeColor(c.status)}`}>{c.status}</span>
                                                        {c.aiPriority === 'Hot' && (
                                                            <span className="rounded-full border border-[#D5E4FF] bg-[#EEF4FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#315FD0]">Sentinel Hot</span>
                                                        )}
                                                    </div>

                                                    <p className="mt-1 truncate text-sm font-semibold text-[#5E7096]">{c.company || 'Client account'}</p>
                                                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#9AA9C3]">{c.source || 'Nexus pipeline'}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 lg:block">
                                                <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getStatusBadgeColor(c.status)}`}>{c.status}</span>
                                                <p className="mt-2 text-sm font-semibold text-[#5E7096]">{c.email || c.phone || 'Relationship on file'}</p>
                                            </div>

                                            <div className="rounded-[1.2rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-sm font-black ${c.aiScore && c.aiScore > 75 ? 'text-emerald-500' : 'text-[#4378E9]'}`}>{c.aiScore || 50}%</span>
                                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                        <div className={`h-full transition-all duration-100 ${c.aiScore && c.aiScore > 75 ? 'bg-emerald-500' : 'bg-[#4378E9]'}`} style={{ width: `${c.aiScore || 50}%` }} />
                                                    </div>
                                                </div>
                                                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Readiness index</p>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 lg:justify-end">
                                                <div className="text-left lg:text-right">
                                                    <p className="text-[1.15rem] font-black tracking-tight text-[#1C3164]">${c.value?.toLocaleString() || '0'}</p>
                                                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Open client detail</p>
                                                </div>
                                                <ChevronRight size={18} className="text-[#A6B4D1]" />
                                            </div>
                                        </div>
                                    </button>
                                ))}
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
                                <div key={c.id} onClick={() => setSelectedContact(c)} className={`bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden animate-fade-in ${c.aiPriority === 'Hot' ? 'ring-2 ring-[#4A7AE8]/40 ring-offset-4 ring-offset-slate-50' : 'border-slate-100'}`} style={{ animationDelay: `${i * 50}ms` }}>
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
             <div className="absolute inset-0 bg-[#203266]/18 backdrop-blur-md transition-opacity duration-300" onClick={() => {setSelectedContact(null); setShowBattleCard(false);}} />
             <div className={`relative bg-white h-full shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ${
                'w-full md:w-4/5 xl:max-w-4xl md:rounded-l-[3rem] animate-slide-in-right'
             }`}>
                
                {showBattleCard && selectedContact.battleCard ? (
                    <SalesBattleCard card={selectedContact.battleCard} onLaunchMeeting={() => { setSelectedContact(null); setShowBattleCard(false); }} />
                ) : (
                  <>
                    <div className="shrink-0 border-b border-[#E6EEF9] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] p-8 pt-10 text-[#203266]">
                        <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-6 min-w-0">
                            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#315FD0,#72A3FF)] text-4xl font-black text-white shadow-[0_18px_40px_rgba(49,95,208,0.24)] transform rotate-3">{selectedContact.company.charAt(0)}</div>
                            <div className="min-w-0">
                                <h2 className="text-4xl font-black uppercase tracking-tighter truncate">{selectedContact.company}</h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                   <p className="text-[10px] font-black text-[#6D83AE] uppercase tracking-widest truncate">{selectedContact.name}</p>
                                   {selectedContact.aiPriority === 'Hot' && (
                                       <span className="shrink-0 rounded-full border border-[#D5E4FF] bg-[#EEF4FF] px-2 py-0.5 text-[8px] font-black uppercase text-[#315FD0] animate-pulse">Sentinel Critical</span>
                                   )}
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedContact(null)} className="ml-2 rounded-2xl bg-[#F4F8FF] p-4 text-[#6780B2] transition-all hover:text-[#315FD0]"><X size={24}/></button>
                        </div>
                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[1.4rem] border border-[#DCE7FA] bg-white px-4 py-4 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Relationship status</p>
                                <p className="mt-2 text-base font-black tracking-tight text-[#17233D]">{selectedContact.status}</p>
                            </div>
                            <div className="rounded-[1.4rem] border border-[#DCE7FA] bg-white px-4 py-4 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Readiness score</p>
                                <p className="mt-2 text-base font-black tracking-tight text-[#17233D]">{selectedContact.aiScore || 50}%</p>
                            </div>
                            <div className="rounded-[1.4rem] border border-[#DCE7FA] bg-white px-4 py-4 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Pipeline value</p>
                                <p className="mt-2 text-base font-black tracking-tight text-[#17233D]">${selectedContact.value?.toLocaleString() || '0'}</p>
                            </div>
                        </div>
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
                                    <div className="relative overflow-hidden rounded-[2.5rem] border border-[#DCE7FA] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-8 text-[#203266] shadow-[0_18px_44px_rgba(41,72,138,0.10)] transition-colors group">
                                        <div className="relative z-10">
                                            <p className="mb-6 text-[10px] font-black uppercase tracking-widest text-[#6B82AE]">Neural Intel HUD</p>
                                            <div className="space-y-6">
                                                <div>
                                                    <p className="mb-1 text-[10px] font-black uppercase text-[#6B82AE]">Bankability</p>
                                                    <h4 className="text-5xl font-black tracking-tighter">{selectedContact.aiScore || 50}%</h4>
                                                </div>
                                                <div>
                                                    <p className="mb-1 text-[10px] font-black uppercase text-[#6B82AE]">Exposure Limit</p>
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
