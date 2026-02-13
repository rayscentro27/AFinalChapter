
import React, { useState } from 'react';
import { Contact, Lender, ApplicationSubmission } from '../types';
import { Send, CheckCircle, Clock, AlertTriangle, FileText, Upload, RefreshCw, Briefcase, ChevronRight, Play, Check, ArrowRight, X, Sparkles } from 'lucide-react';
import * as geminiService from '../services/geminiService';

const MOCK_LENDERS: Lender[] = [
  { id: 'l_bluevine', name: 'Bluevine', logo: '🟦', type: 'Fintech', minScore: 625, minRevenue: 10000, minTimeInBusinessMonths: 6, maxAmount: 250000, description: 'Fast LOC', applicationLink: '#' },
  { id: 'l_chase', name: 'Chase Ink', logo: '🏦', type: 'Bank', minScore: 700, minRevenue: 0, minTimeInBusinessMonths: 0, maxAmount: 100000, description: 'Business Credit Card', applicationLink: '#' },
  { id: 'l_ondeck', name: 'OnDeck', logo: '🟧', type: 'Fintech', minScore: 600, minRevenue: 8500, minTimeInBusinessMonths: 12, maxAmount: 150000, description: 'Term Loans', applicationLink: '#' },
  { id: 'l_kapitus', name: 'Kapitus', logo: '🟩', type: 'Fintech', minScore: 550, minRevenue: 25000, minTimeInBusinessMonths: 24, maxAmount: 500000, description: 'Flexible Funding', applicationLink: '#' }
];

interface ApplicationSubmitterProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
}

