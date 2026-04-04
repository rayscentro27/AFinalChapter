import React from 'react';
import { ArrowRight, CheckCircle2, Download, FileText, Loader2, Mail, ShieldCheck, Upload, Wand2 } from 'lucide-react';
import { ViewMode } from '../../types';

type CreditWorkflowData = {
  latestReport: any | null;
  latestAnalysis: any | null;
  recommendations: any[];
  letters: any[];
  packets: any[];
  finalizedLetters: any[];
  mailEvents: any[];
  mailPackets: any[];
};

type Props = {
  data: CreditWorkflowData;
  loading?: boolean;
  saving?: boolean;
  error?: string;
  onNavigate: (view: ViewMode, pathname?: string) => void;
  onGenerateLetters: () => Promise<void> | void;
  onDownloadLetter: (letter: any) => void;
};

function latestByCreated(rows: any[]) {
  return [...rows].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null;
}

function statusLabel(input: CreditWorkflowData) {
  const latestMail = latestByCreated(input.mailEvents);
  const latestPacket = latestByCreated(input.packets);
  if (!input.latestReport) return 'report_needed';
  if (!input.latestAnalysis) return 'analysis_pending';
  if (input.letters.length === 0) return 'letters_ready_to_generate';
  if (input.finalizedLetters.length === 0 && latestPacket) return 'packet_ready';
  if (latestMail) return String(latestMail.event_type || 'mail_pending');
  return 'letters_ready';
}

