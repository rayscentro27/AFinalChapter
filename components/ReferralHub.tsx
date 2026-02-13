
import React, { useState } from 'react';
import { Contact } from '../types';
import { 
    Share2, Copy, Users, DollarSign, TrendingUp, CheckCircle, 
    Clock, Crown, Zap, ShieldCheck, ArrowRight, Sparkles, Award, Star
} from 'lucide-react';

interface ReferralHubProps {
  contact: Contact;
}

const ReferralHub: React.FC<ReferralHubProps> = ({ contact }) => {
  const [copied, setCopied] = useState(false);
  
  const stats = contact.referralData || {
    totalClicks: 0,
    totalSignups: 0,
    commissionPending: 0,
    commissionPaid: 0,
    referralLink: `https://nexus.funding/ref/${contact.id}`,
    leads: []
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(stats.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine Partner Level
  const isPartner = stats.totalSignups >= 5;

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      
      {/* Premium Header */}
      <div className="bg-slate-950 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Crown size={280} /></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                    Ecosystem Partnership
                </div>
                <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                    Become the <span className="text-blue-500">Node.</span>
                </h1>
                <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                    Our most successful clients don't just use capital—they expand the network. When you refer businesses to Nexus, you accelerate your own Tier 2 eligibility and earn direct liquidity.
                </p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 text-center shadow-inner min-w-[300px]">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Your Personal Node Link</p>
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 mb-6 font-mono text-xs text-blue-400 truncate">
                    {stats.referralLink}
                </div>
                <button 
                    onClick={handleCopy}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-500 shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                    {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                    {copied ? 'Link Synchronized' : 'Copy Access Link'}
                </button>
            </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Earnings</p>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><DollarSign size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">${(stats.commissionPaid + stats.commissionPending).toLocaleString()}</h3>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referral Count</p>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><Users size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">{stats.totalSignups} Entities</h3>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-indigo-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ecosystem Impact</p>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform"><Zap size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">{isPartner ? 'HIGH' : 'ACTIVE'}</h3>
        </div>

        <div className="bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-2xl flex flex-col justify-between group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Node Level</p>
                <div className="p-3 bg-blue-500/20 text-blue-400 rounded-2xl"><Star size={20} fill="currentColor"/></div>
            </div>
            <div className="mt-4">
                <h3 className="text-3xl font-black text-white">{isPartner ? 'PARTNER' : 'CLIENT'}</h3>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">Tier 2 Ready: {isPartner ? 'YES' : 'NO'}</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Referrals List */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2"><Users size={18} className="text-blue-500"/> Network Activity</h3>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                        <tr>
                            <th className="px-10 py-6">Entity</th>
                            <th className="px-10 py-6">Date Registered</th>
                            <th className="px-10 py-6">Phase</th>
                            <th className="px-10 py-6 text-right">Yield</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.leads.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-20 text-center flex flex-col items-center">
                                    <Sparkles size={48} className="opacity-10 mb-4" />
                                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Node activity dormant</p>
                                </td>
                            </tr>
                        ) : stats.leads.map((lead: any) => (
                            <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-10 py-6">
                                    <div className="font-black text-slate-900 uppercase tracking-tight text-sm">{lead.name}</div>
                                </td>
                                <td className="px-10 py-6 text-xs font-bold text-slate-500 uppercase">{lead.date}</td>
                                <td className="px-10 py-6">
                                    <span className={`text-[9px] uppercase font-black px-3 py-1 rounded-full border ${
                                        lead.status === 'Funded' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                                    }`}>
                                        {lead.status}
                                    </span>
                                </td>
                                <td className="px-10 py-6 text-right font-black text-sm text-slate-900">
                                    {lead.commission > 0 ? `$${lead.commission}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Benefits Sidebar */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-blue-500" /> Partner Rewards
                </h3>
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 shadow-sm"><DollarSign size={18}/></div>
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Direct Liquidity</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Earn $500 - $2,500 per funded referral. Paid via Stripe Instant Payouts.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm"><TrendingUp size={18}/></div>
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Tier 2 Acceleration</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Referring 5+ businesses proves your industry leadership, skipping you to Tier 2 funding levels faster.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 shadow-sm"><Award size={18}/></div>
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Elite Networking</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Access private investor rounds and pre-IPO deal flow for your business.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Sparkles size={120} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-2">Partner Support</h3>
                <p className="text-sm font-bold leading-relaxed mb-8">Need co-branded marketing assets to share with your network?</p>
                <button className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transform active:scale-95 transition-all">
                    Access Asset Hub
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralHub;
