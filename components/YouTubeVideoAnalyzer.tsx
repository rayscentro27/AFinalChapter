
import React, { useState, useEffect } from 'react';
import { Youtube, Search, Loader, Sparkles, RefreshCw, CheckCircle, Zap, ExternalLink, Play, MessageSquare, ListChecks, ArrowRight, Copy, PlusCircle, Video } from 'lucide-react';
import * as geminiService from '../services/geminiService';

const YouTubeVideoAnalyzer: React.FC = () => {
  const [url, setUrl] = useState('');
  const [embedId, setEmbedId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{ title: string; steps: string[] } | null>(null);
  const [progressMsg, setProgressMsg] = useState('');

  // Extract YouTube ID for the preview player
  useEffect(() => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[7].length === 11) {
      setEmbedId(match[7]);
    } else {
      setEmbedId(null);
    }
  }, [url]);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    
    setIsAnalyzing(true);
    setResult(null);
    
    const messages = [
        "Connecting to YouTube Data Streams...",
        "Scraping Audio Transcripts...",
        "Neural Deconstruction Active...",
        "Synthesizing Strategic Examples...",
        "Finalizing Actionable Protocol..."
    ];
    
    let i = 0;
    const interval = setInterval(() => {
        setProgressMsg(messages[i % messages.length]);
        i++;
    }, 3000);

    try {
        const data = await geminiService.analyzeYouTubeVideo(url);
        setResult(data);
    } catch (e) {
        console.error(e);
        alert("Intelligence scan failed. Verify URL or Neural Link settings.");
    } finally {
        clearInterval(interval);
        setIsAnalyzing(false);
        setProgressMsg('');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      {/* Header & Search */}
      <div className="flex justify-between items-center bg-slate-950 p-10 rounded-[3rem] text-white relative overflow-hidden shadow-2xl border border-white/5">
         <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Youtube size={280} /></div>
         <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-red-500/20">
               <Youtube size={14} className="fill-red-500" /> Video Intelligence Protocol
            </div>
            <h1 className="text-5xl font-black mb-6 tracking-tighter uppercase leading-none">Video <span className="text-red-500">Intelligence</span></h1>
            <p className="text-slate-400 text-xl leading-relaxed mb-10 font-medium">
               Paste any URL to have Nexus AI "watch" the content, extract tactical examples, and convert them into CRM tasks.
            </p>
            
            <div className="flex bg-white/5 p-2 rounded-2xl border border-white/10 shadow-inner backdrop-blur-xl">
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste YouTube Video URL..."
                    className="flex-1 bg-transparent border-none text-white px-6 py-4 focus:ring-0 outline-none font-medium placeholder:text-slate-600"
                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
                <button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !url}
                    className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-xl disabled:opacity-50 flex items-center gap-2 transform active:scale-95"
                >
                    {isAnalyzing ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18} fill="currentColor"/>}
                    {isAnalyzing ? 'Processing...' : 'Analyze Video'}
                </button>
            </div>
         </div>
      </div>

      {isAnalyzing && (
        <div className="py-20 flex flex-col items-center justify-center animate-fade-in">
           <div className="relative mb-12">
              <RefreshCw className="animate-spin text-red-500" size={120} />
              <Search size={48} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-pulse" />
           </div>
           <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4">Deep Packet Inspection</h3>
           <div className="bg-slate-100 px-6 py-2 rounded-full border border-slate-200">
               <p className="text-red-600 font-mono text-[10px] tracking-[0.2em] uppercase">{progressMsg}</p>
           </div>
        </div>
      )}

      {result && !isAnalyzing && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
            <div className="lg:col-span-7 space-y-6">
               {/* Video Preview */}
               {embedId && (
                 <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 aspect-video relative group">
                    <iframe 
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${embedId}?autoplay=0&mute=0`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                    <div className="absolute top-4 left-4 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        <Video size={10} /> Active Source
                    </div>
                 </div>
               )}

               <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
                  <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                     <div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-tight">{result.title}</h3>
                        <div className="flex gap-4 mt-3">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListChecks size={14} className="text-red-500"/> Actionable Protocol</span>
                        </div>
                     </div>
                  </div>
                  
                  <div className="p-10 space-y-6 flex-1 bg-white">
                      {result.steps.map((step, idx) => (
                        <div key={idx} className="flex gap-8 group animate-fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                            <div className="flex flex-col items-center shrink-0">
                                <div className="w-12 h-12 rounded-2xl bg-slate-950 text-white flex items-center justify-center font-black text-lg shadow-xl transform rotate-3 group-hover:rotate-0 transition-transform">{idx + 1}</div>
                                {idx !== result.steps.length - 1 && <div className="w-px h-full bg-slate-100 mt-2"></div>}
                            </div>
                            <div className="pb-8 flex-1 border-b border-slate-50 last:border-0 group-hover:translate-x-1 transition-transform">
                                <p className="text-lg font-bold text-slate-800 leading-relaxed mb-4 italic">"{step}"</p>
                                <div className="flex gap-4">
                                    <button className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-lg hover:bg-blue-100 flex items-center gap-2">
                                        <PlusCircle size={12}/> Create CRM Task
                                    </button>
                                    <button className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg hover:bg-emerald-100 flex items-center gap-2">
                                        <RefreshCw size={10}/> Automate Follow-up
                                    </button>
                                </div>
                            </div>
                        </div>
                      ))}
                  </div>
               </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
                <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
                    <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={120} /></div>
                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Zap size={16}/> Strategic Impact</h4>
                    <div className="space-y-6">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                            <p className="text-xs text-slate-400 font-medium leading-relaxed mb-4">
                                Analysis indicates this content contains high-value underwriting insights. 
                                We've identified <span className="text-emerald-400 font-bold">{result.steps.length} examples</span> that can be used to qualify current pipeline leads.
                            </p>
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <span>Conversion Lift</span>
                                <span className="text-emerald-500">High (+12%)</span>
                            </div>
                            <div className="mt-2 w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 w-[85%]"></div>
                            </div>
                        </div>
                        <button className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-50 transition-all shadow-xl flex items-center justify-center gap-3">
                            <ArrowRight size={18} /> Sync with Global Leads
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2"><MessageSquare size={16} className="text-blue-500"/> AI Social Hook</h4>
                    <p className="text-sm text-slate-600 font-medium leading-relaxed mb-8">
                        Nexus has drafted a social post to help you distribute this new strategy to your borrowers.
                    </p>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-inner relative group">
                        <p className="text-sm text-slate-500 leading-relaxed italic">"Did you see the latest protocol for Tier 3 fleet expansion? Most business owners miss the critical step of {result.steps[0].split(' ').slice(0,3).join(' ')}..."</p>
                        <button className="absolute bottom-4 right-4 bg-white p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"><Copy size={16}/></button>
                    </div>
                    <button className="w-full mt-8 py-4 border-2 border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">Edit in Content Factory</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default YouTubeVideoAnalyzer;
