import React, { useState } from 'react';
import { Contact, ClientDocument, Activity } from '../types';
import {
  Shield,
  Upload,
  RefreshCw,
  Zap,
  Info,
  ExternalLink,
  ListChecks,
  FileText,
  Smartphone,
  Copy,
  Download,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  runDisputeLetterPipeline,
  type DisputeLetterItemInput,
  type DisputeLetterPipelineResult,
} from '../services/disputeLetterPipelineService';

interface CreditRepairAIProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

function buildDisputeItems(contact: Contact): DisputeLetterItemInput[] {
  const items = contact.negativeItems || [];
  if (items.length === 0) {
    return [
      {
        bureau: 'all',
        creditor: 'Chase Bank',
        reason: 'Late payment reporting appears inaccurate or unverifiable',
        details: 'Requesting investigation and correction under FCRA principles.',
      },
    ];
  }

  return items.map((item, index) => ({
    bureau: 'all',
    creditor: item.title || `Creditor ${index + 1}`,
    account_reference: item.id || undefined,
    reason: item.description || 'Reported account details appear inaccurate or unverifiable.',
    details: item.status ? `Current status noted: ${item.status}` : undefined,
  }));
}

function formatRedactionSummary(result: DisputeLetterPipelineResult): string {
  const stats = result.run.redaction_stats;
  return `Redaction pass: emails ${stats.emails}, phones ${stats.phones}, SSNs ${stats.ssn}, long numbers ${stats.long_numbers}`;
}

function toSafeSlug(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'client';
  return trimmed.replace(/\s+/g, '_');
}

