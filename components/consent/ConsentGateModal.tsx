import React, { useEffect, useMemo, useState } from 'react';
import RequiredDisclaimers from '../legal/RequiredDisclaimers';
import {
  ConsentSelections,
  ConsentStatusRow,
  ConsentVersionMap,
  statusToSelections,
} from '../../hooks/useConsentGate';
import { RequiredConsentType } from '../legal/legalDocuments';

type ConsentGateModalProps = {
  open: boolean;
  loading?: boolean;
  submitting?: boolean;
  status: ConsentStatusRow | null;
  error?: string | null;
  requiredTypes: RequiredConsentType[];
  requiredVersions: ConsentVersionMap;
  onAccept: (selected: ConsentSelections) => Promise<void>;
};

const linkClass = 'text-cyan-300 hover:text-cyan-200 underline underline-offset-2';

function versionTag(version: string | undefined): React.ReactNode {
  if (!version) return null;
  return (
    <span className="ml-2 rounded-md border border-cyan-300/20 bg-cyan-900/30 px-1.5 py-0.5 text-[10px] text-cyan-100">
      {version}
    </span>
  );
}

export default function ConsentGateModal({
  open,
  loading = false,
  submitting = false,
  status,
  error,
  requiredTypes,
  requiredVersions,
  onAccept,
}: ConsentGateModalProps) {
  const [selected, setSelected] = useState<ConsentSelections>(statusToSelections(status));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(statusToSelections(status));
  }, [status]);

  const allRequiredChecked = useMemo(
    () => requiredTypes.every((type) => selected[type]),
    [requiredTypes, selected]
  );

  const toggle = (type: keyof ConsentSelections) => {
    setSelected((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      await onAccept(selected);
    } catch (e: any) {
      setLocalError(String(e?.message || e));
    }
  };

  if (!open) return null;

  const requiredHint = requiredTypes.length > 0
    ? `Required: ${requiredTypes.join(', ')}`
    : 'Required policies must be accepted.';

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-cyan-300/20 bg-slate-900 shadow-2xl">
        <div className="px-6 py-5 border-b border-white/10">
          <h2 className="text-xl font-black tracking-tight text-white">Required Policy Consent</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            You must accept all required terms to access the Nexus workspace.
          </p>
          <p className="text-[11px] text-slate-500 mt-2">{requiredHint}</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.terms}
              onChange={() => toggle('terms')}
              disabled={loading || submitting}
            />
            <span>
              I accept the <a className={linkClass} href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>.
              {versionTag(requiredVersions.terms)}
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.privacy}
              onChange={() => toggle('privacy')}
              disabled={loading || submitting}
            />
            <span>
              I acknowledge the <a className={linkClass} href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
              {versionTag(requiredVersions.privacy)}
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.ai_disclosure}
              onChange={() => toggle('ai_disclosure')}
              disabled={loading || submitting}
            />
            <span>
              I understand the <a className={linkClass} href="/ai-disclosure" target="_blank" rel="noreferrer">AI Disclosure</a> and that AI output requires human review.
              {versionTag(requiredVersions.ai_disclosure)}
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.disclaimers}
              onChange={() => toggle('disclaimers')}
              disabled={loading || submitting}
            />
            <span>
              I agree to the <a className={linkClass} href="/disclaimers" target="_blank" rel="noreferrer">Educational Disclaimers</a>.
              {versionTag(requiredVersions.disclaimers)}
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.comms_email}
              onChange={() => toggle('comms_email')}
              disabled={loading || submitting}
            />
            <span>
              I consent to required account and service email communications.
              {versionTag(requiredVersions.comms_email)}
            </span>
          </label>

          <RequiredDisclaimers />

          {(error || localError) ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
              {error || localError}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!allRequiredChecked || loading || submitting}
              className="rounded-xl bg-cyan-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Accept and Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
