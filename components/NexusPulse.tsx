
import React, { useState } from 'react';
import { Contact } from '../types';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
    PieChart, Pie, Cell 
} from 'recharts';
import { 
    Zap, TrendingUp, ShieldCheck, DollarSign, BrainCircuit, 
    ArrowUpRight, ArrowDownRight, Layers, Sparkles, Target,
    Activity, Crown, Star, Mic, ArrowRight, ShieldAlert,
    Clock, CheckCircle, Smartphone, UserCheck
} from 'lucide-react';
import TaskSuggester from './TaskSuggester';

interface NexusPulseProps {
  contact: Contact;
  onOpenVoice: () => void;
  onUpdateContact: (contact: Contact) => void;
}

const NexusPulse: React.FC<NexusPulseProps> = ({ contact, onOpenVoice, onUpdateContact }) => {
  const activeDeal = contact.fundedDeals?.find(d => d.status === 'Active');
  const revenue = contact.revenue || 0;
  const mobilityIndex = Math.round((revenue / 15000) * 40 + (contact.aiScore || 50) * 0.6);

  // LOGIC: Detect most critical friction point
  const criticalTask = contact.clientTasks.find(t => t.status === 'pending');
  const missingIdentity = contact.compliance?.kycStatus !== 'Verified';
  const missingBank = !contact.connectedBanks?.length;
  
  const chartData = [
    { name: 'Month 1', bankability: 35, mobility: 20 },
    { name: 'Month 2', bankability: 45, mobility: 35 },
    { name: 'Month 3', bankability: 42, mobility: 50 },
    { name: 'Month 4', bankability: 58, mobility: 65 },
    { name: 'Current', bankability: contact.aiScore || 65, mobility: mobilityIndex },
  ];

  // Bankability Breakdown Data for Radar Chart
  const bankabilityMetrics = contact.bankabilityData || {
      cashflow: 65,
      credit: contact.creditAnalysis?.score ? (contact.creditAnalysis.score / 850) * 100 : 40,
      collateral: contact.documents?.some(d => d.type === 'Financial') ? 70 : 20,
      compliance: contact.compliance?.riskScore === 'Low' ? 90 : 50,
      character: contact.timeInBusiness ? Math.min(100, contact.timeInBusiness * 5) : 30
  };

  const radarData = [
      { subject: 'Cash Flow', A: bankabilityMetrics.cashflow, fullMark: 100 },
      { subject: 'Credit', A: bankabilityMetrics.credit, fullMark: 100 },
      { subject: 'Collateral', A: bankabilityMetrics.collateral, fullMark: 100 },
      { subject: 'Compliance', A: bankabilityMetrics.compliance, fullMark: 100 },
      { subject: 'Character', A: bankabilityMetrics.character, fullMark: 100 },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      {/* PRIORITY ALPHA DIRECTIVE - CRITICAL PATH GUIDANCE */}
      <div className="bg-white border-2 border-indigo-600 rounded-[3rem] p-1 shadow-2xl overflow-hidden animate-ai-glow">
          <div className="bg-indigo-600 text-white p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-10 rounded-[2.8rem]">
              <div className="flex-1">
                  <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border border-white/20">
                      <Zap size={14} fill="currentColor" /> Priority Alpha Directive
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter uppercase leading-[0.9]">
                      Execute your <span className="text-indigo-200">Next Step.</span>
                  </h2>
                  <p className="text-indigo-100 text-lg md:text-xl font-medium leading-relaxed opacity-90 max-w-xl">
                      {missingBank ? "Synchronize your operating account to allow Nexus AI to force a pre-approval from our Tier 1 marketplace." : 
                       missingIdentity ? "Complete your biometric facial audit to verify your identity and release capital transmission locks." :
                       criticalTask ? `Finalize the task "${criticalTask.title}" to move your application to the Underwriting Phase.` :
                       "Your entity is currently synchronized and healthy. Monitor your inbox for new liquidity matching events."}
                  </p>
              </div>
              <div className="w-full md:w-auto shrink-0">
                  <button 
                    onClick={() => {
                        // Protocol: User click focuses on the relevant missing piece
                        alert("Directing focus to critical milestone...");
                    }}
                    className="w-full md:w-auto bg-white text-indigo-600 px-12 py-6 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl transform hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4"
                  >
                      {missingBank ? <DollarSign size={20} /> : missingIdentity ? <UserCheck size={20} /> : <Zap size={20} />}
                      Initiate Protocol <ArrowRight size={20} />
                  </button>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* NEW: Capital Readiness HUD (Radar Chart) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm flex flex-col relative overflow-hidden group hover:border-blue-500 transition-all">
            <div className="flex items-center gap-3 mb-8">
                <div className="bg-blue-500 p-2 rounded-xl shadow-lg shadow-blue-500/20">
                    <Target size={20} className="text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter">Bankability Radar</h2>
                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.3em]">Core Underwriting Pillars</p>
                </div>
            </div>
            
            <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} hide />
                        <Radar
                            name="Entity Magnitude"
                            dataKey="A"
                            stroke="#3b82f6"
                            fill="#3b82f6"
                            fillOpacity={0.4}
                        />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
            
            <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Strongest Pillar</p>
                    <p className="text-sm font-black text-emerald-600 uppercase">Compliance</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Gap Analysis</p>
                    <p className="text-sm font-black text-blue-600 uppercase">Collateral</p>
                </div>
            </div>
        </div>

        {/* Neural Mobility Card */}
        <div className="lg:col-span-7 bg-slate-950 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group border border-white/5">
            <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform text-slate-100"><BrainCircuit size={280} /></div>
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-12">
                   <div className="flex items-center gap-3">
                      <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-500/20 transform -rotate-3 transition-transform group-hover:rotate-0">
                         <Activity size={24} className="text-slate-950" />
                      </div>
                      <div>
                         <h2 className="text-2xl font-black uppercase tracking-tighter">Neural Mobility Pulse</h2>
                         <p className="text-emerald-500 text-[9px] font-black uppercase tracking-[0.3em] mt-1">Institutional Maturity Rating</p>
                      </div>
                   </div>
                   <button 
                      onClick={onOpenVoice}
                      className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 group/voice"
                   >
                      <Mic size={16} className="text-emerald-400 group-hover:animate-pulse" /> Live Advisor Briefing
                   </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                   <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mobility Index</p>
                      <h3 className="text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500">{mobilityIndex}%</h3>
                      <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase">
                         <ArrowUpRight size={14}/> +{Math.round(mobilityIndex/10)}% Efficiency
                      </div>
                   </div>
                   <div className="md:col-span-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Growth Trajectory</p>
                      <div className="h-40 w-full">
                         <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                               <defs>
                                  <linearGradient id="colorMob" x1="0" y1="0" x2="0" y2="1">
                                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                               </defs>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                               <XAxis dataKey="name" hide />
                               <YAxis hide />
                               <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                               <Area type="monotone" dataKey="mobility" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorMob)" />
                            </AreaChart>
                         </ResponsiveContainer>
                      </div>
                   </div>
                </div>
            </div>
        </div>
      </div>

      {/* Level HUD Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all">
              <div className="flex justify-between items-start">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authority Level</p>
                    <h3 className="text-3xl font-black text-slate-900 mt-1 uppercase tracking-tighter">Nexus Platinum</h3>
                 </div>
                 <div className="p-4 bg-amber-50 text-amber-500 rounded-2xl shadow-xl group-hover:scale-110 transition-transform">
                    <Crown size={28} />
                 </div>
              </div>
              <div className="mt-10">
                 <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2">
                    <span>Tier 2 Readiness</span>
                    <span>{contact.aiScore || 65}%</span>
                 </div>
                 <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.4)]" style={{ width: `${contact.aiScore || 65}%` }}></div>
                 </div>
              </div>
           </div>

           <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform text-white"><Star size={120} /></div>
              <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest mb-1">System XP</p>
              <h4 className="text-5xl font-black tracking-tighter">{(contact.xp || 0).toLocaleString()}</h4>
              <p className="text-[9px] font-black text-indigo-300 uppercase tracking-[0.2em] mt-4">Autonomous Milestone: REVEALED</p>
           </div>
           
           <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm group hover:border-emerald-500 transition-all">
                <div className="flex justify-between items-start mb-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capital Efficiency</p>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform"><TrendingUp size={20}/></div>
                </div>
                <h4 className="text-4xl font-black text-slate-900 tracking-tighter">{(revenue / 240).toFixed(1)}x</h4>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">Revenue to Debt Multiplier</p>
           </div>
      </div>

      <TaskSuggester contact={contact} onUpdateContact={onUpdateContact} />

    </div>
  );
};

export default NexusPulse;
