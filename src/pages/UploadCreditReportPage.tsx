import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Bureau,
  createCreditReportUploadUrl,
  uploadCreditReportPdf,
  runCreditExtractSanitize,
} from '../services/secureDisputePipelineService';

const BUREAU_OPTIONS: Bureau[] = ['experian', 'equifax', 'transunion'];

export default function UploadCreditReportPage() {
  const { user } = useAuth();
  const [bureau, setBureau] = useState<Bureau>('experian');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sanitizedFactsId, setSanitizedFactsId] = useState<string | null>(null);

  async function handleUploadAndSanitize() {
    if (!file) {
      setError('Select a PDF file first.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const upload = await createCreditReportUploadUrl(file.name || 'credit-report.pdf');
      await uploadCreditReportPdf(file, upload);

      const run = await runCreditExtractSanitize({
        upload_id: upload.upload_id,
        bureau,
      });

      setSanitizedFactsId(run.sanitized_facts_id);
      setSuccess(
        run.manual_extraction_required
          ? 'Report uploaded. Sanitization completed with manual extraction fallback. Review and edit dispute facts before generating a draft.'
          : 'Report uploaded and sanitized facts extracted successfully.',
      );
    } catch (e: any) {
      setError(String(e?.message || e));
      setSanitizedFactsId(null);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Upload Credit Report</h1>
        <p className="text-sm text-slate-400 mt-2">
          Upload your AnnualCreditReport PDF to generate educational dispute templates. Client review is required and results vary.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{success}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <label className="block text-xs uppercase tracking-widest text-slate-400">Credit Bureau</label>
        <select
          value={bureau}
          onChange={(e) => setBureau(e.target.value as Bureau)}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
        >
          {BUREAU_OPTIONS.map((item) => (
            <option key={item} value={item}>{item.toUpperCase()}</option>
          ))}
        </select>

        <label className="block text-xs uppercase tracking-widest text-slate-400">AnnualCreditReport PDF</label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        />

        <p className="text-xs text-slate-500">
          Privacy guardrail: raw PDFs remain in secure storage and are not sent directly to AI models.
        </p>

        <button
          disabled={busy || !file}
          onClick={() => void handleUploadAndSanitize()}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
        >
          {busy ? 'Uploading and Sanitizing...' : 'Upload and Extract Facts'}
        </button>
      </section>

      {sanitizedFactsId ? (
        <section className="rounded-2xl border border-cyan-500/30 bg-slate-900 p-5 text-sm space-y-3">
          <p>
            Sanitized facts ID: <span className="font-mono text-cyan-300">{sanitizedFactsId}</span>
          </p>
          <a
            href={`/dispute-facts-review?sanitized_facts_id=${encodeURIComponent(sanitizedFactsId)}`}
            className="inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
          >
            Review Extracted Facts
          </a>
        </section>
      ) : null}
    </div>
  );
}
