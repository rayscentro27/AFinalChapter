
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Contact, FinancialMonth, FinancialSpreading } from '../types';
import { Activity, Save, Calculator, AlertOctagon, Sparkles, RefreshCw, TrendingUp, ShieldCheck } from 'lucide-react';
import * as geminiService from '../services/geminiService';

interface CashFlowAnalyzerProps {
  contact: Contact;
  onUpdateContact?: (contact: Contact) => void;
}

const CashFlowAnalyzer: React.FC<CashFlowAnalyzerProps> = ({ contact, onUpdateContact }) => {
  const defaultMonths: FinancialMonth[] = [
    { month: 'Month 1', revenue: 0, expenses: 0, endingBalance: 0, nsfCount: 0, negativeDays: 0 },
    { month: 'Month 2', revenue: 0, expenses: 0, endingBalance: 0, nsfCount: 0, negativeDays: 0 },
    { month: 'Month 3', revenue: 0, expenses: 0, endingBalance: 0, nsfCount: 0, negativeDays: 0 },
  ];

  const [months, setMonths] = useState<FinancialMonth[]>(contact.financialSpreading?.months || defaultMonths);
  const [isEditing, setIsEditing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const totalRevenue = months.reduce((acc, m) => acc + m.revenue, 0);
  const avgRevenue = months.length > 0 ? totalRevenue / months.length : 0;
  const totalNSFs = months.reduce((acc, m) => acc + m.nsfCount, 0);
  const avgBalance = months.length > 0 ? months.reduce((acc, m) => acc + m.endingBalance, 0) / months.length : 0;
  
  const getLenderTier = () => {
    if (totalNSFs > 5 || avgBalance < 500) return { tier: 'D', label: 'High Risk (MCA Only)', color: 'bg-red-100 text-red-700' };
    if (totalNSFs > 2) return { tier: 'C', label: 'Sub-Prime', color: 'bg-orange-100 text-orange-700' };
    if (avgRevenue < 5000) return { tier: 'B-', label: 'Micro-Funding', color: 'bg-blue-100 text-blue-700' };
    if (avgRevenue > 10000 && avgBalance > 2000) return { tier: 'A', label: 'Prime / Bankable', color: 'bg-emerald-100 text-emerald-700' };
    return { tier: 'B', label: 'Standard', color: 'bg-blue-50 text-blue-600' };
  };

  const lenderTier = getLenderTier();

  const handleNeuralAnalysis = async () => {
    setIsAnalyzing(true);
    try {
        const result = await geminiService.analyzeDealStructure(contact.financialSpreading || { months, lastUpdated: '' }, avgRevenue);
        if (onUpdateContact) {
            onUpdateContact({
                ...contact,
                aiReason: `Neural Scan Result: ${result.riskAssessment}`,
                aiScore: result.maxApproval > 50000 ? 85 : 45
            });
        }
        alert("Neural underwriting complete. Risk profile updated.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (onUpdateContact) {
      const spreadingData: FinancialSpreading = {
        months,
        lastUpdated: new Date().toISOString().split('T')[0]
      };
      onUpdateContact({
        ...contact,
        revenue: avgRevenue,
        financialSpreading: spreadingData
      });
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Avg Monthly Revenue</p>
          <p className="text-xl font-black text-slate-900 mt-1 tracking-tight">${avgRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Avg Daily Balance</p>
          <p className={`text-xl font-black mt-1 tracking-tight ${avgBalance < 1000 ? 'text-amber-600' : 'text-slate-900'}`}>
            ${avgBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Total NSFs</p>
          <div className="flex items-center gap-2 mt-1">
            <p className={`text-xl font-black tracking-tight ${totalNSFs > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totalNSFs}</p>
            {totalNSFs > 0 && <AlertOctagon size={16} className="text-red-500 animate-pulse" />}
          </div>
        </div>
        <div className={`p-4 rounded-xl border flex flex-col justify-center ${lenderTier.color} border-transparent shadow-sm relative overflow-hidden group`}>
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-110 transition-transform"><TrendingUp size={48} /></div>
          <p className="text-[10px] uppercase font-black tracking-widest opacity-70">Lender Tier</p>
          <p className="text-xl font-black tracking-tight">{lenderTier.tier} - {lenderTier.label}</p>
        </div>
      </div>

      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
                  <Sparkles size={24} />
              </div>
              <div>
                  <h3 className="text-white font-black uppercase tracking-tight text-lg">Neural Forensic Audit</h3>
                  <p className="text-slate-400 text-sm">Deep scan for debt stacking and pattern inconsistencies.</p>
              </div>
          </div>
          <button 
            onClick={handleNeuralAnalysis}
            disabled={isAnalyzing}
            className="w-full md:w-auto px-8 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 disabled:opacity-50"
          >
              {isAnalyzing ? <RefreshCw className="animate-spin" size={18}/> : <ShieldCheck size={18}/>}
              {isAnalyzing ? 'Processing...' : 'Execute Neural Spread'}
          </button>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-72">
        <h3 className="text-xs font-black text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-widest">
          <Activity size={16} className="text-blue-500"/> Cash Flow Trend Analysis
        </h3>
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <BarChart data={months}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} />
            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} />
            <Tooltip 
              contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold'}}
              formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
            />
            <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
            <Bar dataKey="revenue" name="Deposits" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Withdrawals" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-wider">
            <Calculator size={18} className="text-slate-500" /> Bank Statement Ledger
          </h3>
          {isEditing ? (
            <div className="flex gap-2">
              <button onClick={() => setIsEditing(false)} className="text-[10px] px-4 py-2 rounded-xl font-black uppercase tracking-widest border border-slate-300 text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleSave} className="text-[10px] px-4 py-2 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest hover:bg-emerald-700 flex items-center gap-2 shadow-lg transition-all"><Save size={14} /> Commit Changes</button>
            </div>
          ) : (
            <button onClick={() => setIsEditing(true)} className="text-[10px] px-4 py-2 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">Manual Override</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-200">
              <tr><th className="px-6 py-4">Month</th><th className="px-6 py-4">Deposits</th><th className="px-6 py-4">Withdrawals</th><th className="px-6 py-4">Ending Bal</th><th className="px-6 py-4 text-red-600">NSF Count</th><th className="px-6 py-4 text-amber-600">Neg Days</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {months.map((m, idx) => (
                <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${m.nsfCount > 0 || m.negativeDays > 0 ? 'bg-red-50/30' : ''}`}>
                  <td className="px-6 py-4 font-bold text-slate-900 text-xs uppercase tracking-tight">{m.month}</td>
                  <td className="px-6 py-4 text-emerald-700 font-black">${m.revenue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-slate-600 font-bold">${m.expenses.toLocaleString()}</td>
                  <td className="px-6 py-4 font-black text-slate-800">${m.endingBalance.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${m.nsfCount > 0 ? 'bg-red-100 text-red-700 border-red-200 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-40'}`}>{m.nsfCount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${m.negativeDays > 0 ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-40'}`}>{m.negativeDays}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashFlowAnalyzer;
