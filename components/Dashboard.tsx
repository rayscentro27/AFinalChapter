
import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, DollarSign, Activity, Sparkles, RefreshCw, 
  History, Zap, CheckCircle, Lightbulb, Target, 
  ShieldAlert, MessageSquare, AlertTriangle,
  BarChart3, ShieldCheck, Globe, Key, Database, CreditCard,
  BrainCircuit, Gavel, Clock, ArrowRight, MousePointer2,
  Users, Building2, MapPin, Phone, Mail, Eye, Terminal,
  PhoneCall, ZapOff, Gauge, Play, ArrowUpRight, Mic, Receipt, Orbit, Maximize2, Hexagon,
  Shield
} from 'lucide-react';
import { Contact, AgencyBranding } from '../types';
import { data } from '../adapters';
import * as geminiService from '../services/geminiService';
import GlobalFundPulse from './GlobalFundPulse';
import VoiceAssistant from './VoiceAssistant';
import GlobalDirectives from './GlobalDirectives';

interface DashboardProps {
  contacts?: Contact[];
  onFocusContact?: (contact: Contact) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ contacts = [], onFocusContact }) => {
  const [systemThoughts, setSystemThoughts] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'brief' | 'watchtower'>('brief');
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);

  // High magnitude deals for sentinel briefing
  const highValueDeals = contacts.filter(c => c.value >= 100000 && c.status !== 'Closed');

  useEffect(() => {
    const runNeuralBriefing = async () => {
      const apiKey = process.env.API_KEY;
      if (!apiKey || apiKey === 'YOUR_API_KEY') return;
      try {
        const thoughts = await geminiService.generateSystemThoughts(contacts);
        setSystemThoughts(thoughts);
      } catch (e) {}
    };
    runNeuralBriefing();
  }, [contacts]);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-10 max-w-7xl mx-auto relative">
      
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 md:mb-6 gap-4">
        <div className="flex bg-[#1F2833]/20 backdrop-blur-xl border border-white/5 p-1.5 rounded-2xl shadow-2xl w-full md:w-auto">
            <button 
                onClick={() => setActiveTab('brief')}
                className={`flex-1 md:flex-none px-6 md:px-10 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all transform active:scale-95 ${activeTab === 'brief' ? 'bg-[#66FCF1] text-slate-950 shadow-[0_0_20px_rgba(102,252,241,0.4)]' : 'text-slate-500 hover:text-white'}`}
            >
                <Target size={14} className="inline mr-1 md:mr-2" /> Briefing
            </button>
            <button 
                onClick={() => setActiveTab('watchtower')}
                className={`flex-1 md:flex-none px-6 md:px-10 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all transform active:scale-95 ${activeTab === 'watchtower' ? 'bg-[#66FCF1] text-slate-950 shadow-[0_0_20px_rgba(102,252,241,0.4)]' : 'text-slate-500 hover:text-white'}`}
            >
                <Eye size={14} className="inline mr-1 md:mr-2" /> Watchtower
            </button>
        </div>

        <button 
          onClick={() => setIsVoiceAssistantOpen(true)}
          className="w-full md:w-auto flex items-center gap-3 bg-[#66FCF1] text-slate-950 px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-[#66FCF1]/20 transform hover:scale-105 hover:-translate-y-1 transition-all active:scale-95"
        >
          <Mic size={16} className="animate-pulse" /> Command Voice Hub
        </button>
      </div>

      {activeTab === 'brief' ? (
        <>
            {/* Sentinel Priority Alerts */}
            {highValueDeals.length > 0 && (
                <div className="bg-red-950/40 border-2 border-red-600 rounded-[3rem] p-8 md:p-12 mb-8 animate-critical-glow relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 p-10 opacity-5"><Shield size={200} /></div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                        <div className="flex-1">
                            <div className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 shadow-lg shadow-red-600/30">
                                <Zap size={14} fill="currentColor" className="animate-pulse" /> Sentinel Priority Alpha
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter uppercase leading-[0.9] text-white">
                                High magnitude <span className="text-red-500">Inventory.</span>
                            </h2>
                            <p className="text-red-100 text-lg md:text-xl font-medium leading-relaxed opacity-90 max-w-xl">
                                System has detected {highValueDeals.length} entities with magnitude >$100k awaiting final protocol.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 shrink-0">
                            {highValueDeals.slice(0, 2).map(deal => (
                                <div key={deal.id} onClick={() => onFocusContact?.(deal)} className="bg-white/5 border border-white/10 hover:bg-white/10 p-6 rounded-[2rem] cursor-pointer transition-all group backdrop-blur-md">
                                    <p className="text-[8px] font-black uppercase text-red-500 tracking-widest mb-2">Target Tranche</p>
                                    <p className="text-xl font-black text-white">${(deal.value/1000).toFixed(0)}k</p>
                                    <p className="text-[10px] font-bold text-slate-400 mt-2 truncate max-w-[120px]">{deal.company}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <GlobalDirectives contacts={contacts} onAction={(c) => onFocusContact?.(c)} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
                {/* SPATIAL CONSTELLATION HUD */}
                <div className="lg:col-span-8 space-y-6 md:space-y-8">
                    <div className="bg-[#0B0C10] rounded-[3rem] p-12 border border-white/5 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[550px] group border-animated">
                        <div className="absolute top-8 left-10 z-20">
                            <div className="inline-flex items-center gap-2 bg-[#66FCF1]/10 text-[#66FCF1] px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.4em] border border-[#66FCF1]/20">
                                <Orbit size={12} className="animate-spin-slow" /> Readiness Constellation
                            </div>
                            <h2 className="text-3xl font-black uppercase tracking-tighter text-white mt-4 leading-none">Global <br/> Readiness.</h2>
                        </div>

                        {/* SPATIAL ORBIT VISUALIZATION */}
                        <div className="relative w-full h-full flex items-center justify-center py-20">
                             <div className="relative z-10 w-24 h-24 bg-slate-900 rounded-[2rem] border-4 border-[#66FCF1] shadow-[0_0_50px_rgba(102,252,241,0.4)] flex items-center justify-center transform rotate-3 animate-float">
                                <Hexagon size={40} className="text-[#66FCF1] fill-[#66FCF1]/10" />
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded text-[8px] font-black text-slate-900 uppercase">Agency Node</div>
                             </div>

                             <div className="absolute w-48 h-48 border border-white/5 rounded-full"></div>
                             <div className="absolute w-72 h-72 border border-white/5 rounded-full"></div>
                             <div className="absolute w-96 h-96 border border-white/5 rounded-full animate-spin-slow opacity-30"></div>

                             {contacts.slice(0, 10).map((c, i) => {
                                const angle = (i / 10) * 360;
                                const readiness = c.aiScore || 50;
                                const radius = 250 - (readiness * 2); 
                                return (
                                    <div 
                                        key={c.id}
                                        className="absolute transition-all duration-1000 group/planet cursor-pointer"
                                        style={{ transform: `rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)` }}
                                        onClick={() => onFocusContact?.(c)}
                                    >
                                        <div className={`w-3 h-3 rounded-full shadow-lg ${c.status === 'Closed' ? 'bg-[#66FCF1] shadow-[#66FCF1]/40' : c.status === 'Negotiation' ? 'bg-amber-500' : 'bg-blue-500'} group-hover/planet:scale-150 transition-transform`}></div>
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/planet:opacity-100 transition-opacity bg-slate-950 border border-white/10 px-3 py-1.5 rounded-xl whitespace-nowrap shadow-2xl pointer-events-none z-30">
                                            <p className="text-[10px] font-black text-white uppercase">{c.company}</p>
                                            <p className="text-[8px] text-slate-500 font-bold uppercase">${c.value.toLocaleString()} Magnitude</p>
                                        </div>
                                    </div>
                                );
                             })}
                        </div>

                        <div className="absolute bottom-8 right-10 flex gap-10 text-right z-20">
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Portfolio Density</p>
                                <p className="text-3xl font-black text-white">0.94 <span className="text-sm opacity-30 font-mono text-[#66FCF1]">AU</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6 md:space-y-8">
                    <div className="bg-[#0B0C10] rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden flex flex-col h-full border border-white/5 holographic-edge group">
                        <h3 className="text-[10px] font-black text-[#66FCF1] uppercase tracking-[0.4em] mb-10 flex items-center gap-2 relative z-10"><Zap size={16} fill="currentColor" className="animate-pulse" /> Closing Queue</h3>
                        <div className="space-y-4 relative z-10 flex-1 overflow-y-auto no-scrollbar min-h-[350px]">
                            {contacts.filter(c => c.aiPriority === 'Hot').map((lead) => (
                                <div key={lead.id} onClick={() => onFocusContact?.(lead)} className="bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/10 transition-all cursor-pointer transform hover:scale-[1.02]">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="text-[9px] font-black uppercase px-3 py-1 rounded-full bg-[#66FCF1] text-slate-950 shadow-[0_0_15px_rgba(102,252,241,0.4)]">Vetted</span>
                                        <ArrowRight size={14} className="text-slate-600 group-hover:text-[#66FCF1] group-hover:translate-x-1 transition-all" />
                                    </div>
                                    <h4 className="text-base font-black uppercase tracking-tight text-white truncate">{lead.company}</h4>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">${lead.value.toLocaleString()} Magnitude</p>
                                </div>
                            ))}
                        </div>
                        <button 
                            onClick={() => window.location.hash = 'power_dialer'}
                            className="w-full mt-10 bg-[#66FCF1] text-slate-950 py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-white transition-all shadow-2xl active:scale-95 transform hover:-translate-y-1"
                        >
                            Activate Global Dialer <PhoneCall size={16} />
                        </button>
                    </div>

                    <div className="bg-[#0B0C10] rounded-[2.5rem] p-8 text-[#66FCF1] font-mono text-[11px] border border-white/5 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Terminal size={80}/></div>
                        <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 mb-6 flex items-center gap-2">
                           <RefreshCw size={12} className="animate-spin text-blue-500" /> Neural Floor Stream
                        </h4>
                        <div className="space-y-3 max-h-40 overflow-hidden">
                           {systemThoughts.map((thought, i) => (
                             <div key={i} className="flex gap-4 animate-spatial" style={{ animationDelay: `${i * 0.15}s` }}>
                                <span className="opacity-20 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                <span className="opacity-90 truncate whitespace-nowrap italic">{thought}</span>
                             </div>
                           ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
      ) : (
          <GlobalFundPulse contacts={contacts} onOpenVoice={() => setIsVoiceAssistantOpen(true)} />
      )}

      <VoiceAssistant isOpen={isVoiceAssistantOpen} onClose={() => setIsVoiceAssistantOpen(false)} contacts={contacts} />
    </div>
  );
};

export default Dashboard;
