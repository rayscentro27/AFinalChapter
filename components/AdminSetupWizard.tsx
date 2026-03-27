import React, { useState, useEffect } from 'react';
import { 
  Rocket, BrainCircuit, Layout, Briefcase, Users, Layers, 
  ArrowRight, CheckCircle, Clock, ShieldCheck, Key, Globe, 
  Plus, Database, RefreshCw, AlertTriangle, Cpu, Zap, ExternalLink,
  Shield, Server, Palette as PaletteIcon, Wifi, Lock, Cloud, Info
} from 'lucide-react';
import { ViewMode, AgencyBranding } from '../types';
import { createClient } from '@supabase/supabase-js';
import * as geminiService from '../services/geminiService';

interface AdminSetupWizardProps {
  onNavigate: (view: ViewMode) => void;
  branding: AgencyBranding;
  onUpdateBranding: (branding: AgencyBranding) => void;
}

const AdminSetupWizard: React.FC<AdminSetupWizardProps> = ({ onNavigate, branding, onUpdateBranding }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  // Readiness snapshot state
  const [readiness, setReadiness] = useState({
    hasRegisteredBusiness: false,
    docsReady: false,
    hasMajorDerog: false,
    utilizationPct: 20,
    monthsReserves: 2,
    wantsGrants: false,
    wantsSba: false,
    wantsTier1: true,
  });
  // Business profile state
  const [businessProfile, setBusinessProfile] = useState({
    legalName: branding.name,
    taxId: '',
    structure: 'LLC',
    industry: '',
    ownershipPercentage: 100,
    establishedDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    website: '',
    riskLevel: 'Low',
    missionStatement: '',
    impactSummary: ''
  });

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
    const steps = [
      {
        id: 'welcome',
        label: 'Welcome',
        title: 'Welcome to Nexus OS',
        desc: 'Begin your SuperAdmin onboarding. This protocol will guide you through essential setup for your agency.',
        icon: Shield,
        color: 'text-emerald-500',
        component: (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl">
              <h2 className="text-xl font-black text-blue-700 mb-2">Welcome, SuperAdmin!</h2>
              <p className="text-slate-700 text-sm mb-2">You are about to activate your private Nexus OS instance. This wizard will help you connect services, verify readiness, and launch your AI-powered agency.</p>
              <ul className="list-disc ml-6 text-xs text-slate-600">
                <li>Connect AI and database services</li>
                <li>Complete readiness checklist</li>
                <li>Set up your business profile</li>
                <li>Activate your AI workforce</li>
                <li>Go live with your system</li>
              </ul>
            </div>
            <button onClick={() => setActiveStep(1)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transform hover:scale-[1.02] transition-all">Begin Setup <ArrowRight size={16} /></button>
          </div>
        )
      },
      {
        id: 'ai',
        label: 'AI Protocol',
        title: 'Initialize Neural Core',
        desc: 'Verify connectivity to Google Gemini. This powers your AI Underwriter, Content Engine, and Sales Coach.',
        icon: BrainCircuit,
        color: 'text-purple-500',
        component: (
          <div className="space-y-6 animate-fade-in">...</div>
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
          <div className="space-y-6 animate-fade-in">...</div>
        )
      },
      {
        id: 'readiness',
        label: 'Readiness',
        title: 'Readiness Snapshot',
        desc: 'Complete the operational readiness checklist to ensure your agency is launch-ready.',
        icon: CheckCircle,
        color: 'text-emerald-600',
        component: (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
              <h3 className="text-lg font-black text-slate-800 mb-2">Operational Readiness</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={readiness.hasRegisteredBusiness} onChange={e => setReadiness(r => ({...r, hasRegisteredBusiness: e.target.checked}))} />
                  Registered business entity
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={readiness.docsReady} onChange={e => setReadiness(r => ({...r, docsReady: e.target.checked}))} />
                  All required documents ready
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={readiness.hasMajorDerog} onChange={e => setReadiness(r => ({...r, hasMajorDerog: e.target.checked}))} />
                  Major derogatories (charge-off/collections)
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  Utilization %
                  <input type="number" value={readiness.utilizationPct} onChange={e => setReadiness(r => ({...r, utilizationPct: Number(e.target.value)}))} className="w-20 ml-2 p-1 border rounded" />
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  Months reserves
                  <input type="number" value={readiness.monthsReserves} onChange={e => setReadiness(r => ({...r, monthsReserves: Number(e.target.value)}))} className="w-20 ml-2 p-1 border rounded" />
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={readiness.wantsTier1} onChange={e => setReadiness(r => ({...r, wantsTier1: e.target.checked}))} />
                  Want Tier 1 (0% intro)
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={readiness.wantsSba} onChange={e => setReadiness(r => ({...r, wantsSba: e.target.checked}))} />
                  Want SBA path
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={readiness.wantsGrants} onChange={e => setReadiness(r => ({...r, wantsGrants: e.target.checked}))} />
                  Want grants
                </label>
              </div>
            </div>
            <button onClick={() => setActiveStep(activeStep + 1)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transform hover:scale-[1.02] transition-all">Next: Business Profile <ArrowRight size={16} /></button>
          </div>
        )
      },
      {
        id: 'businessProfile',
        label: 'Business Profile',
        title: 'Business Entity Profile',
        desc: 'Enter your business details for compliance and AI-powered grant writing.',
        icon: Briefcase,
        color: 'text-blue-700',
        component: (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
              <h3 className="text-lg font-black text-slate-800 mb-2">Business Profile</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Legal Name</label><input type="text" value={businessProfile.legalName} onChange={e => setBusinessProfile(bp => ({...bp, legalName: e.target.value}))} className="w-full p-2 border rounded" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">EIN / Tax ID</label><input type="text" value={businessProfile.taxId} onChange={e => setBusinessProfile(bp => ({...bp, taxId: e.target.value}))} className="w-full p-2 border rounded" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Structure</label><select value={businessProfile.structure} onChange={e => setBusinessProfile(bp => ({...bp, structure: e.target.value}))} className="w-full p-2 border rounded"><option>LLC</option><option>S-Corp</option><option>C-Corp</option><option>Sole Prop</option></select></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Industry</label><input type="text" value={businessProfile.industry} onChange={e => setBusinessProfile(bp => ({...bp, industry: e.target.value}))} className="w-full p-2 border rounded" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Website</label><input type="text" value={businessProfile.website} onChange={e => setBusinessProfile(bp => ({...bp, website: e.target.value}))} className="w-full p-2 border rounded" /></div>
                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Risk Level</label><select value={businessProfile.riskLevel} onChange={e => setBusinessProfile(bp => ({...bp, riskLevel: e.target.value as any}))} className="w-full p-2 border rounded"><option>Low</option><option>Medium</option><option>High</option></select></div>
              </div>
              <div className="mt-4">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Mission Statement</label>
                <textarea value={businessProfile.missionStatement} onChange={e => setBusinessProfile(bp => ({...bp, missionStatement: e.target.value}))} className="w-full p-2 border rounded" />
              </div>
              <div className="mt-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Impact Summary</label>
                <textarea value={businessProfile.impactSummary} onChange={e => setBusinessProfile(bp => ({...bp, impactSummary: e.target.value}))} className="w-full p-2 border rounded" />
                <p className="text-[9px] text-slate-400 mt-2 font-bold italic">Critical: This data powers your AI Grant Writer.</p>
              </div>
            </div>
            <button onClick={() => setActiveStep(activeStep + 1)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transform hover:scale-[1.02] transition-all">Next: AI Workforce <ArrowRight size={16} /></button>
          </div>
        )
      },
      {
        id: 'aiWorkforce',
        label: 'AI Workforce',
        title: 'Activate AI Workforce',
        desc: 'Review and activate your AI-powered team for underwriting, content, and support.',
        icon: Cpu,
        color: 'text-purple-700',
        component: (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
              <h3 className="text-lg font-black text-slate-800 mb-2">AI Workforce Activation</h3>
              <ul className="list-disc ml-6 text-xs text-slate-600">
                <li>AI Underwriter: <span className="text-emerald-600 font-bold">Ready</span></li>
                <li>Content Engine: <span className="text-emerald-600 font-bold">Ready</span></li>
                <li>Sales Coach: <span className="text-emerald-600 font-bold">Ready</span></li>
                <li>Support Sentinel: <span className="text-emerald-600 font-bold">Ready</span></li>
              </ul>
              <p className="mt-4 text-xs text-slate-500">Your AI workforce is pre-configured. You can customize roles and permissions in the Admin Control Plane after launch.</p>
            </div>
            <button onClick={() => setActiveStep(activeStep + 1)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transform hover:scale-[1.02] transition-all">Next: Launch <ArrowRight size={16} /></button>
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
          <div className="space-y-6 animate-fade-in">...</div>
        )
      },
      {
        id: 'launch',
        label: 'Launch',
        title: 'System Live',
        desc: 'Your agency is ready to launch! Complete setup to activate your Nexus OS instance.',
        icon: Rocket,
        color: 'text-blue-700',
        component: (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <h2 className="text-xl font-black text-emerald-700 mb-2">Congratulations!</h2>
              <p className="text-slate-700 text-sm mb-2">You have completed the SuperAdmin onboarding protocol. Your Nexus OS instance is now live and fully operational.</p>
            </div>
            <button onClick={handleCompleteSetup} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl flex items-center justify-center gap-3 transform hover:-translate-y-1 transition-all active:scale-95">Go to Dashboard <Rocket size={20} /></button>
          </div>
        )
      }
    ];
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
          <div className={`${fintechMetric} border-2 transition-all ${aiStatus === 'success' ? 'bg-emerald-50 border-emerald-200' : aiStatus === 'error' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
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
              Detection Mode: Checking secure server-side AI gateway reachability.
              Browser-side API keys are intentionally disabled.
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
           <div className={`${fintechShell} bg-slate-950 p-6 border border-white/10 shadow-2xl relative overflow-hidden`}> 
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