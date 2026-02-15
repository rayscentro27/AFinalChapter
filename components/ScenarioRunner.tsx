import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Rocket, FlaskConical, AlertTriangle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

type Pack = { id: string; title: string; created_at: string };

type RunResult = {
  ok: boolean;
  run_id: string;
  pack_title: string;
  scenarios_ran: number;
  passed: number;
  failed: number;
  results: Array<{ index: number; passed: boolean; score: number; reasons: string[] }>;
};

const ScenarioRunner: React.FC = () => {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState('');
  const [runTitle, setRunTitle] = useState('Regression Run');
  const [mode, setMode] = useState<'simulated' | 'live'>('simulated');
  const [maxScenarios, setMaxScenarios] = useState(30);

  const [status, setStatus] = useState('');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);

  const canUseDb = isSupabaseConfigured;

  const selectedPackTitle = useMemo(() => {
    return packs.find((p) => p.id === packId)?.title || '';
  }, [packs, packId]);

  const loadPacks = async () => {
    if (!canUseDb) return;

    setStatus('Loading scenario packs...');
    const { data, error } = await supabase
      .from('scenario_packs')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      setStatus(error.message);
      return;
    }

    setPacks((data as any) || []);
    setStatus('');
  };

  useEffect(() => {
    loadPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPack = async () => {
    if (!packId) return setStatus('Pick a scenario pack first.');

    setLoading(true);
    setStatus('Running scenarios...');
    setRunResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setStatus('You must be logged in to run scenarios (RLS + admin check).');
        return;
      }

      const res = await fetch('/.netlify/functions/run_scenario_pack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          pack_id: packId,
          run_title: runTitle || selectedPackTitle || 'Scenario Run',
          mode,
          max_scenarios: maxScenarios,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setStatus(`Run failed: ${data?.error || 'Unknown error'}`);
        return;
      }

      setRunResult(data as RunResult);
      setStatus(`Done. Run ID: ${data.run_id}`);
    } catch (e: any) {
      setStatus(`Run failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-24">
      <div className="bg-slate-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
          <FlaskConical size={320} />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#66FCF1]/10 text-[#66FCF1] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-10 border border-[#66FCF1]/20">
            Scenario Runner
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tighter uppercase leading-[0.9]">
            Regression Tests for <span className="text-[#66FCF1]">AI Employees</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed font-medium">
            Pick a scenario pack, run it through the single agent endpoint, score outcomes, and store results in Supabase.
          </p>
        </div>
      </div>

      {!canUseDb && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] p-8 text-amber-200 flex items-start gap-4">
          <AlertTriangle className="shrink-0" />
          <div>
            <div className="font-black uppercase tracking-widest text-[10px]">Supabase Not Configured</div>
            <div className="text-sm text-amber-100/90 mt-2">
              Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-white text-2xl font-black uppercase tracking-tight">Run a Pack</h2>
            <p className="text-slate-400 text-sm mt-2">
              This calls <span className="font-mono">/.netlify/functions/run_scenario_pack</span>. Only admin/supervisor can run.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadPacks}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={runPack}
              disabled={loading || !packId}
              className="px-6 py-3 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Rocket size={16} />}
              Run Pack
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Scenario Pack</label>
            <select
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
            >
              <option value="">Select pack...</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Run Title</label>
            <input
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={runTitle}
              onChange={(e) => setRunTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Mode</label>
            <select
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="simulated">simulated</option>
              <option value="live">live</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Max Scenarios</label>
            <input
              type="number"
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={maxScenarios}
              onChange={(e) => setMaxScenarios(Number(e.target.value))}
              min={1}
              max={200}
            />
          </div>
        </div>

        <div className="mt-6 text-sm text-slate-300 whitespace-pre-wrap">{status}</div>
      </div>

      {runResult && (
        <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl space-y-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <div className="text-white text-2xl font-black">{runResult.pack_title}</div>
              <div className="text-slate-500 text-xs mt-2 font-mono">Run ID: {runResult.run_id}</div>
            </div>

            <div className="flex gap-6 text-sm text-slate-300">
              <div>
                Ran: <span className="font-black text-white">{runResult.scenarios_ran}</span>
              </div>
              <div>
                Passed: <span className="font-black text-emerald-300">{runResult.passed}</span>
              </div>
              <div>
                Failed: <span className="font-black text-red-300">{runResult.failed}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {(runResult.results || []).map((r) => (
              <div key={r.index} className="p-6 rounded-[2rem] bg-white/5 border border-white/10">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-white font-black">Scenario #{r.index + 1}</div>
                  <div className={`font-black ${r.passed ? 'text-emerald-300' : 'text-red-300'}`}>
                    {r.passed ? 'PASS' : 'FAIL'} <span className="text-slate-400">|</span> {r.score}
                  </div>
                </div>
                <ul className="mt-3 text-xs text-slate-300 list-disc pl-4 space-y-1">
                  {(r.reasons || []).slice(0, 8).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioRunner;
