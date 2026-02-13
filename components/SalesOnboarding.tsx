import React, { useState } from 'react';
import { 
    Rocket, ShieldCheck, Play, ArrowRight, Gavel, 
    BookOpen, DollarSign, CheckCircle, RefreshCw, 
    Zap, Sparkles, Target, Layers, LogOut,
    // Added Shield icon to imports
    Shield
} from 'lucide-react';
import { User, ViewMode } from '../types';
import SmartContractSigner from './SmartContractSigner';

interface SalesOnboardingProps {
  user: User;
  onComplete: () => void;
  onLogout: () => void;
}

const SalesOnboarding: React.FC<SalesOnboardingProps> = ({ user, onComplete, onLogout }) => {
  const [step, setStep] = useState(0);
  const [iscaSigned, setIscaSigned] = useState(false);
  const [showSigner, setShowSigner] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const steps = [
    { label: 'Infrastructure', icon: ShieldCheck, title: 'Contract Execution' },
    { label: 'Knowledge Base', icon: BookOpen, title: 'Tactical Training' },
    { label: 'Compensation', icon: DollarSign, title: 'Payout Architecture' },
    { label: 'Deployment', icon: Rocket, title: 'System Access' }
  ];

  const handleFinishTraining = () => {
      setIsFinalizing(true);
      setTimeout(() => {
          onComplete();
      }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100 overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full"></div>
      </div>

      {/* Onboarding Header */}
      <header className="h-24 border-b border-white/5 flex items-center justify-between px-10 relative z-10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
                <Zap size={24} className="text-white fill-white" />
            </div>
            <div>
                <h1 className="text-xl font-black uppercase tracking-tighter">Nexus <span className="text-blue-500">Onboarding</span></h1>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">Operational Phase: Genesis</p>
            </div>
        </div>
        <button onClick={onLogout} className="p-3 text-slate-500 hover:text-red-400 transition-colors bg-white/5 rounded-xl"><LogOut size={20}/></button>
      </header>

      {/* Progress HUD */}
      <div className="max-w-6xl mx-auto w-full px-10 pt-12 pb-20 flex-1 flex flex-col relative z-10">
        <div className="flex justify-between mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -translate-y-1/2 z-0"></div>
            {steps.map((s, idx) => (
                <div key={idx} className="relative z-10 flex flex-col items-center group">
                    <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-700 ${step === idx ? 'bg-blue-600 border-blue-500 shadow-[0_0_25px_rgba(37,99,235,0.4)] scale-110' : step > idx ? 'bg-emerald-50 border-emerald-400' : 'bg-slate-900 border-slate-800'}`}>
                        {step > idx ? <CheckCircle size={22} className="text-white" /> : <s.icon size={22} className={step === idx ? 'text-white' : 'text-slate-600'} />}
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] mt-3 ${step === idx ? 'text-blue-400' : 'text-slate-600'}`}>{s.label}</span>
                </div>
            ))}
        </div>

        <div className="flex-1 flex items-center justify-center">
            {step === 0 && (
                <div className="max-w-xl w-full space-y-10 animate-fade-in text-center">
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/20">Protocol Infrastructure</div>
                    <h2 className="text-5xl font-black tracking-tighter uppercase leading-[0.9]">
                        Execute your <span className="text-blue-500">Contracts.</span>
                    </h2>
                    <p className="text-slate-400 text-lg leading-relaxed font-medium">
                        To activate your seat in the Nexus Intelligence Core, you must sign the Independent Sales Contractor Agreement (ISCA). This secures your commission splits and defines data privacy protocols.
                    </p>
                    <div className="pt-6">
                        {iscaSigned ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[2rem] flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <CheckCircle size={32} className="text-emerald-500" />
                                    <div className="text-left">
                                        <p className="font-black text-emerald-400 uppercase text-sm">Agreement Captured</p>
                                        <p className="text-[10px] text-emerald-600 font-bold uppercase">Hashed & Vaulted on Ledger</p>
                                    </div>
                                </div>
                                <button onClick={() => setStep(1)} className="bg-emerald-500 text-slate-950 px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-400">Proceed <ArrowRight className="inline ml-2" size={14}/></button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setShowSigner(true)}
                                className="bg-blue-600 text-white px-12 py-5 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl hover:bg-blue-500 transition-all flex items-center justify-center gap-4 mx-auto transform active:scale-95"
                            >
                                <Gavel size={22} /> Initiate Digital Execution
                            </button>
                        )}
                    </div>
                </div>
            )}

            {step === 1 && (
                <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 animate-fade-in">
                    <div className="flex flex-col justify-center space-y-8">
                        <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 w-fit">Mastery Protocol</div>
                        <h2 className="text-5xl font-black tracking-tighter uppercase leading-[0.9]">
                            Absorb the <span className="text-emerald-500">Arsenal.</span>
                        </h2>
                        <p className="text-slate-400 text-lg leading-relaxed font-medium">
                            Our AI Training Lab features live roleplay combat simulations and deep dives into forensic document analysis. You'll need to complete Module 1 to unlock the Lead Pipeline.
                        </p>
                        <button onClick={() => setStep(2)} className="bg-white text-slate-950 px-10 py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-emerald-50 shadow-2xl flex items-center justify-center gap-3 w-fit transform active:scale-95 transition-all">
                            Complete Briefing <ArrowRight size={18}/>
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { title: 'The Closing Move', sub: 'Mastering the AI Combat Trainer', icon: Target, color: 'text-red-500' },
                            { title: 'Content Factory', sub: 'Generating viral social assets', icon: Zap, color: 'text-blue-500' },
                            { title: 'Sentinel Guard', sub: 'Forensic underwriting logic', icon: ShieldCheck, color: 'text-emerald-500' }
                        ].map((m, i) => (
                            <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-[2.5rem] flex items-center gap-6 group hover:bg-white/10 transition-all cursor-pointer">
                                <div className={`p-4 rounded-2xl bg-white/5 group-hover:scale-110 transition-transform ${m.color}`}>
                                    <m.icon size={24} />
                                </div>
                                <div>
                                    <h4 className="font-black text-white text-sm uppercase tracking-tight">{m.title}</h4>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{m.sub}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="max-w-xl w-full space-y-10 animate-fade-in text-center">
                    <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">Compensation Logic</div>
                    <h2 className="text-5xl font-black tracking-tighter uppercase leading-[0.9]">
                        Your Split is <span className="text-indigo-400">{user.commissionSplit || 50}%.</span>
                    </h2>
                    <p className="text-slate-400 text-lg leading-relaxed font-medium italic">
                        "Real-time liquidity tracking. No manual accounting."
                    </p>
                    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 grid grid-cols-2 gap-10">
                        <div className="text-center">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Payout Method</p>
                            <p className="text-xl font-black text-white uppercase">Stripe Instant</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Cycle</p>
                            <p className="text-xl font-black text-white uppercase">Every Friday</p>
                        </div>
                    </div>
                    <button onClick={() => setStep(3)} className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl hover:bg-indigo-50 transition-all flex items-center justify-center gap-4 mx-auto transform active:scale-95">
                        Accept Architecture <CheckCircle size={18}/>
                    </button>
                </div>
            )}

            {step === 3 && (
                <div className="max-w-xl w-full space-y-10 animate-fade-in text-center">
                    <div className="relative">
                        <RefreshCw size={120} className={`mx-auto text-blue-500 opacity-20 ${isFinalizing ? 'animate-spin' : ''}`} />
                        <Rocket size={48} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-pulse" />
                    </div>
                    <h2 className="text-5xl font-black tracking-tighter uppercase leading-[0.9]">
                        Deploy <span className="text-blue-400">Workspace.</span>
                    </h2>
                    <p className="text-slate-400 text-lg leading-relaxed font-medium">
                        Onboarding complete. Your identity has been synchronized with the Global CRM and Dialer. Welcome to the team, {user.name}.
                    </p>
                    <button 
                        onClick={handleFinishTraining}
                        disabled={isFinalizing}
                        className="bg-blue-600 text-white px-16 py-6 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-blue-500 transition-all flex items-center justify-center gap-4 mx-auto transform active:scale-95 disabled:opacity-50"
                    >
                        {isFinalizing ? 'Initializing Core...' : 'Enter Closing Floor'}
                    </button>
                </div>
            )}
        </div>
      </div>

      {showSigner && (
          <SmartContractSigner 
            offer={{
                id: 'isca_onboarding',
                lenderName: 'Nexus Global Holdings',
                amount: 0,
                term: 'ISCA Protocol v2.5',
                rate: '0',
                payment: 'Commission',
                paymentAmount: 0,
                status: 'Sent',
                dateSent: ''
            }}
            onClose={() => setShowSigner(false)}
            onSign={(sig) => {
                setIscaSigned(true);
                setShowSigner(false);
            }}
          />
      )}

      {/* Footer Vitals */}
      <footer className="p-8 border-t border-white/5 bg-slate-950/50 text-center">
          <div className="flex items-center justify-center gap-6 text-[8px] font-black text-slate-700 uppercase tracking-[0.5em]">
              {/* Fix: Added missing Shield icon above */}
              <span className="flex items-center gap-2"><Shield size={10}/> Bank-Grade Security</span>
              <span className="flex items-center gap-2"><Sparkles size={10}/> Neural Training Active</span>
              <span className="flex items-center gap-2"><Layers size={10}/> Multi-Tenant Privacy</span>
          </div>
      </footer>
    </div>
  );
};

export default SalesOnboarding;