
import React, { useState, useEffect } from 'react';
import { Contact, Tier2Data, FundedDeal } from '../types';
import { 
    Zap, Sparkles, TrendingUp, ShieldCheck, DollarSign, 
    ArrowRight, RefreshCw, Calculator, Lock, Info, 
    CheckCircle, ListChecks, Smartphone, Clock, CreditCard,
    PlayCircle, Shield, AlertTriangle, Layers
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { sanitizeAIHtml } from '../utils/security';

interface Tier2StrategyProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const Tier2Strategy: React.FC<Tier2StrategyProps> = ({ contact, onUpdateContact }) => {
  const [coaching, setCoaching] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [reserveInput, setReserveInput] = useState<string>('');
  
  const activeDeal = contact.fundedDeals?.find(d => d.status === 'Active');
  const tier2 = contact.tier2Data || {
      reserveBalance: 0,
      monthsReserveGoal: 6,
      paymentsMadeCount: activeDeal?.paymentsMade || 0,
      isEligibleForTier2: false
  };

  const limit = activeDeal?.originalAmount || 0;
  const estMinPayment = Math.max(50, limit * 0.015); 
  const reserveGoalAmount = estMinPayment * tier2.monthsReserveGoal;
  
  const progressPercent = Math.min(100, (tier2.reserveBalance / reserveGoalAmount) * 100);

  useEffect(() => {
    const fetchCoaching = async () => {
      setIsLoading(true);
      const res = await geminiService.generateTier2Strategy(contact);
      setCoaching(res);
      setIsLoading(false);
    };
    fetchCoaching();
  }, [contact.id]);

  const handleUpdateReserve = () => {
      const val = parseFloat(reserveInput);
      if (isNaN(val)) return;
      const updatedTier2: Tier2Data = {
          ...tier2,
          reserveBalance: val,
          isEligibleForTier2: val >= reserveGoalAmount && tier2.paymentsMadeCount >= 6
      };
      onUpdateContact({ ...contact, tier2Data: updatedTier2 });
      setReserveInput('');
  };

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><TrendingUp size={280} /></div>
        <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                Phase 3: Liquidation & Seasoning
            </div>
            <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                Card to <span className="text-emerald-500">Capital.</span>
            </h1>
            <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                Your 0% lines are the bridge. We teach you how to liquidate them safely while maintaining the 6-month reserve required for the $1M SBA Application.
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
         <div className="lg:col-span-7 space-y-8">
            <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-200 relative overflow-hidden">
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-10 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500" /> Strategic AI Protocol
                </h3>
                {isLoading ? (
                    <div className="space-y-4 animate-pulse">
                        <div className="h-4 bg-slate-100 rounded w-full"></div>
                        <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                        <div className="h-20 bg-slate-100 rounded w-full mt-10"></div>
                    </div>
                ) : (
                    <div className="prose prose-lg prose-slate max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: coaching }} />
                    </div>
                )}
            </div>

            <div className="bg-slate-950 rounded-[3.5rem] p-10 text-white shadow-2xl relative border border-white/5">
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-blue-400 mb-8 flex items-center gap-2">
                    <PlayCircle size={16} /> Card Liquidation SOP
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl group hover:bg-white/10 transition-all">
                        <h4 className="font-black text-xs uppercase text-blue-400 mb-2">The Vendor Loop</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Use Melio or Plastiq to pay your business rent or suppliers. This triggers a 'Business Purchase' on your 0% card while depositing clean cash in your operating account.</p>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl group hover:bg-white/10 transition-all">
                        <h4 className="font-black text-xs uppercase text-emerald-400 mb-2">Inventory Flip</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Utilize credit lines to purchase resellable assets. This method converts credit to inventory, which flips back to high-velocity bank deposits.</p>
                    </div>
                </div>
            </div>
         </div>

         <div className="lg:col-span-5 space-y-8">
            <div className="bg-white rounded-[3rem] border border-slate-200 p-10 shadow-sm">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-8">SBA Bankability Meter</h3>
                <div className="space-y-6">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Reserve</p>
                            <p className="text-3xl font-black text-blue-600">${reserveGoalAmount.toLocaleString()}</p>
                        </div>
                        <p className="text-lg font-black text-slate-900">{Math.round(progressPercent)}%</p>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_10px_#10b981]" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                    <div className="pt-8 border-t border-slate-100">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Manual Balance Sync ($)</label>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                value={reserveInput}
                                onChange={e => setReserveInput(e.target.value)}
                                placeholder="Enter daily balance..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold"
                            />
                            <button onClick={handleUpdateReserve} className="bg-slate-950 text-white px-6 rounded-xl hover:bg-blue-600 transition-all">Sync</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="p-8 bg-blue-50 rounded-[2.5rem] border border-blue-100 flex items-start gap-4">
                <Info size={24} className="text-blue-600 mt-1" />
                <p className="text-xs text-blue-800 leading-relaxed font-medium">
                    The SBA requires a consistent Average Daily Balance. Maintaining this 6-month reserve while your 0% cards are on Auto-Pay forces the algorithm to approve the $1M tranches.
                </p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Tier2Strategy;
