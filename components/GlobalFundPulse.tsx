
import React from 'react';
import { Contact } from '../types';
import { 
    Zap, Activity, Phone, ShieldCheck, DollarSign, Target, 
    ArrowUpRight, Users, MessageCircle, BarChart3, TrendingUp, RefreshCw, CheckCircle, Mic
} from 'lucide-react';

interface GlobalFundPulseProps {
  contacts: Contact[];
  onOpenVoice: () => void;
}

const GlobalFundPulse: React.FC<GlobalFundPulseProps> = ({ contacts, onOpenVoice }) => {
  const totalVolume = contacts.reduce((sum, c) => sum + (c.value || 0), 0);
  const closedVolume = contacts.filter(c => c.status === 'Closed').reduce((sum, c) => sum + (c.value || 0), 0);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><Activity size={100} /></div>
            <p className="text-emerald-400 text-[9px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Floor Velocity
            </p>
            <h3 className="text-3xl font-black text-white tracking-tighter">LIVE MONITORING</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-4">Active Neural Threads Synchronized</p>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between hover:border-blue-500 transition-all group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Pipeline</p>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><Target size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">${(totalVolume/1000000).toFixed(1)}M</h3>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between hover:border-emerald-500 transition-all group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Yield Captured</p>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><DollarSign size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">${(closedVolume/1000).toFixed(0)}k</h3>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between hover:border-indigo-500 transition-all group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neural Accuracy</p>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform"><Zap size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">98.4%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <div className="lg:col-span-8 bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2"><Users size={18} className="text-blue-500"/> Personnel Watchtower</h3>
                <div className="flex gap-2">
                    <span className="bg-white border border-slate-200 px-3 py-1 rounded-full text-[9px] font-black uppercase text-slate-500">All Agents</span>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-10 py-6">Agent Identity</th>
                            <th className="px-10 py-6">Current Protocol</th>
                            <th className="px-10 py-6">Session Duration</th>
                            <th className="px-10 py-6 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {[
                            { name: 'System Admin', avatar: 'SA', protocol: 'Nexus Sentinel Hub', duration: 'LIFETIME', status: 'ACTIVE', color: 'text-emerald-500' },
                            { name: 'John Doe', avatar: 'JD', protocol: 'Neural Power Dialer', duration: '12m 45s', status: 'IN CALL', color: 'text-emerald-500' },
                            { name: 'Sarah Sales', avatar: 'SS', protocol: 'Combat Trainer v2.5', duration: '08m 12s', status: 'ROLEPLAY', color: 'text-indigo-500' },
                        ].map((agent, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-10 py-6 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shadow-lg">{agent.avatar}</div>
                                    <span className="font-black text-slate-900 uppercase text-sm tracking-tight">{agent.name}</span>
                                </td>
                                <td className="px-10 py-6">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{agent.protocol}</span>
                                </td>
                                <td className="px-10 py-6 font-mono text-xs text-slate-400">{agent.duration}</td>
                                <td className="px-10 py-6 text-right">
                                    <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${agent.color} flex items-center justify-end gap-2`}>
                                        <div className={`w-1.5 h-1.5 rounded-full fill-current ${agent.status !== 'IDLE' ? 'animate-pulse' : ''} bg-current`}></div>
                                        {agent.status}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
         </div>

         <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-10 flex items-center gap-2">
                   <TrendingUp size={18} className="text-emerald-500" /> Hourly Flow
                </h3>
                <div className="space-y-10">
                    <div className="relative">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Call Connect Rate</span>
                            <span className="text-lg font-black text-slate-900">42%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: '42%' }}></div>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bot Bypass %</span>
                            <span className="text-lg font-black text-slate-900">91%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: '91%' }}></div>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Closing Friction</span>
                            <span className="text-lg font-black text-slate-900">LOW</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: '20%' }}></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Zap size={140} /></div>
                <h3 className="text-xl font-black uppercase tracking-tight mb-4">Neural Override</h3>
                <p className="text-sm text-indigo-100 font-medium mb-8 leading-relaxed italic">
                    "Autonomous Sentinel monitoring active. All operational metrics are currently nominal."
                </p>
                <button 
                  onClick={onOpenVoice}
                  className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transform active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    <Mic size={16} /> Advisor Handshake
                </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default GlobalFundPulse;
