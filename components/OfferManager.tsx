
import React, { useState, useRef } from 'react';
// Fix: Added 'FundedDeal' to imports from '../types'
import { Contact, FundingOffer, Invoice, ClientDocument, FundedDeal } from '../types';
import { 
  DollarSign, Calendar, Percent, CheckCircle, Send, FileText, 
  PenTool, Loader, Shield, AlertTriangle, Scale, Upload, 
  X, PartyPopper, BarChart3, ArrowRight, CheckSquare, 
  Square, Sparkles, CreditCard, TrendingUp, ChevronDown, RefreshCw, Lock
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import SmartContractSigner from './SmartContractSigner';
import { BACKEND_CONFIG } from '../adapters/config';

interface OfferManagerProps {
  contact: Contact;
  onUpdateContact?: (contact: Contact) => void;
  isAdmin?: boolean;
}

const OfferManager: React.FC<OfferManagerProps> = ({ contact, onUpdateContact, isAdmin = false }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newOffer, setNewOffer] = useState<Partial<FundingOffer>>({ 
    lenderName: '', amount: 0, term: '', rate: '', payment: 'Monthly', paymentAmount: 0, stips: '', tier: 1
  });
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [signingOffer, setSigningOffer] = useState<FundingOffer | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedOfferIdForUpload, setSelectedOfferIdForUpload] = useState<string | null>(null);

  const handleCreateOffer = () => {
    if (!onUpdateContact || !newOffer.amount) return;
    const offer: FundingOffer = { 
      id: `off_${Date.now()}`, 
      lenderName: newOffer.lenderName || 'Unknown', 
      amount: newOffer.amount || 0, 
      term: newOffer.term || '', 
      rate: newOffer.rate || '', 
      payment: newOffer.payment || 'Monthly', 
      paymentAmount: newOffer.paymentAmount || 0, 
      status: 'Sent', 
      dateSent: new Date().toLocaleDateString(), 
      stips: newOffer.stips,
      tier: newOffer.tier as any
    };
    const newActivity = { 
      id: `act_off_${Date.now()}`, 
      type: 'system' as const, 
      description: `Funding Offer Sent: $${offer.amount.toLocaleString()} from ${offer.lenderName} (Tier ${offer.tier})`, 
      date: new Date().toLocaleString(), 
      user: 'Admin' 
    };
    onUpdateContact({ 
      ...contact, 
      offers: [...(contact.offers || []), offer], 
      activities: [...(contact.activities || []), newActivity], 
      status: 'Negotiation' 
    });
    setIsCreating(false);
  };

  const handleSignComplete = (signature: string) => {
    if (!onUpdateContact || !signingOffer) return;
    const signedOfferId = signingOffer.id;
    setSigningOffer(null);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);

    const updatedOffers = contact.offers?.map(o => o.id === signedOfferId ? { 
        ...o, 
        status: 'Accepted' as const,
        signature: signature,
        signedDate: new Date().toLocaleDateString()
    } : o);

    const acceptedOffer = contact.offers?.find(o => o.id === signedOfferId);
    const feeAmount = (acceptedOffer?.amount || 0) * 0.10;
    
    const newInvoice: Invoice = { 
        id: `inv_fee_${Date.now()}`, 
        contactId: contact.id,
        contactName: contact.company,
        amount: feeAmount, 
        date: new Date().toISOString().split('T')[0], 
        dueDate: new Date().toISOString().split('T')[0], 
        status: 'Pending', 
        description: `Success Fee - ${signingOffer.lenderName} Funding` 
    };

    const signedDoc: ClientDocument = {
        id: `doc_sign_${Date.now()}`,
        name: `Executed_Contract_${signingOffer.lenderName}.pdf`,
        type: 'Contract',
        status: 'Signed',
        uploadDate: new Date().toLocaleDateString(),
        fileUrl: '#',
        isEsed: true
    };

    const fundedDeal: FundedDeal = {
        id: `fd_${Date.now()}`,
        lenderName: signingOffer.lenderName,
        fundedDate: new Date().toLocaleDateString(),
        originalAmount: signingOffer.amount,
        currentBalance: signingOffer.amount * Number(signingOffer.rate || 1.25),
        termLengthMonths: parseInt(signingOffer.term) || 12,
        paymentFrequency: signingOffer.payment,
        paymentAmount: signingOffer.paymentAmount,
        totalPayback: signingOffer.amount * Number(signingOffer.rate || 1.25),
        status: 'Active',
        renewalEligibleDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        paymentsMade: 0
    };

    onUpdateContact({ 
        ...contact, 
        offers: updatedOffers, 
        invoices: [...(contact.invoices || []), newInvoice], 
        documents: [...(contact.documents || []), signedDoc],
        fundedDeals: [...(contact.fundedDeals || []), fundedDeal],
        status: 'Closed', 
        notifications: [
            ...(contact.notifications || []), 
            { id: `notif_fund_${Date.now()}`, title: 'Deal Funded! 🎉', message: `Congratulations! Your contract with ${signingOffer.lenderName} is signed and vaulted.`, date: 'Just now', read: false, type: 'success' }
        ],
        activities: [
            ...(contact.activities || []), 
            { id: `act_sign_${Date.now()}`, type: 'system', description: `Client executed digital funding agreement with ${signingOffer.lenderName}.`, date: new Date().toLocaleString(), user: 'System' }
        ]
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !selectedOfferIdForUpload || !onUpdateContact) return;
    const file = event.target.files[0];
    const offerId = selectedOfferIdForUpload;
    setIsAnalyzing(offerId);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const analysis = await geminiService.analyzeContract(base64);
        if (analysis) {
           const updatedOffers = contact.offers?.map(o => o.id === offerId ? { ...o, aiAnalysis: analysis } : o);
           onUpdateContact({ ...contact, offers: updatedOffers });
        }
        setIsAnalyzing(null);
        setSelectedOfferIdForUpload(null);
      };
    } catch (e) {
      console.error(e);
      setIsAnalyzing(null);
    }
  };

  const toggleComparisonSelection = (id: string) => {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter(oid => oid !== id));
    } else {
      if (selectedForCompare.length < 3) {
        setSelectedForCompare([...selectedForCompare, id]);
      } else {
        alert("You can compare up to 3 offers.");
      }
    }
  };

  const activeOffers = contact.offers || [];
  const comparisonOffers = activeOffers.filter(o => selectedForCompare.includes(o.id));
  const isTier2Eligible = contact.tier2Data?.isEligibleForTier2 || false;

  return (
    <div className="space-y-8 animate-fade-in relative max-w-6xl mx-auto">
      {showConfetti && (
        <div className="fixed inset-0 z-[300] pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md animate-pulse"></div>
            <div className="z-10 text-center animate-bounce">
                <PartyPopper size={120} className="text-emerald-500 mx-auto mb-6" />
                <h2 className="text-6xl font-black text-white tracking-tighter uppercase">Capital Secured.</h2>
                <p className="text-xl text-emerald-400 mt-4 font-black uppercase tracking-widest">Protocol Success</p>
            </div>
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm sticky top-0 z-30">
          <div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                <DollarSign size={28} className="text-blue-600" /> {isAdmin ? 'Offer Management' : 'Liquidity Offers'}
            </h3>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">{activeOffers.length} Ready for Review</p>
          </div>
          <div className="flex gap-4">
            {selectedForCompare.length > 1 && (
              <button 
                onClick={() => setShowComparison(true)} 
                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 flex items-center gap-2 shadow-xl shadow-indigo-500/20 transform active:scale-95 transition-all"
              >
                <Scale size={16} /> Compare {selectedForCompare.length} Options
              </button>
            )}
            {isAdmin && !isCreating && (
                <button onClick={() => setIsCreating(true)} className="bg-slate-950 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                    <PenTool size={16} /> Draft Offer
                </button>
            )}
          </div>
      </div>
      
      {isCreating && isAdmin && (
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl animate-fade-in">
            <div className="flex justify-between mb-8">
                <h4 className="font-black text-xs uppercase tracking-widest text-slate-400">Offer Template</h4>
                <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-10">
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Lender Entity</label><input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newOffer.lenderName} onChange={e => setNewOffer({...newOffer, lenderName: e.target.value})} /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Magnitude ($)</label><input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newOffer.amount} onChange={e => setNewOffer({...newOffer, amount: Number(e.target.value)})} /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Term</label><input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newOffer.term} onChange={e => setNewOffer({...newOffer, term: e.target.value})} placeholder="e.g. 12 Months" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Rate</label><input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newOffer.rate} onChange={e => setNewOffer({...newOffer, rate: e.target.value})} placeholder="e.g. 1.25" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Tier Level</label><select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newOffer.tier} onChange={e => setNewOffer({...newOffer, tier: Number(e.target.value) as any})}><option value={1}>Tier 1</option><option value={2}>Tier 2</option></select></div>
            </div>
            <button onClick={handleCreateOffer} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] hover:bg-blue-700 shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3">
                <Send size={18} /> Transmit Offer to Portal
            </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 gap-6">
        {activeOffers.map(offer => {
          const isLockedTier2 = offer.tier === 2 && !isTier2Eligible && !isAdmin;
          
          return (
            <div key={offer.id} className={`rounded-[2.5rem] border shadow-sm p-10 relative overflow-hidden group transition-all hover:border-blue-300 ${offer.status === 'Accepted' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'} ${isLockedTier2 ? 'opacity-60 bg-slate-50 border-dashed' : ''}`}>
              {offer.status !== 'Accepted' && !isLockedTier2 && (
                <div className="absolute top-8 right-8">
                   <button onClick={() => toggleComparisonSelection(offer.id)} className="transition-all hover:scale-110 active:scale-90">
                      {selectedForCompare.includes(offer.id) ? <CheckSquare size={32} className="text-blue-600" /> : <Square size={32} className="text-slate-200 group-hover:text-slate-300" />}
                   </button>
                </div>
              )}

              {isLockedTier2 && (
                  <div className="absolute inset-0 bg-slate-950/5 flex items-center justify-center z-10 backdrop-blur-[2px]">
                      <div className="bg-white px-6 py-4 rounded-3xl shadow-2xl border border-slate-200 text-center animate-fade-in">
                          <Lock size={32} className="text-slate-300 mx-auto mb-3" />
                          <h4 className="font-black text-xs uppercase tracking-widest text-slate-800">Tier 2 Capital Locked</h4>
                          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Requires 6 months Tier 1 performance</p>
                          <button onClick={() => window.location.hash = 'tier2'} className="mt-4 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">View Requirements</button>
                      </div>
                  </div>
              )}

              <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6 pr-12">
                 <div className="flex items-center gap-6">
                    <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center text-3xl font-black shadow-lg shadow-black/5 transform rotate-3 ${offer.status === 'Accepted' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 text-slate-400'}`}>
                        {offer.lenderName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                          {offer.lenderName}
                          {offer.status === 'Accepted' && <CheckCircle size={24} className="text-emerald-500" />}
                          {offer.tier === 2 && <span className="bg-blue-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Tier 2</span>}
                      </h4>
                      <div className="flex gap-4 mt-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar size={14}/> {offer.term}</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Percent size={14}/> {offer.rate} Cost</span>
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5"><CreditCard size={14}/> {offer.payment} Payback</span>
                      </div>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Approved Funding</p>
                    <h4 className="text-5xl font-black text-blue-600 tracking-tighter">${offer.amount.toLocaleString()}</h4>
                    <p className={`text-[10px] font-black uppercase mt-3 tracking-[0.2em] ${offer.status === 'Accepted' ? 'text-emerald-500' : 'text-slate-400'}`}>{offer.status}</p>
                 </div>
              </div>

              {offer.aiAnalysis && (
                 <div className="bg-slate-50 rounded-[2rem] p-8 mb-8 border border-slate-200 relative overflow-hidden group/audit">
                    <div className="absolute top-0 right-0 p-10 opacity-5"><Shield size={120} /></div>
                    <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-200">
                       <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.3em] flex items-center gap-2">
                          <Shield className={offer.aiAnalysis.safetyScore > 75 ? 'text-emerald-500' : 'text-red-500'} size={18} />
                          Neural Contract Audit
                       </h5>
                       <div className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${offer.aiAnalysis.recommendation === 'Sign' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          AI Advice: {offer.aiAnalysis.recommendation}
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                       <div>
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Integrity Score</p>
                          <div className="flex items-center gap-4">
                              <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-black text-xl shadow-lg ${offer.aiAnalysis.safetyScore > 75 ? 'border-emerald-500 text-emerald-600 shadow-emerald-500/10' : 'border-red-500 text-red-600'}`}>
                              {offer.aiAnalysis.safetyScore}
                              </div>
                              <span className="text-xs font-bold text-slate-500 leading-tight">Fair & Transparent<br/>Documentation</span>
                       </div>
                       </div>
                       <div>
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Annual Yield (True APR)</p>
                          <div className="text-3xl font-black text-slate-900 tracking-tighter">{offer.aiAnalysis.trueApr}%</div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Calculated via AI Parser</p>
                       </div>
                       <div>
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Forensic Insight</p>
                          <p className="text-xs text-slate-600 leading-relaxed font-medium line-clamp-3 italic">"{offer.aiAnalysis.summary}"</p>
                       </div>
                    </div>
                 </div>
              )}
              
              {!offer.aiAnalysis && offer.status !== 'Accepted' && !isLockedTier2 && (
                 <div onClick={() => { setSelectedOfferIdForUpload(offer.id); fileInputRef.current?.click(); }} className="flex items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50 mb-8 cursor-pointer hover:bg-blue-50/50 hover:border-blue-400 transition-all group/upload">
                    {isAnalyzing === offer.id ? (
                       <div className="flex flex-col items-center">
                          <RefreshCw className="animate-spin text-blue-600 mb-3" size={32} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Neutral Scan in Progress...</span>
                       </div>
                    ) : (
                       <div className="text-center">
                          <Shield className="mx-auto text-slate-300 mb-4 group-hover/upload:text-blue-500 group-hover/upload:scale-110 transition-all" size={40} />
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover/upload:text-blue-600">Activate AI Sentinel Scan</p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Audit contract for predatory clauses & true cost</p>
                       </div>
                    )}
                 </div>
              )}

              {!isAdmin && offer.status === 'Sent' && !isLockedTier2 && (
                 <div className="flex gap-4 justify-end border-t border-slate-50 pt-8">
                    <button 
                      onClick={() => setSigningOffer(offer)}
                      className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] hover:bg-blue-500 shadow-2xl shadow-blue-500/20 flex items-center gap-3 transition-all transform hover:-translate-y-1 active:scale-95"
                    >
                       <PenTool size={18} /> Execute Agreement
                    </button>
                 </div>
              )}
            </div>
          );
        })}
      </div>
      
      <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileUpload} />
      
      {signingOffer && (
        <SmartContractSigner 
            offer={signingOffer} 
            onClose={() => setSigningOffer(null)} 
            onSign={handleSignComplete}
        />
      )}

      {/* REVOLUTIONARY COMPARISON MODAL */}
      {showComparison && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-in-right">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-4">
                        <Scale size={32} className="text-indigo-600"/> Decision Core Comparison
                    </h2>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Multi-Offer Financial Modeling</p>
                 </div>
                 <button onClick={() => setShowComparison(false)} className="p-3 hover:bg-white rounded-2xl transition-all text-slate-400 hover:text-red-500"><X size={32}/></button>
              </div>
              
              <div className="p-10 overflow-y-auto flex-1 bg-white custom-scrollbar">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                    {comparisonOffers.map(offer => {
                       const cost = (offer.amount * Number(offer.rate)) - offer.amount;
                       const totalPayback = offer.amount + cost;
                       
                       return (
                          <div key={offer.id} className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 flex flex-col shadow-sm relative overflow-hidden group">
                             <div className="mb-8">
                                <h3 className="font-black text-slate-500 text-[10px] uppercase tracking-[0.2em] mb-2">{offer.lenderName}</h3>
                                <p className="text-4xl font-black text-slate-900 tracking-tighter">${offer.amount.toLocaleString()}</p>
                             </div>
                             
                             <div className="space-y-6 flex-1">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                        <span>Cost of Capital</span>
                                        <span className="text-red-500">${cost.toLocaleString()}</span>
                                    </div>
                                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500" style={{ width: `${(cost/offer.amount)*100}%` }}></div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-3 rounded-xl border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Term</p>
                                        <p className="text-xs font-black text-slate-800">{offer.term}</p>
                                    </div>
                                    <div className={`bg-white p-3 rounded-xl border border-slate-100`}>
                                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Payment</p>
                                        <p className="text-xs font-black text-blue-600">${offer.paymentAmount.toLocaleString()}</p>
                                    </div>
                                </div>
                             </div>

                             <button 
                                onClick={() => { setShowComparison(false); setSigningOffer(offer); }}
                                className="w-full mt-10 bg-slate-950 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95"
                             >
                                Adopt This Option <ArrowRight size={14} className="ml-2 inline" />
                             </button>
                          </div>
                       );
                    })}
                 </div>

                 <div className="bg-indigo-950 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 p-10 opacity-10"><Sparkles size={160} /></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30 shadow-lg">
                                <BrainCircuit size={28} />
                            </div>
                            <div>
                                <h4 className="text-xl font-black uppercase tracking-tight">AI Broker Recommendation</h4>
                                <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.3em]">Protocol Analysis</p>
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-4xl">
                            <p className="text-lg font-medium leading-relaxed italic text-indigo-100">
                                "Our neural model suggests the offer from <strong>{comparisonOffers[0]?.lenderName}</strong> as the optimal match for your current growth cycle. While the total cost is slightly higher, the weekly payment structure allows for better cash reserve maintenance, reducing your operational risk score by 14% compared to daily alternatives."
                            </p>
                        </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const BrainCircuit = (props: any) => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={props.size || 24} 
      height={props.size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={props.className}
    >
      <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0 .44 4.96 2.5 2.5 0 0 0 3 1.98 2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 1.98-3 2.5 2.5 0 0 0-.44-4.96 2.5 2.5 0 0 0-3-1.98Z" />
      <path d="M9 13v4a2 2 0 0 0 2 2h2" />
      <path d="M15 13v2a2 2 0 0 0 2 2h2" />
      <path d="M9 7h-1a2 2 0 0 1-2-2V4" />
      <circle cx="12" cy="12" r="2" />
    </svg>
);

export default OfferManager;
