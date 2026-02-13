
import React, { useState } from 'react';
import { Contact, ClientDocument } from '../types';
import { Shield, Gavel, CheckCircle, FileText, Lock, PenTool, Download, AlertTriangle, ChevronRight, Scale, ArrowRight, Fingerprint, Search } from 'lucide-react';
import SmartContractSigner from './SmartContractSigner';

interface LegalComplianceProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const LegalCompliance: React.FC<LegalComplianceProps> = ({ contact, onUpdateContact }) => {
  const [signingDoc, setSigningDoc] = useState<ClientDocument | null>(null);
  const [selectedAuditDoc, setSelectedAuditDoc] = useState<ClientDocument | null>(null);

  const legalDocs = contact.documents?.filter(d => d.type === 'Legal' || d.type === 'Contract') || [];

  const handleSignComplete = (signature: string) => {
    if (!signingDoc) return;
    
    // Simulate Forensic Data
    const forensicMetadata = {
        ip: "192.168.1.104",
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        forensicScore: 98
    };

    const updatedDocs = (contact.documents || []).map(doc => 
        doc.id === signingDoc.id ? { 
            ...doc, 
            status: 'Signed' as const, 
            uploadDate: new Date().toLocaleDateString(),
            isEsed: true,
            signatureHash: btoa(signature.substring(0, 50)),
            metadata: forensicMetadata
        } : doc
    );

    const newActivity = {
        id: `act_leg_${Date.now()}`,
        type: 'system' as const,
        description: `Executed Digital Agreement: ${signingDoc.name} (Forensic Score: ${forensicMetadata.forensicScore})`,
        date: new Date().toLocaleString(),
        user: 'Client'
    };

    onUpdateContact({
        ...contact,
        documents: updatedDocs as ClientDocument[],
        activities: [...(contact.activities || []), newActivity],
        legalStanding: 'Compliant'
    });

    setSigningDoc(null);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-slate-900 rounded-[2.5rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5">
         <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Shield size={280} /></div>
         <div className="relative z-10 max-w-2xl">
            <div className="bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-emerald-500/20 w-fit">Compliance Infrastructure</div>
            <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase leading-none">Security <span className="text-emerald-500">& Legal</span></h2>
            <p className="text-slate-400 text-xl leading-relaxed font-medium">
               Nexus OS uses bank-grade encryption and Neural Forensics to secure your legal authorizations.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2">
                <Gavel size={16} className="text-blue-500" /> Active Agreements
            </h3>

            <div className="grid grid-cols-1 gap-4">
                {legalDocs.length === 0 ? (
                    <div className="bg-white p-12 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-400">
                        <FileText size={48} className="opacity-10 mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest">No Active Agreements</p>
                    </div>
                ) : (
                    legalDocs.map(doc => (
                        <div key={doc.id} className={`bg-white p-6 rounded-[2rem] border shadow-sm transition-all flex items-center justify-between group ${doc.status === 'Signed' ? 'border-emerald-100 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-300'}`}>
                            <div className="flex items-center gap-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${doc.status === 'Signed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                    {doc.status === 'Signed' ? <CheckCircle size={24}/> : <PenTool size={24}/>}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 uppercase tracking-tight">{doc.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${doc.status === 'Signed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                            {doc.status}
                                        </span>
                                        {doc.uploadDate && <span className="text-[9px] font-black text-slate-400 uppercase">Executed {doc.uploadDate}</span>}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                {doc.status !== 'Signed' ? (
                                    <button 
                                        onClick={() => setSigningDoc(doc)}
                                        className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-500/10 flex items-center gap-2 transform active:scale-95 transition-all"
                                    >
                                        Execute <ArrowRight size={14} />
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button onClick={() => setSelectedAuditDoc(doc)} className="p-3 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-2">
                                            <Fingerprint size={18} />
                                        </button>
                                        <button className="p-3 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-blue-600 hover:border-blue-200 transition-all">
                                            <Download size={20} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
         </div>

         <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Lock size={16} className="text-emerald-500" /> Digital Integrity
                </h3>
                {selectedAuditDoc ? (
                    <div className="animate-fade-in space-y-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Signature Hash</p>
                            <code className="text-[10px] text-blue-600 break-all">{selectedAuditDoc.signatureHash || 'pending...'}</code>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">IP Address</p>
                            <p className="text-xs font-bold">{selectedAuditDoc.metadata?.ip}</p>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <span className="text-[10px] font-black text-emerald-700 uppercase">Forensic Score</span>
                            <span className="font-black text-emerald-600">{selectedAuditDoc.metadata?.forensicScore}/100</span>
                        </div>
                        <button onClick={() => setSelectedAuditDoc(null)} className="w-full py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Close Audit</button>
                    </div>
                ) : (
                    <ul className="space-y-4">
                        <li className="flex items-start gap-4">
                            <div className="mt-1"><CheckCircle size={14} className="text-emerald-500" /></div>
                            <div className="text-xs font-medium text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800">ESIGN Compliance:</span> All signatures are legally binding under the Federal ESIGN Act of 2000.
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="mt-1"><CheckCircle size={14} className="text-emerald-500" /></div>
                            <div className="text-xs font-medium text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800">Neural Audit:</span> We track device fingerprints and IP latency to verify identity.
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="mt-1"><Scale size={14} className="text-slate-400" /></div>
                            <div className="text-xs font-medium text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800">Jurisdiction:</span> Real-time state-specific disclosure logic applied to all contracts.
                            </div>
                        </li>
                    </ul>
                )}
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-[2rem] p-8">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle size={24} className="text-indigo-600" />
                    <h4 className="font-black text-indigo-900 text-sm uppercase tracking-tight">Security Alert</h4>
                </div>
                <p className="text-xs text-indigo-700 leading-relaxed font-medium">
                    Please sign the <span className="font-bold">Neural Data Usage Disclosure</span> before connecting your primary bank accounts.
                </p>
            </div>
         </div>
      </div>

      {signingDoc && (
          <SmartContractSigner 
            offer={{ 
                id: signingDoc.id, 
                lenderName: 'Nexus OS Legal Core', 
                amount: 0, 
                term: 'Perpetual', 
                rate: '0', 
                payment: 'None', 
                paymentAmount: 0, 
                status: 'Sent', 
                dateSent: '' 
            }} 
            onClose={() => setSigningDoc(null)} 
            onSign={handleSignComplete} 
          />
      )}
    </div>
  );
};

export default LegalCompliance;
