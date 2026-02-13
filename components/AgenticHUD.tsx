
import React, { useState, useEffect } from 'react';
import { Bot, Terminal, Zap, Shield, Search, RefreshCw, Layers, Smartphone, Ghost } from 'lucide-react';

const AgenticHUD: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([
    "Nexus OS Bootloader :: Auth Level 4",
    "Sentinel initialized. Monitoring global threads..."
  ]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const agents = ['Sentinel Scout', 'Forensic Bot', 'Ghost Hunter', 'Nexus Analyst', 'Underwriter'];
    const targets = ['Ohio Manufacturing', 'SAAS Pipeline', 'UCC Public Records', 'Client Vault', 'Instagram Leads'];
    const actions = [
        'scanning for expansion signals',
        'verifying binary integrity',
        'detecting stacking patterns',
        'analyzing revenue magnitude',
        'auditing sentiment delta',
        'mapping liquidity tranches'
    ];

    const interval = setInterval(() => {
        const msg = `${agents[Math.floor(Math.random() * agents.length)]} :: [${targets[Math.floor(Math.random() * targets.length)]}] :: ${actions[Math.floor(Math.random() * actions.length)]}...`;
        setLogs(prev => [msg, ...prev].slice(0, 20));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-[150] transition-all duration-500 ease-in-out md:ml-64 ${isExpanded ? 'h-64' : 'h-10'} bg-slate-950/80 backdrop-blur-2xl border-t border-white/10 group`}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="h-10 px-8 flex items-center justify-between cursor-pointer border-b border-white/5"
      >
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
                <span className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Agentic Core Active</span>
            </div>
            <div className="hidden lg:flex items-center gap-4 text-slate-500 text-[8px] font-mono uppercase truncate">
                <span className="animate-fade-in">{'>> '}{logs[0]}</span>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex -space-x-1">
                {[Bot, Search, Shield, Ghost].map((Icon, i) => (
                    <div key={i} className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors">
                        <Icon size={12} />
                    </div>
                ))}
            </div>
            <Terminal size={14} className="text-slate-500" />
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-6 h-54 overflow-y-auto custom-scrollbar font-mono text-[9px] space-y-1.5">
            {logs.map((log, i) => (
                <div key={i} className={`flex gap-4 animate-fade-in ${i === 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                    <span className="opacity-20 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false, second: '2-digit' })}]</span>
                    <span>{log}</span>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default AgenticHUD;