const CreditRepairAI: React.FC<CreditRepairAIProps> = ({ contact, onUpdateContact }) => {
  const [step, setStep] = useState<'upload' | 'scanning' | 'results'>('upload');
  const [scanProgress, setScanProgress] = useState(0);
  const [isDraftingLetter, setIsDraftingLetter] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftResult, setDraftResult] = useState<DisputeLetterPipelineResult | null>(null);

  const handleSimulateScan = () => {
    setStep('scanning');
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setStep('results');
      }
    }, 100);
  };

  const handleDraftDisputeLetter = async () => {
    setIsDraftingLetter(true);
    setDraftError('');

    try {
      const result = await runDisputeLetterPipeline({
        contact_id: contact.id,
        recipient_name: contact.name || 'Client',
        tone: 'firm',
        items: buildDisputeItems(contact),
      });

      setDraftResult(result);

      const companySlug = toSafeSlug(contact.company || contact.name || 'client');
      const fileName = `${companySlug}_dispute_letter_${new Date().toISOString().slice(0, 10)}.txt`;
      const blob = new Blob([result.letter.letter_text], { type: 'text/plain' });
      const fileUrl = URL.createObjectURL(blob);

      const newDoc: ClientDocument = {
        id: `doc_dispute_${result.letter.id}`,
        name: fileName,
        type: 'Credit',
        status: 'Pending Review',
        uploadDate: new Date().toLocaleDateString(),
        fileUrl,
        metadata: {
          dispute_letter_id: result.letter.id,
          dispute_run_id: result.run.id,
          redaction_stats: result.run.redaction_stats,
          generated_by: 'dispute_letter_pipeline',
        },
      };

      const activity: Activity = {
        id: `act_dispute_${Date.now()}`,
        type: 'legal',
        description: `Generated dispute letter template (${result.letter.id}) and queued for review.`,
        date: new Date().toLocaleString(),
        user: 'Nexus AI',
      };

      onUpdateContact({
        ...contact,
        documents: [...(contact.documents || []), newDoc],
        activities: [...(contact.activities || []), activity],
      });
    } catch (e: any) {
      setDraftError(e?.message || 'Unable to generate dispute letter.');
    } finally {
      setIsDraftingLetter(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!draftResult?.letter.letter_text) return;
    await navigator.clipboard.writeText(draftResult.letter.letter_text);
  };

  const handleDownloadDraft = () => {
    if (!draftResult?.letter.letter_text) return;
    const blob = new Blob([draftResult.letter.letter_text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toSafeSlug(contact.company || contact.name || 'client')}_dispute_letter.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col animate-fade-in bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden relative shadow-sm">
      <div className="bg-slate-950 text-white p-10 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-3xl font-black flex items-center gap-3 uppercase tracking-tighter">
            <Zap size={28} className="text-yellow-400 fill-yellow-400" /> Forensic Credit Audit
          </h3>
          <p className="text-slate-500 text-xs mt-2 font-black tracking-widest uppercase opacity-60">Personal Portfolio Deconstruction v2.5</p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-5"><Shield size={200} /></div>
      </div>

      <div className="flex-1 p-10 flex flex-col overflow-y-auto custom-scrollbar">
        {step === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start h-full">
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-[0.9]">Phase 1: <br /><span className="text-blue-600">The Genesis Audit.</span></h3>
                <p className="text-lg text-slate-500 font-medium leading-relaxed italic">
                  "Your funding journey starts with forensic integrity. We audit your reports to find technical errors that prevent Tier 1 approvals."
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-8 rounded-[2.5rem] space-y-6">
                <h4 className="font-black text-blue-900 uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                  <Info size={16} /> How to pull your report
                </h4>
                <ol className="space-y-4">
                  <li className="flex gap-4">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-[10px] shrink-0 shadow-lg">1</div>
                    <p className="text-sm text-blue-800 font-medium">Navigate to <a href="https://www.annualcreditreport.com" target="_blank" className="font-black underline decoration-2">AnnualCreditReport.com</a></p>
                  </li>
                  <li className="flex gap-4">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-[10px] shrink-0 shadow-lg">2</div>
                    <p className="text-sm text-blue-800 font-medium">Download reports from <strong>Experian, TransUnion, and Equifax</strong>.</p>
                  </li>
                  <li className="flex gap-4">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-[10px] shrink-0 shadow-lg">3</div>
                    <p className="text-sm text-blue-800 font-medium">Save as PDF and drop them into the audit engine to the right.</p>
                  </li>
                </ol>
                <a href="https://www.annualcreditreport.com" target="_blank" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/10">
                  Visit Source <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="h-full flex flex-col justify-center">
              <div
                onClick={handleSimulateScan}
                className="border-4 border-dashed border-slate-100 bg-slate-50 rounded-[3rem] p-16 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group active:scale-95 flex flex-col items-center shadow-inner"
              >
                <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl group-hover:scale-110 transition-transform">
                  <Upload size={40} className="text-blue-600" />
                </div>
                <p className="font-black text-blue-600 mb-2 uppercase text-lg tracking-widest">Deploy Audit Engine</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Drop 3-Bureau Report (PDF)</p>
              </div>
            </div>
          </div>
        )}

        {step === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
            <div className="relative mb-12">
              <RefreshCw className="animate-spin text-blue-600 opacity-20" size={160} />
            </div>
            <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Audit in Progress: {scanProgress}%</h4>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-2">Scrutinizing technical non-compliance...</p>
          </div>
        )}

        {step === 'results' && (
          <div className="animate-fade-in space-y-10">
            <div className="flex justify-between items-center">
              <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Audit Verdict</h4>
              <button onClick={() => setStep('upload')} className="text-[10px] font-black uppercase text-slate-400 hover:text-blue-600">Re-Run Scan</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl">
                <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Estimated Score</p>
                <p className="text-4xl font-black text-emerald-600 tracking-tighter">685</p>
                <p className="text-[10px] font-medium text-emerald-600 mt-2">Ready for Tier 1 Cards</p>
              </div>
              <div className="p-6 bg-red-50 border border-red-100 rounded-3xl">
                <p className="text-[9px] font-black text-red-700 uppercase tracking-widest mb-1">Negative Items</p>
                <p className="text-4xl font-black text-red-600 tracking-tighter">{contact.negativeItems?.length || 1}</p>
                <p className="text-[10px] font-medium text-red-600 mt-2">Technical Errors Detected</p>
              </div>
              <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl">
                <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest mb-1">SBA Probability</p>
                <p className="text-4xl font-black text-blue-600 tracking-tighter">High</p>
                <p className="text-[10px] font-medium text-blue-600 mt-2">Qualified for Phase 4</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-8 space-y-6">
              <h5 className="font-black text-slate-900 uppercase text-xs tracking-widest mb-6 flex items-center gap-2">
                <ListChecks size={18} className="text-blue-600" /> Prescribed Protocol
              </h5>

              <div className="space-y-4">
                <div className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><FileText size={20} /></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800 uppercase">Generate Metro2 Dispute Letters</p>
                    <p className="text-[10px] text-slate-400 font-medium">AI pipeline: redact - generate - merge - store</p>
                  </div>
                  <button
                    onClick={handleDraftDisputeLetter}
                    disabled={isDraftingLetter}
                    className="bg-slate-950 text-white px-6 py-2 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-600 transition-all disabled:opacity-60"
                  >
                    {isDraftingLetter ? 'Drafting...' : 'Draft AI Letter'}
                  </button>
                </div>

                <div className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 opacity-60">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center"><Smartphone size={20} /></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-400 uppercase">Apply for Tier 1 Cards</p>
                    <p className="text-[10px] text-slate-400 font-medium">Wait until disputes are cleared (approx 21 days)</p>
                  </div>
                  <span className="text-[9px] font-black text-slate-300 uppercase">LOCKED</span>
                </div>
              </div>

              {draftError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle size={14} /> {draftError}
                </div>
              ) : null}

              {draftResult ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                        <CheckCircle size={14} /> Dispute letter generated and queued for review
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-1">
                        Run {draftResult.run.id} | Letter {draftResult.letter.id}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-1">{formatRedactionSummary(draftResult)}</p>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleCopyDraft} className="px-3 py-2 rounded-lg border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                        <Copy size={12} /> Copy
                      </button>
                      <button onClick={handleDownloadDraft} className="px-3 py-2 rounded-lg border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                        <Download size={12} /> Download
                      </button>
                    </div>
                  </div>

                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-200 bg-white p-4 text-xs text-slate-700 leading-relaxed">
                    {draftResult.letter.letter_text}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditRepairAI;
