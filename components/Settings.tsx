
import React, { useState, useEffect } from 'react';
import { 
  Globe, Save, CheckCircle, Shield, Layers, Server, Key, 
  ShieldCheck, Database, Zap, RefreshCw, Cloud, ArrowUpCircle, ExternalLink,
  CreditCard, Lock, Eye, EyeOff, BrainCircuit, Sparkles, AlertTriangle,
  Rocket, Terminal, Github, Activity, Palette as PaletteIcon, 
  Phone, Share2, Building2, Search, Link2, Wifi, MessageCircle, 
  Instagram, Facebook, Linkedin, MessageSquare, Smartphone, Receipt, Award,
  Info, Users, UserPlus, Trash2, MapPin, Mail, Link as LinkIcon, GitBranch,
  Plus, ChevronRight, Play, Settings as SettingsIcon, Filter, MousePointer2, X,
  Music, DollarSign, Star, Gauge, PlusCircle, ZapOff, Bot, TrendingUp, Cpu,
  Landmark, Mail as MailIcon
} from 'lucide-react';
import { AgencyBranding, User, PipelineRule, Contact, ViewMode, AutoReplyRule, AiEmployee } from '../types';
import { BACKEND_CONFIG } from '../adapters/config';
import * as geminiService from '../services/geminiService';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import AccountIntegrationsPanel from './AccountIntegrationsPanel';

interface SettingsProps {
  branding: AgencyBranding;
  onUpdateBranding: (branding: AgencyBranding) => void;
  onNavigate: (view: ViewMode) => void;
}

