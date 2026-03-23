import React, { useState } from 'react';

type Props = {
  open: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { source_type: string; url: string; label: string; priority: number }) => Promise<boolean>;
};

export default function AddSourceModal({ open, submitting, onClose, onSubmit }: Props) {
  const [sourceType, setSourceType] = useState('website');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [priority, setPriority] = useState(50);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit() {
    if (!url.trim() || !label.trim()) {
      setError('Source URL and label are required.');
      return;
    }
    setError('');
    const ok = await onSubmit({ source_type: sourceType, url: url.trim(), label: label.trim(), priority });
    if (ok) {
      setUrl('');
      setLabel('');
      setPriority(50);
      setSourceType('website');
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Add Source</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Register a research source</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">Type</div>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900">
              <option value="website">Website</option>
              <option value="youtube_channel">YouTube Channel</option>
              <option value="rss">RSS Feed</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">Priority</div>
            <input type="number" min={0} max={100} value={priority} onChange={(event) => setPriority(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" />
          </label>
        </div>
        <label className="mt-4 block text-sm text-slate-600">
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">Label</div>
          <input value={label} onChange={(event) => setLabel(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" />
        </label>
        <label className="mt-4 block text-sm text-slate-600">
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">URL</div>
          <input value={url} onChange={(event) => setUrl(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" />
        </label>
        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700">Cancel</button>
          <button type="button" disabled={submitting} onClick={handleSubmit} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white disabled:opacity-50">{submitting ? 'Saving...' : 'Add Source'}</button>
        </div>
      </div>
    </div>
  );
}