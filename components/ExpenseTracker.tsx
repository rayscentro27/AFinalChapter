import React, { useState, useEffect } from 'react';
import { FinancialEntry } from '../types';
import { 
  CreditCard, DollarSign, TrendingUp, Plus, Trash2, PieChart, 
  Filter, Tag, Briefcase, Megaphone, Smartphone, Server, 
  Download, FileText, ArrowUpRight, ArrowDownLeft, 
  RefreshCw, Sparkles, Building2, Layers, Zap, Info, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, AreaChart, Area, Legend 
} from 'recharts';
import { GoogleGenAI } from '../services/clientAiBridge';

const MOCK_ENTRIES: FinancialEntry[] = [
  { id: 'fe_1', type: 'Expense', entity: 'Twilio', amount: 45.50, category: 'Software', frequency: 'Monthly', date: '2023-10-01', status: 'Paid', description: 'Power Dialer Usage' },
  { id: 'fe_2', type: 'Expense', entity: 'Facebook Ads', amount: 500.00, category: 'Marketing', frequency: 'Monthly', date: '2023-10-02', status: 'Paid', description: 'Lead Gen Campaign Q4' },
  { id: 'fe_3', type: 'Revenue', entity: 'TechCorp LLC', amount: 4500.00, category: 'Success Fee', frequency: 'One-time', date: '2023-10-05', status: 'Paid', description: 'Brokerage Fee - $45k Deal' },
  { id: 'fe_4', type: 'Revenue', entity: 'Sarah Sales', amount: 150.00, category: 'Subscription', frequency: 'Monthly', date: '2023-10-01', status: 'Paid', description: 'Portal Seat - Sarah' },
  { id: 'fe_5', type: 'Expense', entity: 'IdentityIQ', amount: 29.99, category: 'Software', frequency: 'Monthly', date: '2023-10-05', status: 'Paid', description: 'Credit Monitoring' },
  { id: 'fe_6', type: 'Revenue', entity: 'BuildIt Construction', amount: 12000.00, category: 'Success Fee', frequency: 'One-time', date: '2023-10-12', status: 'Paid', description: 'Brokerage Fee - $120k SBA' },
  { id: 'fe_7', type: 'Expense', entity: 'Independent Sales', amount: 1250.00, category: 'Personnel', frequency: 'One-time', date: '2023-10-15', status: 'Pending', description: 'Deal #1042 Payout' },
  { id: 'fe_8', type: 'Expense', entity: 'Vercel', amount: 20.00, category: 'Software', frequency: 'Monthly', date: '2023-10-01', status: 'Paid', description: 'Hosting & DB' },
];