const Settings: React.FC<SettingsProps> = ({ branding, onUpdateBranding, onNavigate }) => {
  const validTabs = new Set([
    'connectivity',
    'intelligence',
    'ai_workforce',
    'marketing_nodes',
    'autoreply',
    'team',
    'social',
    'billing',
    'general',
  ]);

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const fromStorage = localStorage.getItem('nexus_settings_activeTab') || 'connectivity';
      return validTabs.has(fromStorage) ? fromStorage : 'connectivity';
    } catch (e) {
      return 'connectivity';
    }
  });
  const [successMsg, setSuccessMsg] = useState('');
  const [hasAiKey, setHasAiKey] = useState(false);
  
  const [localBranding, setLocalBranding] = useState<AgencyBranding>(branding);
  const [isSyncingSocial, setIsSyncingSocial] = useState<string | null>(null);


  const socialPlatforms: { id: string; label: string; icon: any; hint: string }[] = [
    { id: 'instagram', label: 'Instagram', icon: Instagram, hint: '@handle or profile URL' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, hint: 'Page URL' },
    { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, hint: 'Company page URL' },
    { id: 'google_business', label: 'Google Business', icon: MapPin, hint: 'Business name or maps URL' },
  ];

  const upsertSocialConnection = (
    platform: string,
    patch: Partial<{ handle: string; connected: boolean }>
  ) => {
    setLocalBranding(prev => {
      const list = prev.socialConnections ? [...prev.socialConnections] : [];
      const idx = list.findIndex(s => s.platform === platform);
      const current = idx >= 0 ? list[idx] : { platform, handle: '', connected: false };
      const next = { ...current, ...patch };
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      return { ...prev, socialConnections: list };
    });
  };

  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffSplit, setStaffSplit] = useState(50);
  const [isInviting, setIsInviting] = useState(false);
  const { signUp } = useAuth();

  // API Override State
  const [apiKeys, setApiKeys] = useState({
    GEMINI: localStorage.getItem('nexus_override_API_KEY') || '',
    STRIPE_PK: localStorage.getItem('nexus_override_VITE_STRIPE_PUBLIC_KEY') || '',
    TWILIO_SID: localStorage.getItem('nexus_override_TWILIO_SID') || '',
    PLAID_CLIENT: localStorage.getItem('nexus_override_PLAID_CLIENT_ID') || ''
  });

  useEffect(() => {
    const apiKey = process.env.API_KEY || apiKeys.GEMINI;
    setHasAiKey(!!apiKey && apiKey.length > 5);
  }, [apiKeys.GEMINI]);

  useEffect(() => {
    try {
      localStorage.setItem('nexus_settings_activeTab', activeTab);
    } catch (e) {
      // Ignore
    }
  }, [activeTab]);

  useEffect(() => {
    const onTab = (event: Event) => {
      const e = event as CustomEvent;
      const next = (e && typeof (e as any).detail === 'string') ? (e as any).detail : null;
      if (next && validTabs.has(next)) setActiveTab(next);
    };

    window.addEventListener('nexus:settings-tab', onTab as EventListener);
    return () => window.removeEventListener('nexus:settings-tab', onTab as EventListener);
  }, []);

  const handleUpdateApiKey = (key: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [key]: value }));
    localStorage.setItem(`nexus_override_${key === 'GEMINI' ? 'API_KEY' : key === 'STRIPE_PK' ? 'VITE_STRIPE_PUBLIC_KEY' : key}`, value);
    setSuccessMsg(`${key} Protocol Override Updated.`);
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleGlobalSave = () => {
    onUpdateBranding(localBranding);
    setSuccessMsg('Infrastructure protocols synchronized.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-20">
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#0B0C10] to-slate-500">Infrastructure</h1>
          <p className="text-slate-500 mt-2 font-medium">Command central for API protocols and autonomous scaling.</p>
        </div>
        <button 
          onClick={handleGlobalSave}
          className="bg-slate-950 text-white px-10 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-[#66FCF1] hover:text-slate-950 shadow-2xl transition-all transform active:scale-95 flex items-center gap-3 border border-white/10"
        >
          <Save size={18} /> Push Global Config
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-10">
        <div className="w-full md:w-64 flex-shrink-0">
          <nav className="space-y-1.5 sticky top-24">
            {[
              { id: 'connectivity', label: 'API Matrix', icon: Zap },
              { id: 'intelligence', label: 'Neural Link', icon: BrainCircuit },
              { id: 'ai_workforce', label: 'AI Workforce', icon: Bot },
              { id: 'marketing_nodes', label: 'Marketing Nodes', icon: MailIcon },
              { id: 'autoreply', label: 'Auto-Reply', icon: MessageSquare },
              { id: 'team', label: 'Staff Node', icon: Users },
              { id: 'social', label: 'Social Link', icon: Share2 },
              { id: 'billing', label: 'Capital Tiers', icon: Receipt },
              { id: 'general', label: 'Agency Profile', icon: Building2 },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)} 
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-slate-900 text-[#66FCF1] shadow-xl ring-1 ring-[#66FCF1]/30' : 'text-slate-400 hover:bg-white hover:text-slate-900'}`}
              >
                <div className="flex items-center gap-3">
                    <tab.icon size={18} /> {tab.label}
                </div>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1">
          {successMsg && <div className="mb-6 bg-emerald-950 text-[#66FCF1] px-6 py-4 rounded-2xl flex items-center gap-3 text-sm font-black border border-[#66FCF1]/20 animate-fade-in shadow-xl shadow-[#66FCF1]/10"><CheckCircle size={18} /> {successMsg}</div>}

          <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden min-h-[700px] flex flex-col">
            
            {activeTab === 'connectivity' && (
                <div className="p-10 space-y-10 animate-fade-in">
                    <div className="bg-[#0B0C10] p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Database size={300}/></div>
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 bg-[#66FCF1]/10 text-[#66FCF1] px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-8 border border-[#66FCF1]/20">
                                <Lock size={12}/> Secure Gateway v2.5
                            </div>
                            <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4 mb-4">
                                API Matrix HUD
                            </h3>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-lg font-medium">
                                Configure the neural handshakes that power your autonomous ecosystem. Overrides set here are prioritized over environment defaults.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ApiField 
                            label="Google Gemini (AI Core)" 
                            value={apiKeys.GEMINI} 
                            onChange={(val) => handleUpdateApiKey('GEMINI', val)}
                            icon={<BrainCircuit size={18}/>}
                            status={hasAiKey ? 'Authenticated' : 'Unlinked'}
                            placeholder="Enter Pro API Key"
                        />
                        <ApiField 
                            label="Stripe (Capital Settlement)" 
                            value={apiKeys.STRIPE_PK} 
                            onChange={(val) => handleUpdateApiKey('STRIPE_PK', val)}
                            icon={<CreditCard size={18}/>}
                            status={apiKeys.STRIPE_PK ? 'Authenticated' : 'Unlinked'}
                            placeholder="pk_live_..."
                        />
                        <ApiField 
                            label="Twilio (Dialer & SMS)" 
                            value={apiKeys.TWILIO_SID} 
                            onChange={(val) => handleUpdateApiKey('TWILIO_SID', val)}
                            icon={<Phone size={18}/>}
                            status={apiKeys.TWILIO_SID ? 'Authenticated' : 'Unlinked'}
                            placeholder="Account SID"
                        />
                        <ApiField 
                            label="Plaid (Bank Spreading)" 
                            value={apiKeys.PLAID_CLIENT} 
                            onChange={(val) => handleUpdateApiKey('PLAID_CLIENT', val)}
                            icon={<Landmark size={18}/>}
                            status={apiKeys.PLAID_CLIENT ? 'Authenticated' : 'Unlinked'}
                            placeholder="Client ID"
                        />
                    </div>

                    <div className="p-10 bg-blue-50 border border-blue-100 rounded-[3rem] flex items-start gap-6">
                        <div className="p-4 bg-blue-600 rounded-3xl text-white shadow-lg"><Info size={24}/></div>
                        <div>
                            <h4 className="text-lg font-black text-blue-900 uppercase tracking-tight mb-2">Institutional Security Note</h4>
                            <p className="text-sm text-blue-800 leading-relaxed font-medium">
                                API overrides are stored in your local browser instance for immediate operational testing. For team-wide stability, ensure keys are mirrored in your primary server environment (Vercel/Netlify).
                            </p>
                        </div>
                    </div>

                    <AccountIntegrationsPanel />
                </div>
            )}
            {activeTab === 'marketing_nodes' && (
                <div className="p-10 space-y-10 animate-fade-in">
                    <div className="bg-[#0B0C10] p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><MailIcon size={300}/></div>
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 bg-[#66FCF1]/10 text-[#66FCF1] px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-8 border border-[#66FCF1]/20">
                                <Smartphone size={12}/> Comms Architecture
                            </div>
                            <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4 mb-4">
                                Marketing Node Sync
                            </h3>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-lg font-medium">
                                Link your MailerLite account to synchronize CRM leads directly into your marketing funnels.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 border border-slate-200 p-8 rounded-[2.5rem] group hover:border-[#66FCF1] transition-all shadow-sm">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">MailerLite API Key (Server)</label>
                            <div className="w-full p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                                Set <span className="font-mono">MAILERLITE_API_KEY</span> in Netlify environment variables. This key stays server-side and is never stored in browser settings.
                            </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-8 rounded-[2.5rem] group hover:border-[#66FCF1] transition-all shadow-sm">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">MailerLite Group ID</label>
                            <input 
                                type="text" 
                                value={localBranding.mailerLite?.groupId || ''}
                                onChange={e => setLocalBranding({ ...localBranding, mailerLite: { ...localBranding.mailerLite, groupId: e.target.value, autoSync: localBranding.mailerLite?.autoSync || false } })}
                                placeholder="e.g. 11042942"
                                className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-[#66FCF1] outline-none"
                            />
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex items-center justify-between">
                        <div>
                            <h4 className="font-black text-slate-900 uppercase text-sm tracking-tight">Lead Auto-Migration</h4>
                            <p className="text-xs text-slate-500 mt-1">Automatically push new CRM registrations to MailerLite.</p>
                        </div>
                        <button 
                            onClick={() => setLocalBranding({ ...localBranding, mailerLite: { ...localBranding.mailerLite, autoSync: !localBranding.mailerLite?.autoSync } })}
                            className={`w-14 h-8 rounded-full transition-all flex items-center p-1 ${localBranding.mailerLite?.autoSync ? 'bg-[#059669] justify-end' : 'bg-slate-200 justify-start'}`}
                        >
                            <div className="w-6 h-6 bg-white rounded-full shadow-lg"></div>
                        </button>
                    </div>
                </div>
            )}


            {activeTab === 'social' && (
                <div className="p-10 space-y-10 animate-fade-in">
                    <div className="bg-[#0B0C10] p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Share2 size={300}/></div>
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 bg-[#66FCF1]/10 text-[#66FCF1] px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-8 border border-[#66FCF1]/20">
                                <Link2 size={12}/> Social Graph
                            </div>
                            <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4 mb-4">
                                Social Link
                            </h3>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-lg font-medium">
                                Store your social handles and profile URLs for quick access. This does not yet sync data from platforms; it only links your identity layer.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {socialPlatforms.map(p => {
                          const conn = (localBranding.socialConnections || []).find(s => s.platform === p.id) || { platform: p.id, handle: '', connected: false };
                          const Icon = p.icon;
                          const syncing = isSyncingSocial === p.id;
                          return (
                            <div key={p.id} className="bg-slate-50 border border-slate-200 p-8 rounded-[2.5rem] group hover:border-[#66FCF1] transition-all shadow-sm">
                                <div className="flex items-center justify-between gap-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-500 group-hover:text-[#66FCF1] transition-colors">
                                            <Icon size={18} />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest">{p.label}</p>
                                            <p className="text-[10px] text-slate-500 font-medium mt-1">{conn.connected ? 'Connected' : 'Not linked'}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                          if (syncing) return;
                                          setIsSyncingSocial(p.id);
                                          window.setTimeout(() => {
                                            upsertSocialConnection(p.id, { connected: !conn.connected });
                                            setIsSyncingSocial(null);
                                            setSuccessMsg(`${p.label} ${conn.connected ? 'disconnected' : 'connected'}.`);
                                            window.setTimeout(() => setSuccessMsg(''), 2000);
                                          }, 700);
                                        }}
                                        className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                          conn.connected
                                            ? 'bg-white text-slate-700 border-slate-200 hover:border-red-200 hover:text-red-600'
                                            : 'bg-slate-950 text-white border-white/10 hover:bg-[#66FCF1] hover:text-slate-950'
                                        } ${syncing ? 'opacity-70 cursor-wait' : ''}`}
                                    >
                                        {syncing ? 'Syncing...' : conn.connected ? 'Disconnect' : 'Connect'}
                                    </button>
                                </div>

                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Handle / URL</label>
                                <input
                                    type="text"
                                    value={conn.handle || ''}
                                    onChange={e => upsertSocialConnection(p.id, { handle: e.target.value })}
                                    placeholder={p.hint}
                                    className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-[#66FCF1] outline-none"
                                />
                            </div>
                          );
                        })}
                    </div>

                    <div className="p-10 bg-blue-50 border border-blue-100 rounded-[3rem] flex items-start gap-6">
                        <div className="p-4 bg-blue-600 rounded-3xl text-white shadow-lg"><Info size={24}/></div>
                        <div>
                            <h4 className="text-lg font-black text-blue-900 uppercase tracking-tight mb-2">Note</h4>
                            <p className="text-sm text-blue-800 leading-relaxed font-medium">
                                Click <span className="font-black">Push Global Config</span> to save these links to your agency branding state.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'intelligence' && (
                <div className="p-12 space-y-8 animate-fade-in">
                    <div className="p-10 bg-slate-50 border border-slate-200 rounded-[3rem]">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Neural Link</h3>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                            This module is not wired up yet. Configure your AI key in <span className="font-black">API Matrix</span> to enable AI-powered features throughout the OS.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'ai_workforce' && (
                <div className="p-12 space-y-8 animate-fade-in">
                    <div className="p-10 bg-slate-50 border border-slate-200 rounded-[3rem]">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">AI Workforce</h3>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                            Workforce management UI is not implemented yet. For now, use <span className="font-black">Neural Floor</span> for agent operations.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'autoreply' && (
                <div className="p-12 space-y-8 animate-fade-in">
                    <div className="p-10 bg-slate-50 border border-slate-200 rounded-[3rem]">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Auto-Reply</h3>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                            Auto-reply rules UI is not implemented yet. This tab is a placeholder so you don’t hit a blank screen.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'team' && (
                <div className="p-12 space-y-8 animate-fade-in">
                    <div className="p-10 bg-slate-50 border border-slate-200 rounded-[3rem]">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Staff Node</h3>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                            Team invites and role provisioning are not implemented in the UI yet.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'billing' && (
                <div className="p-12 space-y-10 animate-fade-in">
                    <div className="p-10 bg-slate-50 border border-slate-200 rounded-[3rem]">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Capital Tiers</h3>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                            Configure subscription pricing for your client portal.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {(['Bronze', 'Silver', 'Gold'] as const).map(tier => (
                            <div key={tier} className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">{tier} Tier (USD)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={localBranding.tierPrices?.[tier] ?? 0}
                                    onChange={e => {
                                      const n = Number(e.target.value || 0);
                                      setLocalBranding(prev => ({
                                        ...prev,
                                        tierPrices: {
                                          Bronze: prev.tierPrices?.Bronze ?? 0,
                                          Silver: prev.tierPrices?.Silver ?? 0,
                                          Gold: prev.tierPrices?.Gold ?? 0,
                                          [tier]: n,
                                        },
                                      }));
                                    }}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-black text-2xl tracking-tight outline-none focus:ring-2 focus:ring-[#66FCF1]"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {activeTab === 'general' && (
              <div className="p-12 space-y-10 animate-fade-in">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Agency Brand Identity</label>
                    <input 
                      type="text" 
                      value={localBranding.name} 
                      onChange={e => setLocalBranding({ ...localBranding, name: e.target.value })}
                      className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-3xl uppercase tracking-tighter outline-none focus:ring-2 focus:ring-[#66FCF1] transition-all shadow-inner"
                    />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Primary Email Node</label>
                        <input type="email" value={localBranding.contactEmail} onChange={e => setLocalBranding({ ...localBranding, contactEmail: e.target.value })} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-[#66FCF1] transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Physical HQ Address</label>
                        <input type="text" value={localBranding.physicalAddress} onChange={e => setLocalBranding({ ...localBranding, physicalAddress: e.target.value })} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-[#66FCF1] transition-all" />
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ApiField: React.FC<{ label: string; value: string; onChange: (val: string) => void; icon: any; status: string; placeholder?: string }> = ({ label, value, onChange, icon, status, placeholder }) => (
    <div className="bg-slate-50 border border-slate-200 p-8 rounded-[2.5rem] group hover:border-[#66FCF1] transition-all shadow-sm">
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                {icon} {label}
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border ${status === 'Authenticated' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${status === 'Authenticated' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`}></div>
                {status}
            </div>
        </div>
        <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-400 group-hover:text-[#66FCF1] transition-colors"><Lock size={12}/></div>
            <input 
                type="password" 
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-14 pr-6 text-xs font-mono outline-none focus:ring-4 focus:ring-[#66FCF1]/10 focus:border-[#66FCF1] transition-all shadow-inner"
            />
        </div>
    </div>
);

export default Settings;
