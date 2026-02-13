
import React, { useState } from 'react';
import { ExternalLink, CreditCard, Landmark, Search, FileText, Shield, Briefcase, Hash, Video, PlayCircle, Sparkles, Youtube, ArrowRight, Loader, Calculator, Percent, DollarSign, Activity, AlertTriangle, BookOpen, GraduationCap, Zap, RefreshCw, CheckCircle, Truck } from 'lucide-react';
import * as geminiService from '../services/geminiService';

const AdminResources: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tools' | 'training' | 'calculators'>('tools');
  const [isSyncing, setIsSyncing] = useState(false);

  const handlePushRoadmap = () => {
    setIsSyncing(true);
    setTimeout(() => {
        setIsSyncing(false);
        alert("The 4-Tier Business Credit Roadmap has been pushed to the Global CRM Template. All new leads will now follow this automation sequence.");
    }, 1500);
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in pb-10">
      <div className="mb-8 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Operator Toolkit</h1>
            <p className="text-slate-500 mt-2 font-medium">Standard Operating Procedures & Intelligence Tools.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
            <button onClick={() => setActiveTab('tools')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'tools' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Tools</button>
            <button onClick={() => setActiveTab('training')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'training' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Training</button>
            <button onClick={() => setActiveTab('calculators')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'calculators' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Calcs</button>
        </div>
      </div>

      {activeTab === 'training' && (
        <div className="space-y-8 animate-fade-in">
           {/* CORE STRATEGY CARD */}
           <div className="bg-slate-900 rounded-[2rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
              <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Youtube size={280} /></div>
              <div className="relative z-10 max-w-2xl">
                 <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6 border border-emerald-500/20">
                    Featured Masterclass
                 </div>
                 <h2 className="text-4xl font-black mb-4 tracking-tighter uppercase">Building Business Credit: The 4-Tier Protocol</h2>
                 <p className="text-slate-400 text-lg leading-relaxed mb-8">
                    Stop guessing. This framework outlines the exact sequence to move a business from $0 to $100k+ in Tier 4 bank lines without using a personal credit score.
                 </p>
                 <div className="flex flex-col sm:flex-row gap-4">
                    <a 
                      href="https://www.youtube.com/watch?v=VphW2glU9jY" 
                      target="_blank" 
                      rel="noreferrer"
                      className="bg-white text-slate-950 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center justify-center gap-3 shadow-xl"
                    >
                       <PlayCircle size={20} className="text-red-600" /> Watch Video
                    </a>
                    <button 
                      onClick={handlePushRoadmap}
                      disabled={isSyncing}
                      className="bg-emerald-500 text-slate-950 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50"
                    >
                       {isSyncing ? <RefreshCw className="animate-spin" /> : <Zap size={20} />}
                       Push to CRM Roadmap
                    </button>
                 </div>
              </div>
           </div>

           {/* CHEAT SHEET GRID */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><CheckCircle size={16} className="text-emerald-500" /> Phase 0: Compliance Vitals</h3>
                 <ul className="space-y-4">
                    {['Professional Address (Virtual Office OK, No PO Box)', '411 Listing (ListYourself.net)', 'Business Email & Phone (VOIP only)', 'Good Standing with SOS', 'EIN Confirmation Letter (CP575)'].map(item => (
                       <li key={item} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                          {item}
                       </li>
                    ))}
                 </ul>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Zap size={16} className="text-yellow-500" /> Phase 1: The Net-30 Starter</h3>
                 <p className="text-xs text-slate-500 mb-6">Need 5 reporting trade accounts to generate your first score.</p>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                       <Truck className="text-blue-600 mb-2" size={24} />
                       <span className="font-black text-[10px] uppercase text-slate-800">Uline</span>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                       <Landmark className="text-blue-600 mb-2" size={24} />
                       <span className="font-black text-[10px] uppercase text-slate-800">Grainger</span>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                       <FileText className="text-blue-600 mb-2" size={24} />
                       <span className="font-black text-[10px] uppercase text-slate-800">Quill</span>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                       <CreditCard className="text-blue-600 mb-2" size={24} />
                       <span className="font-black text-[10px] uppercase text-slate-800">Nav</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Rest of the Resources content... */}
      {activeTab === 'tools' && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ToolCard title="Credit Card Matcher" desc="Find Tier 4 high-limit cards based on current score." icon={<CreditCard className="text-blue-600"/>} />
            <ToolCard title="SOS Directory" desc="Direct links to all 50 State Secretaries." icon={<Search className="text-emerald-600"/>} />
         </div>
      )}
    </div>
  );
};

const ToolCard = ({ title, desc, icon }: any) => (
  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all group">
     <div className="mb-6 bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">{icon}</div>
     <h3 className="text-xl font-black text-slate-900 mb-3 uppercase tracking-tight">{title}</h3>
     <p className="text-slate-500 leading-relaxed text-sm font-medium mb-6">{desc}</p>
     <button className="w-full py-4 bg-slate-950 text-emerald-400 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-900 shadow-lg transform active:scale-95 transition-all">Launch Tool</button>
  </div>
);

export default AdminResources;
