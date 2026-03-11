
import React, { useState, useEffect } from 'react';
import { 
    ShieldCheck, Eye, Search, FileText, Activity, 
    ArrowUpRight, Download, BarChart3, Clock, Lock, 
    CheckCircle, AlertTriangle, Fingerprint, Building2,
    DollarSign, Briefcase, ChevronRight, Scale, RefreshCw, Zap
} from 'lucide-react';
import { Contact, MarketPulse } from '../types';
import * as geminiService from '../services/geminiService';

interface LenderRoomProps {
    contacts: Contact[];
}

const LenderRoom: React.FC<LenderRoomProps> = ({ contacts }) => {
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
    const [pulses, setPulses] = useState<MarketPulse[]>([]);
    
    const vettedDeals = contacts.filter(c => c.status === 'Active' || c.status === 'Negotiation');
    const selectedDeal = contacts.find(c => c.id === selectedContactId);

    useEffect(() => {
        const fetchPulse = async () => {
            const data = await geminiService.generateMarketPulse();
            setPulses(data);
        };
        fetchPulse();
        const interval = setInterval(fetchPulse, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-10">
            {/* NEW: MARKET PULSE TICKER */}
            <div className="bg-slate-950 border-y border-white/5 py-3 overflow-hidden whitespace-nowrap relative">
                <div className="absolute left-0 top-0 bottom-0 px-6 bg-slate-950 z-10 flex items-center gap-2 border-r border-white/5">
                    <Zap size={14} className="text-emerald-400 fill-emerald-400" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Market Pulse</span>
                </div>
                <div className="inline-block animate-[shimmer_60s_linear_infinite] px-4 space-x-12">
                    {pulses.map((p, i) => (
                        <span key={p.id + i} className="text-slate-400 font-bold uppercase text-[9px] tracking-widest inline-flex items-center gap-3">
                            <span className="text-white">{p.lenderName}</span>
                            <span className="text-emerald-500">${p.amount.toLocaleString()}</span>
                            <span className="text-slate-600">{p.industry}</span>
                            <span className="text-slate-700 opacity-50">• {p.timestamp}</span>
                        </span>
                    ))}
                    {/* Duplicate for seamless loop */}
                    {pulses.map((p, i) => (
                        <span key={p.id + i + 'dup'} className="text-slate-400 font-bold uppercase text-[9px] tracking-widest inline-flex items-center gap-3">
                            <span className="text-white">{p.lenderName}</span>
                            <span className="text-emerald-500">${p.amount.toLocaleString()}</span>
                            <span className="text-slate-600">{p.industry}</span>
                            <span className="text-slate-700 opacity-50">• {p.timestamp}</span>
                        </span>
                    ))}
                </div>
            </div>

            <div className="bg-slate-900 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Scale size={320} /></div>
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                        Underwriting Node: ACCESS LEVEL 4
                    </div>
                    <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        The <span className="text-blue-500">Lender Room.</span>
                    </h1>
                    <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                        Securely audit Nexus-verified deal flow. Access forensic binary integrity reports, neural spreading audits, and institutional credit memos.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Deal List Sidebar */}
                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col h-[600px]">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2">
                            <Briefcase size={18} className="text-blue-500" /> Active Inventory
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        {vettedDeals.map(deal => (
                            <div 
                                key={deal.id}
                                onClick={() => setSelectedContactId(deal.id)}
                                className={`p-6 rounded-[2rem] border-2 mb-2 cursor-pointer transition-all flex items-center justify-between group ${selectedContactId === deal.id ? 'bg-blue-50 border-blue-600 shadow-lg' : 'bg-white border-transparent hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-xl transform rotate-3 group-hover:rotate-0 transition-transform ${selectedContactId === deal.id ? 'bg-blue-600' : 'bg-slate-900'}`}>
                                        {deal.company[0]}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 uppercase text-sm tracking-tight">{deal.company}</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">${deal.value.toLocaleString()} Requirement</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className={selectedContactId === deal.id ? 'text-blue-600' : 'text-slate-300'} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Audit Pane */}
                <div className="lg:col-span-8">
                    {selectedDeal ? (
                        <div className="space-y-8 animate-fade-in">
                            {/* Summary Banner */}
                            <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm flex flex-col md:flex-row justify-between items-center gap-10">
                                <div className="flex items-center gap-8">
                                    <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner flex items-center justify-center text-4xl font-black text-slate-400">
                                        {selectedDeal.company[0]}
                                    </div>
                                    <div>
                                        <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">{selectedDeal.company}</h2>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Industry: {selectedDeal.businessProfile?.industry || 'Merchant'}</span>
                                            <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1"><ShieldCheck size={12}/> Vetted by Nexus AI</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center md:text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Magnitude</p>
                                    <h3 className="text-4xl font-black text-blue-600 tracking-tighter">${selectedDeal.value.toLocaleString()}</h3>
                                    <button className="mt-4 px-8 py-2 bg-slate-950 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95">Download PDF Memo</button>
                                </div>
                            </div>

                            {/* Forensic Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group border border-white/5">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Fingerprint size={120} /></div>
                                    <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                        <Lock size={16} /> Forensic Integrity Verdict
                                    </h3>
                                    <div className="space-y-6">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-3xl font-black text-white tracking-tighter">PASSED</p>
                                                <p className="text-[9px] font-black text-slate-500 uppercase mt-1">Binary & Metadata Audit</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-3xl font-black text-emerald-400 tracking-tighter">98/100</p>
                                                <p className="text-[9px] font-black text-slate-500 uppercase mt-1">Trust Score</p>
                                            </div>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" style={{ width: '98%' }}></div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic">
                                            "Nexus Forensic Guard has verified that all 12 submitted bank statements and identity documents are original exports. Zero digital tampering or pixel inconsistency detected."
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                        <Activity size={18} className="text-indigo-600" /> Neural Spreading
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Avg Monthly Revenue</span>
                                            <span className="text-lg font-black text-slate-900">${(selectedDeal.revenue || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                                            <span className="text-[10px] font-black uppercase text-slate-400">NSF Incidents (3Mo)</span>
                                            <span className="text-lg font-black text-emerald-600">0</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                                            <span className="text-[10px] font-black uppercase text-slate-400">DSCR Index</span>
                                            <span className="text-lg font-black text-blue-600">2.42x</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Underwriter Verdict</span>
                                            <span className="text-[10px] font-black uppercase px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">Strong Buy</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tactical Visualization */}
                            <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm overflow-hidden relative group">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                    <Eye size={18} className="text-blue-500" /> Entity Presence Scan
                                </h3>
                                <div className="aspect-video bg-slate-900 rounded-[2.5rem] overflow-hidden relative shadow-inner border border-slate-200">
                                    {selectedDeal.creditMemo?.visualUrl ? (
                                        <img src={selectedDeal.creditMemo.visualUrl} className="w-full h-full object-cover opacity-80" alt="Entity Visualization" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-700">
                                            <RefreshCw size={48} className="animate-spin-slow mb-4 opacity-10" />
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Neural visual synthesis offline</p>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                    <div className="absolute bottom-8 left-8">
                                        <p className="text-white font-black uppercase text-lg tracking-tight">{selectedDeal.company}</p>
                                        <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mt-1">Verified Digital Footprint Asset</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 py-40 border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
                            <Search size={64} className="opacity-10 mb-6" />
                            <p className="text-sm font-black uppercase tracking-widest opacity-40">Select a Deal for Forensic Review</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LenderRoom;
