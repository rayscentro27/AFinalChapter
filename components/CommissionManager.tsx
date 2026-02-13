
import React, { useState } from 'react';
import { Contact, CommissionProfile, PayoutRecord, ClientDocument } from '../types';
import { DollarSign, User, TrendingUp, Download, Plus, CheckCircle, Calculator, Wallet, ArrowRight, Gavel, FileCheck, Shield, AlertCircle } from 'lucide-react';
import SmartContractSigner from './SmartContractSigner';

interface CommissionManagerProps {
  contacts: Contact[];
}

const CommissionManager: React.FC<CommissionManagerProps> = ({ contacts }) => {
  const [activeTab, setActiveTab] = useState<'payouts' | 'agents'>('payouts');
  const [signingAgentId, setSigningAgentId] = useState<string | null>(null);
  
  const [agents, setAgents] = useState<CommissionProfile[]>([
    { id: 'agt_1', agentName: 'John Doe', splitPercentage: 50, totalFunded: 250000, totalCommissionEarned: 25000, currentDrawBalance: 2000, contractStatus: 'Signed' },
    { id: 'agt_2', agentName: 'Sarah Sales', splitPercentage: 40, totalFunded: 120000, totalCommissionEarned: 9600, currentDrawBalance: 0, contractStatus: 'Pending' },
  ]);

  const [payouts, setPayouts] = useState<PayoutRecord[]>([
    { id: 'pay_1', agentId: 'agt_1', dealId: 'deal_101', dealValue: 50000, grossCommission: 5000, splitAmount: 2500, drawDeduction: 0, netPayout: 2500, status: 'Paid', date: '2023-10-01' },
    { id: 'pay_2', agentId: 'agt_2', dealId: 'deal_102', dealValue: 20000, grossCommission: 2000, splitAmount: 800, drawDeduction: 0, netPayout: 800, status: 'Paid', date: '2023-10-05' },
  ]);

  const closedDeals = contacts.filter(c => c.status === 'Closed' && c.value > 0);
  const pendingDeals = closedDeals.filter(d => !payouts.some(p => p.dealId === d.id));

  const handleProcessPayout = (deal: Contact, agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    if (agent.contractStatus !== 'Signed') {
        alert("CRITICAL ERROR: Payout blocked. Agent has not signed the mandatory Independent Sales Contractor Agreement.");
        return;
    }

    const houseGross = deal.value * 0.10; 
    const agentCut = houseGross * (agent.splitPercentage / 100);
    const deduction = Math.min(agentCut, agent.currentDrawBalance);
    const net = agentCut - deduction;

    const newPayout: PayoutRecord = {
        id: `pay_${Date.now()}`,
        agentId: agent.id,
        dealId: deal.id,
        dealValue: deal.value,
        grossCommission: houseGross,
        splitAmount: agentCut,
        drawDeduction: deduction,
        netPayout: net,
        status: 'Pending',
        date: new Date().toLocaleDateString()
    };

    setPayouts([newPayout, ...payouts]);
    
    const updatedAgents = agents.map(a => 
        a.id === agent.id ? { 
            ...a, 
            currentDrawBalance: a.currentDrawBalance - deduction,
            totalFunded: a.totalFunded + deal.value,
            totalCommissionEarned: a.totalCommissionEarned + agentCut
        } : a
    );
    setAgents(updatedAgents);
    alert(`Payout processed for ${agent.agentName}. Net: $${net.toLocaleString()}`);
  };

  const handleSignOnboarding = (signature: string) => {
      if (!signingAgentId) return;
      const updatedAgents = agents.map(a => a.id === signingAgentId ? { ...a, contractStatus: 'Signed' as const } : a);
      setAgents(updatedAgents);
      alert(`Agent Agreement Executed & Hashed. Signature Hash: ${signature.substring(0, 15)}...`);
      setSigningAgentId(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tighter">
            <Wallet className="text-blue-600" size={32} /> Asset Payouts
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Neural split tracking and automated partner distributions.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200">
           <button onClick={() => setActiveTab('payouts')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'payouts' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Distributions</button>
           <button onClick={() => setActiveTab('agents')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'agents' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Agent Roster</button>
        </div>
      </div>

      {activeTab === 'payouts' && (
        <div className="space-y-8">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2"><DollarSign size={18} className="text-emerald-500"/> Pipeline Liquidity</h3>
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full uppercase tracking-widest">{pendingDeals.length} Outstanding</span>
                </div>
                
                {pendingDeals.length === 0 ? (
                    <div className="p-20 text-center text-slate-300 font-black uppercase tracking-widest text-sm">Distributions Synchronized</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <tr>
                                <th className="px-8 py-5">Merchant Entity</th>
                                <th className="px-8 py-5">Funded Value</th>
                                <th className="px-8 py-5">House Gross</th>
                                <th className="px-8 py-5 text-right">Assign Protocol</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {pendingDeals.map(deal => (
                                <tr key={deal.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-6 font-black text-slate-900 uppercase tracking-tight text-sm">{deal.company}</td>
                                    <td className="px-8 py-6 text-slate-600 font-bold">${deal.value.toLocaleString()}</td>
                                    <td className="px-8 py-6 font-mono text-emerald-600 font-black">${(deal.value * 0.10).toLocaleString()}</td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="flex justify-end gap-2">
                                            {agents.map(agent => (
                                                <button 
                                                    key={agent.id}
                                                    onClick={() => handleProcessPayout(deal, agent.id)}
                                                    className={`text-[9px] font-black px-4 py-2 rounded-xl uppercase tracking-widest transition-all shadow-lg ${agent.contractStatus === 'Signed' ? 'bg-slate-950 text-white hover:bg-slate-800' : 'bg-red-50 text-red-400 border border-red-100'}`}
                                                >
                                                    {agent.contractStatus === 'Signed' ? `Pay ${agent.agentName}` : `Block (${agent.agentName})`}
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {agents.map(agent => (
                <div key={agent.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-10">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-slate-950 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl transform rotate-3 transition-transform group-hover:rotate-0">
                                {agent.agentName.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-xl uppercase tracking-tight">{agent.agentName}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Specialist</span>
                                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 ${agent.contractStatus === 'Signed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                        {agent.contractStatus === 'Signed' ? <ShieldCheck size={10}/> : <AlertCircle size={10}/>}
                                        {agent.contractStatus}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                            {agent.splitPercentage}% Split
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-10">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner text-center">
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Funded</p>
                            <p className="font-black text-slate-900 text-lg tracking-tight">${(agent.totalFunded/1000).toFixed(0)}k</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner text-center">
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Earnings</p>
                            <p className="font-black text-emerald-600 text-lg tracking-tight">${(agent.totalCommissionEarned/1000).toFixed(1)}k</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-2xl border border-red-100 shadow-inner text-center">
                            <p className="text-[9px] text-red-400 uppercase font-black tracking-widest mb-1">Draw Bal</p>
                            <p className="font-black text-red-600 text-lg tracking-tight">${agent.currentDrawBalance}</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setSigningAgentId(agent.id)} className={`flex-1 py-4 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 ${agent.contractStatus === 'Signed' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-red-600 text-white hover:bg-red-700'}`}>
                           <Gavel size={14} /> {agent.contractStatus === 'Signed' ? 'View ISCA' : 'Send Agreement'}
                        </button>
                        <button className="p-4 bg-slate-950 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-xl">
                            <Download size={18}/>
                        </button>
                    </div>
                </div>
            ))}
            
            <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-16 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group">
                <Plus size={64} className="mb-4 opacity-10 group-hover:scale-110 transition-transform" />
                <p className="font-black uppercase tracking-[0.3em] text-xs">Onboard Specialist</p>
            </div>
        </div>
      )}

      {signingAgentId && (
          <SmartContractSigner 
            offer={{
                id: `isca_${signingAgentId}`,
                lenderName: 'Nexus Onboarding Protocol',
                amount: 0,
                term: 'Independent Sales Contractor Agreement',
                rate: '0',
                payment: 'Commission Split',
                paymentAmount: 0,
                status: 'Sent',
                dateSent: ''
            }}
            onClose={() => setSigningAgentId(null)}
            onSign={handleSignOnboarding}
          />
      )}

    </div>
  );
};

const ShieldCheck = (props: any) => <CheckCircle {...props} />;

export default CommissionManager;
