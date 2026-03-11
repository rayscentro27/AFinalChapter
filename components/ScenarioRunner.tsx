import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Rocket,
  FlaskConical,
  AlertTriangle,
  History,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

type Pack = { id: string; title: string; created_at: string };

type RunRow = {
  id: string;
  pack_id: string;
  agent_name: string;
  run_title: string;
  mode: 'simulated' | 'live';
  created_at: string;
};

type RunItemRow = {
  id: string;
  run_id: string;
  scenario_index: number;
  scenario: any;
  model_output: any;
  passed: boolean;
  score: number;
  reasons: string[];
  created_at: string;
};

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
  const [concurrency, setConcurrency] = useState(3);
  const [perCallTimeoutMs, setPerCallTimeoutMs] = useState(15000);

  const [status, setStatus] = useState('');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);

  // History
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runItems, setRunItems] = useState<RunItemRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const canUseDb = isSupabaseConfigured;

  const selectedPackTitle = useMemo(() => {
    return packs.find((p) => p.id === packId)?.title || '';
  }, [packs, packId]);

  const loadPacks = async () => {
    if (!canUseDb) return;

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
  };

  const loadRuns = async (pack_id: string) => {
    if (!canUseDb || !pack_id) {
      setRuns([]);
      setSelectedRunId('');
      setRunItems([]);
      return;
    }

    const { data: runRows, error } = await supabase
      .from('scenario_runs')
      .select('id, pack_id, agent_name, run_title, mode, created_at')
      .eq('pack_id', pack_id)
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      setStatus(error.message);
      return;
    }

    const list = ((runRows as any) || []) as RunRow[];
    setRuns(list);

    // Auto-select most recent run
    const newest = list[0]?.id || '';
    setSelectedRunId(newest);
  };

  const loadRunItems = async (run_id: string) => {
    if (!canUseDb || !run_id) {
      setRunItems([]);
      return;
    }

    const { data: itemRows, error } = await supabase
      .from('scenario_run_items')
      .select('id, run_id, scenario_index, scenario, model_output, passed, score, reasons, created_at')
      .eq('run_id', run_id)
      .order('scenario_index', { ascending: true })
      .limit(250);

    if (error) {
      setStatus(error.message);
      return;
    }

    setRunItems(((itemRows as any) || []) as RunItemRow[]);
  };

  useEffect(() => {
    loadPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!packId) return;
    loadRuns(packId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  useEffect(() => {
    if (!selectedRunId) return;
    loadRunItems(selectedRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId]);

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
          concurrency,
          per_call_timeout_ms: perCallTimeoutMs,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setStatus(`Run failed: ${data?.error || 'Unknown error'}`);
        return;
      }

      setRunResult(data as RunResult);
      setStatus(`Done. Run ID: ${data.run_id}`);

      // Refresh history
      await loadRuns(packId);
      if (data.run_id) {
        setSelectedRunId(String(data.run_id));
        await loadRunItems(String(data.run_id));
      }
    } catch (e: any) {
      setStatus(`Run failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const historySummary = useMemo(() => {
    const total = runItems.length;
    const passed = runItems.filter((x) => x.passed).length;
    const failed = total - passed;
    return { total, passed, failed };
  }, [runItems]);

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
            Run scenario packs through the single agent endpoint, score outcomes, store results, and review failures.
          </p>
        </div>
      </div>

      {!canUseDb && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] p-8 text-amber-200 flex items-start gap-4">
          <AlertTriangle className="shrink-0" />
          <div>
            <div className="font-black uppercase tracking-widest text-[10px]">Supabase Not Configured</div>
            <div className="text-sm text-amber-100/90 mt-2">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.</div>
          </div>
        </div>
      )}

      <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-white text-2xl font-black uppercase tracking-tight">Run a Pack</h2>
            <p className="text-slate-400 text-sm mt-2">
              Calls <span className="font-mono">/.netlify/functions/run_scenario_pack</span>. Only admin/supervisor can run.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setStatus('Refreshing...');
                await loadPacks();
                if (packId) await loadRuns(packId);
                if (selectedRunId) await loadRunItems(selectedRunId);
                setStatus('');
              }}
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

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Concurrency</label>
            <input
              type="number"
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              min={1}
              max={10}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Per-Call Timeout (ms)</label>
            <input
              type="number"
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={perCallTimeoutMs}
              onChange={(e) => setPerCallTimeoutMs(Number(e.target.value))}
              min={1000}
              max={60000}
            />
          </div>
        </div>

        <div className="mt-6 text-sm text-slate-300 whitespace-pre-wrap">{status}</div>
      </div>

      {/* Latest run result (from function response) */}
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
                  {(r.reasons || []).slice(0, 6).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white">
              <History size={18} />
            </div>
            <div>
              <h2 className="text-white text-2xl font-black uppercase tracking-tight">Run History</h2>
              <p className="text-slate-400 text-sm mt-2">Select a past run and inspect each scenario output.</p>
            </div>
          </div>

          <div className="text-sm text-slate-300 flex gap-6">
            <div>
              Total: <span className="font-black text-white">{historySummary.total}</span>
            </div>
            <div>
              Passed: <span className="font-black text-emerald-300">{historySummary.passed}</span>
            </div>
            <div>
              Failed: <span className="font-black text-red-300">{historySummary.failed}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Runs (most recent)</label>
            <select
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              disabled={!packId}
            >
              <option value="">Select run...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString()} | {r.mode} | {r.run_title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3">
            <button
              onClick={async () => {
                if (packId) await loadRuns(packId);
                if (selectedRunId) await loadRunItems(selectedRunId);
              }}
              className="px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
              disabled={!packId}
            >
              <RefreshCw size={14} /> Refresh History
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {selectedRunId && runItems.length === 0 ? (
            <div className="text-slate-500 text-sm">No items loaded for this run (or you need to run the SQL + login).</div>
          ) : null}

          {runItems.map((it) => {
            const key = it.id;
            const isOpen = !!expanded[key];
            const scenarioTitle = String(it?.scenario?.title || `Scenario #${it.scenario_index + 1}`);
            const agentAnswer = String(it?.model_output?.final_answer || it?.model_output?.error || '');
            const userMessage = String(it?.scenario?.user_message || '');

            return (
              <div key={it.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden">
                <button
                  onClick={() => setExpanded((m) => ({ ...m, [key]: !m[key] }))}
                  className="w-full px-6 py-5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-white font-black truncate">
                      #{it.scenario_index + 1} {scenarioTitle}
                    </div>
                    <div className="text-slate-500 text-xs mt-1 truncate">{new Date(it.created_at).toLocaleString()}</div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className={`text-[10px] font-black uppercase tracking-widest ${it.passed ? 'text-emerald-300' : 'text-red-300'}`}>
                      {it.passed ? 'PASS' : 'FAIL'}
                    </div>
                    <div className="text-white font-black font-mono">{it.score}</div>
                    {isOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-black/30 border border-white/10 rounded-2xl p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">User Message</div>
                        <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{userMessage || '—'}</div>
                      </div>
                      <div className="bg-black/30 border border-white/10 rounded-2xl p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Agent Output</div>
                        <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap font-mono">{agentAnswer || '—'}</div>
                      </div>
                    </div>

                    <div className="bg-black/30 border border-white/10 rounded-2xl p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reasons</div>
                      <ul className="mt-2 text-xs text-slate-300 list-disc pl-4 space-y-1">
                        {(it.reasons || []).slice(0, 20).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ScenarioRunner;
