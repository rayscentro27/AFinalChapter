
import React, { useState, useEffect } from 'react';
import { 
    Cpu, Zap, DollarSign, Activity, ShieldAlert, CheckCircle, 
    RefreshCw, Layers, BrainCircuit, Search, ShieldCheck, 
    Smartphone, AlertTriangle, ArrowUpRight, ArrowDownRight,
    TrendingUp, Terminal, Lock, Gauge, Settings, Shield
} from 'lucide-react';
import { ApiUsageRecord, ApiThreshold } from '../types';
import * as costService from '../services/costService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';

const InfraMonitor: React.FC = () => {
    const [usage, setUsage] = useState<ApiUsageRecord[]>([]);
    const [thresholds, setThresholds] = useState<ApiThreshold[]>([]);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        setUsage(costService.getUsage());
        setThresholds(costService.getThresholds());
    };

    const totalSpent = usage.reduce((sum, r) => sum + r.cost, 0);
    const dailySpent = usage
        .filter(r => new Date(r.timestamp).toDateString() === new Date().toDateString())
        .reduce((sum, r) => sum + r.cost, 0);

    const handleUpdateThreshold = (service: string, newLimit: number) => {
        const updated = thresholds.map(t => t.service === service ? { ...t, limit: newLimit } : t);
        setThresholds(updated);
        costService.saveThresholds(updated);
    };

    const toggleFreeze = (service: string) => {
        const updated = thresholds.map(t => t.service === service ? { ...t, isFrozen: !t.isFrozen } : t);
        setThresholds(updated);
        costService.saveThresholds(updated);
    };

    // Chart Data Preparation
    const serviceBreakdown = thresholds.map(t => ({
        name: t.service,
        cost: t.current,
        limit: t.limit,
        percent: Math.round((t.current / t.limit) * 100)
    }));

    return (
        <div className="space-y-8 animate-fade-in pb-20 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
                        <Cpu className="text-blue-600" size={36} /> Engine Room
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Real-time API spending, token forensics, and circuit breakers.</p>
                </div>
                <div className="flex gap-3 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                    <button onClick={refreshData} className="p-3 hover:bg-slate-100 rounded-xl transition-all text-slate-500" title="Refresh Telemetry">
                        <RefreshCw size={20} />
                    </button>
                    <div className="h-10 w-px bg-slate-100 mx-1"></div>
                    <div className="px-6 py-2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Neural Link: Nominal</span>
                    </div>
                </div>
            </div>

            {/* Spending KPI HUD */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><DollarSign size={100} /></div>
                    <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-4">Total Accrued (Mo)</p>
                    <h3 className="text-4xl font-black text-white tracking-tighter">${totalSpent.toFixed(2)}</h3>
                    <div className="mt-6 flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase">
                        <ArrowUpRight size={14} /> Efficiency Index: 94%
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Burn</p>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><Activity size={20}/></div>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mt-4">${dailySpent.toFixed(2)}</h3>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group hover:border-indigo-500 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Circuits</p>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform"><Zap size={20}/></div>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mt-4">{thresholds.length} Nodes</h3>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group hover:border-emerald-500 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Budget Safety</p>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><ShieldCheck size={20}/></div>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mt-4">82.4%</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Circuit Breakers & Thresholds */}
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2">
                            <Lock size={18} className="text-blue-500" /> Threshold Circuitry
                        </h3>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Monthly Reset Protocol</span>
                    </div>
                    
                    <div className="p-10 space-y-10">
                        {thresholds.map(t => (
                            <div key={t.service} className={`p-8 rounded-[2.5rem] border-2 transition-all ${t.isFrozen ? 'bg-red-50 border-red-200 opacity-60' : 'bg-slate-50/50 border-slate-100 hover:border-blue-200'}`}>
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 ${t.isFrozen ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white'}`}>
                                            {t.service.includes('Gemini') ? <BrainCircuit size={28}/> : <Smartphone size={28}/>}
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{t.service}</h4>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Operational Limit: ${t.limit}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Burn Index</p>
                                            <p className={`text-xl font-black ${t.current > t.limit * 0.8 ? 'text-red-600' : 'text-slate-900'}`}>${t.current.toFixed(2)}</p>
                                        </div>
                                        <button 
                                            onClick={() => toggleFreeze(t.service)}
                                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 ${t.isFrozen ? 'bg-emerald-50 text-white' : 'bg-red-600 text-white hover:bg-red-700'}`}
                                        >
                                            {t.isFrozen ? 'Re-Activate Node' : 'Kill Switch'}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-end text-[10px] font-black uppercase">
                                        <span className="text-slate-500">Utilization Spectrum</span>
                                        <span className={t.current > t.limit * 0.8 ? 'text-red-500 animate-pulse' : 'text-blue-600'}>
                                            {Math.round((t.current / t.limit) * 100)}% Consumed
                                        </span>
                                    </div>
                                    <div className="h-2.5 bg-white rounded-full overflow-hidden border border-slate-200 shadow-inner">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${t.current > t.limit * 0.8 ? 'bg-red-500' : 'bg-blue-600'}`} 
                                            style={{ width: `${Math.min(100, (t.current / t.limit) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest italic leading-none">AI will pause {t.service} functions at 100% burn.</p>
                                        <div className="flex items-center gap-3">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">Limit</label>
                                            <input 
                                                type="number" 
                                                value={t.limit} 
                                                onChange={(e) => handleUpdateThreshold(t.service, Number(e.target.value))}
                                                className="w-20 p-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-center outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sidebar Intelligence */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Terminal size={140} /></div>
                        <h3 className="font-black text-xs uppercase tracking-[0.3em] text-blue-400 mb-8 flex items-center gap-2">
                            <Gauge size={16} /> Cost Breakdown
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={serviceBreakdown}>
                                    <XAxis dataKey="name" hide />
                                    <Tooltip 
                                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px', color: '#fff' }}
                                        itemStyle={{ color: '#6366f1' }}
                                    />
                                    <Bar dataKey="cost" radius={[8, 8, 8, 8]}>
                                        {serviceBreakdown.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.percent > 80 ? '#ef4444' : '#6366f1'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-8 space-y-3">
                            {serviceBreakdown.map(s => (
                                <div key={s.name} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <span>{s.name}</span>
                                    <span className="text-white">${s.cost.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                        <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-8 flex items-center gap-2">
                            <Shield size={16} className="text-blue-600"/> Efficiency Audit
                        </h3>
                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm"><CheckCircle size={24}/></div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Pattern Optimization</p>
                                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Nexus AI is batching document scans. Gemini Pro token input reduced by 24% this week.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100 shadow-sm"><AlertTriangle size={24}/></div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Usage Warning</p>
                                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">Veo Video generation is currently your highest burn vector. Consider setting a daily quota.</p>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => alert("Audit report generated.")} className="w-full mt-10 py-4 border-2 border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                            Export Compliance Log <ArrowDownRight size={14}/>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfraMonitor;
