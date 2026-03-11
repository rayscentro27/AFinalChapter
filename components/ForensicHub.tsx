
import React, { useState } from 'react';
import { ShieldCheck, Fingerprint, Lock, Search, FileText, CheckCircle, RefreshCw, AlertTriangle, Download, Zap, BrainCircuit, Shield } from 'lucide-react';
import { Contact, ForensicReport } from '../types';
import * as geminiService from '../services/geminiService';

interface ForensicHubProps {
    contacts: Contact[];
    onUpdateContact: (contact: Contact) => void;
}

const ForensicHub: React.FC<ForensicHubProps> = ({ contacts, onUpdateContact }) => {
    const [selectedContactId, setSelectedContactId] = useState('');
    const [isIssuing, setIsIssuing] = useState(false);
    
    const selectedContact = contacts.find(c => c.id === selectedContactId);
    const reports = selectedContact?.forensicReports || [];

    const handleIssueCertificate = async () => {
        if (!selectedContact) return;
        setIsIssuing(true);
        const report = await geminiService.generateForensicCertificate({ context: 'Global Audit' }, selectedContact);
        if (report) {
            onUpdateContact({
                ...selectedContact,
                forensicReports: [report, ...(selectedContact.forensicReports || [])]
            });
        }
        setIsIssuing(false);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="bg-slate-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border border-white/10">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><ShieldCheck size={320} /></div>
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20">
                        Institutional Trust Protocol
                    </div>
                    <h1 className="text-6xl font-black mb-8 tracking-tighter uppercase leading-[0.9]">
                        Forensic <span className="text-emerald-500">Guard.</span>
                    </h1>
                    <p className="text-slate-400 text-xl leading-relaxed mb-10 font-medium">
                        Convert raw borrower data into certified assets. Nexus AI audits every pixel and byte to issue tamper-proof certificates for lenders.
                    </p>
                    
                    <select 
                        value={selectedContactId}
                        onChange={e => setSelectedContactId(e.target.value)}
                        className="bg-white/5 border border-white/10 p-5 rounded-2xl w-full text-white font-black uppercase text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="">-- SELECT ENTITY FOR AUDIT --</option>
                        {contacts.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.company}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2"><Lock size={18} className="text-blue-500"/> Audit Engine</h3>
                        <div className="space-y-4">
                            <button 
                                onClick={handleIssueCertificate}
                                disabled={isIssuing || !selectedContact}
                                className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isIssuing ? <RefreshCw className="animate-spin" size={16}/> : <Fingerprint size={16}/>}
                                {isIssuing ? 'Synthesizing...' : 'Issue Trust Certificate'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Shield size={120} /></div>
                        <h3 className="font-black text-xs uppercase tracking-widest opacity-60 mb-2">Protocol Status</h3>
                        <div className="text-5xl font-black tracking-tighter mb-4">OPTIMIZED</div>
                        <p className="text-[10px] font-black uppercase tracking-widest mt-4 opacity-70">Forensic confidence: 99.4%</p>
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-6">
                    {reports.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 py-40 border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
                            <Search size={64} className="opacity-10 mb-6" />
                            <p className="text-sm font-black uppercase tracking-widest opacity-40">No Certificates Issued Yet</p>
                        </div>
                    ) : (
                        reports.map(report => (
                            <div key={report.id} className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm relative group animate-fade-in">
                                <div className="absolute top-10 right-10 flex gap-2">
                                    <span className="px-4 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase border border-emerald-200">Institutional Ready</span>
                                    <button className="p-2 text-slate-300 hover:text-blue-600 transition-all"><Download size={20}/></button>
                                </div>
                                <div className="flex items-center gap-6 mb-10">
                                    <div className="w-20 h-20 bg-slate-950 rounded-2xl flex items-center justify-center text-white shadow-2xl transform rotate-3">
                                        <ShieldCheck size={36} className="text-emerald-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Audit Certificate: {report.id}</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Issued {report.issuedAt} by {report.certifiedBy}</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forensic Breakdown</p>
                                        <div className="space-y-2">
                                            {report.metadataAudit.map((m, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                    <CheckCircle size={14} className="text-emerald-500" /> {m}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Neural Conclusion</p>
                                        <p className="text-xs font-medium text-slate-600 leading-relaxed italic">"{report.logicCheck}"</p>
                                    </div>
                                </div>

                                <div className="p-6 bg-slate-950 rounded-[2rem] text-white flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl"><BrainCircuit size={24}/></div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-500 uppercase">Trust Index</p>
                                            <p className="text-xl font-black">{report.trustScore}%</p>
                                        </div>
                                    </div>
                                    <div className="h-2 w-48 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <div className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" style={{ width: `${report.trustScore}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForensicHub;
