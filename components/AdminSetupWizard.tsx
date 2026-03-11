import React, { useState, useEffect } from 'react';
import { 
  Rocket, BrainCircuit, Layout, Briefcase, Users, Layers, 
  ArrowRight, CheckCircle, Clock, ShieldCheck, Key, Globe, 
  Plus, Database, RefreshCw, AlertTriangle, Cpu, Zap, ExternalLink,
  Shield, Server, Palette as PaletteIcon, Wifi, Lock, Cloud, Info
} from 'lucide-react';
import { ViewMode, AgencyBranding } from '../types';
import { createClient } from '@supabase/supabase-js';

interface AdminSetupWizardProps {
  onNavigate: (view: ViewMode) => void;
  branding: AgencyBranding;
  onUpdateBranding: (branding: AgencyBranding) => void;
}

const AdminSetupWizard: React.FC<AdminSetupWizardProps> = ({ onNavigate, branding, onUpdateBranding }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Supabase Connection State
  const [dbConfig, setDbConfig] = useState({
    url: localStorage.getItem('nexus_supabase_url') || '',
    key: localStorage.getItem('nexus_supabase_key') || ''
  });
  const [dbStatus, setDbStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [dbError, setDbError] = useState('');

  // Local state for branding setup
  const [tempBranding, setTempBranding] = useState(branding);

  const testAIHandshake = async () => {
    setIsVerifying(true);
    setAiStatus('idle');
    await new Promise(resolve => setTimeout(resolve, 1500));
    const apiKey = process.env.API_KEY;
    const hasKey = !!apiKey && apiKey !== 'YOUR_API_KEY' && apiKey.length > 10;
    setAiStatus(hasKey ? 'success' : 'error');
    setIsVerifying(false);
  };

  const testSupabaseConnection = async () => {
    if (!dbConfig.url || !dbConfig.key) {
        setDbError('Both URL and Key are required for cloud sync.');
        setDbStatus('error');
        return;
    }
    
    setDbStatus('testing');
    setDbError('');

    try {
        const client = createClient(dbConfig.url, dbConfig.key);
        const { error } = await client.from('profiles').select('id').limit(1);
        
        if (error && error.message.includes('failed to fetch')) {
            throw new Error("Could not reach Supabase endpoint.");
        }

        setDbStatus('success');
        localStorage.setItem('nexus_supabase_url', dbConfig.url);
        localStorage.setItem('nexus_supabase_key', dbConfig.key);
    } catch (err: any) {
        setDbStatus('error');
        setDbError(err.message || 'Connection handshake failed.');
    }
  };

  const handleFinalizeBranding = () => {
    onUpdateBranding(tempBranding);
    setActiveStep(2);
  };

  const handleCompleteSetup = () => {
      window.location.hash = 'dashboard';
      window.location.reload();
  };

  const steps = [
    {
      id: 'ai',
      label: 'AI Protocol',
      title: 'Initialize Neural Core',
      desc: 'Verify connectivity to Google Gemini. This powers your AI Underwriter, Content Engine, and Sales Coach.',
      icon: BrainCircuit,
      color: 'text-purple-500',
      component: (
        <div className="space-y-6 animate-fade-in">
          <div className={`p-6 rounded-2xl border-2 transition-all ${aiStatus === 'success' ? 'bg-emerald-50 border-emerald-200' : aiStatus === 'error' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <Cpu size={24} className={aiStatus === 'success' ? 'text-emerald-500' : 'text-slate-400'} />
                <span className="font-bold text-slate-800">Gemini 3.1 Pro Link</span>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${aiStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {aiStatus === 'success' ? 'Authenticated' : 'Unlinked'}
              </div>
            </div>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Detection Mode: Checking environment for <code className="bg-slate-200 px-1 rounded font-mono">API_KEY</code>. 
              Ensure this is set in your Netlify/Vercel settings.
            </p>

            {aiStatus === 'error' ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                  <div className="text-xs text-amber-800 leading-relaxed">
                    <p className="font-bold mb-1">Key Not Detected:</p>
                    <p className="mb-2">System is currently using a mock layer. To enable real intelligence, add your key to environment variables.</p>
                  </div>
                </div>
                <button onClick={testAIHandshake} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
                  {isVerifying ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                  Retry Handshake
                </button>
              </div>
            ) : aiStatus === 'success' ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-100/50 border border-emerald-200 rounded-xl flex items-center gap-3">
                  <CheckCircle className="text-emerald-600" size={18} />
                  <p className="text-xs text-emerald-800 font-bold uppercase tracking-widest">Neural Link Synchronized</p>
                </div>
                <button onClick={() => setActiveStep(1)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transform hover:scale-[1.02] transition-all">
                  Proceed to Branding <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <button onClick={testAIHandshake} disabled={isVerifying} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
                {isVerifying ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} className="text-emerald-400" />}
                Initiate AI Handshake
              </button>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'branding',
      label: 'Identity',
      title: 'Agency Personalization',
      desc: 'Customize the name and appearance that your clients and team will interact with.',
      icon: PaletteIcon,
      color: 'text-blue-500',
      component: (
        <div className="space-y-6 animate-fade-in">
           <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Agency Name</label>
              <input 
                type="text" 
                value={tempBranding.name}
                onChange={e => setTempBranding({...tempBranding, name: e.target.value})}
                className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800 shadow-sm"
              />
           </div>
           <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Brand Accent Color</label>
              <div className="flex gap-4 items-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                 <input 
                   type="color" 
                   value={tempBranding.primaryColor}
                   onChange={e => setTempBranding({...tempBranding, primaryColor: e.target.value})}
                   className="w-16 h-16 rounded-xl border-4 border-white shadow-lg cursor-pointer"
                 />
                 <div className="flex-1">
                    <div className="text-xs font-mono text-slate-400 font-bold uppercase">{tempBranding.primaryColor}</div>
                    <p className="text-[10px] text-slate-400 uppercase mt-1">Global accent for buttons and UI highlights.</p>
                 </div>
              </div>
           </div>
           <button onClick={handleFinalizeBranding} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg transform hover:scale-[1.02] transition-all">
              Lock In Identity <CheckCircle size={16} />
           </button>
        </div>
      )
    },
    {
      id: 'database',
      label: 'Infrastructure',
      title: 'Live Cloud Sync',
      desc: 'Connect your Supabase project to transition from local mock data to a live production database.',
      icon: Database,
      color: 'text-emerald-500',
      component: (
        <div className="space-y-6 animate-fade-in">
           <div className="bg-slate-950 p-6 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10"><Wifi size={100} /></div>
                <div className="relative z-10">
                    <h4 className="text-white font-black uppercase tracking-tight mb-4 flex items-center gap-2"><Cloud className="text-blue-400" size={18}/> Cloud Integration</h4>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Project URL</label>
                            <input 
                                type="text" 
                                placeholder="https://your-id.supabase.co"
                                value={dbConfig.url}
                                onChange={e => setDbConfig({...dbConfig, url: e.target.value})}
                                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Service Role / Anon Key</label>
                            <input 
                                type="password" 
                                placeholder="eyJhbGciOiJIUzI1Ni..."
                                value={dbConfig.key}
                                onChange={e => setDbConfig({...dbConfig, key: e.target.value})}
                                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>

                    {dbError && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-[10px] font-bold">
                            <AlertTriangle size={14} /> {dbError}
                        </div>
                    )}

                    <div className="mt-6 flex gap-3">
                        <button 
                            onClick={testSupabaseConnection}
                            disabled={dbStatus === 'testing'}
                            className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${dbStatus === 'success' ? 'bg-emerald-50 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            {dbStatus === 'testing' ? <RefreshCw className="animate-spin" size={14}/> : dbStatus === 'success' ? <CheckCircle size={14}/> : <Wifi size={14}/>}
                            {dbStatus === 'testing' ? 'Testing Handshake...' : dbStatus === 'success' ? 'Connection Verified' : 'Test & Link Cloud'}
                        </button>
                    </div>
                </div>
           </div>

           <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                <Info size={18} className="text-blue-600 shrink-0" />
                <p className="text-[10px] text-blue-800 leading-relaxed font-medium italic">
                    "Skip this step to continue in <span className="font-bold">Offline Ledger Mode</span>. You can always link Supabase later in the Infrastructure Settings."
                </p>
           </div>

           <button onClick={handleCompleteSetup} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl flex items-center justify-center gap-3 transform hover:-translate-y-1 transition-all active:scale-95">
              Complete Genesis Protocol <Rocket size={20} />
           </button>
        </div>
      )
    }
  ];

  return (
    <div className="max-w-5xl mx-auto py-10 animate-fade-in px-6">
      <div className="bg-slate-950 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden mb-12 border border-white/5">
         <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>
         <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] mb-8 border border-emerald-500/20">
               <Shield size={14} className="fill-emerald-400 text-slate-950" /> Ownership Verified
            </div>
            <h1 className="text-5xl font-black mb-4 tracking-tighter uppercase leading-none">Nexus <span className="text-emerald-500">Activator</span></h1>
            <p className="text-slate-400 max-w-xl text-lg leading-relaxed font-medium">
               Welcome to your private instance of Nexus OS. Follow the activation protocol below to link your AI core and brand your agency.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
         <div className="lg:col-span-5 space-y-4">
            {steps.map((step, idx) => {
               const Icon = step.icon;
               const isActive = idx === activeStep;
               const isCompleted = idx < activeStep;
               
               return (
                 <div 
                   key={step.id} 
                   className={`p-6 rounded-3xl border-2 transition-all flex items-center gap-6 ${isActive ? 'bg-white border-blue-500 shadow-xl' : isCompleted ? 'bg-emerald-50 border-emerald-100 opacity-60' : 'bg-slate-50 border-transparent opacity-40'}`}
                 >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${isActive ? 'bg-blue-600 text-white' : isCompleted ? 'bg-emerald-50 text-white' : 'bg-slate-200 text-slate-400'}`}>
                       {isCompleted ? <CheckCircle size={24} /> : <Icon size={28} />}
                    </div>
                    <div>
                       <h3 className={`font-black text-[10px] uppercase tracking-widest ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>{step.label}</h3>
                       <p className={`font-bold text-sm ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.title}</p>
                    </div>
                 </div>
               );
            })}
         </div>

         <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-200 p-10 shadow-sm flex flex-col min-h-[450px]">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">{steps[activeStep].title}</h2>
            <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed">{steps[activeStep].desc}</p>
            
            <div className="flex-1">
               {steps[activeStep].component}
            </div>
         </div>
      </div>
    </div>
  );
};

export default AdminSetupWizard;