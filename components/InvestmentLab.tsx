
import React, { useState, useEffect } from 'react';
import { Contact, InvestmentIdea } from '../types';
import { 
    TrendingUp, Sparkles, Youtube, ArrowRight, RefreshCw, 
    ShieldCheck, DollarSign, ListChecks, PlayCircle, Layers,
    PieChart, Briefcase, Info, X
} from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface InvestmentLabProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const InvestmentLab: React.FC<InvestmentLabProps> = ({ contact, onUpdateContact }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<InvestmentIdea | null>(null);
  
  const strategies = contact.investmentStrategies || [];

  const handleAnalyzeVideo = async () => {
    if (!videoUrl) return;
    setIsAnalyzing(true);
    try {
        const idea = await geminiService.generateInvestmentIdea(videoUrl, contact);
        if (idea) {
            onUpdateContact({
                ...contact,
                investmentStrategies: [idea, ...(contact.investmentStrategies || [])]
            });
            setActiveStrategy(idea);
            setVideoUrl('');
        }
    } catch (e) {
        alert("Failed to deconstruct investment strategy.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      
      {/* HUD Header */}
      <div className="bg-indigo-950 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><PieChart size={280} /></div>
        <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-indigo-500/20">
                Wealth Alpha Core
            </div>
            <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                The <span className="text-indigo-400">Wealth</span> Accelerator.
            </h1>
            <p className="text-slate-300 text-xl leading-relaxed mb-0 font-medium">
                Don't just pay down debt—deploy your capital into high-yield assets. Use our neural scout to deconstruct investment ideas from YouTube and tailor them to your business magnitude.
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
         
         {/* Scout Pane */}
         <div className="lg:col-span-4 space-y-8">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-200">
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-8 flex items-center gap-2">
                    <Youtube size={18} className="text-red-600" /> Neural Video Scout
                </h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">
                    Found a video about real estate, index scaling, or ad-arbitrage? Paste the link below to generate a tactical execution plan.
                </p>
                <div className="space-y-4">
                    <input 
                        type="text" 
                        value={videoUrl}
                        onChange={e => setVideoUrl(e.target.value)}
                        placeholder="Paste YouTube Link..."
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button 
                        onClick={handleAnalyzeVideo}
                        disabled={isAnalyzing || !videoUrl}
                        className="w-full bg-slate-950 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                        {isAnalyzing ? <RefreshCw className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                        Deconstruct Strategy
                    </button>
                </div>
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Layers size={100} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-2">Capital Pool</h3>
                <div className="text-5xl font-black tracking-tighter mb-4">${(contact.revenue || 0).toLocaleString()}</div>
                <p className="text-[10px] font-black uppercase tracking-widest mt-4 opacity-70">Recommended Re-Investment: 20%</p>
            </div>
         </div>

         {/* Strategy Library */}
         <div className="lg:col-span-8 space-y-8">
            <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 px-4">Tactical Blueprint Library</h3>
            
            {strategies.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center flex flex-col items-center justify-center">
                    <TrendingUp size={64} className="opacity-10 mb-4" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No strategies analyzed yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {strategies.map(strat => (
                        <div key={strat.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-8 opacity-5"><Layers size={120}/></div>
                            <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6 relative z-10">
                                <div>
                                    <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-200 mb-4 inline-block">
                                        {strat.category}
                                    </span>
                                    <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">{strat.title}</h4>
                                    <p className="text-sm text-slate-500 font-medium italic">" {strat.description} "</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ROI Potential</p>
                                    <p className="text-3xl font-black text-emerald-600 tracking-tighter">{strat.roiPotential}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-slate-100 pt-8 relative z-10">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ListChecks size={14}/> Execution Steps</p>
                                    <div className="space-y-3">
                                        {strat.steps.map((step, i) => (
                                            <div key={i} className="flex gap-4 items-start">
                                                <div className="w-5 h-5 bg-slate-100 rounded flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</div>
                                                <p className="text-xs text-slate-600 font-medium leading-relaxed">{step}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col justify-end">
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Risk Rating</span>
                                            <span className={`text-[10px] font-black uppercase ${strat.riskLevel === 'Low' ? 'text-emerald-500' : strat.riskLevel === 'High' ? 'text-red-500' : 'text-amber-500'}`}>{strat.riskLevel}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className={`h-full ${strat.riskLevel === 'Low' ? 'bg-emerald-500 w-1/3' : strat.riskLevel === 'High' ? 'bg-red-500 w-full' : 'bg-amber-500 w-2/3'}`}></div>
                                        </div>
                                    </div>
                                    <button className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                                        Consult with Advisor <ArrowRight size={14}/>
                                    </button>
                                </div>
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

export default InvestmentLab;
