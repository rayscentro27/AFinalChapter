
import React, { useState } from 'react';
import { 
  CreditCard, ShieldCheck, Landmark, Smartphone, 
  Globe, Briefcase, Zap, Star, ExternalLink, 
  TrendingUp, CheckCircle, Info, Building2, Search,
  Award, Rocket, Shield, Key
} from 'lucide-react';
import { AffiliateTool } from '../types';

const PARTNERS: AffiliateTool[] = [
  {
    id: 'iiq',
    name: 'IdentityIQ',
    category: 'Credit',
    description: 'Required for AI Underwriting. Provides real-time 3-bureau reports and identity monitoring.',
    payoutInfo: 'Best for: Personal Credit Monitoring',
    link: 'https://www.identityiq.com', // Replace with affiliate link
    logo: '🆔',
    isRecommended: true
  },
  {
    id: 'nav',
    name: 'Nav Business',
    category: 'Credit',
    description: 'Establish Tier 1 trade lines and track your Dun & Bradstreet business credit score.',
    payoutInfo: 'Best for: Business Credit Building',
    link: 'https://www.nav.com',
    logo: '🧭',
    isRecommended: true
  },
  {
    id: 'mercury',
    name: 'Mercury Banking',
    category: 'Banking',
    description: 'Venture-backed business banking with high-limit cards and treasury management.',
    payoutInfo: 'Best for: High-Growth Startups',
    link: 'https://mercury.com',
    logo: 'Ⓜ️',
    isRecommended: false
  },
  {
    id: 'zen',
    name: 'ZenBusiness',
    category: 'Legal',
    description: 'Fast LLC formation, EIN filing, and compliance for new entities.',
    payoutInfo: 'Best for: Startup Entity Setup',
    link: 'https://zenbusiness.com',
    logo: '🧘',
    isRecommended: false
  },
  {
      id: 'relay',
      name: 'Relay Financial',
      category: 'Banking',
      description: 'Collaborative business banking that makes cash flow management automatic.',
      payoutInfo: 'Best for: Operating Accounts',
      link: 'https://relayfi.com',
      logo: '🔄',
      isRecommended: true
  }
];

const AffiliateMarketplace: React.FC = () => {
  const [activeCat, setActiveCat] = useState<'All' | 'Credit' | 'Banking' | 'Legal'>('All');

  const filtered = activeCat === 'All' ? PARTNERS : PARTNERS.filter(p => p.category === activeCat);

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-fade-in pb-20">
      
      {/* Header HUD */}
      <div className="bg-slate-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Briefcase size={320} /></div>
        <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-blue-500/20">
                Nexus Partner Ecosystem
            </div>
            <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                Growth <span className="text-blue-500">Infrastructure.</span>
            </h1>
            <p className="text-slate-400 text-xl leading-relaxed mb-0 font-medium">
                The tools required to optimize your entity for institutional capital. These partners are pre-integrated with the Nexus Neural Core.
            </p>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner w-fit">
          {(['All', 'Credit', 'Banking', 'Legal'] as const).map(cat => (
              <button 
                key={cat} 
                onClick={() => setActiveCat(cat)}
                className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCat === cat ? 'bg-white shadow-lg text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}
              >
                  {cat}
              </button>
          ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map(tool => (
              <div key={tool.id} className={`bg-white border-2 p-8 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between relative overflow-hidden ${tool.isRecommended ? 'border-blue-100' : 'border-slate-100'}`}>
                  {tool.isRecommended && (
                      <div className="absolute top-6 right-6 bg-blue-600 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-blue-600/20">
                          Recommended
                      </div>
                  )}
                  <div>
                      <div className="flex justify-between items-start mb-8">
                          <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-4xl shadow-inner border border-slate-100 group-hover:rotate-3 transition-transform">
                              {tool.logo}
                          </div>
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">{tool.name}</h3>
                      <p className="text-blue-600 text-[10px] font-black uppercase tracking-widest mb-6">{tool.payoutInfo}</p>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 italic">"{tool.description}"</p>
                  </div>
                  
                  <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-4 border border-slate-100">
                          <Shield size={16} className="text-blue-500" />
                          <span className="text-[10px] font-black uppercase text-slate-400">Security: Tier 4 Encrypted</span>
                      </div>
                      <a 
                        href={tool.link} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full bg-slate-950 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-600 shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95"
                      >
                          Deploy Protocol <ExternalLink size={14}/>
                      </a>
                  </div>
              </div>
          ))}
      </div>

      <div className="bg-indigo-600 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform"><Key size={240} /></div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="max-w-xl">
                  <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Affiliate Network Configuration</h3>
                  <p className="text-indigo-100 text-lg font-medium leading-relaxed italic">
                      "Replace the links above with your own affiliate tracking URLs in the source code to start capturing referral yield on every client formation."
                  </p>
              </div>
              <button className="bg-white text-indigo-600 px-12 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl transform hover:-translate-y-1 transition-all">
                  Documentation Guide
              </button>
          </div>
      </div>
    </div>
  );
};

export default AffiliateMarketplace;