export default function CreditWorkflowActionCenter(props: Props) {
  const latestLetter = latestByCreated(props.data.letters);
  const latestPacket = latestByCreated(props.data.packets);
  const latestFinalized = latestByCreated(props.data.finalizedLetters);
  const latestMail = latestByCreated(props.data.mailEvents);
  const state = statusLabel(props.data);

  const workflowSteps = [
    { label: 'Report Uploaded', complete: Boolean(props.data.latestReport) },
    { label: 'Analysis Ready', complete: Boolean(props.data.latestAnalysis) },
    { label: 'Letters Ready', complete: props.data.letters.length > 0 },
    { label: 'Certified Send', complete: Boolean(latestMail) },
  ];

  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F7FBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Phase 5 • Credit analysis + dispute engine</p>
          <h3 className="mt-2 text-[1.9rem] font-black tracking-tight text-[#17233D]">Upload, Analyze, Generate Letters, Then Send</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">
            This action center keeps the credit workflow connected from report upload through dispute-letter generation and optional certified mailing.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE5F4] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#607CC1]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Educational workflow only
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {workflowSteps.map((step) => (
          <div key={step.label} className={`rounded-[1.35rem] border p-4 ${step.complete ? 'border-[#D7ECDC] bg-[#F6FCF8]' : 'border-[#E1E8F4] bg-white'}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${step.complete ? 'bg-[#E5F8EE] text-[#169E68]' : 'bg-[#F1F5FA] text-[#93A2BA]'}`}>
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-black tracking-tight text-[#17233D]">{step.label}</p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F93B5]">{step.complete ? 'Complete' : 'Pending'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Current workflow state</p>
          <h4 className="mt-2 text-[1.4rem] font-black tracking-tight text-[#17233D]">
            {state === 'report_needed' && 'Upload Your Credit Report'}
            {state === 'analysis_pending' && 'Your Analysis Is Processing'}
            {state === 'letters_ready_to_generate' && 'Your Analysis Is Ready For Letters'}
            {state === 'packet_ready' && 'Your Packet Is Ready For Review'}
            {state === 'letters_ready' && 'Dispute Letters Are Ready'}
            {state !== 'report_needed' && state !== 'analysis_pending' && state !== 'letters_ready_to_generate' && state !== 'packet_ready' && state !== 'letters_ready' && 'Certified Mailing Status'}
          </h4>
          <p className="mt-3 text-sm leading-6 text-[#61769D]">
            {state === 'report_needed' && 'Start by uploading a report so Nexus can extract facts and unlock analysis.'}
            {state === 'analysis_pending' && 'A report is on file. Analysis and recommendations are the next step before any dispute draft is generated.'}
            {state === 'letters_ready_to_generate' && 'Actionable findings are available. Generate your dispute letters and keep the workflow moving.'}
            {state === 'packet_ready' && 'A dispute packet exists. Review the packet preview before optional certified mailing.'}
            {state === 'letters_ready' && 'Letter drafts exist. Download them or continue into finalized packet review.'}
            {state !== 'report_needed' && state !== 'analysis_pending' && state !== 'letters_ready_to_generate' && state !== 'packet_ready' && state !== 'letters_ready' && `Latest mailing event: ${String(latestMail?.event_type || 'queued').replaceAll('_', ' ')}.`}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1rem] border border-[#E6EDF8] bg-[#FBFDFF] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Summary of findings</p>
              <p className="mt-2 text-sm text-[#17233D]">
                {props.data.latestAnalysis?.analysis_notes
                  || props.data.latestAnalysis?.analysis_summary
                  || props.data.latestAnalysis?.summary
                  || 'Upload and analyze a report to surface utilization issues, negative items, and dispute opportunities.'}
              </p>
            </div>
            <div className="rounded-[1rem] border border-[#E6EDF8] bg-[#FBFDFF] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Status visibility</p>
              <p className="mt-2 text-sm text-[#17233D]">
                {latestMail
                  ? `Certified send in progress or completed: ${String(latestMail.event_type || '').replaceAll('_', ' ')}.`
                  : latestPacket
                    ? `Packet status: ${String(latestPacket.status || 'draft').replaceAll('_', ' ')}.`
                    : latestLetter
                      ? `Latest draft letter status: ${String(latestLetter.letter_status || latestLetter.status || 'pending_review').replaceAll('_', ' ')}.`
                      : 'No dispute packet or mailing record is visible yet.'}
              </p>
            </div>
          </div>

          {props.error ? (
            <div className="mt-4 rounded-[1rem] border border-[#FFD8DF] bg-[#FFF5F7] px-4 py-3 text-sm text-[#C14E67]">{props.error}</div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Primary actions</p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => props.onNavigate(ViewMode.UPLOAD_CREDIT_REPORT, '/credit-report-upload')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] bg-[#17233D] px-4 py-3 text-sm font-black text-white"
              >
                <Upload className="h-4 w-4" />
                Upload Credit Report
              </button>
              <button
                type="button"
                onClick={() => void props.onGenerateLetters()}
                disabled={props.saving || !props.data.latestAnalysis}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Generate My Dispute Letters
              </button>
              <button
                type="button"
                onClick={() => latestLetter && props.onDownloadLetter(latestLetter)}
                disabled={!latestLetter}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Download Letters
              </button>
              <button
                type="button"
                onClick={() => {
                  if (latestPacket?.id) {
                    window.location.href = `/dispute-letter-preview?packet_id=${encodeURIComponent(String(latestPacket.id))}`;
                    return;
                  }
                  if (latestFinalized?.dispute_packet_id) {
                    window.location.href = `/dispute-letter-preview?packet_id=${encodeURIComponent(String(latestFinalized.dispute_packet_id))}`;
                  }
                }}
                disabled={!latestPacket?.id && !latestFinalized?.dispute_packet_id}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6] disabled:opacity-60"
              >
                <Mail className="h-4 w-4" />
                Send Certified With DocuPost
              </button>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-[#DCE5F4] bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Latest assets</p>
            <div className="mt-4 space-y-3 text-sm text-[#17233D]">
              <div className="rounded-[1rem] border border-[#E6EDF8] bg-[#FBFDFF] p-4">
                <p className="font-black">Recommendations</p>
                <p className="mt-1 text-[#61769D]">{props.data.recommendations.length} recommendation(s) available</p>
              </div>
              <div className="rounded-[1rem] border border-[#E6EDF8] bg-[#FBFDFF] p-4">
                <p className="font-black">Letters</p>
                <p className="mt-1 text-[#61769D]">{props.data.letters.length} draft letter(s) stored</p>
              </div>
              <div className="rounded-[1rem] border border-[#E6EDF8] bg-[#FBFDFF] p-4">
                <p className="font-black">Packet + Mailing</p>
                <p className="mt-1 text-[#61769D]">
                  {latestMail
                    ? `Mailing event logged: ${String(latestMail.event_type || '').replaceAll('_', ' ')}`
                    : latestPacket
                      ? `Packet status: ${String(latestPacket.status || 'draft').replaceAll('_', ' ')}`
                      : 'No packet or mailing event visible yet'}
                </p>
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#356AE6]">
              This workflow is connected to the live upload, analysis, and mailing systems
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
