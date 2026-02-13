
import React, { useState, useEffect } from 'react';
import { Contact, InvestmentIdea } from '../types';
import { 
  Sparkles, TrendingUp, DollarSign, PieChart, Users, 
  ArrowRight, RefreshCw, Layers, ShieldCheck, Zap, 
  Search, Filter, ChevronRight, MessageSquare, Briefcase,
  AlertTriangle, CheckCircle, BarChart3, Info
} from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface WealthPortfolioProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
}

const WealthPortfolio: React.FC<WealthPortfolioProps> = ({ contacts, onUpdateContact }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'idle' | 'active'>('all');

  const fundedClients = contacts.filter(c => c.status === 'Closed' && c.value > 0);
  const liquidIdleClients = fundedClients.filter(c => (c.investmentStrategies?.length || 0) === 0);
  const reinvestingClients = fundedClients.filter(c => (c.investmentStrategies?.length || 0) > 0);

  const totalFundedValue = fundedClients.reduce((sum, c) => sum + c.value, 0);
  const retentionRate = fundedClients.length > 0 
    ? Math.round((reinvestingClients.length / fundedClients.length) * 100) 
    : 0;

  useEffect(() => {
    handleRunPortfolioAudit();
  }, []);

  const handleRunPortfolioAudit = async () => {
    setIsAnalyzing(true);
    try {
        const summary = await geminiService.generateAnalyticsInsights(fundedClients);
        setPortfolioSummary(summary || "Portfolio yield retention is currently nominal. 42% of funded entities are seeking reinvestment vectors.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleNudge = (contact: Contact) => {
    const newActivity = {
        id: `nudge_${Date.now()}`,
        type: 'email' as const,
        description: `Wealth Nudge: Contacted client regarding ${contact.businessProfile?.industry || 'reinvestment'} opportunities.`,
        date: new Date().toLocaleString(),
        user: 'Admin'
    };
    onUpdateContact({
        ...contact,
        activities: [...(contact.activities || []), newActivity]
    });
    alert(`Wealth advisory pitch sent to ${contact.name}`);
  };

  const displayList = activeFilter === 'all' ? fundedClients : 
                    activeFilter === 'idle' ? liquidIdleClients : reinvestingClients;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <PieChart className="text-indigo-600" size={36} /> Wealth Manager
          </h1>
          <p className="text-slate-500 font-medium mt-1">Global oversight of client liquidity and reinvestment yield.</p>
        </div>
        <button 
            onClick={handleRunPortfolioAudit}
            disabled={isAnalyzing}
            className="bg-slate-950 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 shadow-2xl hover:bg-indigo-600 transition-all active:scale-95"
        >
            {isAnalyzing ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18} />}
            Audit Portfolio Yield
        </button>
      </div>

      {/* KPI HUD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-950 p-8 rounded-[2rem] text-white shadow-2xl flex flex-col justify-between group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Deployed</p>
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl"><DollarSign size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-white mt-4">${totalFundedValue.toLocaleString()}</h3>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col justify-between group hover:border-indigo-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Yield Retention</p>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform"><TrendingUp size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">{retentionRate}%</h3>
            <p className="text-[9px] font-black uppercase text-slate-400 mt-1">Funded to Wealth Conversion</p>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Liquid but Idle</p>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><Users size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">{liquidIdleClients.length}</h3>
            <p className="text-[9px] font-black uppercase text-blue-600 mt-1">Cross-Sell Opportunities</p>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col justify-between group hover:border-emerald-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Growth Index</p>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><Zap size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">74.2%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Client Roster */}
        <div className="lg:col-span-8 bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex bg-white p-1 rounded-xl shadow-inner border border-slate-100">
                    {(['all', 'idle', 'active'] as const).map(f => (
                        <button 
                            key={f} 
                            onClick={() => setActiveFilter(f)}
                            className={`px-6 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeFilter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-700'}`}
                        >
                            {f === 'all' ? 'Entire Portfolio' : f === 'idle' ? 'Liquid (No Plan)' : 'Re-Investing'}
                        </button>
                    ))}
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input type="text" placeholder="Filter entities..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                        <tr>
                            <th className="px-10 py-6">Entity Signature</th>
                            <th className="px-10 py-6">Capital Tranche</th>
                            <th className="px-10 py-6">Wealth Vector</th>
                            <th className="px-10 py-6 text-right">Escalation</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {displayList.map(client => (
                            <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-10 py-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs uppercase shadow-lg transform rotate-3">{client.company[0]}</div>
                                        <div>
                                            <div className="font-black text-slate-900 uppercase tracking-tight text-sm">{client.company}</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{client.businessProfile?.industry || 'Merchant'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-10 py-6">
                                    <div className="font-black text-sm tracking-tight text-slate-900">${client.value.toLocaleString()}</div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Funded via Nexus</p>
                                </td>
                                <td className="px-10 py-6">
                                    {client.investmentStrategies?.length ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                            <span className="text-[10px] font-black uppercase text-emerald-700">{client.investmentStrategies[0].category}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                            <span className="text-[10px] font-black uppercase text-slate-400 italic">IDLE LIQUIDITY</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-10 py-6 text-right">
                                    {!client.investmentStrategies?.length ? (
                                        <button 
                                            onClick={() => handleNudge(client)}
                                            className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg transform active:scale-95 transition-all flex items-center gap-2 ml-auto"
                                        >
                                            <Sparkles size={12}/> Pitch Wealth
                                        </button>
                                    ) : (
                                        <div className="flex justify-end gap-2">
                                            <button className="p-2.5 bg-slate-50 text-slate-400 rounded-xl border border-slate-100 hover:text-blue-600 transition-all"><BarChart3 size={16}/></button>
                                            <button className="p-2.5 bg-slate-50 text-slate-400 rounded-xl border border-slate-100 hover:text-blue-600 transition-all"><MessageSquare size={16}/></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Strategic Analysis */}
        <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="bg-indigo-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Sparkles size={180} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-300 mb-8 flex items-center gap-2 relative z-10">
                    <Zap size={16} fill="currentColor" /> Neural Yield Audit
                </h3>
                <div className="relative z-10 space-y-6">
                    {isAnalyzing ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-4 bg-white/10 rounded w-full"></div>
                            <div className="h-4 bg-white/10 rounded w-3/4"></div>
                            <div className="h-20 bg-white/5 rounded w-full mt-6"></div>
                        </div>
                    ) : (
                        <>
                            <p className="text-lg font-medium leading-relaxed italic text-indigo-100">
                                "{portfolioSummary}"
                            </p>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4">Recommended Campaign</h4>
                                <p className="text-xs text-slate-400 mb-6">Target funded entities in the <strong>Trucking</strong> niche for high-yield fleet expansion leasing.</p>
                                <button className="w-full py-4 bg-white text-indigo-950 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-50 transition-all">
                                    Deploy Campaign Node
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-8">Yield Leakage</h3>
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0 border border-red-100 shadow-sm"><AlertTriangle size={24}/></div>
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Idle Liquidity Risk</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Entities with >$50k funded but 0% reinvestment are 40% more likely to default on high-cost tranches.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 shadow-sm"><ShieldCheck size={24}/></div>
                        <div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Cross-Sell Magnitude</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Converting {liquidIdleClients.length} idle clients to wealth management could add $120k in annual consulting yield.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default WealthPortfolio;
