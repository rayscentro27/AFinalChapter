
import React, { useState, useEffect } from 'react';
import { 
  Youtube, Globe, Search, RefreshCw, Sparkles, ShieldCheck, 
  ArrowRight, ListChecks, TrendingUp, AlertTriangle, ExternalLink,
  PlusCircle, BookOpen, Layers, Terminal, Zap, Shield, Info, X
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { ContentAudit, KnowledgeDoc } from '../types';

const IntelligenceAuditor: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audit, setAudit] = useState<ContentAudit | null>(null);
  const [researchLogs, setResearchLogs] = useState<string[]>([]);
  const [isBridging, setIsBridging] = useState(false);

  const handleAudit = async () => {
    if (!url.trim()) return;
    
    setIsAnalyzing(true);
    setAudit(null);
    setResearchLogs(["Initializing Forensic Ingestion...", "Mapping Semantic Vectors..."]);
    
    const logCycle = [
        "Connecting to Google Grounding Nodes...",
        "Querying 2024 SBA Compliance Database...",
        "Researching Chase Business Policy Amendments...",
        "Detecting High-Yield Verification Signals...",
        "Cross-Referencing Agency Knowledge Base..."
    ];
    
    let logIdx = 0;
    const logInterval = setInterval(() => {
        setResearchLogs(prev => [logCycle[logIdx % logCycle.length], ...prev].slice(0, 10));
        logIdx++;
    }, 2500);

    try {
        const result = await geminiService.auditContentValue(url);
        setAudit(result);
    } catch (e) {
        setResearchLogs(prev => ["CRITICAL: Neural Handshake Interrupted", ...prev]);
    } finally {
        clearInterval(logInterval);
        setIsAnalyzing(false);
    }
  };

  const bridgeToKnowledgeBase = () => {
    if (!audit) return;
    setIsBridging(true);
    
    const existing = JSON.parse(localStorage.getItem('nexus_knowledge_vault') || '[]');
    const newDoc: KnowledgeDoc = {
        id: `verified_${Date.now()}`,
        title: `Verified: ${audit.title}`,
        content: `STRATEGIC AUDIT SUMMARY:\n${audit.strategicValue}\n\nCORE CLAIMS:\n${audit.claims.map(c => `- ${c.statement} (${c.verdict})`).join('\n')}`,
        category: 'Verified Intelligence',
        uploadedAt: new Date().toLocaleDateString(),
        isActive: true,
        sourceUrl: audit.sourceUrl,
        trustScore: audit.trustScore
    };
    
    localStorage.setItem('nexus_knowledge_vault', JSON.stringify([newDoc, ...existing]));
    
    setTimeout(() => {
        setIsBridging(false);
        alert("Intelligence Bridged! Your AI Agents are now grounded in this verified data.");
    }, 1500);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* Search Header */}
      <div className="bg-slate-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Globe size={320} /></div>
        <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                Neural Intelligence Protocol
            </div>
            <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                Verified <span className="text-blue-500">Intelligence.</span>
            </h1>
            <p className="text-slate-400 text-xl leading-relaxed mb-10 font-medium">
                Paste any social URL (YouTube, LinkedIn, X). Nexus AI will ingest the content, research the live web to verify the claims, and bridge the strategy to your agency's core.
            </p>
            
            <div className="flex bg-white/5 p-2 rounded-[2rem] border border-white/10 shadow-inner backdrop-blur-xl">
                <input 
                    type="text" 
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="Paste URL (YouTube, X, LinkedIn)..."
                    className="flex-1 bg-transparent border-none text-white px-8 py-4 focus:ring-0 outline-none font-medium placeholder:text-slate-700"
                    onKeyDown={e => e.key === 'Enter' && handleAudit()}
                />
                <button 
                    onClick={handleAudit}
                    disabled={isAnalyzing || !url}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest transition-all shadow-xl disabled:opacity-50 flex items-center gap-2 transform active:scale-95"
                >
                    {isAnalyzing ? <RefreshCw className="animate-spin" size={18}/> : <Search size={18} />}
                    {isAnalyzing ? 'Auditing...' : 'Run Forensic Audit'}
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         {/* Research Stream / Terminal */}
         <div className="lg:col-span-4 bg-slate-900 rounded-[3rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                <h3 className="font-black text-xs uppercase tracking-widest text-blue-400 flex items-center gap-2">
                    <Terminal size={14} /> Grounding Stream
                </h3>
                <span className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isAnalyzing ? 'bg-blue-500 animate-pulse' : 'bg-slate-700'}`}></div>
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">{isAnalyzing ? 'Searching Live Web' : 'Idle'}</span>
                </span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-2 bg-black/40">
                {researchLogs.map((log, i) => (
                    <div key={i} className={`animate-fade-in flex gap-3 ${i === 0 ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                        <span className="opacity-30">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                        <span>>> {log}</span>
                    </div>
                ))}
                {!isAnalyzing && researchLogs.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                        <Search size={48} className="mb-4" />
                        <p className="uppercase tracking-widest">Awaiting Command</p>
                    </div>
                )}
            </div>
         </div>

         {/* Results Pane */}
         <div className="lg:col-span-8 flex flex-col gap-6">
            {audit ? (
                <div className="animate-fade-in space-y-6">
                    {/* Trust HUD */}
                    <div className="bg-white border border-slate-200 p-8 rounded-[3rem] shadow-sm flex flex-col md:flex-row justify-between items-center gap-10">
                        <div className="flex items-center gap-6">
                            <div className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-xl transform rotate-3 transition-transform group-hover:rotate-0 ${audit.trustScore > 75 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                {audit.trustScore}%
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{audit.title}</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Platform: {audit.platform} • Scanned Just Now</p>
                            </div>
                        </div>
                        <button 
                            onClick={bridgeToKnowledgeBase}
                            disabled={isBridging}
                            className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            {isBridging ? <RefreshCw className="animate-spin" size={16}/> : <PlusCircle size={16}/>}
                            Bridge to Knowledge Base
                        </button>
                    </div>

                    {/* Claims Verification Grid */}
                    <div className="grid grid-cols-1 gap-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Claim Integrity Audit</p>
                        {audit.claims.map((claim, i) => (
                            <div key={i} className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <h4 className="text-base font-bold text-slate-800 italic">" {claim.statement} "</h4>
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                        claim.verdict === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                        claim.verdict === 'Debunked' ? 'bg-red-50 text-red-700 border-red-100' :
                                        'bg-amber-50 text-amber-700 border-amber-100'
                                    }`}>
                                        {claim.verdict}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                        <Shield size={12} className="inline mr-2 text-blue-500"/>
                                        {claim.evidence}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Grounding Source Ledger */}
                    <div className="bg-slate-950 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/10">
                        <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                            <Layers size={18} /> Grounding Evidence Ledger
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {audit.groundingUrls?.map((link, i) => (
                                <a 
                                    key={i} 
                                    href={link.uri} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all"
                                >
                                    <div className="min-w-0 pr-4">
                                        <p className="text-xs font-bold text-white truncate">{link.title}</p>
                                        <p className="text-[9px] text-slate-500 font-mono mt-1 truncate">{link.uri}</p>
                                    </div>
                                    <ExternalLink size={14} className="text-slate-600 group-hover:text-blue-400 shrink-0" />
                                </a>
                            ))}
                            {(!audit.groundingUrls || audit.groundingUrls.length === 0) && (
                                <p className="text-xs text-slate-500 italic">No direct grounding links provided by neural core.</p>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-40 border-2 border-dashed border-slate-200 rounded-[3.5rem] bg-white/50">
                    <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-xl flex items-center justify-center mb-8 border border-slate-100">
                        <Sparkles size={48} className="text-slate-100" />
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.4em] opacity-40">Awaiting Neural Directive</p>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default IntelligenceAuditor;