const ApplicationSubmitter: React.FC<ApplicationSubmitterProps> = ({ contacts, onUpdateContact }) => {
  const [activeTab, setActiveTab] = useState<'new' | 'tracker'>('new');
  const [step, setStep] = useState(1);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedLenderIds, setSelectedLenderIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPackets, setGeneratedPackets] = useState<ApplicationSubmission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  const handleGeneratePackets = async () => {
    if (!selectedContact || selectedLenderIds.length === 0) return;
    setIsGenerating(true);
    const newPackets: ApplicationSubmission[] = [];
    for (const lenderId of selectedLenderIds) {
      const lender = MOCK_LENDERS.find(l => l.id === lenderId);
      if (lender) {
        const coverLetter = await geminiService.generateApplicationCoverLetter(selectedContact, lender.name);
        newPackets.push({
          id: `sub_${Date.now()}_${lenderId}`,
          contactId: selectedContact.id,
          contactName: selectedContact.company,
          lenderId: lender.id,
          lenderName: lender.name,
          status: 'Draft',
          dateSent: new Date().toLocaleDateString(),
          coverLetter: coverLetter
        });
      }
    }
    setGeneratedPackets(newPackets);
    setIsGenerating(false);
    setStep(3);
  };

  const handleSubmitAll = () => {
    if (!selectedContact) return;
    setIsSubmitting(true);
    setTimeout(() => {
        const sentPackets = generatedPackets.map(p => ({ ...p, status: 'Sent' as const }));
        onUpdateContact({
            ...selectedContact,
            submissions: [...(selectedContact.submissions || []), ...sentPackets],
            status: 'Active',
            activities: [...(selectedContact.activities || []), { id: `act_sub_${Date.now()}`, type: 'system', description: `Transmitted applications to ${selectedLenderIds.length} partners.`, date: new Date().toLocaleString(), user: 'Admin' }]
        });
        setIsSubmitting(false);
        setStep(1);
        setSelectedContactId('');
        setSelectedLenderIds([]);
        setGeneratedPackets([]);
        setActiveTab('tracker');
    }, 1500);
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative pb-20 md:pb-0 overflow-hidden">
      <div className="px-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">Protocol Transmit</h1>
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.4em] mt-2">Autonomous Application Engine</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto border border-slate-200 shadow-inner">
           <button onClick={() => setActiveTab('new')} className={`flex-1 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'new' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>Execute</button>
           <button onClick={() => setActiveTab('tracker')} className={`flex-1 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'tracker' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>Logs</button>
        </div>
      </div>

      {activeTab === 'new' && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] md:rounded-[3rem] shadow-xl flex flex-col md:flex-row flex-1 overflow-hidden relative">
           
           {/* Step Navigation - Top Bar on Mobile, Left Bar on Desktop */}
           <div className="w-full md:w-48 xl:w-56 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-5 md:p-8 flex-shrink-0">
              <div className="flex md:flex-col justify-around md:justify-start gap-4 md:gap-10">
                 <StepCircle n={1} label="Subject" active={step >= 1} current={step === 1} />
                 <StepCircle n={2} label="Targets" active={step >= 2} current={step === 2} />
                 <StepCircle n={3} label="Audit" active={step >= 3} current={step === 3} />
              </div>
           </div>

           <div className="flex-1 p-5 md:p-10 xl:p-14 overflow-y-auto custom-scrollbar relative bg-white">
              {step === 1 && (
                 <div className="space-y-6 md:space-y-10 animate-fade-in max-w-2xl mx-auto">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-2">Select Target Merchant</h3>
                    <div className="grid grid-cols-1 gap-4">
                       {contacts.filter(c => ['Lead', 'Active', 'Negotiation'].includes(c.status)).map(c => (
                          <div key={c.id} onClick={() => setSelectedContactId(c.id)} className={`p-5 md:p-8 rounded-[2rem] border-2 cursor-pointer transition-all flex justify-between items-center group active:scale-[0.98] ${selectedContactId === c.id ? 'border-blue-600 bg-blue-50/20 shadow-xl shadow-blue-500/5' : 'border-slate-100 bg-white hover:border-slate-300'}`}>
                             <div className="min-w-0 pr-4">
                                <h4 className="font-black text-slate-900 uppercase tracking-tight text-base md:text-xl group-hover:text-blue-600 truncate">{c.company}</h4>
                                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">${c.value?.toLocaleString()} Magnitide • {c.name}</p>
                             </div>
                             {selectedContactId === c.id ? (
                                <div className="bg-blue-600 text-white rounded-2xl p-3 shadow-lg"><Check size={20}/></div>
                             ) : (
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-200 group-hover:text-slate-400 transition-colors"><ArrowRight size={20}/></div>
                             )}
                          </div>
                       ))}
                    </div>
                    <div className="sticky bottom-0 pt-10 pb-4 bg-white md:bg-transparent">
                      <button disabled={!selectedContactId} onClick={() => setStep(2)} className="w-full bg-slate-950 text-white py-5 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] hover:bg-blue-600 shadow-2xl transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-30">
                        Continue Deployment <ArrowRight size={20}/>
                      </button>
                    </div>
                 </div>
              )}

              {step === 2 && (
                 <div className="space-y-6 md:space-y-10 animate-fade-in">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-2">Map Destination Protocols</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-8">
                        {MOCK_LENDERS.map(l => (
                            <div key={l.id} onClick={() => setSelectedLenderIds(prev => prev.includes(l.id) ? prev.filter(i => i !== l.id) : [...prev, l.id])} className={`p-6 md:p-10 rounded-[2.5rem] border-2 cursor-pointer transition-all flex flex-col group relative overflow-hidden active:scale-[0.98] ${selectedLenderIds.includes(l.id) ? 'border-emerald-500 bg-emerald-50/20 shadow-2xl shadow-emerald-500/10' : 'border-slate-100 bg-white hover:border-slate-300'}`}>
                                <div className="flex justify-between items-start mb-8">
                                    <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-3xl md:text-5xl shadow-inner group-hover:rotate-3 transition-transform">{l.logo}</div>
                                    {selectedLenderIds.includes(l.id) ? (
                                        <div className="bg-emerald-500 text-white rounded-2xl p-2.5 shadow-lg"><Check size={18}/></div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100" />
                                    )}
                                </div>
                                <h4 className="font-black text-slate-900 uppercase tracking-tight text-xl md:text-2xl mb-1">{l.name}</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{l.type} Engine</p>
                                <div className="mt-8 pt-8 border-t border-slate-100/50 flex justify-between items-center">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Min Score</p>
                                        <p className="text-sm font-black text-slate-900">{l.minScore}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Cap Limit</p>
                                        <p className="text-sm font-black text-emerald-600">${(l.maxAmount/1000).toFixed(0)}k</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 pt-12 sticky bottom-0 bg-white md:bg-transparent pb-4">
                        <button onClick={() => setStep(1)} className="w-full md:flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Back</button>
                        <button disabled={selectedLenderIds.length === 0} onClick={handleGeneratePackets} className="w-full md:flex-[2] bg-slate-950 text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-600 transition-all shadow-2xl flex items-center justify-center gap-4 active:scale-95 disabled:opacity-30">
                            {isGenerating ? <RefreshCw className="animate-spin" size={20}/> : <Sparkles size={20} />}
                            Synthesize Packets
                        </button>
                    </div>
                 </div>
              )}

              {step === 3 && (
                 <div className="space-y-10 animate-fade-in max-w-4xl mx-auto pb-10">
                    <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 shadow-sm">
                        <Sparkles size={16} /> Neural Packet Audit
                    </div>
                    <div className="space-y-6 md:space-y-10">
                        {generatedPackets.map((p, idx) => (
                            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-[3rem] p-8 md:p-12 relative overflow-hidden group shadow-sm">
                                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity"><FileText size={220} /></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-6 mb-10">
                                        <div className="w-14 h-14 md:w-16 md:h-16 bg-white rounded-3xl flex items-center justify-center text-3xl md:text-4xl shadow-sm border border-slate-100">{MOCK_LENDERS.find(l=>l.id===p.lenderId)?.logo}</div>
                                        <div>
                                            <h4 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">{p.lenderName} Packet</h4>
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Autonomous Drafting v2.5</p>
                                        </div>
                                    </div>
                                    <textarea className="w-full bg-white border border-slate-200 rounded-[2rem] p-8 text-sm md:text-base font-medium h-64 resize-none shadow-inner outline-none focus:ring-4 focus:ring-blue-500/10 transition-all leading-relaxed" defaultValue={p.coverLetter} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 pt-12">
                        <button onClick={() => setStep(2)} className="w-full md:flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-slate-200">Back</button>
                        <button onClick={handleSubmitAll} disabled={isSubmitting} className="w-full md:flex-[3] bg-emerald-500 text-slate-950 py-6 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.3em] shadow-[0_20px_50px_rgba(16,185,129,0.3)] hover:bg-emerald-400 transition-all flex items-center justify-center gap-4 active:scale-95">
                            {isSubmitting ? <RefreshCw className="animate-spin" size={24}/> : <Send size={24}/>} 
                            Execute Global Transmission
                        </button>
                    </div>
                 </div>
              )}
           </div>
        </div>
      )}

      {activeTab === 'tracker' && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] md:rounded-[3rem] shadow-xl flex-1 overflow-hidden flex flex-col">
            <div className="p-6 md:p-10 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="font-black text-xs md:text-sm uppercase tracking-[0.3em] text-slate-800">Protocol Execution Logs</h3>
                <span className="flex text-[9px] font-black text-slate-400 uppercase tracking-widest items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> Secure stream Active</span>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {contacts.flatMap(c => c.submissions || []).length ? (
                    <table className="w-full text-left">
                        <thead className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                            <tr><th className="px-10 py-6">Lender Partner</th><th className="px-10 py-6">Merchant Entity</th><th className="px-10 py-6 text-right">Phase</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {contacts.flatMap(c => c.submissions || []).map(sub => (
                                <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-10 py-6 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xs uppercase shadow-lg group-hover:scale-110 transition-transform">{sub.lenderName[0]}</div>
                                        <span className="font-black text-slate-900 uppercase text-sm tracking-tight">{sub.lenderName}</span>
                                    </td>
                                    <td className="px-10 py-6">
                                        <p className="font-black text-slate-600 text-xs uppercase tracking-tight truncate max-w-[120px] md:max-w-none">{sub.contactName}</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Sent: {sub.dateSent}</p>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full border ${sub.status === 'Sent' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{sub.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-32 text-center flex flex-col items-center">
                        <Clock size={48} className="opacity-10 mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Awaiting Log Data</p>
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

const StepCircle = ({ n, label, active, current }: { n: number, label: string, active: boolean, current: boolean }) => (
    <div className={`flex items-center gap-4 transition-all duration-500 ${active ? 'opacity-100' : 'opacity-20'}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border-2 shadow-inner transition-all duration-500 ${current ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-500/20 scale-110' : active ? 'bg-emerald-50 text-emerald-600 border-emerald-400' : 'bg-white text-slate-200 border-slate-200'}`}>
            {active && !current ? <Check size={20}/> : n}
        </div>
        <div className="hidden md:block">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Step 0{n}</p>
            <p className={`text-xs font-black uppercase tracking-tight mt-1 ${current ? 'text-slate-900' : 'text-slate-400'}`}>{label}</p>
        </div>
    </div>
);

export default ApplicationSubmitter;
