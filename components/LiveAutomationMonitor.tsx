
import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Activity, ShieldAlert, CheckCircle, Terminal, RefreshCw, Layers, BrainCircuit, Search, ShieldCheck, Ghost, DollarSign, TrendingUp, AlertTriangle, Scale } from 'lucide-react';

interface AutomationLog {
  id: string;
  timestamp: string;
  protocol: string;
  target: string;
  result: string;
  severity: 'info' | 'alert' | 'critical';
}

const LiveAutomationMonitor: React.FC = () => {
  const [logs, setLogs] = useState<AutomationLog[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString(), protocol: 'Neural Scorer', target: 'TechCorp LLC', result: 'Risk Index Optimized (42 -> 15)', severity: 'info' },
    { id: '2', timestamp: new Date().toLocaleTimeString(), protocol: 'UCC Scanner', target: 'Portfolio-Wide', result: 'No Stacking Detected', severity: 'info' }
  ]);

  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const protocols = ['Ghost Hunter', 'Forensic Guard', 'Revenue Pulse', 'Renewal Predictor', 'Stacking Sentinel', 'Auto-Underwriter'];
      const targets = ['Apex Logistics', 'Green Energy Inc', 'A-Z Retail', 'Smith Engineering', 'Global Trans'];
      const results = [
          'Pattern Interrupt Sent', 
          'Binary Integrity Verified', 
          'Fee Invoiced', 
          'Growth Vector Identified', 
          'UCC Scraping Node: CLEAN', 
          'Memo Synthesized'
      ];
      
      const isCritical = Math.random() > 0.95;
      
      const newLog: AutomationLog = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        target: targets[Math.floor(Math.random() * targets.length)],
        result: isCritical ? 'DETECTED SECOND POSITION FILING - FREEZING ACCOUNT' : results[Math.floor(Math.random() * results.length)],
        severity: isCritical ? 'critical' : Math.random() > 0.8 ? 'alert' : 'info'
      };

      setLogs(prev => [newLog, ...prev].slice(0, 15));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 animate-fade-in pb-10 max-w-7xl mx-auto">
      <div className="flex justify-between items-center bg-slate-950 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
         <div className="flex items-center gap-4">
            <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-500/20 animate-pulse">
                <BrainCircuit size={28} className="text-slate-950" />
            </div>
            <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Nexus Sentinel Hub</h2>
                <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">Neural Protocols: ONLINE & ACTIVE</p>
            </div>
         </div>
         <div className="flex gap-4">
            <div className="text-right hidden md:block">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Latency</p>
                <p className="text-white font-mono text-lg">12ms</p>
            </div>
         </div>
      </div>

      {/* Protocol Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <ProtocolCard 
            title="Ghost Hunter" 
            icon={<Ghost size={20} />} 
            desc="Autonomous re-engagement of stale leads." 
            status="Active" 
            stats="12 Recovered" 
        />
        <ProtocolCard 
            title="Stacking Shield" 
            icon={<Scale size={20} />} 
            desc="Live UCC record scraping via Neural Search." 
            status="Active" 
            stats="0 Active Threats" 
            color="red" 
        />
        <ProtocolCard 
            title="Yield Harvester" 
            icon={<TrendingUp size={20} />} 
            desc="Revenue spike detection for auto-upsells." 
            status="Active" 
            stats="4 Tranches Bumped" 
            color="emerald" 
        />
        <ProtocolCard 
            title="Forensic Guard" 
            icon={<ShieldCheck size={20} />} 
            desc="Binary document audit for tampering." 
            status="Active" 
            stats="94% Authenticity" 
            color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                <h3 className="text-slate-400 font-black text-[11px] uppercase tracking-widest flex items-center gap-2">
                    <Terminal size={14} /> Neural Execution Stream
                </h3>
                <span className="text-[9px] font-black text-emerald-500 uppercase animate-pulse">Streaming Live</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3 font-mono custom-scrollbar bg-black/40">
                {logs.map(log => (
                    <div key={log.id} className={`flex items-start gap-4 p-3 rounded-xl border transition-all ${
                        log.severity === 'critical' ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]' :
                        log.severity === 'alert' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                        'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                    }`}>
                        <span className="text-[10px] opacity-30 shrink-0 mt-0.5">{log.timestamp}</span>
                        <div className="flex-1 text-xs">
                            <span className="font-black uppercase text-indigo-400 mr-2">[{log.protocol}]</span>
                            <span className="font-bold text-white mr-2">{log.target}</span>
                            <span className="opacity-70">:: {log.result}</span>
                        </div>
                        {log.severity !== 'info' && <Zap size={12} className="animate-pulse fill-current text-amber-500" />}
                    </div>
                ))}
            </div>
         </div>

         <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
                <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2">
                    <Activity size={16} className="text-blue-600"/> Efficiency Spectrum
                </h3>
                <div className="space-y-8">
                    <MetricBar label="Auto-Nurture Recovery" value="89%" color="bg-blue-600" />
                    <MetricBar label="Forensic Integrity" value="94%" color="bg-emerald-500" />
                    <MetricBar label="Upsell Conversion" value="22%" color="bg-indigo-600" />
                </div>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Layers size={140} /></div>
                <h3 className="font-black text-xs uppercase tracking-widest opacity-60 mb-2">Neural Load</h3>
                <div className="text-5xl font-black tracking-tighter mb-4">NOMINAL</div>
                <p className="text-xs text-blue-100 leading-relaxed font-medium mb-8">Sentinel is currently monitoring 1,242 entities across 4 states with 0 processing delays.</p>
                <button className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-50 transition-all shadow-xl">
                    Deploy Custom Protocol
                </button>
            </div>
         </div>
      </div>
    </div>
  );
};

const ProtocolCard = ({ title, icon, desc, status, stats, color = 'indigo' }: any) => {
    let colorClass = 'bg-indigo-50 text-indigo-600';
    if (color === 'emerald') colorClass = 'bg-emerald-50 text-emerald-600';
    if (color === 'red') colorClass = 'bg-red-50 text-red-600';
    if (color === 'blue') colorClass = 'bg-blue-50 text-blue-600';

    return (
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm hover:shadow-lg transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform ${colorClass}`}>
                    {icon}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400'}`}>{status}</span>
            </div>
            <h4 className="font-black text-slate-900 uppercase text-sm tracking-tight mb-2">{title}</h4>
            <p className={`text-[10px] font-medium leading-relaxed mb-4 ${color === 'red' ? 'text-red-500' : 'text-slate-500'}`}>{desc}</p>
            <div className="pt-4 border-t border-slate-50 flex items-center gap-2">
                <TrendingUp size={12} className="text-emerald-500" />
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{stats}</span>
            </div>
        </div>
    );
};

const MetricBar = ({ label, value, color }: any) => (
    <div>
        <div className="flex justify-between items-end mb-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
            <span className="text-sm font-black text-slate-900">{value}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${color}`} style={{ width: value }}></div>
        </div>
    </div>
);

export default LiveAutomationMonitor;
