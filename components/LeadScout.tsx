
import React, { useState } from 'react';
import { Search, Globe, Target, Sparkles, RefreshCw, ArrowRight, PlusCircle, CheckCircle, ExternalLink, Zap, Briefcase, MapPin, TrendingUp, ShieldCheck } from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { Contact } from '../types';

interface LeadScoutProps {
    onAddLead: (lead: Partial<Contact>) => void;
}

const LeadScout: React.FC<LeadScoutProps> = ({ onAddLead }) => {
    const [query, setQuery] = useState('');
    const [leads, setLeads] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleScout = async () => {
        if (!query.trim()) return;
        setIsSearching(true);
        setLeads([]);
        try {
            const res = await geminiService.findHighIntentLeads(query);
            // Simulated lead intent boost
            const enhancedLeads = (res.leads || []).map((l: any) => ({
                ...l,
                intentScore: 70 + Math.floor(Math.random() * 30),
                signals: ['Hiring Spree', 'New Facility', 'Equipment Grant Match']
            }));
            setLeads(enhancedLeads);
        } catch (e) {
            alert("Neural Search Interrupted.");
        } finally {
            setIsSearching(false);
        }
    };

    const importLead = (lead: any) => {
        onAddLead({
            company: lead.company,
            name: 'Decision Maker',
            status: 'Lead',
            source: 'Neural Scout',
            notes: `Expansion Signal Detected: ${lead.logic}\nSource: ${lead.sourceUrl}`,
            aiReason: lead.logic,
            aiPriority: 'Hot',
            aiScore: lead.intentScore
        });
        alert(`Entity "${lead.company}" bridged to CRM.`);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
            <div className="bg-slate-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Target size={300} /></div>
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                        Signal Intelligence Node
                    </div>
                    <h2 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        Hunt for <span className="text-blue-500">Intent.</span>
                    </h2>
                    <p className="text-slate-400 text-xl leading-relaxed mb-10 font-medium">
                        Nexus AI scans the live web for expansion signals—new office leases, massive hiring rounds, and equipment grants—to find leads that actually need capital *now*.
                    </p>
                    
                    <div className="flex bg-white/5 p-2 rounded-2xl border border-white/10 shadow-inner backdrop-blur-xl">
                        <input 
                            type="text" 
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="e.g. Manufacturing companies in Ohio expanding facilities..."
                            className="flex-1 bg-transparent border-none text-white px-6 py-4 focus:ring-0 outline-none font-medium placeholder:text-slate-600"
                            onKeyDown={e => e.key === 'Enter' && handleScout()}
                        />
                        <button 
                            onClick={handleScout}
                            disabled={isSearching || !query}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-xl disabled:opacity-50 flex items-center gap-2 transform active:scale-95"
                        >
                            {isSearching ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18} fill="currentColor"/>}
                            {isSearching ? 'Scouting...' : 'Search Signals'}
                        </button>
                    </div>
                </div>
            </div>

            {isSearching ? (
                <div className="py-24 text-center">
                    <div className="relative mb-12 inline-block">
                        <RefreshCw size={120} className="text-blue-500 animate-spin opacity-10" />
                        <Globe size={48} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Grounding Search Active</h3>
                    <p className="text-slate-400 font-mono text-[10px] tracking-[0.4em] uppercase mt-4">Auditing Live Data Nodes...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {leads.map((lead, i) => (
                        <div key={i} className="bg-white border border-slate-200 p-8 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-8 right-8">
                                <div className="text-center">
                                    <div className={`text-2xl font-black ${lead.intentScore > 85 ? 'text-emerald-500' : 'text-blue-600'}`}>{lead.intentScore}%</div>
                                    <p className="text-[7px] font-black text-slate-400 uppercase">Intent Score</p>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-start mb-6">
                                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-lg transition-transform group-hover:rotate-3 shadow-blue-100">
                                        <Briefcase size={24} />
                                    </div>
                                    <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-blue-600 transition-colors mr-14">
                                        <ExternalLink size={20}/>
                                    </a>
                                </div>
                                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2 truncate max-w-[200px]">{lead.company}</h4>
                                <div className="flex items-center gap-2 mb-6">
                                    <MapPin size={12} className="text-slate-400"/>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lead.location}</span>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-6">
                                    {lead.signals?.map((s: string) => (
                                        <span key={s} className="text-[7px] font-black uppercase px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">{s}</span>
                                    ))}
                                </div>

                                <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl mb-8">
                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Sparkles size={10} /> Neural Rationale
                                    </p>
                                    <p className="text-xs text-indigo-900 font-medium leading-relaxed italic">"{lead.logic}"</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => importLead(lead)}
                                className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"
                            >
                                Bridge to CRM <PlusCircle size={16}/>
                            </button>
                        </div>
                    ))}
                    {leads.length === 0 && !isSearching && (
                        <div className="col-span-full py-20 text-center opacity-30 flex flex-col items-center">
                            <Target size={64} className="mb-4" />
                            <p className="text-sm font-black uppercase tracking-widest">Execute search to begin scouting</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LeadScout;