const FinancialTracker: React.FC = () => {
  const [entries, setEntries] = useState<FinancialEntry[]>(MOCK_ENTRIES);
  const [isAdding, setIsAdding] = useState(false);
  const [activeType, setActiveType] = useState<'All' | 'Revenue' | 'Expense'>('All');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiForecast, setAiForecast] = useState<string | null>(null);
  
  // New Entry State
  const [newEntry, setNewEntry] = useState<Partial<FinancialEntry>>({
    type: 'Expense', entity: '', amount: 0, category: 'Software', frequency: 'Monthly', date: new Date().toISOString().split('T')[0], status: 'Paid', description: ''
  });

  // Calculations
  const revenue = entries.filter(e => e.type === 'Revenue');
  const expenses = entries.filter(e => e.type === 'Expense');

  const totalRevenue = revenue.reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpense;

  const recurringBurn = expenses
    .filter(e => e.frequency !== 'One-time')
    .reduce((sum, e) => sum + e.amount, 0);
  
  const recurringYield = revenue
    .filter(e => e.frequency !== 'One-time')
    .reduce((sum, e) => sum + e.amount, 0);

  // Chart Data: Profit/Loss History
  const chartData = [
    { name: 'Jul', Inflow: 8500, Outflow: 4200, Profit: 4300 },
    { name: 'Aug', Inflow: 11000, Outflow: 4800, Profit: 6200 },
    { name: 'Sep', Inflow: 13500, Outflow: 5100, Profit: 8400 },
    { name: 'Oct', Inflow: totalRevenue, Outflow: totalExpense, Profit: netProfit },
  ];

  const categoryData = [
    { name: 'Software', value: expenses.filter(e => e.category === 'Software').reduce((sum, e) => sum + e.amount, 0), color: '#3b82f6' },
    { name: 'Marketing', value: expenses.filter(e => e.category === 'Marketing').reduce((sum, e) => sum + e.amount, 0), color: '#f59e0b' },
    { name: 'Personnel', value: expenses.filter(e => e.category === 'Personnel').reduce((sum, e) => sum + e.amount, 0), color: '#10b981' },
    { name: 'Revenue', value: totalRevenue, color: '#2563eb' }
  ];

  const handleAddEntry = () => {
    if (!newEntry.entity || !newEntry.amount) return;
    const entry: FinancialEntry = {
        ...newEntry,
        id: `fe_${Date.now()}`,
        amount: Number(newEntry.amount),
    } as FinancialEntry;
    
    setEntries([entry, ...entries]);
    setIsAdding(false);
    setNewEntry({ type: 'Expense', entity: '', amount: 0, category: 'Software', frequency: 'Monthly', date: new Date().toISOString().split('T')[0], status: 'Paid', description: '' });
  };

  const handleRunForecast = async () => {
    setIsAnalyzing(true);
    try {
        const ai = new GoogleGenAI();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Financial Audit: Revenue $${totalRevenue}, Expenses $${totalExpense}, Recurring Burn $${recurringBurn}. Monthly Recurring Revenue (Seat Subscriptions): $${recurringYield}. Based on this, give a 1-sentence forecast for the next quarter.`,
            config: {
                systemInstruction: "You are a pragmatic CFO for a fintech brokerage. Be concise."
            }
        });
        setAiForecast(response.text || "Handshake established. Fiscal trajectory is nominal.");
    } catch (e) {
        setAiForecast("Error interfacing with Neural Forecaster.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const filteredEntries = activeType === 'All' ? entries : entries.filter(e => e.type === activeType);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <DollarSign className="text-emerald-500" size={36} /> Finance Center
          </h1>
          <p className="text-slate-500 font-medium mt-1">Unified ledger for operational burn and capital yield.</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={() => setIsAdding(!isAdding)}
                className="bg-slate-950 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 shadow-2xl hover:bg-slate-800 transition-all active:scale-95"
            >
                {/* Fix: Imported X from lucide-react to resolve "Cannot find name X" error */}
                {isAdding ? <X size={18} /> : <Plus size={18} />}
                {isAdding ? 'Close Entry' : 'Log Transaction'}
            </button>
        </div>
      </div>

      {/* Neural Forecast Banner */}
      <div className="bg-indigo-950 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl border border-white/5">
         <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Zap size={200} /></div>
         <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border border-indigo-500/20">
                    <Sparkles size={14} /> Neural Forecaster
                </div>
                <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Capital Velocity Projection</h3>
                <p className="text-indigo-100 text-lg font-medium italic opacity-90 leading-relaxed">
                   "{isAnalyzing ? 'Analyzing fiscal trajectory...' : aiForecast || "Initiate forecast to determine profitability timeline based on current burn."}"
                </p>
            </div>
            <button 
                onClick={handleRunForecast}
                disabled={isAnalyzing}
                className="bg-white text-indigo-950 px-10 py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] hover:bg-indigo-50 shadow-2xl transition-all flex items-center gap-3 disabled:opacity-50 active:scale-95"
            >
                {isAnalyzing ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18} />}
                Run Neural Audit
            </button>
         </div>
      </div>

      {/* Transaction Entry Form */}
      {isAdding && (
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl animate-fade-in">
            <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-8">Manual Ledger Override</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Protocol Type</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setNewEntry({...newEntry, type: 'Expense'})} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${newEntry.type === 'Expense' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-500'}`}>Expense</button>
                        <button onClick={() => setNewEntry({...newEntry, type: 'Revenue'})} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${newEntry.type === 'Revenue' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}>Revenue</button>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Entity (Vendor/Client)</label>
                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Google Ads" value={newEntry.entity} onChange={e => setNewEntry({...newEntry, entity: e.target.value})} />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Magnitude ($)</label>
                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newEntry.amount} onChange={e => setNewEntry({...newEntry, amount: Number(e.target.value)})} />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Recurrence</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold appearance-none outline-none focus:ring-2 focus:ring-blue-500" value={newEntry.frequency} onChange={e => setNewEntry({...newEntry, frequency: e.target.value as any})}>
                        <option>One-time</option>
                        <option>Monthly</option>
                        <option>Yearly</option>
                    </select>
                </div>
            </div>
            <button onClick={handleAddEntry} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] hover:bg-blue-700 shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3">
                <Plus size={18} /> Commit to Ledger
            </button>
        </div>
      )}

      {/* KPI HUD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Yield (Mo)</p>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><ArrowUpRight size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">${totalRevenue.toLocaleString()}</h3>
        </div>
        
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-red-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross Burn (Mo)</p>
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl group-hover:scale-110 transition-transform"><ArrowDownLeft size={20}/></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mt-4">${totalExpense.toLocaleString()}</h3>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Profit Delta</p>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><Layers size={20}/></div>
            </div>
            <h3 className={`text-3xl font-black mt-4 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString()}
            </h3>
        </div>

        <div className="bg-slate-950 p-8 rounded-[2rem] text-white shadow-2xl flex flex-col justify-between group">
            <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Operating Leverage</p>
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl"><Zap size={20}/></div>
            </div>
            <div className="mt-4">
                <h3 className="text-3xl font-black text-white">{(totalRevenue / totalExpense).toFixed(2)}x</h3>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">Capital Efficiency</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Main Chart Section */}
        <div className="lg:col-span-8 bg-white rounded-[3rem] border border-slate-200 shadow-sm p-10 flex flex-col h-[500px]">
            <div className="flex justify-between items-center mb-10">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-500" /> Operational Trajectory
                </h3>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></div><span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Inflow</span></div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"></div><span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Outflow</span></div>
                </div>
            </div>
            <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} tickFormatter={(v) => `$${v/1000}k`} />
                        <Tooltip contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }} />
                        <Area type="monotone" dataKey="Inflow" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorIn)" />
                        <Area type="monotone" dataKey="Outflow" stroke="#ef4444" strokeWidth={4} fillOpacity={1} fill="url(#colorOut)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Breakdown Panel */}
        <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col items-center text-center group">
                <div className="w-20 h-20 bg-slate-50 text-slate-900 rounded-[2rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner border border-slate-100">
                    <RefreshCw size={36} />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Recurring Flow</h3>
                <div className="mt-6 space-y-4 w-full">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">OpEx Burn</span>
                        <span className="text-lg font-black text-red-600">${recurringBurn.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">SaaS Yield (MRR)</span>
                        <span className="text-lg font-black text-emerald-600">${recurringYield.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className="bg-blue-600 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Briefcase size={100} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-2">Efficiency Rating</h3>
                <div className="text-5xl font-black tracking-tighter">94.2%</div>
                <p className="text-[10px] font-black uppercase tracking-widest mt-4 opacity-70">Top 5% Portfolio Performance</p>
                <button className="mt-10 w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-50 transition-all shadow-xl active:scale-95">
                    Optimization Report
                </button>
            </div>
        </div>
      </div>

      {/* Ledger Feed */}
      <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden flex flex-col">
        <div className="p-8 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-6">
            <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2">
                <Tag size={18} className="text-slate-500" /> Neural Ledger stream
            </h3>
            <div className="flex bg-white p-1 rounded-xl shadow-inner border border-slate-100">
                {(['All', 'Revenue', 'Expense'] as const).map(type => (
                    <button 
                        key={type} 
                        onClick={() => setActiveType(type)}
                        className={`px-6 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeType === type ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        {type}
                    </button>
                ))}
            </div>
        </div>
        
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                    <tr>
                        <th className="px-10 py-6">Identity / Entity</th>
                        <th className="px-10 py-6">Protocol Type</th>
                        <th className="px-10 py-6">Recurrence</th>
                        <th className="px-10 py-6">Magnitude</th>
                        <th className="px-10 py-6 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-10 py-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${entry.type === 'Revenue' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                        {entry.type === 'Revenue' ? <ArrowUpRight size={18}/> : <ArrowDownLeft size={18}/>}
                                    </div>
                                    <div>
                                        <div className="font-black text-slate-900 uppercase tracking-tight text-sm">{entry.entity}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{entry.date} • {entry.category}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-10 py-6">
                                <span className={`text-[9px] uppercase font-black px-3 py-1 rounded-full border ${
                                    entry.type === 'Revenue' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                                }`}>
                                    {entry.type}
                                </span>
                            </td>
                            <td className="px-10 py-6">
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${entry.frequency === 'One-time' ? 'bg-slate-300' : 'bg-blue-500 animate-pulse'}`}></div>
                                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{entry.frequency}</span>
                                </div>
                            </td>
                            <td className="px-10 py-6">
                                <div className={`font-black text-sm tracking-tight ${entry.type === 'Revenue' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                    {entry.type === 'Revenue' ? '+' : '-'}${entry.amount.toLocaleString()}
                                </div>
                            </td>
                            <td className="px-10 py-6 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEntries(entries.filter(e => e.id !== entry.id))} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-red-600 hover:border-red-100 transition-all"><Trash2 size={16}/></button>
                                    <button className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 transition-all"><FileText size={16}/></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {filteredEntries.length === 0 && (
                <div className="p-20 text-center flex flex-col items-center">
                    <Layers size={48} className="opacity-10 mb-4" />
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Zero protocol records detected</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default FinancialTracker;
