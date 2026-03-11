
import React, { useState, useEffect } from 'react';
import { Contact, FundingOffer, FinancialMonth } from '../types';
import { Calculator, Zap, DollarSign, TrendingUp, ShieldCheck, AlertCircle, RefreshCw, CheckCircle, BarChart3, AlertOctagon, Calendar, Info, Layers, ShieldAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as geminiService from '../services/geminiService';

interface DealStructureProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const DealStructure: React.FC<DealStructureProps> = ({ contact, onUpdateContact }) => {
  const [amount, setAmount] = useState(50000);
  const [term, setTerm] = useState(12); // Months
  const [factor, setFactor] = useState(1.25);
  const [freq, setFreq] = useState<'Daily' | 'Weekly'>('Weekly');
  const [margin, setMargin] = useState(30); // ROI Margin %
  
  // Local Forensic State
  const [localMonths, setLocalMonths] = useState<FinancialMonth[]>(contact.financialSpreading?.months || []);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  useEffect(() => {
    if (contact.financialSpreading?.months) {
        setLocalMonths(contact.financialSpreading.months);
    }
  }, [contact.financialSpreading?.months]);

  // --- REVENUE & ELIGIBILITY CALCULATIONS ---
  const avgMonthlyRevenue = localMonths.length > 0 
    ? localMonths.reduce((acc, m) => acc + m.revenue, 0) / localMonths.length 
    : (contact.revenue || 0);

  const totalNSFs = localMonths.reduce((acc, m) => acc + m.nsfCount, 0);
  
  // Tier 2 Eligibility Logic (Revenue Based)
  const TIER2_REV_THRESHOLD = 15000;
  const isTier2RevenueQualified = avgMonthlyRevenue >= TIER2_REV_THRESHOLD && totalNSFs <= 2;
  
  // Risk Cap: Usually lenders don't fund more than 1.5x monthly revenue for MCA
  const revenueCap = avgMonthlyRevenue * 1.5;
  const leverageRatio = amount / (avgMonthlyRevenue || 1);
  const isOverLeveraged = amount > revenueCap;

  // --- Financial Modeling ---
  const payback = amount * factor;
  const costOfCapital = payback - amount;
  const numPayments = freq === 'Daily' ? term * 21 : term * 4; 
  const paymentAmount = payback / numPayments;
  
  const grossReturn = amount * (1 + margin / 100);
  const netProfit = grossReturn - payback;
  const roiPercent = (netProfit / amount) * 100;

  const chartData = [
    { name: 'Structure', Principal: amount, Interest: costOfCapital, Profit: netProfit > 0 ? netProfit : 0 }
  ];

  const handleUpdateForensics = (idx: number, field: 'nsfCount' | 'negativeDays', val: string) => {
      const num = parseInt(val) || 0;
      const updated = [...localMonths];
      updated[idx] = { ...updated[idx], [field]: num };
      setLocalMonths(updated);
      
      onUpdateContact({
          ...contact,
          financialSpreading: {
              ...contact.financialSpreading!,
              months: updated
          }
      });
  };

  const handleAIAnalyze = async () => {
    if (!contact.financialSpreading && localMonths.length === 0) {
      alert("No financial data available. Please run the Bank Statement Analyzer first.");
      return;
    }
    setIsAnalyzing(true);
    const result = await geminiService.analyzeDealStructure({ ...contact.financialSpreading!, months: localMonths }, amount);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const applyOption = (opt: any) => {
    setAmount(opt.amount);
    const termNum = parseInt(opt.term) || 12;
    setTerm(termNum);
    setFactor(opt.rate);
    setFreq(opt.freq);
  };

  const handleCreateOffer = () => {
    const newOffer: FundingOffer = {
      id: `off_${Date.now()}`,
      lenderName: isTier2RevenueQualified && amount >= 100000 ? 'Nexus Institutional' : 'Direct Internal Funding',
      amount: amount,
      term: `${term} Months`,
      rate: factor.toString(),
      payment: freq,
      paymentAmount: Math.round(paymentAmount),
      status: 'Sent',
      dateSent: new Date().toLocaleDateString(),
      stips: 'Standard',
      tier: isTier2RevenueQualified && amount >= 100000 ? 2 : 1
    };
    
    onUpdateContact({
      ...contact,
      offers: [...(contact.offers || []), newOffer],
      activities: [...(contact.activities || []), {
        id: `act_struct_${Date.now()}`,
        type: 'system' as const,
        description: `Structured ${newOffer.tier === 2 ? 'Tier 2' : 'Tier 1'} offer: $${amount.toLocaleString()} at ${factor} factor. Revenue leverage: ${leverageRatio.toFixed(2)}x.`,
        date: new Date().toLocaleString(),
        user: 'Admin'
      }],
      status: 'Negotiation'
    });
    
    alert(`Offer created! This has been classified as a Tier ${newOffer.tier} deal.`);
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in">
      
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-[2rem] shadow-lg relative overflow-hidden border border-white/5">
         <div className="relative z-10">
            <h2 className="text-2xl font-black flex items-center gap-2 uppercase tracking-tighter"><Calculator className="text-blue-400" /> Structure Protocol</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Revenue-Based Underwriting Engine</p>
         </div>
         <div className="relative z-10 flex gap-4">
            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-all ${isTier2RevenueQualified ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                <ShieldCheck size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">{isTier2RevenueQualified ? 'Tier 2 Revenue Qualified' : 'Tier 1 Protocol Only'}</span>
            </div>
            <button 
              onClick={handleAIAnalyze}
              disabled={isAnalyzing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
            >
               {isAnalyzing ? <RefreshCw className="animate-spin" size={14}/> : <Zap size={14} className="fill-yellow-400 text-yellow-400" />}
               {isAnalyzing ? 'Underwriting...' : 'Execute AI Audit'}
            </button>
         </div>
         <div className="absolute right-0 top-0 opacity-10 p-4 rotate-12 -translate-y-6"><TrendingUp size={180} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Monthly Revenue</p>
            <p className="text-2xl font-black text-slate-900 tracking-tight">${avgMonthlyRevenue.toLocaleString()}</p>
            <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-[10px] font-black uppercase mb-1">
                    <span className="text-slate-400">Leverage Index</span>
                    <span className={isOverLeveraged ? 'text-red-500' : 'text-emerald-500'}>{leverageRatio.toFixed(2)}x</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${isOverLeveraged ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (leverageRatio / 1.5) * 100)}%` }}></div>
                </div>
            </div>
         </div>

         <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Max Revenue Cap</p>
            <p className="text-2xl font-black text-slate-900 tracking-tight">${revenueCap.toLocaleString()}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase mt-2 italic">Standard 1.5x Multiplier</p>
         </div>

         <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-2">Tier 2 Readiness</p>
            <div className={`flex items-center gap-2 text-xs font-black uppercase ${isTier2RevenueQualified ? 'text-emerald-600' : 'text-slate-400'}`}>
                {isTier2RevenueQualified ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
                {isTier2RevenueQualified ? 'Qualified' : 'Criteria Not Met'}
            </div>
         </div>

         <div className={`p-6 rounded-[2.5rem] border flex flex-col justify-center shadow-sm relative overflow-hidden group ${isOverLeveraged ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-110 transition-transform"><ShieldAlert size={64} /></div>
            <p className="text-[10px] uppercase font-black tracking-widest opacity-70">Leverage Warning</p>
            <p className="text-lg font-black tracking-tight uppercase">{isOverLeveraged ? 'Over-Leveraged' : 'Nominal Risk'}</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
         <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-8">
            <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-4">Modeling Workspace</h3>
            
            <div className="space-y-8">
               <div>
                  <div className="flex justify-between mb-3">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Liquidity</label>
                     <span className={`text-sm font-black ${isOverLeveraged ? 'text-red-500' : 'text-blue-600'}`}>${amount.toLocaleString()}</span>
                  </div>
                  <input type="range" min="5000" max="250000" step="5000" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
               </div>

               <div>
                  <div className="flex justify-between mb-3">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Factor Multiplier</label>
                     <span className="text-sm font-black text-blue-600">{factor.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="1.10" max="1.55" step="0.01" value={factor} onChange={(e) => setFactor(Number(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
               </div>

               <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <ShieldAlert size={14} className="text-amber-500" /> Audit Override
                    </h4>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{localMonths.length} Statements Active</span>
                  </div>
                  
                  <div className="space-y-3">
                    {localMonths.map((m, i) => (
                        <div key={i} className="grid grid-cols-3 gap-3 items-center">
                            <span className="text-[10px] font-black text-slate-600 uppercase truncate">{m.month}</span>
                            <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-red-400">NSF</span>
                                <input 
                                    type="number" 
                                    value={m.nsfCount} 
                                    onChange={(e) => handleUpdateForensics(i, 'nsfCount', e.target.value)}
                                    className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-red-600 outline-none"
                                />
                            </div>
                            <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-amber-400">NEG</span>
                                <input 
                                    type="number" 
                                    value={m.negativeDays} 
                                    onChange={(e) => handleUpdateForensics(i, 'negativeDays', e.target.value)}
                                    className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-amber-600 outline-none"
                                />
                            </div>
                        </div>
                    ))}
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Term Duration</label>
                     <select value={term} onChange={(e) => setTerm(Number(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase outline-none">
                        {[3, 4, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m} Months</option>)}
                     </select>
                  </div>
                  <div>
                     <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Frequency</label>
                     <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                        <button onClick={() => setFreq('Daily')} className={`flex-1 text-[10px] font-black uppercase py-2 rounded-lg transition-all ${freq === 'Daily' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>Daily</button>
                        <button onClick={() => setFreq('Weekly')} className={`flex-1 text-[10px] font-black uppercase py-2 rounded-lg transition-all ${freq === 'Weekly' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>Weekly</button>
                     </div>
                  </div>
               </div>
            </div>
         </div>

         <div className="flex flex-col gap-6">
            <div className="bg-slate-950 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><DollarSign size={100} /></div>
               <div className="grid grid-cols-2 gap-8 relative z-10">
                  <div>
                     <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Payload</p>
                     <p className="text-3xl font-black tracking-tighter">${payback.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Est. Pmt ({freq})</p>
                     <p className="text-4xl font-black text-emerald-400 tracking-tighter">${Math.round(paymentAmount).toLocaleString()}</p>
                  </div>
               </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex-1 flex flex-col">
               <h4 className="text-[10px] font-black text-slate-400 mb-8 flex items-center gap-2 uppercase tracking-widest"><BarChart3 size={18} className="text-indigo-500" /> Economic Yield Analysis</h4>
               <div className="flex-1 w-full min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={chartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Tooltip contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                        <Bar dataKey="Principal" stackId="a" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Interest" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Profit" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
               
               <div className="mt-8 p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 flex justify-between items-center shadow-inner">
                  <div>
                     <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Net Alpha Yield</p>
                     <p className="text-2xl font-black text-emerald-600 tracking-tighter">${Math.round(netProfit).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">ROI Magnitude</p>
                     <p className="text-2xl font-black text-emerald-600 tracking-tighter">{roiPercent.toFixed(1)}%</p>
                  </div>
               </div>
            </div>

            <button 
               onClick={handleCreateOffer}
               className="w-full bg-slate-950 text-white font-black py-6 rounded-[2rem] hover:bg-blue-600 shadow-2xl transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-[0.3em] transform active:scale-95"
            >
               <CheckCircle size={24} /> Manifest Formal Protocol
            </button>
         </div>

      </div>
    </div>
  );
};

export default DealStructure;
