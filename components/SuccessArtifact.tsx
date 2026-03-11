
import React from 'react';
import { Award, ShieldCheck, Download, Linkedin, Share2, Sparkles, Hexagon } from 'lucide-react';
import { Contact } from '../types';

interface SuccessArtifactProps {
    contact: Contact;
}

const SuccessArtifact: React.FC<SuccessArtifactProps> = ({ contact }) => {
    const fundedDeal = contact.fundedDeals?.[0];
    if (!fundedDeal) return null;

    return (
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden animate-fade-in mb-10">
            <div className="flex flex-col md:flex-row h-full">
                {/* Certificate Visual */}
                <div className="md:w-1/2 bg-slate-950 p-12 text-center flex flex-col items-center justify-center relative overflow-hidden border-r border-white/5">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-transparent to-emerald-900/30"></div>
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <path d="M0 100 L100 0" stroke="white" strokeWidth="0.1" />
                            <path d="M0 0 L100 100" stroke="white" strokeWidth="0.1" />
                        </svg>
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="w-24 h-24 bg-white/5 backdrop-blur-xl rounded-[2rem] flex items-center justify-center border border-white/10 mx-auto shadow-2xl transform -rotate-3">
                            <Hexagon size={48} className="text-emerald-500 fill-emerald-500/10" />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-emerald-500 uppercase tracking-[0.4em] mb-2">Liquidity Verification</h4>
                            <h3 className="text-5xl font-black text-white tracking-tighter uppercase leading-[0.8] mb-4">${fundedDeal.originalAmount.toLocaleString()}</h3>
                            <div className="flex items-center justify-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-widest border border-white/10 px-4 py-1.5 rounded-full w-fit mx-auto bg-white/5">
                                <ShieldCheck size={14} className="text-emerald-500"/> Nexus Verified Entity
                            </div>
                        </div>
                        <div className="pt-10">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Entity Name</p>
                            <p className="text-xl font-black text-white uppercase tracking-tight">{contact.company}</p>
                            <p className="text-[9px] text-slate-600 font-bold uppercase mt-1">Deployed {fundedDeal.fundedDate}</p>
                        </div>
                    </div>
                </div>

                {/* Viral Actions */}
                <div className="md:w-1/2 p-12 flex flex-col justify-center bg-white">
                    <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 border border-indigo-100">
                        <Sparkles size={14} /> AI Success Narrator
                    </div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-6 leading-[0.9]">Share the <br/><span className="text-indigo-600">Milestone.</span></h2>
                    <p className="text-slate-500 text-lg font-medium leading-relaxed mb-10">
                        Our AI has synthesized a specialized announcement for your network. Verified funding achievements increase your entity's authority index by 18%.
                    </p>
                    
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8 relative group">
                        <p className="text-sm text-slate-600 font-medium leading-relaxed italic">
                            "Huge milestone for {contact.company}! We just secured ${fundedDeal.originalAmount.toLocaleString()} in institutional capital via Nexus OS to accelerate our Q4 infrastructure goals. Capital velocity is real."
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl flex items-center justify-center gap-3 transform active:scale-95">
                            <Linkedin size={18} /> Share on LinkedIn
                        </button>
                        <button className="flex-1 border-2 border-slate-200 text-slate-700 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
                            <Download size={18} /> Download Asset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SuccessArtifact;
