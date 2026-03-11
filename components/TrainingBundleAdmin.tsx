import React, { useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';

const starter = `{
  "schema_version": "1.0",
  "modules": [],
  "routing": {
    "cri_tiers": {},
    "tier_defaults": {},
    "global_safeguards": []
  }
}`;

const TrainingBundleAdmin: React.FC = () => {
  const [jsonText, setJsonText] = useState(starter);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const importBundle = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch('/.netlify/functions/import_training_bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_json: parsed }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Import failed (${res.status})`);
      }

      setResult(payload);
    } catch (e: any) {
      setError(e?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-5">
      <div className="bg-[#1F2833]/50 border border-white/10 rounded-3xl p-6 text-white">
        <h2 className="text-2xl font-black uppercase tracking-tight">Training Bundle Import</h2>
        <p className="text-slate-300 text-sm mt-1">
          Paste your bundle JSON, then import modules, tasks, and CRI routing in one call.
        </p>
      </div>

      <div className="bg-[#1F2833]/50 border border-white/10 rounded-3xl p-6">
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="w-full min-h-[360px] bg-[#0B0C10] text-slate-100 border border-white/10 rounded-2xl p-4 font-mono text-xs outline-none"
          spellCheck={false}
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={importBundle}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-wide text-xs disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <Upload size={14} /> {loading ? 'Importing...' : 'Import Bundle'}
            </span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-4 text-red-200 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4 text-emerald-100 text-sm">
          <div className="font-black uppercase tracking-wide text-xs flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} /> Import Complete
          </div>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
};

export default TrainingBundleAdmin;
