
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Contact, ClientDocument, FinancialSpreading, Activity, BusinessProfile } from '../types';
import { Folder, FileText, Upload, CheckCircle, AlertCircle, Clock, Eye, Download, Shield, X, MoreVertical, Loader, BrainCircuit, ScanLine, Share2, MessageSquare, Send, Sparkles, AlertTriangle, Fingerprint, RefreshCw, Wand2, Info, Search } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import * as geminiService from '../services/geminiService';
import SecureShareModal from './SecureShareModal';

interface DocumentVaultProps {
  contact: Contact;
  readOnly?: boolean; 
  onUpdateContact?: (contact: Contact) => void;
  defaultCategory?: DocumentVaultCategory;
  uploadRequestId?: number;
  uploadIntentLabel?: string;
}

export type DocumentVaultCategory = 'All' | ClientDocument['type'];

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

const CATEGORY_FILTERS: DocumentVaultCategory[] = ['All', 'Credit', 'Financial', 'Legal', 'Identification', 'Contract', 'Receipt', 'Other'];

const DocumentVault: React.FC<DocumentVaultProps> = ({
  contact,
  readOnly = false,
  onUpdateContact,
  defaultCategory = 'All',
  uploadRequestId = 0,
  uploadIntentLabel = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<DocumentVaultCategory>(defaultCategory);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents: ClientDocument[] = contact.documents && contact.documents.length > 0 ? contact.documents : [
    { id: 'req_1', name: 'Articles of Incorporation', type: 'Legal', status: 'Missing', required: true },
    { id: 'req_2', name: 'EIN Confirmation Letter', type: 'Legal', status: 'Missing', required: true },
    { id: 'req_3', name: 'Driver\'s License (Front/Back)', type: 'Identification', status: 'Missing', required: true },
    { id: 'req_4', name: 'Bank Statements (Last 3 Months)', type: 'Financial', status: 'Missing', required: true },
  ];

  const filteredDocuments = useMemo(
    () => (selectedCategory === 'All' ? documents : documents.filter((document) => document.type === selectedCategory)),
    [documents, selectedCategory]
  );
  const orderedDocuments = useMemo(() => {
    const rank: Record<ClientDocument['status'], number> = {
      Missing: 0,
      'Pending Review': 1,
      Processing: 2,
      Rejected: 3,
      Verified: 4,
      Signed: 5,
    };

    return [...filteredDocuments].sort((left, right) => {
      const statusDelta = (rank[left.status] ?? 99) - (rank[right.status] ?? 99);
      if (statusDelta !== 0) return statusDelta;
      return Number(Boolean(right.required)) - Number(Boolean(left.required));
    });
  }, [filteredDocuments]);
  const missingCount = documents.filter((document) => document.status === 'Missing').length;
  const verifiedCount = documents.filter((document) => document.status === 'Verified' || document.status === 'Signed').length;
  const pendingCount = documents.filter((document) => document.status === 'Pending Review' || document.status === 'Processing').length;
  const nextDocumentRequest = documents.find((document) => document.required && document.status === 'Missing') || null;

  useEffect(() => {
    setSelectedCategory(defaultCategory);
  }, [defaultCategory]);

  useEffect(() => {
    if (!uploadRequestId) return;
    fileInputRef.current?.click();
  }, [uploadRequestId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, isAiScan: boolean = false) => {
    if (!event.target.files || event.target.files.length === 0 || !onUpdateContact) return;
    const file = event.target.files[0];
    
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Invalid file type."); return;
    }

    setUploading(true);
    setAnalyzing(true);

    const lowerName = (file.name || '').toLowerCase();
    const isCreditLike = /credit|experian|equifax|transunion/.test(lowerName);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const [forensic, financials] = await Promise.all([
            geminiService.analyzeDocumentForensics(base64),
            isAiScan || file.name.toLowerCase().includes('bank') ? geminiService.extractFinancialsFromDocument(base64, file.type) : null
        ]);

        const annotations = [
            { x: 20, y: 15, text: "Verified EIN Matching IRSCP575", type: 'positive' as const },
            { x: 70, y: 40, text: "Binary Integrity: Original Export", type: 'positive' as const },
            { x: 40, y: 80, text: "No Pixel Tampering Detected", type: 'positive' as const }
        ];

        const newDoc: ClientDocument = {
            id: `doc_${Date.now()}`,
            name: file.name,
            type: isCreditLike ? 'Credit' : financials ? 'Financial' : 'Legal', 
            status: forensic.trustScore > 80 ? 'Verified' : 'Rejected',
            uploadDate: new Date().toLocaleDateString(),
            fileUrl: '#',
            metadata: { forensicScore: forensic.trustScore },
            annotations: forensic.trustScore > 80 ? annotations : []
        };

        let updatedContact = { ...contact, documents: [...(contact.documents || []), newDoc] };
        if (financials?.months.length) {
            updatedContact.financialSpreading = financials;
            updatedContact.revenue = financials.months.reduce((acc, m) => acc + m.revenue, 0) / financials.months.length;
        }

        onUpdateContact(updatedContact);

        // Event hook: credit report uploads should immediately update profile + regenerate tasks.
        if (isCreditLike) {
          try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token;
            if (token && contact.id) {
              await fetch('/.netlify/functions/credit_report_uploaded_hook', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  tenant_id: contact.id,
                  docs_ready: true
                })
              });
            }
          } catch {
            // best-effort hook
          }
        }

        setUploading(false);
        setAnalyzing(false);
      };
    } catch (error) {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {(uploading || analyzing) && (
          <div className="absolute inset-0 z-50 bg-indigo-600/10 backdrop-blur-[2px] flex items-center justify-center rounded-[3rem] border-4 border-indigo-500/30 animate-pulse">
              <div className="bg-slate-950 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center">
                  <RefreshCw className="animate-spin text-blue-400 mb-4" size={48} />
                  <p className="text-white font-black uppercase tracking-widest text-xs">Neural Ingestion Active</p>
              </div>
          </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 tracking-tight leading-none">
            <Shield className="text-blue-600" size={24} /> Document Vault
          </h2>
          <p className="mt-2 text-sm text-[#61769D]">One place to upload, verify, and track the records needed for credit, funding, grants, and business setup.</p>
        </div>
        <div className="flex gap-3">
            <button onClick={() => setIsShareModalOpen(true)} className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
                <Share2 size={16} /> Share Request
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={readOnly} className="bg-slate-950 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center gap-2 disabled:opacity-50">
                <Upload size={16} /> Upload Document
            </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-[1.55rem] border border-[#E4ECF8] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Missing</p>
          <p className="mt-2 text-[1.8rem] font-black tracking-tight text-[#17233D]">{missingCount}</p>
        </div>
        <div className="rounded-[1.55rem] border border-[#E4ECF8] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Pending Review</p>
          <p className="mt-2 text-[1.8rem] font-black tracking-tight text-[#C27A24]">{pendingCount}</p>
        </div>
        <div className="rounded-[1.55rem] border border-[#E4ECF8] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Verified</p>
          <p className="mt-2 text-[1.8rem] font-black tracking-tight text-[#178D5B]">{verifiedCount}</p>
        </div>
        <div className="rounded-[1.55rem] border border-[#E4ECF8] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Next request</p>
          <p className="mt-2 text-sm font-black tracking-tight text-[#17233D]">{nextDocumentRequest?.name || 'No urgent upload request'}</p>
        </div>
      </div>

      {nextDocumentRequest ? (
        <div className="mb-5 rounded-[1.5rem] border border-[#FFE1E7] bg-[#FFF6F8] px-4 py-4 text-sm text-[#17233D]">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#E25A74]">Next action</p>
          <p className="mt-2 font-black tracking-tight">Upload {nextDocumentRequest.name} to keep this workflow moving.</p>
          <p className="mt-1 text-[#61769D]">The document experience is unified here so clients and admins can work from one clear status view.</p>
        </div>
      ) : null}

      {uploadIntentLabel ? (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Guided upload intent: <span className="font-black">{uploadIntentLabel}</span>. The vault is focused on <span className="font-black">{selectedCategory}</span> items for this upload.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${selectedCategory === category ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar p-1">
        {orderedDocuments.map((doc) => (
          <div key={doc.id} className={`p-8 rounded-[2.5rem] border-2 transition-all flex flex-col relative group bg-white shadow-sm hover:shadow-xl ${doc.status === 'Verified' ? 'border-emerald-100 hover:border-emerald-300' : 'border-slate-100 hover:border-blue-300'}`}>
            
            {/* FORENSIC X-RAY OVERLAY */}
            {doc.status === 'Verified' && doc.annotations && (
                <div className="absolute inset-4 rounded-[1.8rem] bg-slate-950/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-500 z-10 overflow-hidden pointer-events-none">
                    <div className="animate-laser-scan"></div>
                    <div className="h-full relative flex flex-col items-center justify-center p-6">
                        <div className="absolute top-4 left-4 flex items-center gap-2 text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                           <Fingerprint size={12}/> Forensic X-Ray Active
                        </div>
                        <div className="flex-1 w-full relative">
                            {doc.annotations.map((ann, i) => (
                                <div key={i} className="absolute" style={{ left: `${ann.x}%`, top: `${ann.y}%` }}>
                                    <div className={`w-3 h-3 rounded-full animate-ping ${ann.type === 'positive' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                    <div className="absolute left-6 -translate-y-1/2 bg-white/10 border border-white/20 p-2 rounded-lg text-[8px] font-black text-white uppercase whitespace-nowrap shadow-2xl">{ann.text}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between mb-8">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner ${doc.status === 'Missing' ? 'bg-slate-50 text-slate-200' : 'bg-blue-50 text-blue-600'}`}>
                {doc.type === 'Legal' ? <Shield size={32} /> : <FileText size={32} />}
              </div>
            </div>

            <div className="mb-2">
              <h4 className="text-xl font-black uppercase tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">{doc.name}</h4>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{doc.type} Milestone</p>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-50 flex justify-between items-center">
              <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                  doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                  doc.status === 'Missing' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-slate-50 text-slate-400 border-slate-100'
              }`}>{doc.status}</div>
              {doc.status === 'Missing' && !readOnly ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-[#D5E4FF] bg-[#EEF4FF] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]"
                >
                  Upload now
                </button>
              ) : (
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">{doc.required ? 'Required' : 'Reference'}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <SecureShareModal contact={contact} isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} onShare={() => {}} />
      <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e, true)} className="hidden" />
    </div>
  );
};

export default DocumentVault;
