
import React, { useEffect, useState } from 'react';
import { Hexagon, CheckCircle, ArrowRight, Zap, TrendingUp, ShieldCheck, DollarSign, Clock, LayoutDashboard, Sparkles, Smartphone, Award, MapPin, Phone, Mail, Shield, BrainCircuit, Globe, Play, Video, Terminal, Fingerprint, Activity } from 'lucide-react';
import { ViewMode, AgencyBranding } from '../types';
import { data } from '../adapters';

interface ClientLandingPageProps {
  onNavigate: (view: ViewMode) => void;
}

const ClientLandingPage: React.FC<ClientLandingPageProps> = ({ onNavigate }) => {
  const [branding, setBranding] = useState<AgencyBranding | null>(null);

  useEffect(() => {
    const fetchBranding = async () => {
      const b = await data.getBranding();
      setBranding(b);
    };
    fetchBranding();
  }, []);

  // Institutional Emerald green used as the primary accent
  const primaryGreen = "#059669"; 

  return (
    <div className="min-h-screen bg-[#0B0C10] font-sans text-slate-100 scroll-smooth overflow-x-hidden">
      
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-[#0B0C10]/40 backdrop-blur-xl border-b border-white/5 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="bg-[#059669] p-2 rounded-xl shadow-lg shadow-[#059669]/20">
              <Hexagon className="text-slate-950 fill-slate-950/10" size={24} />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white uppercase">{branding?.name.split(' ')[0] || 'Nexus'}<span className="text-[#059669]">{branding?.name.split(' ')[1] || 'Capital'}</span></span>
          </div>
          <div className="hidden md:flex gap-10 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 items-center">
            <a href="#infrastructure" className="hover:text-[#059669] transition-colors">Infrastructure</a>
            <a href="#yield" className="hover:text-[#059669] transition-colors">Yield</a>
            <a href="#security" className="hover:text-[#059669] transition-colors">Security</a>
          </div>
          <div className="flex gap-6 items-center">
            <button 
              onClick={() => onNavigate(ViewMode.LOGIN)}
              className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-[#059669] transition-colors"
            >
              Sign In
            </button>
            <button 
              onClick={() => onNavigate(ViewMode.SIGNUP)}
              className="px-8 py-3 text-xs font-black uppercase tracking-widest bg-[#059669] text-slate-950 rounded-xl hover:bg-white transition-all shadow-xl shadow-[#059669]/20 transform active:scale-95"
            >
              Apply Now
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative min-h-screen flex items-center pt-20">
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#0B0C10]">
            {branding?.heroVideoUrl ? (
                <video 
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    className="w-full h-full object-cover opacity-50 brightness-50 transition-opacity duration-1000"
                    key={branding.heroVideoUrl}
                >
                    <source src={branding.heroVideoUrl} type="video/mp4" />
                </video>
            ) : (
                <video 
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    className="w-full h-full object-cover opacity-30 grayscale brightness-50 blur-[1px]"
                >
                    <source src="https://cdn.pixabay.com/video/2021/04/12/70860-536965022_large.mp4" type="video/mp4" />
                </video>
            )}
            <div className="video-vignette"></div>
            <div className="neural-grain"></div>
            <div className="animate-laser-scan opacity-10"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center relative z-10">
          <div className="animate-fade-in space-y-10">
            <div className="inline-flex items-center gap-2 bg-[#059669]/10 text-[#059669] px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border border-[#059669]/20 shadow-[0_0_15px_rgba(5,150,105,0.1)]">
              <Zap size={14} className="fill-[#059669] animate-pulse" /> Neural Handshake Synchronized
            </div>
            
            <h1 className="text-7xl md:text-9xl font-black leading-[0.85] mb-8 tracking-tighter text-white uppercase">
              Manifest <br/>
              <span className="text-[#059669] drop-shadow-[0_0_30px_rgba(5,150,105,0.3)]">Magnitude.</span>
            </h1>
            
            <p className="text-xl text-[#C5C6C7] max-w-lg font-medium leading-relaxed italic border-l-2 border-[#059669]/30 pl-6">
              "Bypass manual underwriting. Access institutional liquidity at the speed of light."
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 pt-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-[#059669] rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <button 
                  onClick={() => onNavigate(ViewMode.SIGNUP)}
                  className="relative px-12 py-6 bg-[#059669] text-slate-950 rounded-2xl font-black text-xl hover:bg-white transition-all flex items-center justify-center gap-4 transform hover:-translate-y-1 active:scale-95 shadow-2xl shadow-[#059669]/20"
                >
                  Start Protocol <ArrowRight size={24} />
                </button>
              </div>

              <div className="flex items-center gap-8 px-4">
                 <div className="flex flex-col">
                    <span className="text-white font-black text-2xl tracking-tighter">Instant</span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mt-1">Pre-Audit</span>
                 </div>
                 <div className="w-px h-10 bg-white/10"></div>
                 <div className="flex flex-col">
                    <span className="text-white font-black text-2xl tracking-tighter">$5.0M</span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mt-1">Daily Capacity</span>
                 </div>
              </div>
            </div>
          </div>
          
          <div className="relative hidden lg:block h-[600px] animate-spatial">
             {/* ENHANCED BUBBLE: AI Active Spreading */}
             <div className="absolute top-20 right-0 w-80 bg-[#1F2833]/40 backdrop-blur-3xl border border-[#059669]/20 p-1 rounded-[3rem] shadow-2xl animate-float group overflow-hidden">
                <div className="aspect-[4/5] rounded-[2.8rem] overflow-hidden relative border border-white/5 bg-black">
                    <video autoPlay loop muted playsInline className="w-full h-full object-cover opacity-60">
                        <source src="https://cdn.pixabay.com/video/2020/09/20/50493-461427503_large.mp4" type="video/mp4" />
                    </video>
                    
                    {/* Scanning Animation Layer */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-transparent to-transparent"></div>
                    <div className="animate-laser-scan opacity-40"></div>
                    
                    {/* Top Overlay Stats */}
                    <div className="absolute top-6 left-6 right-6 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#059669] animate-pulse shadow-[0_0_8px_#059669]"></div>
                            <span className="text-[9px] font-black uppercase text-white tracking-[0.2em] shadow-sm">AI Active Spreading</span>
                        </div>
                        
                        {/* Bullet points and real-time markers with sequential animation */}
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 w-fit animate-fade-in [animation-delay:0.5s]">
                                <CheckCircle size={10} className="text-[#059669] animate-pulse" />
                                <span className="text-[8px] font-mono text-[#059669] uppercase tracking-widest">Entity Verified</span>
                            </div>
                            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 w-fit ml-2 animate-fade-in [animation-delay:1.5s]">
                                <Activity size={10} className="text-[#059669] animate-pulse" />
                                <span className="text-[8px] font-mono text-[#059669] uppercase tracking-widest">Revenue Scaled</span>
                            </div>
                            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 w-fit ml-4 animate-fade-in [animation-delay:2.5s]">
                                <Fingerprint size={10} className="text-[#059669] animate-pulse" />
                                <span className="text-[8px] font-mono text-[#059669] uppercase tracking-widest">Liquidity Mapped</span>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Dynamic Markers */}
                    <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
                        <div className="font-mono text-[7px] text-[#059669]/50 uppercase leading-tight">
                            LOC_NODE: 0x42f<br/>
                            TRANCHE: ALPHA<br/>
                            SYNC: TRUE
                        </div>
                        <div className="w-10 h-10 bg-[#059669]/10 rounded-full border border-[#059669]/30 flex items-center justify-center animate-spin-slow">
                            <Zap size={14} className="text-[#059669] fill-[#059669]/20" />
                        </div>
                    </div>
                </div>
             </div>

             <div className="absolute bottom-10 left-0 w-64 bg-[#1F2833]/40 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl animate-float border-[#059669]/20" style={{ animationDelay: '-3s' }}>
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 bg-[#059669]/20 rounded-2xl flex items-center justify-center text-[#059669] border border-[#059669]/30">
                      <ShieldCheck size={24} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sovereign Link</p>
                      <p className="text-white font-black text-lg">AES-256</p>
                   </div>
                </div>
                <div className="flex gap-1">
                    {[...Array(4)].map((_,i) => <div key={i} className="flex-1 h-1 bg-[#059669] rounded-full shadow-[0_0_8px_#059669] opacity-60 animate-pulse" style={{ animationDelay: `${i*0.2}s` }}></div>)}
                </div>
             </div>
          </div>
        </div>
      </header>

      <section id="infrastructure" className="py-32 relative z-10 bg-[#0B0C10]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24 animate-fade-in">
            <h2 className="text-5xl md:text-7xl font-black text-white mb-8 tracking-tighter uppercase leading-[0.9]">The Infrastructure <br/><span className="text-[#059669]">of Magnitude.</span></h2>
            <p className="text-[#C5C6C7] max-w-2xl mx-auto text-xl font-medium leading-relaxed">
              Proprietary neural spreading technology that audits business bankability in real-time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <FeatureCard 
                icon={<BrainCircuit size={36}/>} 
                title="Neural Audit" 
                desc="Automated extraction and forensic analysis of 12 months bank statement data in seconds."
                delay="0s"
            />
            <FeatureCard 
                icon={<Shield size={36}/>} 
                title="Binary Guard" 
                desc="Pixel-level verification of corporate documents to ensure institutional-grade trust."
                delay="0.2s"
            />
            <FeatureCard 
                icon={<Globe size={36}/>} 
                title="Global Liquidity" 
                desc="Direct API handshakes with over 40 Tier 1 and Tier 2 institutional capital partners."
                delay="0.4s"
            />
          </div>
        </div>
      </section>

      <footer className="py-20 bg-[#0B0C10] border-t border-white/5 text-center">
         <div className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-700">
            © 2024 NEXUS INTELLIGENCE OS • DEPLOYED WORLDWIDE
         </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc, delay }: any) => (
  <div className="bg-[#1F2833]/30 backdrop-blur-xl p-12 rounded-[3rem] border border-white/5 hover:border-[#059669]/40 transition-all group animate-fade-in shadow-2xl" style={{ animationDelay: delay }}>
     <div className="mb-10 bg-[#059669]/10 w-20 h-20 rounded-3xl flex items-center justify-center text-[#059669] group-hover:scale-110 group-hover:rotate-6 transition-transform shadow-inner border border-[#059669]/20">{icon}</div>
     <h3 className="text-3xl font-black text-white mb-6 uppercase tracking-tight">{title}</h3>
     <p className="text-[#C5C6C7] leading-relaxed font-medium text-lg italic opacity-80">"{desc}"</p>
  </div>
);

export default ClientLandingPage;
