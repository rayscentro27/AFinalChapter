import React, { useEffect, useMemo, useState } from 'react';
import { DocuPostAddress } from '../../src/services/docupostMailService';

type DocuPostAuthorizationModalProps = {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  defaultAddress?: Partial<DocuPostAddress>;
  onClose: () => void;
  onAuthorize: (address: DocuPostAddress, acknowledgement: string) => Promise<void>;
};

export const DOCUPOST_AUTH_ACKNOWLEDGEMENT =
  'I acknowledge this dispute letter contains personal information and I authorize Nexus to transmit it to DocuPost solely for print-and-mail fulfillment.';

export default function DocuPostAuthorizationModal({
  open,
  loading = false,
  error,
  defaultAddress,
  onClose,
  onAuthorize,
}: DocuPostAuthorizationModalProps) {
  const [toName, setToName] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;

    setToName(String(defaultAddress?.to_name || ''));
    setAddress1(String(defaultAddress?.to_address_1 || ''));
    setAddress2(String(defaultAddress?.to_address_2 || ''));
    setCity(String(defaultAddress?.to_city || ''));
    setState(String(defaultAddress?.to_state || ''));
    setZip(String(defaultAddress?.to_zip || ''));
    setAcknowledged(false);
  }, [open, defaultAddress]);

  const canSubmit = useMemo(() => {
    return (
      acknowledged
      && toName.trim().length > 0
      && address1.trim().length > 0
      && city.trim().length > 0
      && state.trim().length > 0
      && zip.trim().length > 0
      && !loading
    );
  }, [acknowledged, toName, address1, city, state, zip, loading]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-100 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black tracking-tight">DocuPost Mailing Authorization</h3>
            <p className="text-sm text-slate-400 mt-1">
              Optional mailing action. This is not legal advice and does not guarantee credit bureau outcomes.
            </p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1 rounded-lg border border-slate-700 hover:border-slate-500">Close</button>
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-xs leading-relaxed text-cyan-100 space-y-2">
          <p>Educational-only platform disclosure: Nexus provides templates and workflow tools, not guaranteed outcomes.</p>
          <p>Third-party mailing disclosure: your finalized letter is sent to DocuPost only for print-and-mail processing.</p>
          <p>PII acknowledgement: this letter may contain personal data needed for proper delivery and bureau identification.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Recipient Name" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-cyan-400" />
          <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-cyan-400" />
          <input value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="Address Line 1" className="md:col-span-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-cyan-400" />
          <input value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Address Line 2 (optional)" className="md:col-span-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-cyan-400" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-cyan-400" />
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-cyan-400" />
        </div>

        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={acknowledged}
            onChange={() => setAcknowledged((v) => !v)}
          />
          <span>
            I confirm this mailing request is intentional and for approved dispute correspondence only.
          </span>
        </label>

        {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold">Cancel</button>
          <button
            onClick={() => void onAuthorize({
              to_name: toName.trim(),
              to_address_1: address1.trim(),
              to_address_2: address2.trim() || undefined,
              to_city: city.trim(),
              to_state: state.trim(),
              to_zip: zip.trim(),
            }, DOCUPOST_AUTH_ACKNOWLEDGEMENT)}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black uppercase tracking-wider disabled:opacity-50"
          >
            {loading ? 'Authorizing...' : 'Authorize & Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
