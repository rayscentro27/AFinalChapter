
import React, { useMemo, useState } from 'react';
import { Contact, Lender, ApplicationSubmission } from '../types';
import { Send, Clock, FileText, RefreshCw, Check, ArrowRight, Sparkles } from 'lucide-react';
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
    const eligibleContacts = useMemo(
        () => contacts.filter(c => ['Lead', 'Active', 'Negotiation'].includes(c.status)),
        [contacts]
    );
    const trackerRows = useMemo(() => contacts.flatMap(c => c.submissions || []), [contacts]);

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

    const selectedLenders = MOCK_LENDERS.filter(l => selectedLenderIds.includes(l.id));
    const trackerSummary = useMemo(() => {
        const draft = trackerRows.filter((row) => row.status.toLowerCase() === 'draft').length;
        const sent = trackerRows.filter((row) => row.status.toLowerCase() === 'sent').length;
        return {
            total: trackerRows.length,
            draft,
            sent,
            latest: trackerRows[0]?.dateSent || 'No submissions yet',
        };
    }, [trackerRows]);

    const statusTone = (status: string) => {
        const normalized = status.toLowerCase();
        if (normalized === 'sent') return 'bg-[#E8FAEF] text-[#178D5B] border-[#CBEFD9]';
        if (normalized === 'draft') return 'bg-[#EEF4FF] text-[#4677E6] border-[#D5E4FF]';
        return 'bg-slate-50 text-slate-500 border-slate-200';
    };

  return (
        <div className="h-full overflow-hidden pb-20 md:pb-0">
            <div className="mx-auto max-w-[1380px] space-y-6 animate-fade-in subpixel-antialiased">
                <div className="flex flex-col gap-4 px-1 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-3">
                        <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Funding operations</p>
                        <h1 className="text-[2.4rem] font-black tracking-tight text-[#17233D] sm:text-[3rem]">Funding Application Engine</h1>
                        <p className="max-w-3xl text-sm text-[#61769D]">Select a client, map lender targets, audit generated packets, and keep a cleaner live log of what has been sent.</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[1.4rem] border border-[#E4ECF8] bg-white px-4 py-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Eligible clients</p>
                            <p className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">{eligibleContacts.length}</p>
                        </div>
                        <div className="rounded-[1.4rem] border border-[#E4ECF8] bg-white px-4 py-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Lender targets</p>
                            <p className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">{MOCK_LENDERS.length}</p>
                        </div>
                        <div className="rounded-[1.4rem] border border-[#E4ECF8] bg-white px-4 py-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Logged packets</p>
                            <p className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">{trackerRows.length}</p>
                        </div>
                    </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto border border-slate-200 shadow-inner">
                     <button onClick={() => setActiveTab('new')} className={`flex-1 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'new' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>New Workflow</button>
                     <button onClick={() => setActiveTab('tracker')} className={`flex-1 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'tracker' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>Tracker</button>
        </div>
      </div>

      {activeTab === 'new' && (
                <div className="mt-6 bg-white border border-[#E4ECF8] rounded-[2.4rem] md:rounded-[2.8rem] shadow-[0_18px_54px_rgba(36,58,114,0.08)] flex flex-col md:flex-row flex-1 overflow-hidden relative">
           
           {/* Step Navigation - Top Bar on Mobile, Left Bar on Desktop */}
                     <div className="w-full md:w-56 xl:w-64 bg-[linear-gradient(180deg,#F9FBFF_0%,#F4F8FF_100%)] border-b md:border-b-0 md:border-r border-[#E4ECF8] p-5 md:p-8 flex-shrink-0">
              <div className="flex md:flex-col justify-around md:justify-start gap-4 md:gap-10">
                 <StepCircle n={1} label="Subject" active={step >= 1} current={step === 1} />
                 <StepCircle n={2} label="Targets" active={step >= 2} current={step === 2} />
                 <StepCircle n={3} label="Audit" active={step >= 3} current={step === 3} />
              </div>

                            <div className="mt-6 hidden rounded-[1.4rem] border border-[#E1E9F6] bg-white p-4 md:block">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Live context</p>
                                <p className="mt-3 text-sm font-black text-[#17233D]">{selectedContact ? selectedContact.company : 'No client selected'}</p>
                                <p className="mt-1 text-sm text-[#61769D]">{selectedLenderIds.length ? `${selectedLenderIds.length} lender targets selected` : 'Choose a client and target set to continue.'}</p>
                            </div>
           </div>

           <div className="flex-1 p-5 md:p-10 xl:p-14 overflow-y-auto custom-scrollbar relative bg-white">
              {step === 1 && (
                 <div className="space-y-6 md:space-y-10 animate-fade-in max-w-2xl mx-auto">
                                        <div>
                                            <p className="text-[10px] font-black text-[#91A1BC] uppercase tracking-[0.3em] px-1">Select Target Client</p>
                                            <h3 className="mt-3 text-[2rem] font-black tracking-tight text-[#17233D]">Choose the account you want to route through funding applications.</h3>
                                        </div>
                    <div className="grid grid-cols-1 gap-4">
                                             {eligibleContacts.map(c => (
                                                    <div key={c.id} onClick={() => setSelectedContactId(c.id)} className={`p-5 md:p-7 rounded-[2rem] border cursor-pointer transition-all flex justify-between items-center gap-4 group active:scale-[0.98] ${selectedContactId === c.id ? 'border-[#4A83F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F4F8FF_100%)] shadow-[0_18px_36px_rgba(74,131,244,0.10)]' : 'border-[#E6EDF8] bg-white hover:border-[#C8D8F1]'}`}>
                             <div className="min-w-0 pr-4">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <h4 className="font-black text-[#17233D] tracking-tight text-base md:text-xl group-hover:text-[#4677E6] truncate">{c.company}</h4>
                                                                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${c.status === 'Active' ? 'border-[#CBEFD9] bg-[#E8FAEF] text-[#178D5B]' : c.status === 'Negotiation' ? 'border-[#F5E3BE] bg-[#FFF4E2] text-[#B7791F]' : 'border-[#D5E4FF] bg-[#EEF4FF] text-[#4677E6]'}`}>{c.status}</span>
                                                                </div>
                                                                <p className="mt-2 text-sm font-semibold text-[#5E7096]">{c.name}</p>
                                                                <p className="text-[10px] font-black text-[#9AA9C3] uppercase tracking-widest mt-1.5">${c.value?.toLocaleString()} Pipeline Value</p>
                             </div>
                             {selectedContactId === c.id ? (
                                                                <div className="bg-[#4677E6] text-white rounded-2xl p-3 shadow-lg"><Check size={20}/></div>
                             ) : (
                                                                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-slate-500 transition-colors"><ArrowRight size={20}/></div>
                             )}
                          </div>
                       ))}
                    </div>
                    <div className="sticky bottom-0 pt-10 pb-4 bg-white md:bg-transparent">
                                            <button disabled={!selectedContactId} onClick={() => setStep(2)} className="w-full bg-[#17233D] text-white py-5 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] hover:bg-[#4677E6] shadow-[0_18px_36px_rgba(23,35,61,0.18)] transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-30">
                                                Continue To Targets <ArrowRight size={20}/>
                      </button>
                    </div>
                 </div>
              )}

              {step === 2 && (
                 <div className="space-y-6 md:space-y-10 animate-fade-in">
                                        <div>
                                            <p className="text-[10px] font-black text-[#91A1BC] uppercase tracking-[0.3em] px-1">Select Target Lenders</p>
                                            <h3 className="mt-3 text-[2rem] font-black tracking-tight text-[#17233D]">Build the outgoing lender packet queue.</h3>
                                        </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-8">
                        {MOCK_LENDERS.map(l => (
                                                        <div key={l.id} onClick={() => setSelectedLenderIds(prev => prev.includes(l.id) ? prev.filter(i => i !== l.id) : [...prev, l.id])} className={`p-6 md:p-8 rounded-[2.2rem] border cursor-pointer transition-all flex flex-col group relative overflow-hidden active:scale-[0.98] ${selectedLenderIds.includes(l.id) ? 'border-[#2DBA8C] bg-[linear-gradient(180deg,#FFFFFF_0%,#F2FCF7_100%)] shadow-[0_20px_36px_rgba(45,186,140,0.10)]' : 'border-[#E6EDF8] bg-white hover:border-[#C8D8F1]'}`}>
                                <div className="flex justify-between items-start mb-8">
                                                                        <div className="w-16 h-16 md:w-20 md:h-20 bg-[linear-gradient(135deg,#F4F8FF,#FFFFFF)] rounded-[2rem] flex items-center justify-center text-3xl md:text-5xl shadow-inner group-hover:rotate-3 transition-transform">{l.logo}</div>
                                    {selectedLenderIds.includes(l.id) ? (
                                                                                <div className="bg-[#2DBA8C] text-white rounded-2xl p-2.5 shadow-lg"><Check size={18}/></div>
                                    ) : (
                                                                                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100" />
                                    )}
                                </div>
                                                                <h4 className="font-black text-[#17233D] tracking-tight text-xl md:text-2xl mb-1">{l.name}</h4>
                                                                <p className="text-[10px] font-black text-[#91A1BC] uppercase tracking-widest">{l.type} • {l.description}</p>
                                                                <div className="mt-8 pt-8 border-t border-[#EEF2FA] flex justify-between items-center">
                                    <div>
                                                                                <p className="text-[8px] font-black text-[#91A1BC] uppercase">Min Score</p>
                                                                                <p className="text-sm font-black text-[#17233D]">{l.minScore}</p>
                                    </div>
                                    <div className="text-right">
                                                                                <p className="text-[8px] font-black text-[#91A1BC] uppercase">Cap Limit</p>
                                                                                <p className="text-sm font-black text-[#2DBA8C]">${(l.maxAmount/1000).toFixed(0)}k</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                                        {selectedLenders.length ? (
                                            <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-[#F9FBFE] p-5">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Selected targets</p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {selectedLenders.map((lender) => (
                                                        <span key={lender.id} className="rounded-full border border-[#D5E4FF] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#4677E6]">
                                                            {lender.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                    <div className="flex flex-col md:flex-row gap-4 pt-12 sticky bottom-0 bg-white md:bg-transparent pb-4">
                        <button onClick={() => setStep(1)} className="w-full md:flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Back</button>
                                                <button disabled={selectedLenderIds.length === 0} onClick={handleGeneratePackets} className="w-full md:flex-[2] bg-[#17233D] text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] hover:bg-[#4677E6] transition-all shadow-[0_18px_36px_rgba(23,35,61,0.18)] flex items-center justify-center gap-4 active:scale-95 disabled:opacity-30">
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
                            <div key={idx} className="bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] border border-[#E4ECF8] rounded-[2.4rem] p-8 md:p-10 relative overflow-hidden group shadow-sm">
                                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity"><FileText size={220} /></div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-6 mb-10">
                                        <div className="w-14 h-14 md:w-16 md:h-16 bg-white rounded-3xl flex items-center justify-center text-3xl md:text-4xl shadow-sm border border-slate-100">{MOCK_LENDERS.find(l=>l.id===p.lenderId)?.logo}</div>
                                        <div>
                                            <h4 className="text-xl md:text-2xl font-black text-[#17233D] tracking-tight">{p.lenderName} Packet</h4>
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
                        <button onClick={handleSubmitAll} disabled={isSubmitting} className="w-full md:flex-[3] bg-[#2DBA8C] text-slate-950 py-6 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.3em] shadow-[0_20px_50px_rgba(45,186,140,0.24)] hover:bg-[#41C899] transition-all flex items-center justify-center gap-4 active:scale-95">
                            {isSubmitting ? <RefreshCw className="animate-spin" size={24}/> : <Send size={24}/>} 
                            Submit All Packets
                        </button>
                    </div>
                 </div>
              )}
           </div>
        </div>
      )}

      {activeTab === 'tracker' && (
        <div className="mt-6 bg-white border border-[#E4ECF8] rounded-[2.4rem] md:rounded-[2.8rem] shadow-[0_18px_54px_rgba(36,58,114,0.08)] flex-1 overflow-hidden flex flex-col">
                        <div className="border-b border-[#EEF2FA] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-6 md:p-8">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                    <div>
                                        <p className="font-black text-[10px] uppercase tracking-[0.3em] text-[#91A1BC]">Funding applications</p>
                                        <h3 className="mt-2 text-[1.8rem] font-black tracking-tight text-[#17233D]">Application Tracker</h3>
                                        <p className="mt-2 text-sm text-[#61769D]">Live packet history across lender submissions with clearer status and operator context.</p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-white px-4 py-3 shadow-sm">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Total packets</p>
                                            <p className="mt-2 text-xl font-black tracking-tight text-[#17233D]">{trackerSummary.total}</p>
                                        </div>
                                        <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-white px-4 py-3 shadow-sm">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Sent live</p>
                                            <p className="mt-2 text-xl font-black tracking-tight text-[#178D5B]">{trackerSummary.sent}</p>
                                        </div>
                                        <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-white px-4 py-3 shadow-sm">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Draft queue</p>
                                            <p className="mt-2 text-xl font-black tracking-tight text-[#4677E6]">{trackerSummary.draft}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-5 flex items-center justify-between gap-4 rounded-[1.3rem] border border-[#E4ECF8] bg-white px-4 py-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Last packet activity</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17233D]">{trackerSummary.latest}</p>
                                    </div>
                                    <span className="flex text-[9px] font-black text-slate-400 uppercase tracking-widest items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> Secure stream Active</span>
                                </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-5 md:p-6">
                {trackerRows.length ? (
                                        <div className="space-y-3">
                                            <div className="hidden grid-cols-[1.2fr,1.1fr,0.9fr,0.8fr] gap-4 rounded-[1.25rem] border border-[#E4ECF8] bg-[#F8FBFF] px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#91A1BC] lg:grid">
                                                <span>Lender</span>
                                                <span>Client</span>
                                                <span>Submitted</span>
                                                <span>Status</span>
                                            </div>
                      {trackerRows.map(sub => (
                                                <div key={sub.id} className="grid gap-4 rounded-[1.8rem] border border-[#E4ECF8] bg-[linear-gradient(180deg,#FFFFFF_0%,#F9FBFE_100%)] px-5 py-4 shadow-sm lg:grid-cols-[1.2fr,1.1fr,0.9fr,0.8fr] lg:items-center">
                                                    <div className="flex min-w-0 items-center gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-[#17233D] text-white flex items-center justify-center font-black text-sm uppercase shadow-lg">{sub.lenderName[0]}</div>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-[1rem] font-black tracking-tight text-[#17233D]">{sub.lenderName}</p>
                                                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#9AA9C3]">Packet {sub.id.slice(-6).toUpperCase()}</p>
                                                        </div>
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-black text-[#17233D]">{sub.contactName}</p>
                                                        <p className="mt-1 text-sm font-medium text-[#5E7096]">Queued through Nexus operator desk</p>
                                                    </div>

                                                    <div>
                                                        <p className="text-sm font-black text-[#17233D]">{sub.dateSent}</p>
                                                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#9AA9C3]">Latest submission event</p>
                                                    </div>

                                                    <div className="flex items-center gap-3 lg:justify-end">
                                                        <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(sub.status)}`}>{sub.status}</span>
                                                    </div>
                        </div>
                      ))}
                    </div>
                ) : (
                    <div className="p-24 text-center flex flex-col items-center">
                        <Clock size={48} className="opacity-10 mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Awaiting Log Data</p>
                    </div>
                )}
            </div>
        </div>
      )}
      </div>
    </div>
  );
};

const StepCircle = ({ n, label, active, current }: { n: number, label: string, active: boolean, current: boolean }) => (
    <div className={`flex items-center gap-4 transition-all duration-500 ${active ? 'opacity-100' : 'opacity-20'}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border transition-all duration-500 ${current ? 'bg-[#4677E6] text-white border-[#4677E6] shadow-[0_14px_28px_rgba(70,119,230,0.20)] scale-110' : active ? 'bg-[#E8FAEF] text-[#178D5B] border-[#CBEFD9]' : 'bg-white text-slate-200 border-slate-200'}`}>
            {active && !current ? <Check size={20}/> : n}
        </div>
        <div className="hidden md:block">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Step 0{n}</p>
            <p className={`text-xs font-black uppercase tracking-tight mt-1 ${current ? 'text-[#17233D]' : 'text-slate-400'}`}>{label}</p>
        </div>
    </div>
);

export default ApplicationSubmitter;
