
import React from 'react';
import { Contact } from '../types';
import { Shield, Zap, Clock, Trophy, CheckCircle, Lock, AlertTriangle, TrendingUp } from 'lucide-react';

interface TierProgressWidgetProps {
  contact: Contact;
}

const TierProgressWidget: React.FC<TierProgressWidgetProps> = ({ contact }) => {
  const currentPhase = contact.status === 'Lead' ? 1 : 
                       contact.status === 'Active' ? 2 :
                       contact.status === 'Negotiation' ? 3 : 4;

  const phases = [
    { id: 1, label: 'Genesis Audit', icon: Shield, color: 'bg-blue-500' },
    { id: 2, label: '0% Catalyst', icon: Zap, color: 'bg-yellow-500' },
    { id: 3, label: 'Reserve Seasoning', icon: Clock, color: 'bg-indigo-500' },
    { id: 4, label: 'SBA Magnitude', icon: Trophy, color: 'bg-emerald-500' }
  ];

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="bg-slate-950 p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={120} /></div>
        <div className="relative z-10 flex justify-between items-end">
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Roadmap Maturity</p>
                <h3 className="text-3xl font-black uppercase tracking-tighter">Phase 0{currentPhase}</h3>
            </div>
            <div className="text-right">
                <p className="text-4xl font-black text-emerald-500">{(currentPhase/4)*100}%</p>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Protocol Alignment</p>
            </div>
        </div>
      </div>

      <div className="p-8">
        <div className="flex justify-between relative mb-12">
            <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-100 z-0"></div>
            {phases.map((phase) => {
                const Icon = phase.icon;
                const isCurrent = phase.id === currentPhase;
                const isDone = phase.id < currentPhase;
                
                return (
                    <div key={phase.id} className="relative z-10 flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${isDone ? 'bg-emerald-500 text-white' : isCurrent ? `${phase.color} text-white shadow-lg scale-110` : 'bg-white border-2 border-slate-100 text-slate-300'}`}>
                            {isDone ? <CheckCircle size={20} /> : <Icon size={20} />}
                        </div>
                        <span className={`text-[8px] font-black uppercase mt-3 tracking-widest ${isCurrent ? 'text-slate-900' : 'text-slate-400'}`}>{phase.label}</span>
                    </div>
                );
            })}
        </div>

        {currentPhase === 3 && (
            <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl flex items-start gap-4 animate-fade-in">
                <Clock className="text-indigo-600 mt-1 shrink-0" size={20} />
                <div>
                    <h4 className="text-xs font-black text-indigo-900 uppercase">Reserve Seasoning Active</h4>
                    <p className="text-[11px] text-indigo-700 leading-relaxed mt-1">
                        AI Sentinel is monitoring your Average Daily Balance. Maintain your 6-month reserve on Autopay to unlock the $1M SBA Application in 124 days.
                    </p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default TierProgressWidget;
