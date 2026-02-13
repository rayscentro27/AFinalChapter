
import React, { useState, useEffect } from 'react';
import { AgencyBranding, ViewMode } from '../types';
import { Layout, Palette, Type, Globe, Save, CheckCircle, RefreshCw, Smartphone, Monitor, Code, Settings, Share2, ArrowRight, X, Building2, Sparkles, ShieldCheck, Film, Video, Zap } from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface AdminCMSProps {
  branding: AgencyBranding;
  onUpdateBranding: (branding: AgencyBranding) => void;
}

const AdminCMS: React.FC<AdminCMSProps> = ({ branding, onUpdateBranding }) => {
  const [localBranding, setLocalBranding] = useState<AgencyBranding>(branding);
  const [successMsg, setSuccessMsg] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleSave = () => {
    onUpdateBranding(localBranding);
    setSuccessMsg('Website content published successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSynthesizeHero = async () => {
    // Check key again before synthesis
    if ((window as any).aistudio) {
      const selected = await (window as any).aistudio.hasSelectedApiKey();
      if (!selected) {
        await (window as any).aistudio.openSelectKey();
        setHasKey(true);
      }
    }

    setIsSynthesizing(true);
    try {
        // EXACT prompt based on user request
        const prompt = "A cinematic ultra-high-definition professional video of a neon-green Lamborghini Aventador SVJ driving directly towards the camera in a modern urban street at night. Initially, the frame is dark and only the aggressive glowing LED headlights are visible through a light cinematic mist. As the car approaches, the camera pulls back to reveal the full green body. The car performs a sleek sideways drift, stops perfectly centered in the frame, pauses for a moment as the headlights flare, and then accelerates rapidly out of the picture.";
        
        const videoUrl = await geminiService.generateSocialVideo(prompt, '16:9');
        if (videoUrl) {
            setLocalBranding({ ...localBranding, heroVideoUrl: videoUrl });
            setSuccessMsg("Cinematic Hero Asset Manifested.");
        }
    } catch (e) {
        alert("Synthesis Interrupted. Verify project billing.");
    } finally {
        setIsSynthesizing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tighter">
            <Layout className="text-blue-600" size={32} /> No-Code Site Builder
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Manage your marketing presence and portal branding.</p>
        </div>
        <button 
          onClick={handleSave}
          className="bg-slate-950 text-white px-10 py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-blue-600 shadow-2xl transition-all transform active:scale-95 flex items-center gap-3"
        >
          <Save size={18} /> Publish Changes
        </button>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-700 px-6 py-4 rounded-2xl flex items-center gap-3 text-sm font-black border border-emerald-200 animate-fade-in shadow-xl shadow-emerald-500/10">
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Editor Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* NEW: HERO CINEMATIC STUDIO */}
          <div className="bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-2xl border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Film size={120} /></div>
            <h3 className="font-black flex items-center gap-2 text-emerald-400 uppercase text-xs tracking-widest mb-6">
                <Video size={18} /> Cinematic Hero Studio
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-8">
                Generate a custom 720p background video featuring your signature emerald hypercar protocol.
            </p>
            
            {localBranding.heroVideoUrl && (
                <div className="mb-6 rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
                    <video src={localBranding.heroVideoUrl} autoPlay loop muted className="w-full h-full object-cover" />
                </div>
            )}

            <button 
                onClick={handleSynthesizeHero}
                disabled={isSynthesizing}
                className="w-full py-4 bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {isSynthesizing ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {isSynthesizing ? 'Synthesizing...' : 'Synthesize SVJ Hero'}
            </button>
            <p className="text-[8px] text-slate-600 mt-4 text-center font-bold uppercase tracking-widest">Powered by Google Veo 3.1</p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
            <h3 className="font-black text-slate-900 flex items-center gap-3 border-b border-slate-100 pb-4 mb-4 uppercase text-sm tracking-widest">
              <Palette size={20} className="text-blue-500" /> Branding & Style
            </h3>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Agency Brand Identity</label>
                <input 
                  type="text" 
                  value={localBranding.name} 
                  onChange={(e) => setLocalBranding({ ...localBranding, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Protocol Accent Color</label>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <input 
                    type="color" 
                    value={localBranding.primaryColor} 
                    onChange={(e) => setLocalBranding({ ...localBranding, primaryColor: e.target.value })}
                    className="w-14 h-14 rounded-xl border-4 border-white cursor-pointer p-0 shadow-lg"
                  />
                  <div>
                    <span className="text-sm font-mono text-slate-600 font-bold uppercase">{localBranding.primaryColor}</span>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Applies to all HUD highlights</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
            <h3 className="font-black text-slate-900 flex items-center gap-3 border-b border-slate-100 pb-4 mb-4 uppercase text-sm tracking-widest">
              <Type size={20} className="text-purple-500" /> Landing Matrix
            </h3>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Primary Hero Headline</label>
                <textarea 
                  value={localBranding.heroHeadline}
                  onChange={(e) => setLocalBranding({ ...localBranding, heroHeadline: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 h-24 resize-none text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Hero Semantic Subhead</label>
                <textarea 
                  value={localBranding.heroSubheadline}
                  onChange={(e) => setLocalBranding({ ...localBranding, heroSubheadline: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 h-24 resize-none text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Device Mockup */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
           <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                 <button 
                  onClick={() => setPreviewMode('desktop')}
                  className={`p-2 px-6 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${previewMode === 'desktop' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}
                 >
                   <Monitor size={16} /> Desktop
                 </button>
                 <button 
                  onClick={() => setPreviewMode('mobile')}
                  className={`p-2 px-6 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${previewMode === 'mobile' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}
                 >
                   <Smartphone size={16} /> Mobile
                 </button>
              </div>
              <div className="flex items-center gap-2 text-emerald-500 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-black uppercase tracking-widest">Live Visual Feedback</span>
              </div>
           </div>

           <div className={`bg-slate-200 rounded-[3rem] border-[12px] border-slate-300 overflow-hidden shadow-2xl flex justify-center transition-all duration-700 relative ${previewMode === 'mobile' ? 'max-w-[400px] h-[800px] mx-auto rounded-[4rem]' : 'w-full h-[800px]'}`}>
              {/* iPhone Notch for mobile mode */}
              {previewMode === 'mobile' && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-8 bg-slate-300 rounded-b-3xl z-20"></div>
              )}
              
              <div className="w-full bg-white h-full overflow-y-auto pointer-events-none custom-scrollbar">
                 {/* MINI LANDING PAGE RENDER */}
                 <nav className="p-6 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="font-black flex items-center gap-2 text-lg tracking-tighter uppercase">
                       <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: localBranding.primaryColor }}>
                          <Building2 size={16} />
                       </div>
                       {localBranding.name}
                    </div>
                    <div className={`flex gap-6 items-center ${previewMode === 'mobile' ? 'hidden' : 'flex'}`}>
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Infrastructure</span>
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Security</span>
                       <span className="px-5 py-2 rounded-xl font-black text-white text-[9px] uppercase tracking-widest shadow-lg" style={{ backgroundColor: localBranding.primaryColor }}>Get Funded</span>
                    </div>
                 </nav>

                 <div className="pt-24 pb-20 px-10 text-center bg-slate-950 relative overflow-hidden h-[400px] flex items-center justify-center">
                    <div className="absolute inset-0 z-0">
                        {localBranding.heroVideoUrl ? (
                             <video src={localBranding.heroVideoUrl} autoPlay loop muted className="w-full h-full object-cover opacity-50" />
                        ) : (
                             <div className="w-full h-full bg-slate-900" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/50"></div>
                    </div>
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                           <ShieldCheck size={12} /> Protocol Verified
                        </div>
                        <h1 className="text-5xl font-black mb-8 leading-[1.1] text-white tracking-tighter uppercase max-w-2xl mx-auto">
                           {localBranding.heroHeadline}
                        </h1>
                    </div>
                 </div>

                 <div className="p-12 grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        { title: 'Secure Vault', icon: <Building2 className="text-blue-500" /> },
                        { title: 'Neural Spreading', icon: <Sparkles className="text-indigo-500" /> },
                        { title: 'Fast Liquidity', icon: <ArrowRight className="text-emerald-500" /> }
                    ].map((feat, i) => (
                       <div key={i} className="p-10 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm text-center group">
                          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-6 shadow-inner border border-slate-100">
                             {feat.icon}
                          </div>
                          <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight mb-2">{feat.title}</h4>
                          <div className="h-1.5 w-8 bg-slate-100 rounded-full mx-auto" style={{ backgroundColor: i === 0 ? localBranding.primaryColor : '#f1f5f9' }}></div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCMS;
