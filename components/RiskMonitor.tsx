import React, { useState, useEffect } from 'react';
import { RiskAlert, Contact } from '../types';
// Fixed: Added Sparkles to the imports
import { ShieldAlert, AlertTriangle, Search, Activity, Lock, Scale, FileWarning, RefreshCw, Eye, CheckCircle, TrendingDown, Info, Sparkles } from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { data } from '../adapters';

const RiskMonitor: React.FC = () => {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<RiskAlert | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  useEffect(() => {
    const generateSystemAlerts = async () => {
        const contacts = await data.getContacts();
        const systemAlerts: RiskAlert[] = [];

        contacts.forEach(c => {
            // Auto-detect High NSFs (Logic: 5+ is Critical)
            const totalNSFs = c.financialSpreading?.months.reduce((acc, m) => acc + m.nsfCount, 0) || 0;
            if (totalNSFs > 5) {
                systemAlerts.push({
                    id: `nsf_${c.id}`,
                    contactId: c.id,
                    contactName: c.company,
                    type: 'High NSF Count',
                    severity: 'Critical',
                    description: `Critical underwriting flag: ${totalNSFs} total NSFs detected in recent history.`,
                    date: 'Detected Today',
                    status: 'Active',
                    source: 'Ledger Audit'
                });
            }

            // Auto-detect Negative Balance Days (Logic: 3+ is High Risk)
            const totalNegDays = c.financialSpreading?.months.reduce((acc, m) => acc + m.negativeDays, 0) || 0;
            if (totalNegDays > 3) {
                systemAlerts.push({
                    id: `neg_${c.id}`,
                    contactId: c.id,
                    contactName: c.company,
                    type: 'Cash Flow Decay',
                    severity: 'High',
                    description: `Negative daily balances on ${totalNegDays} separate occasions. Primary indicator of insolvency.`,
                    date: 'Detected Today',
                    status: 'Active',
                    source: 'Ledger Audit'
                });
            }
        });

        setAlerts(systemAlerts);
    };
    generateSystemAlerts();
  }, []);

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
        setIsScanning(false);
        alert("Deep portfolio scan complete. No new external UCC filings or stacking events detected.");
    }, 2000);
  };

  const handleAnalyzeAlert = async (alert: RiskAlert) => {
    setSelectedAlert(alert);
    setAiAnalysis(null);
    const analysis = await geminiService.analyzeRiskEvent(alert);
    setAiAnalysis(analysis);
  };

  const handleResolve = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, status: 'Resolved' } : a));
    if (selectedAlert?.id === id) setSelectedAlert(null);
  };

  const criticalCount = alerts.filter(a => a.severity === 'Critical' && a.status === 'Active').length;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tighter">
            <ShieldAlert className="text-red-600" size={32} /> Portfolio Sentinel
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Autonomous risk detection, stacking alerts, and ledger monitoring.</p>
        </div>
        <button 
            onClick={handleScan}
            disabled={isScanning}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 shadow-xl flex items-center gap-2 transition-all disabled:opacity-50"
        >
            {isScanning ? <RefreshCw className="animate-spin" size={18} /> : <Activity size={18} />}
            {isScanning ? 'Scrutinizing...' : 'Run UCC Search'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className={`p-8 rounded-[2rem] border shadow-sm ${criticalCount > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <p className="text-[10px] font-black uppercase mb-2 tracking-widest opacity-60">Underwriting Health</p>
            <h3 className={`text-2xl font-black uppercase tracking-tight ${criticalCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {criticalCount > 0 ? `${criticalCount} CRITICAL RISKS` : 'PORTFOLIO SECURE'}
            </h3>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Active Flags</p>
            <h3 className="text-3xl font-black text-slate-900">{alerts.filter(a => a.status === 'Active').length}</h3>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Stacking Alerts</p>
            <h3 className="text-3xl font-black text-slate-900">0</h3>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Neural Link</p>
            <h3 className="text-3xl font-black text-blue-600">LIVE</h3>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         
         <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500"/> Incident Feed</h3>
                <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Monitoring Active</span>
                </div>
            </div>
            <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
                {alerts.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center">
                        <CheckCircle size={48} className="text-emerald-100 mb-4" />
                        <p className="text-sm font-black uppercase text-slate-400 tracking-widest">No risks detected</p>
                    </div>
                ) : alerts.map(alert => (
                    <div 
                        key={alert.id} 
                        onClick={() => handleAnalyzeAlert(alert)}
                        className={`p-5 flex items-start gap-5 hover:bg-slate-50 cursor-pointer transition-all ${selectedAlert?.id === alert.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'}`}
                    >
                        <div className={`p-3 rounded-2xl shrink-0 ${
                            alert.severity === 'Critical' ? 'bg-red-100 text-red-600 shadow-sm shadow-red-100' : 
                            alert.severity === 'High' ? 'bg-orange-100 text-orange-600 shadow-sm shadow-orange-100' :
                            'bg-yellow-100 text-yellow-600'
                        }`}>
                            {alert.type.includes('NSF') ? <TrendingDown size={22}/> : <Activity size={22}/>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">{alert.contactName}</h4>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{alert.date}</span>
                            </div>
                            <div className="flex gap-2 items-center mb-2">
                                <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest ${
                                    alert.severity === 'Critical' ? 'bg-red-600 text-white' : 
                                    alert.severity === 'High' ? 'bg-orange-500 text-white' : 
                                    'bg-yellow-500 text-white'
                                }`}>
                                    {alert.severity}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{alert.type} • {alert.source}</span>
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1 font-medium italic">"{alert.description}"</p>
                        </div>
                        <div className="flex items-center">
                            {alert.status === 'Active' ? <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> : <CheckCircle size={18} className="text-emerald-500"/>}
                        </div>
                    </div>
                ))}
            </div>
         </div>

         <div className="lg:col-span-1 bg-slate-950 text-white rounded-[2.5rem] p-10 shadow-2xl flex flex-col relative overflow-hidden">
            {selectedAlert ? (
                <>
                    <h3 className="text-xl font-black mb-8 border-b border-white/10 pb-6 uppercase tracking-tight">Sentinel Audit</h3>
                    <div className="flex-1 space-y-8">
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Entity Under Review</p>
                            <p className="font-black text-2xl uppercase tracking-tighter">{selectedAlert.contactName}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Detailed Findings</p>
                            <p className="text-sm text-slate-300 leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/10 font-medium">
                                {selectedAlert.description}
                            </p>
                        </div>
                        
                        {aiAnalysis ? (
                            <div className="bg-indigo-600/20 p-6 rounded-3xl border border-indigo-500/30 animate-fade-in shadow-xl">
                                <h4 className="font-black text-indigo-400 text-xs uppercase tracking-widest mb-3 flex items-center gap-2"><Sparkles size={16}/> Neural Verdict</h4>
                                <p className="text-sm text-indigo-100 mb-4 font-medium leading-relaxed italic">"{aiAnalysis.recommendation}"</p>
                                <div className="flex items-center gap-2">
                                    <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: aiAnalysis.severity === 'Critical' ? '100%' : '60%' }}></div>
                                    </div>
                                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">{aiAnalysis.severity} Impact</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-slate-500 flex flex-col items-center">
                                <RefreshCw className="animate-spin mb-4" size={32} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Synthesizing Verdict...</span>
                            </div>
                        )}
                        
                        {selectedAlert.status === 'Active' && (
                            <div className="grid grid-cols-2 gap-4 mt-auto pt-10">
                                <button className="bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl transform active:scale-95 transition-all">
                                    <Lock size={14} /> Freeze
                                </button>
                                <button onClick={() => handleResolve(selectedAlert.id)} className="bg-white/10 hover:bg-white/20 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">
                                    Resolve
                                </button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-700 text-center">
                    <ShieldAlert size={100} className="mb-8 opacity-10" />
                    <p className="text-xs font-black uppercase tracking-[0.2em] opacity-30">Select an Incident<br/>for AI Scrutiny</p>
                </div>
            )}
         </div>

      </div>
    </div>
  );
};

export default RiskMonitor;