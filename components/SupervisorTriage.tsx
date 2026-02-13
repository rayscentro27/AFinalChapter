
import React from 'react';
import { 
    AlertTriangle, MessageSquare, TrendingDown, ShieldAlert, 
    ArrowRight, Clock, User, Building2, Zap, Ghost, RefreshCw
} from 'lucide-react';
import { Contact } from '../types';

interface SupervisorTriageProps {
    contacts: Contact[];
    onUpdateContact: (contact: Contact) => void;
}

const SupervisorTriage: React.FC<SupervisorTriageProps> = ({ contacts, onUpdateContact }) => {
    const volatileLeads = contacts.filter(c => 
        c.status === 'Triage' || 
        c.automationMetadata?.sentiment === 'Agitated' || 
        c.automationMetadata?.sentiment === 'Critical'
    );

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="bg-red-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border border-red-500/20">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><ShieldAlert size={320} /></div>
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-red-500/20">
                        Personnel Watchtower: PRIORITY 1
                    </div>
                    <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        Sentiment <span className="text-red-500">Triage.</span>
                    </h1>
                    <p className="text-red-200/70 text-xl leading-relaxed mb-0 font-medium">
                        Autonomous emotional auditing active. Sentinel has intercepted {volatileLeads.length} leads showing signs of friction or churn intent.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {volatileLeads.length === 0 ? (
                    <div className="col-span-full py-40 text-center flex flex-col items-center justify-center text-slate-300">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                            <Zap size={32} className="opacity-20" />
                        </div>
                        <p className="text-sm font-black uppercase tracking-widest opacity-40">Global Pulse Stable: No Friction Detected</p>
                    </div>
                ) : volatileLeads.map(lead => (
                    <div key={lead.id} className="bg-white border-2 border-red-100 p-8 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-6 right-6">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                lead.automationMetadata?.sentiment === 'Critical' ? 'bg-red-600 text-white' : 'bg-orange-50 text-orange-700 border-orange-200'
                            }`}>
                                {lead.automationMetadata?.sentiment}
                            </span>
                        </div>

                        <div>
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-xl transform rotate-3 group-hover:rotate-0 transition-transform">
                                    {lead.company[0]}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate max-w-[150px]">{lead.company}</h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lead.name}</p>
                                </div>
                            </div>

                            <div className="bg-red-50 border border-red-100 p-5 rounded-2xl mb-8">
                                <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <MessageSquare size={12} /> Triage Rationale
                                </p>
                                <p className="text-xs text-red-900 font-medium leading-relaxed italic">
                                    "{lead.automationMetadata?.triageReason || 'Friction detected in recent neural transcripts.'}"
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <button 
                                onClick={() => window.location.hash = 'inbox'}
                                className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                            >
                                Manual Intervention <ArrowRight size={14}/>
                            </button>
                            <button 
                                onClick={() => onUpdateContact({ ...lead, status: 'Active', automationMetadata: { ...lead.automationMetadata!, sentiment: 'Neutral' } })}
                                className="w-full py-2 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest transition-colors"
                            >
                                Dismiss Alert
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-50 rounded-[3rem] p-10 border border-slate-200 flex items-start gap-8">
                <div className="p-4 bg-white rounded-3xl shadow-xl"><ShieldAlert size={32} className="text-red-600"/></div>
                <div>
                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Institutional De-Escalation</h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">
                        The Triage Hub is reserved for supervisors to manage leads that require high emotional IQ. Sentinel AI monitors these sessions to update its own "Empathy Matrix," improving the autonomous Shadow Concierge's success rate in high-friction niches like collections and credit rehab.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SupervisorTriage;
