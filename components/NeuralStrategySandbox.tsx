import React, { useState, useMemo } from 'react';
import { 
    Zap, Sparkles, TrendingUp, Target, RefreshCw, 
    ArrowRight, Layers, PieChart, Info, Search, 
    Database, Activity, ShieldAlert, BrainCircuit, Globe,
    LayoutGrid, MousePointer2, ChevronRight, X, Play, CheckCircle
} from 'lucide-react';
// Fixed: Removed non-existent Type export from ../types
import { Contact } from '../types';
import { GoogleGenAI } from '../services/clientAiBridge';

interface NeuralStrategySandboxProps {
  contacts: Contact[];
}

const NeuralStrategySandbox: React.FC<NeuralStrategySandboxProps> = ({ contacts }) => {
  const [simulationQuery, setSimulationQuery] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<'constellation' | 'grid'>('constellation');

  // Simulated "Constellation" mapping
  const leads = useMemo(() => contacts.map((c, i) => ({
    ...c,
    x: Math.random() * 80 + 10,
    y: Math.random() * 80 + 10,
    size: (c.value / 100000) * 20 + 5
  })), [contacts]);

  const handleSimulate = async () => {
    if (!simulationQuery) return;
    setIsSimulating(true);
    setSimulationResult(null);

    try {
        const ai = new GoogleGenAI();
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `As the Nexus Strategic CFO, run a simulation on this pipeline: ${JSON.stringify(contacts.map(c=>({company:c.company, status:c.status, val:c.value})))}
            User Query: "${simulationQuery}"
            Return a JSON object with: { 
                paradox: string (a non-obvious strategic insight), 
                topCandidates: string[] (3 entity names from the pipeline that benefit most), 
                projectedDelta: string (ROI or % change),
                steps: string[] (3 tactical steps to execute)
            }`,
            config: { 
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 4000 }
            }
        });
        setSimulationResult(JSON.parse(response.text || "{}"));
    } catch (e) {
        alert("Neural Simulation Failed.");
    } finally {
        setIsSimulating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col animate-fade-in relative overflow-hidden">
      {/* Background Neural Rain */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none overflow-hidden">
         <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-blue-500 to-transparent animate-[laser_8s_infinite]"></div>
         <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-emerald-500 to-transparent animate-[laser_12s_infinite]"></div>
      </div>

      <div className="p-8 md:p-12 bg-slate-950 rounded-[3.5rem] border border-white/5 shadow-2xl relative z-10 flex flex-col h-full overflow-hidden">
        
        <div className="flex flex-col lg:flex-row justify-between items-start gap-10 mb-12">
            <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                    <Sparkles size={14} className="animate-pulse" /> Strategic Simulation Hub
                </div>
                <h1 className="text-6xl font-black mb-6 tracking-tighter uppercase leading-[0.8] text-white">
                    Neural <br/> <span className="text-indigo-400">War Room.</span>
                </h1>
                <p className="text-slate-400 text-xl leading-relaxed italic opacity-80">
                    "Audit the future. Simulate market volatility, rate shifts, and industry cascades to find the shortest path to maximum liquidity."
                </p>
            </div>

            <div className="w-full lg:w-96 space-y-6">
                <div className="bg-white/5 p-2 rounded-[2rem] border border-white/10 shadow-2xl flex flex-col gap-4">
                    <textarea 
                        value={simulationQuery}
                        onChange={e => setSimulationQuery(e.target.value)}
                        placeholder="e.g. Find the top 5 leads that have the lowest risk for a 1.25x revenue buyout..."
                        className="bg-transparent border-none text-white p-6 focus:ring-0 outline-none font-medium h-32 resize-none placeholder:text-slate-700 custom-scrollbar"
                    />
                    <button 
                        onClick={handleSimulate}
                        disabled={isSimulating || !simulationQuery}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-[1.8rem] font-black uppercase text-xs tracking-[0.3em] transition-all shadow-2xl flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
                    >
                        {isSimulating ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18} fill="currentColor"/>}
                        {isSimulating ? 'Processing Logic...' : 'Engage Simulation'}
                    </button>
                </div>
            </div>
        </div>

        <div className="flex-1 relative bg-black/40 rounded-[3rem] border border-white/5 overflow-hidden group shadow-inner">
            {/* View Toggle */}
            <div className="absolute top-6 left-6 z-20 flex bg-white/5 p-1 rounded-xl border border-white/10">
                <button onClick={() => setActiveLayer('constellation')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeLayer === 'constellation' ? 'bg-white text-slate-900' : 'text-slate-500'}`}>Constellation</button>
                <button onClick={() => setActiveLayer('grid')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeLayer === 'grid' ? 'bg-white text-slate-900' : 'text-slate-500'}`}>Target Matrix</button>
            </div>

            {activeLayer === 'constellation' ? (
                <div className="w-full h-full relative perspective-[1000px]">
                    {leads.map((lead, i) => (
                        <div 
                            key={lead.id}
                            className="absolute rounded-full transition-all duration-1000 cursor-pointer group/lead"
                            style={{ 
                                left: `${lead.x}%`, 
                                top: `${lead.y}%`, 
                                width: `${lead.size}px`, 
                                height: `${lead.size}px`,
                                backgroundColor: lead.status === 'Closed' ? '#10b981' : lead.status === 'Lead' ? '#3b82f6' : '#f59e0b',
                                boxShadow: `0 0 ${lead.size*2}px rgba(59, 130, 246, 0.4)`,
                                opacity: isSimulating ? 0.2 : 0.8
                            }}
                        >
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/lead:opacity-100 transition-opacity bg-slate-900 px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap z-30">
                                {lead.company}
                            </div>
                        </div>
                    ))}

                    {simulationResult && (
                        <div className="absolute inset-0 bg-indigo-600/5 backdrop-blur-sm animate-fade-in flex items-center justify-center p-20 z-10">
                            <div className="max-w-4xl bg-slate-900/90 border border-indigo-500/30 rounded-[3rem] p-12 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-10 opacity-5"><Zap size={240} className="text-indigo-400"/></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-center mb-10">
                                        <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Simulation Verdict</h3>
                                        <button onClick={() => setSimulationResult(null)} className="p-3 hover:bg-white/10 rounded-2xl text-slate-500 transition-colors"><X size={24}/></button>
                                    </div>
                                    
                                    <div className="space-y-10">
                                        <div className="border-l-4 border-indigo-600 pl-8">
                                            <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.4em] mb-3">Strategic Paradox</p>
                                            <p className="text-2xl font-medium italic text-indigo-50">"{simulationResult.paradox}"</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <div className="space-y-6">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Primary Targets</p>
                                                <div className="space-y-3">
                                                    {simulationResult.topCandidates?.map((c: string, i: number) => (
                                                        <div key={i} className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl">
                                                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-xs">{i+1}</div>
                                                            <span className="font-bold text-slate-200">{c}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="space-y-6">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Execution Steps</p>
                                                <div className="space-y-4">
                                                    {simulationResult.steps?.map((step: string, i: number) => (
                                                        <div key={i} className="flex gap-4">
                                                            {/* Fixed: CheckCircle is now correctly imported from lucide-react */}
                                                            <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-1" />
                                                            <p className="text-xs text-slate-300 font-medium leading-relaxed">{step}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-8 bg-indigo-600 text-white rounded-3xl flex justify-between items-center shadow-xl">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Projected Operational Delta</p>
                                                <h4 className="text-4xl font-black tracking-tighter">{simulationResult.projectedDelta}</h4>
                                            </div>
                                            <button className="bg-slate-950 px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white hover:text-slate-900 transition-all transform active:scale-95">Deploy Campaign</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isSimulating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <RefreshCw className="animate-spin text-blue-600 mb-6" size={64} />
                            <p className="text-blue-400 font-mono text-[10px] uppercase tracking-[0.4em] animate-pulse">Running Neural Simulation...</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto h-full custom-scrollbar">
                   {contacts.map(c => (
                       <div key={c.id} className="bg-white/5 border border-white/5 p-8 rounded-[2rem] hover:bg-white/10 transition-all group">
                           <div className="flex justify-between items-start mb-6">
                               <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-black text-lg shadow-xl">{c.company[0]}</div>
                               <div className="text-right">
                                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Pipeline Val</p>
                                   <p className="text-lg font-black text-white">${(c.value/1000).toFixed(0)}k</p>
                               </div>
                           </div>
                           <h4 className="font-black text-white uppercase text-sm tracking-tight truncate mb-6">{c.company}</h4>
                           <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-widest">
                               <span>{c.status}</span>
                               <span className="text-blue-400">READY</span>
                           </div>
                       </div>
                   ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default NeuralStrategySandbox;