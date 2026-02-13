
import React from 'react';
import { SalesBattleCard as BattleCardType } from '../types';
import { ShieldCheck, Target, AlertTriangle, MessageCircle, ArrowRight, Zap, Info } from 'lucide-react';

interface SalesBattleCardProps {
  card: BattleCardType;
  onLaunchMeeting: () => void;
}

const SalesBattleCard: React.FC<SalesBattleCardProps> = ({ card, onLaunchMeeting }) => {
  return (
    <div className="bg-slate-950 text-white flex flex-col h-full animate-fade-in overflow-hidden">
      <div className="p-8 bg-gradient-to-br from-indigo-600 to-slate-900 border-b border-white/5 relative flex-shrink-0">
         <div className="absolute top-0 right-0 p-8 opacity-10"><Zap size={140} /></div>
         <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4 border border-emerald-500/20">Neural Intel Core</div>
            <h2 className="text-3xl font-black tracking-tight uppercase mb-2">Strategic Battle Card</h2>
            <p className="text-slate-300 text-sm leading-relaxed max-w-md font-medium">Follow this protocol for maximum approval probability.</p>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
         <div className="bg-white/5 rounded-3xl p-6 border border-white/5 italic text-slate-300 text-lg leading-relaxed">"{card.summary}"</div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-emerald-500/5 rounded-2xl p-6 border border-emerald-500/10">
               <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Asset Strengths</h3>
               <ul className="space-y-3 text-sm text-slate-300">{card.strengths.map((s, i) => <li key={i} className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />{s}</li>)}</ul>
            </div>
            <div className="bg-red-500/5 rounded-2xl p-6 border border-red-500/10">
               <h3 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Vulnerabilities</h3>
               <ul className="space-y-3 text-sm text-slate-300">{card.weaknesses.map((w, i) => <li key={i} className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />{w}</li>)}</ul>
            </div>
         </div>

         <div className="bg-indigo-950/30 rounded-2xl p-6 border border-indigo-500/20">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6 flex items-center gap-2"><MessageCircle size={16} /> Objection Strategy</h3>
            <div className="space-y-6">{card.predictedObjections.map((pair, i) => (
                <div key={i} className="space-y-2 border-l-2 border-indigo-500/20 pl-4">
                    <p className="text-sm font-bold text-white italic">" {pair.objection} "</p>
                    <p className="text-xs text-indigo-300/80 font-medium bg-indigo-500/10 p-3 rounded-xl leading-relaxed">{pair.rebuttal}</p>
                </div>
            ))}</div>
         </div>

         <div className="bg-emerald-500/10 rounded-2xl p-6 border border-emerald-500/20 mb-8">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Target size={16} /> The Closing Move</h3>
            <p className="text-slate-200 font-bold leading-relaxed italic text-lg">{card.closingStrategy}</p>
         </div>
      </div>

      <div className="p-8 bg-slate-900 border-t border-white/5 flex items-center justify-between flex-shrink-0">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"><Info size={20} /></div>
            <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol</p><p className="text-xs text-slate-300">Ready for Live Handoff</p></div>
         </div>
         <button onClick={onLaunchMeeting} className="bg-emerald-500 text-slate-950 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20 transition-all flex items-center gap-2 transform active:scale-95">Launch Final Call <ArrowRight size={16} /></button>
      </div>
    </div>
  );
};

export default SalesBattleCard;
