
import React, { useState, useEffect } from 'react';
import { 
  Globe, Search, RefreshCw, Sparkles, ShieldCheck, 
  ArrowRight, ListChecks, TrendingUp, AlertTriangle, ExternalLink,
  PlusCircle, Terminal, Zap, Shield, Users, Briefcase, Cpu, Bot,
  Layers, Ghost, Eye, Award, Maximize2, LayoutGrid
} from 'lucide-react';
import * as geminiService from '../services/geminiService';
import { supabase } from '../lib/supabaseClient';
import { ContentAudit, KnowledgeDoc, AiEmployee, Contact } from '../types';

interface NeuralFloorProps {
    contacts: Contact[];
    onUpdateContacts: (contacts: Contact[]) => void;
}


type AgentMetricRow = {
  agent_id: string;
  name: string;
  division: string;
  role: string;
  cases_total: number;
  avg_accuracy: number | null;
  avg_compliance: number | null;
  avg_clarity: number | null;
  avg_routing: number | null;
  avg_overall: number | null;
};

type ApprovalQueueRow = {
  score_id: string;
  case_id: string;
  agent_name: string | null;
  scenario_title: string | null;
  ai_accuracy: number;
  ai_compliance: number;
  ai_clarity: number;
  ai_routing: number;
  created_at: string;
};

type ApprovalDetail = {
  score_id: string;
  case_id: string;

  agent_name: string | null;
  scenario_title: string | null;

  user_message: string | null;
  expected_behavior: string | null;
  must_include: string[] | null;
  must_not_say: string[] | null;
  ideal_response: string | null;

  agent_output: string;

  ai_accuracy: number;
  ai_compliance: number;
  ai_clarity: number;
  ai_routing: number;
  ai_notes: string;

  created_at: string;
};



const NeuralFloor: React.FC<NeuralFloorProps> = ({ contacts, onUpdateContacts }) => {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audit, setAudit] = useState<ContentAudit | null>(null);
  const [isDelegating, setIsDelegating] = useState(false);
  const [viewMode, setViewMode] = useState<'floor' | 'dossier'>('floor');
  const [agentMetrics, setAgentMetrics] = useState<Record<string, AgentMetricRow>>({});
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalDetail, setApprovalDetail] = useState<ApprovalDetail | null>(null);

  const [humanAccuracy, setHumanAccuracy] = useState<number>(0);
  const [humanCompliance, setHumanCompliance] = useState<number>(0);
  const [humanClarity, setHumanClarity] = useState<number>(0);
  const [humanRouting, setHumanRouting] = useState<number>(0);
  const [humanNotes, setHumanNotes] = useState<string>('');
  const [approveSaving, setApproveSaving] = useState(false);

  
  const [agentLogs, setAgentLogs] = useState<Record<string, string[]>>({
      'Analyst': ["Nexus Analyst: Standing by for research directives."],
      'Scout': ["Sentinel Scout: Scanning market signals (Geo-Intent)."],
      'Underwriter': ["Forensic Bot: Binary integrity checks: OK."],
      'Closer': ["Ghost Hunter: Monitoring stale pipelines."]
  });

  const [employees, setEmployees] = useState<AiEmployee[]>([
      { id: 'e1', name: 'Nexus Analyst', role: 'Analyst', status: 'Idle' },
      { id: 'e2', name: 'Sentinel Scout', role: 'Scout', status: 'Idle' },
      { id: 'e3', name: 'Forensic Bot', role: 'Underwriter', status: 'Idle' },
      { id: 'e4', name: 'Ghost Hunter', role: 'Closer', status: 'Idle' }
  ]);

  const addLog = (role: string, message: string) => {
      setAgentLogs(prev => ({
          ...prev,
          [role]: [message, ...prev[role]].slice(0, 15)
      }));
  };



  const loadTrainingTelemetry = async () => {
    setMetricsLoading(true);
    try {
      const { data: metricsData, error: metricsErr } = await supabase
        .from('v_agent_metrics')
        .select('*');

      if (metricsErr) throw metricsErr;

      const map: Record<string, AgentMetricRow> = {};
      (metricsData || []).forEach((row: any) => {
        map[row.name] = row as AgentMetricRow;
      });
      setAgentMetrics(map);

      const { data: queueData, error: queueErr } = await supabase
        .from('eval_scores')
        .select(`
          id,
          ai_accuracy,
          ai_compliance,
          ai_clarity,
          ai_routing,
          created_at,
          eval_cases:case_id (
            id,
            agents:agent_id ( name ),
            scenarios:scenario_id ( title )
          )
        `)
        .eq('approved', false)
        .order('created_at', { ascending: false })
        .limit(25);

      if (queueErr) throw queueErr;

      const normalized: ApprovalQueueRow[] = (queueData || []).map((r: any) => ({
        score_id: r.id,
        case_id: r.eval_cases?.id ?? '',
        agent_name: r.eval_cases?.agents?.name ?? null,
        scenario_title: r.eval_cases?.scenarios?.title ?? null,
        ai_accuracy: r.ai_accuracy,
        ai_compliance: r.ai_compliance,
        ai_clarity: r.ai_clarity,
        ai_routing: r.ai_routing,
        created_at: r.created_at,
      }));

      setApprovalQueue(normalized);
    } catch (e: any) {
      console.error('Training telemetry load failed:', e?.message || e);
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'dossier') loadTrainingTelemetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);



  const clampScore = (n: number) => Math.max(0, Math.min(5, n));

  const openApprovalModal = async (scoreId: string) => {
    setIsApprovalOpen(true);
    setApprovalLoading(true);
    setApprovalDetail(null);

    try {
      const { data, error } = await supabase
        .from('eval_scores')
        .select(`
          id,
          ai_accuracy,
          ai_compliance,
          ai_clarity,
          ai_routing,
          ai_notes,
          created_at,
          eval_cases:case_id (
            id,
            agent_output,
            agents:agent_id ( name ),
            scenarios:scenario_id (
              title,
              user_message,
              expected_behavior,
              must_include,
              must_not_say,
              ideal_response
            )
          )
        `)
        .eq('id', scoreId)
        .single();

      if (error) throw error;

      const detail: ApprovalDetail = {
        score_id: data.id,
        case_id: data.eval_cases?.id ?? '',

        agent_name: data.eval_cases?.agents?.name ?? null,
        scenario_title: data.eval_cases?.scenarios?.title ?? null,

        user_message: data.eval_cases?.scenarios?.user_message ?? null,
        expected_behavior: data.eval_cases?.scenarios?.expected_behavior ?? null,
        must_include: data.eval_cases?.scenarios?.must_include ?? null,
        must_not_say: data.eval_cases?.scenarios?.must_not_say ?? null,
        ideal_response: data.eval_cases?.scenarios?.ideal_response ?? null,

        agent_output: data.eval_cases?.agent_output ?? '',

        ai_accuracy: data.ai_accuracy,
        ai_compliance: data.ai_compliance,
        ai_clarity: data.ai_clarity,
        ai_routing: data.ai_routing,
        ai_notes: data.ai_notes ?? '',

        created_at: data.created_at,
      };

      setApprovalDetail(detail);

      // Prefill human scores from AI suggestion.
      setHumanAccuracy(detail.ai_accuracy);
      setHumanCompliance(detail.ai_compliance);
      setHumanClarity(detail.ai_clarity);
      setHumanRouting(detail.ai_routing);
      setHumanNotes('');
    } catch (e: any) {
      console.error('Failed to load approval detail:', e?.message || e);
    } finally {
      setApprovalLoading(false);
    }
  };

  const closeApprovalModal = () => {
    setIsApprovalOpen(false);
    setApprovalDetail(null);
  };

  const approveEvaluation = async () => {
    if (!approvalDetail) return;

    setApproveSaving(true);
    try {
      const payload = {
        human_accuracy: clampScore(Number(humanAccuracy)),
        human_compliance: clampScore(Number(humanCompliance)),
        human_clarity: clampScore(Number(humanClarity)),
        human_routing: clampScore(Number(humanRouting)),
        human_notes: humanNotes || '',
        approved: true,
        approved_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('eval_scores')
        .update(payload)
        .eq('id', approvalDetail.score_id);

      if (error) throw error;

      await loadTrainingTelemetry();
      closeApprovalModal();
    } catch (e: any) {
      console.error('Approve failed:', e?.message || e);
      alert('Approve failed. Check console for details.');
    } finally {
      setApproveSaving(false);
    }
  };

  const saveFeedbackOnly = async () => {
    if (!approvalDetail) return;

    setApproveSaving(true);
    try {
      const payload = {
        human_accuracy: clampScore(Number(humanAccuracy)),
        human_compliance: clampScore(Number(humanCompliance)),
        human_clarity: clampScore(Number(humanClarity)),
        human_routing: clampScore(Number(humanRouting)),
        human_notes: humanNotes || '',
        approved: false,
        approved_at: null,
      };

      const { error } = await supabase
        .from('eval_scores')
        .update(payload)
        .eq('id', approvalDetail.score_id);

      if (error) throw error;

      await loadTrainingTelemetry();
      closeApprovalModal();
    } catch (e: any) {
      console.error('Save feedback failed:', e?.message || e);
      alert('Save feedback failed. Check console for details.');
    } finally {
      setApproveSaving(false);
    }
  };

  const handleAudit = async () => {
    if (!url.trim()) return;
    
    setIsAnalyzing(true);
    setAudit(null);
    addLog('Analyst', "Connecting to Research Grounding Nodes...");
    
    setEmployees(prev => prev.map(e => e.role === 'Analyst' ? { ...e, status: 'Researching', currentTask: 'Scrutinizing Source Content' } : e));

    const logCycle = [
        { role: 'Analyst', msg: "Querying live web for claim verification..." },
        { role: 'Scout', msg: "Cross-referencing current market trends..." },
        { role: 'Analyst', msg: "Synthesizing strategic reliability index..." },
        { role: 'Underwriter', msg: "Auditing document forensic score impact..." },
        { role: 'Closer', msg: "Detecting pipeline re-engagement opportunities..." }
    ];
    
    let logIdx = 0;
    const logInterval = setInterval(() => {
        const item = logCycle[logIdx % logCycle.length];
        addLog(item.role, item.msg);
        logIdx++;
    }, 1500);

    try {
        const result = await geminiService.auditContentValue(url);
        setAudit(result);
    } catch (e) {
        addLog('Analyst', "CRITICAL: Neural Staffing Link Severed");
    } finally {
        clearInterval(logInterval);
        setIsAnalyzing(false);
        setEmployees(prev => prev.map(e => ({ ...e, status: 'Idle', currentTask: undefined })));
    }
  };

  const handleGhostHunt = async () => {
      setEmployees(prev => prev.map(e => e.role === 'Closer' ? { ...e, status: 'Auditing', currentTask: 'Hunting Stale Pipeline' } : e));
      addLog('Closer', "Initiating Global Pipeline Scan...");
      
      const stale = contacts.filter(c => c.status === 'Lead');
      if (stale.length > 0) {
          const target = stale[Math.floor(Math.random() * stale.length)];
          addLog('Closer', `TARGET DETECTED: ${target.company}. Searching news...`);
          const email = await geminiService.ghostHunterReengage(target);
          if (email) {
              addLog('Closer', `RE-ENGAGEMENT DRAFTED for ${target.company}. Protocol waiting in Inbox.`);
          }
      }
      
      setTimeout(() => {
        setEmployees(prev => prev.map(e => ({ ...e, status: 'Idle', currentTask: undefined })));
      }, 3000);
  };

  const executeDelegation = async () => {
    if (!audit) return;
    setIsDelegating(true);
    setEmployees(prev => prev.map(e => e.role === 'Analyst' ? { ...e, status: 'Delegating', currentTask: 'Re-structuring CRM Pipeline' } : e));
    
    addLog('Analyst', "Triggering Global CRM Delegation Protocol...");

    try {
        const { updatedContacts, actions } = await geminiService.executeAutonomousDelegation(audit, contacts);
        onUpdateContacts(updatedContacts);
        actions.forEach(a => addLog('Analyst', a));
        
        const existingKB = JSON.parse(localStorage.getItem('nexus_knowledge_vault') || '[]');
        const newDoc: KnowledgeDoc = {
            id: `del_${Date.now()}`,
            title: `AI Directive: ${audit.title}`,
            content: `AUTONOMOUS STRATEGY:\n${audit.strategicValue}\n\nLOGIC: ${audit.suggestedAction?.logic}`,
            category: 'AI Directive',
            uploadedAt: new Date().toLocaleDateString(),
            isActive: true
        };
        localStorage.setItem('nexus_knowledge_vault', JSON.stringify([newDoc, ...existingKB]));
        
        alert("Management Complete: AI has re-structured the pipeline and delegated tasks.");
    } finally {
        setIsDelegating(false);
        setEmployees(prev => prev.map(e => ({ ...e, status: 'Idle', currentTask: undefined })));
    }
  };

  const ConsoleBox = ({ role, icon: Icon, colorClass, logs }: any) => (
      <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col h-full shadow-2xl relative group holographic-edge transition-all hover:scale-[1.01]">
          <div className={`p-5 border-b border-white/5 flex items-center justify-between ${colorClass.replace('text-', 'bg-')}/10`}>
              <div className="flex items-center gap-3">
                  <Icon size={18} className={`${colorClass} group-hover:animate-pulse`} />
                  <span className="text-[10px] font-black uppercase text-white tracking-[0.2em]">{role}</span>
              </div>
              <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
                  <Maximize2 size={14} className="text-slate-600 hover:text-white cursor-pointer transition-colors" />
              </div>
          </div>
          <div className="flex-1 p-6 overflow-y-auto font-mono text-[10px] space-y-2.5 bg-black/40 custom-scrollbar">
              <div className="animate-laser-scan opacity-30"></div>
              {logs.map((l: string, i: number) => (
                  <div key={i} className={`animate-fade-in flex gap-4 ${i === 0 ? `${colorClass} font-bold` : 'text-slate-500'}`}>
                      <span className="opacity-20 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                      <span className="leading-relaxed">{'>> '}{l}</span>
                  </div>
              ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-spatial pb-20">


      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">Neural Floor</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">War room operations and training telemetry.</p>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-1">
          <button
            onClick={() => setViewMode('floor')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'floor' ? 'bg-[#66FCF1] text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}
          >
            War Room
          </button>
          <button
            onClick={() => setViewMode('dossier')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'dossier' ? 'bg-[#66FCF1] text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}
          >
            Staff Dossier
          </button>
        </div>
      </div>
      

      {viewMode === 'dossier' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-slate-950 border border-white/10 rounded-[3.5rem] p-10 shadow-2xl flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{emp.role}</div>
                  <div className="text-2xl font-black text-white uppercase tracking-tight mt-2">{emp.name}</div>
                  <div className="text-xs text-slate-500 font-medium mt-2">Status: {emp.status}</div>
                </div>
                <div className="w-14 h-14 rounded-[1.6rem] bg-white/5 border border-white/10 flex items-center justify-center text-[#66FCF1]">
                  <ShieldCheck size={22} />
                </div>
              </div>

              {(() => {
                const metric = agentMetrics[emp.name];
                const avgOverall = metric?.avg_overall ?? null;
                const avgCompliance = metric?.avg_compliance ?? null;

                return (
                  <div className="mt-10 grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Overall</p>
                      <p className="text-lg font-black text-white font-mono">{avgOverall === null ? '—' : Number(avgOverall).toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500 mt-1">0–5 score</p>
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Compliance</p>
                      <p className="text-lg font-black text-[#66FCF1] font-mono">{avgCompliance === null ? '—' : Number(avgCompliance).toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500 mt-1">0–5 score</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}

          <div className="md:col-span-2 lg:col-span-3">
            <div className="bg-slate-950 border border-white/10 rounded-[3.5rem] p-10 shadow-2xl">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Approvals Queue</h3>
                  <p className="text-xs text-slate-500 mt-2 font-medium">AI suggested scores waiting for human approval (Hybrid scoring).</p>
                </div>

                <button
                  onClick={loadTrainingTelemetry}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <RefreshCw size={16} className={metricsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              <div className="mt-8 space-y-3">
                {approvalQueue.length === 0 ? (
                  <div className="text-slate-500 text-sm">No pending approvals.</div>
                ) : (
                  approvalQueue.map((q) => (
                    <div
                      key={q.score_id}
                      className="bg-white/5 border border-white/10 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    >
                      <div>
                        <div className="text-white font-black uppercase tracking-tight">{q.agent_name || 'Unknown Agent'}</div>
                        <div className="text-slate-400 text-sm mt-1">Scenario: {q.scenario_title || 'Untitled'}</div>
                        <div className="text-slate-600 text-xs mt-2">{new Date(q.created_at).toLocaleString()}</div>
                      </div>

                      <div className="flex gap-3 flex-wrap">
                        <div className="px-4 py-2 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">
                          Acc: <span className="text-white font-mono">{q.ai_accuracy}</span>
                        </div>
                        <div className="px-4 py-2 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">
                          Comp: <span className="text-white font-mono">{q.ai_compliance}</span>
                        </div>
                        <div className="px-4 py-2 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">
                          Clar: <span className="text-white font-mono">{q.ai_clarity}</span>
                        </div>
                        <div className="px-4 py-2 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">
                          Route: <span className="text-white font-mono">{q.ai_routing}</span>
                        </div>

                        <button
                          onClick={() => openApprovalModal(q.score_id)}
                          className="px-6 py-2 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'floor' && (
        <>

      <div className="bg-slate-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border border-white/10 border-animated">
        <div className="absolute top-0 right-0 p-10 opacity-5 rotate-12 group-hover:scale-110 transition-transform"><Globe size={380} /></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-16">
            <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.4em] mb-12 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                    <Zap size={14} className="fill-emerald-400 animate-pulse" /> Neural War Room: ONLINE
                </div>
                <h1 className="text-7xl font-black mb-8 tracking-tighter uppercase leading-[0.8] text-white">
                    Neural <br/> <span className="text-emerald-500">Floor.</span>
                </h1>
                <p className="text-slate-400 text-xl leading-relaxed mb-12 font-medium max-w-xl italic">
                    "Command your autonomous staffing nodes. Distribute research missions or trigger global pipeline audits through the neural link."
                </p>
                <div className="flex bg-white/5 backdrop-blur-3xl p-2 rounded-[2.2rem] border border-white/10 shadow-2xl animate-ai-glow">
                    <input 
                        type="text" 
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="Paste research directive URL (YouTube, News, LinkedIn)..."
                        className="flex-1 bg-transparent border-none text-white px-8 py-5 focus:ring-0 outline-none font-medium placeholder:text-slate-700"
                        onKeyDown={e => e.key === 'Enter' && handleAudit()}
                    />
                    <button 
                        onClick={handleAudit}
                        disabled={isAnalyzing || !url}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-12 py-5 rounded-[1.8rem] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-2xl disabled:opacity-50 flex items-center gap-3 transform active:scale-95"
                    >
                        {isAnalyzing ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20} fill="currentColor" />}
                        {isAnalyzing ? 'Mapping...' : 'Assign Mission'}
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6 shrink-0">
                <button onClick={handleGhostHunt} className="p-10 bg-white/5 border border-white/10 rounded-[3rem] flex flex-col items-center gap-6 hover:bg-white/10 transition-all group holographic-edge">
                    <div className="w-20 h-20 rounded-[2rem] bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:rotate-6 transition-transform shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                        <Ghost size={38} />
                    </div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Ghost Hunt</span>
                </button>
                <button onClick={() => alert("Verification artifact queue synchronized.")} className="p-10 bg-white/5 border border-white/10 rounded-[3rem] flex flex-col items-center gap-6 hover:bg-white/10 transition-all group holographic-edge">
                    <div className="w-20 h-20 rounded-[2rem] bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:-rotate-6 transition-transform shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                        <Award size={38} />
                    </div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Verify Logic</span>
                </button>
            </div>
        </div>
      </div>

      {/* WAR ROOM CONSOLE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[750px]">
          <ConsoleBox role="Analyst" icon={Cpu} colorClass="text-blue-400" logs={agentLogs['Analyst']} />
          <ConsoleBox role="Scout" icon={Globe} colorClass="text-emerald-400" logs={agentLogs['Scout']} />
          <ConsoleBox role="Underwriter" icon={ShieldCheck} colorClass="text-amber-400" logs={agentLogs['Underwriter']} />
          <ConsoleBox role="Closer" icon={Ghost} colorClass="text-indigo-400" logs={agentLogs['Closer']} />
      </div>

      {audit && (
          <div className="animate-spatial bg-white border border-slate-200 p-12 rounded-[3.5rem] shadow-[0_20px_80px_rgba(0,0,0,0.15)] relative overflow-hidden">
             <div className="animate-laser-scan opacity-20"></div>
             <div className="flex flex-col md:flex-row justify-between items-center gap-12 relative z-10">
                <div className="flex items-center gap-8">
                    <div className={`w-28 h-28 rounded-[2.8rem] flex items-center justify-center text-6xl font-black shadow-2xl border-4 transform rotate-3 ${audit.trustScore > 75 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {audit.trustScore}%
                    </div>
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-tight">{audit.title}</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3">Grounding Check: COMPLETE • {audit.platform} Ingestion Verified</p>
                    </div>
                </div>
                <button 
                    onClick={executeDelegation}
                    disabled={isDelegating}
                    className="bg-slate-950 text-white px-16 py-6 rounded-[2.2rem] font-black uppercase text-xs tracking-[0.3em] shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:bg-blue-600 transition-all flex items-center gap-4 active:scale-95 disabled:opacity-50 transform hover:-translate-y-1"
                >
                    {isDelegating ? <RefreshCw className="animate-spin" size={24}/> : <Zap size={24} fill="currentColor" />}
                    Deploy to Global CRM
                </button>
             </div>
          </div>
      )}
        </>
      )}


      {isApprovalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeApprovalModal} />

          <div className="relative w-full max-w-5xl rounded-[2.5rem] border border-white/10 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-white/10 flex items-start justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Approval Review</h3>
                <p className="text-xs text-slate-500 mt-2 font-medium">AI suggested scores to edit and approve (Hybrid scoring)</p>
              </div>

              <button
                onClick={closeApprovalModal}
                className="px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-black uppercase tracking-widest"
              >
                Close
              </button>
            </div>

            <div className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {approvalLoading && <div className="text-slate-400 text-sm">Loading case details...</div>}

              {!approvalLoading && approvalDetail && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-white font-black uppercase tracking-tight">{approvalDetail.agent_name || 'Unknown Agent'}</div>
                      <div className="text-slate-400 text-sm mt-1">Scenario: {approvalDetail.scenario_title || 'Untitled'}</div>
                      <div className="text-slate-600 text-xs mt-2">{new Date(approvalDetail.created_at).toLocaleString()}</div>
                    </div>

                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">User Message</div>
                      <div className="text-slate-200 text-sm whitespace-pre-wrap">{approvalDetail.user_message || '—'}</div>
                    </div>

                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Expected Behavior</div>
                      <div className="text-slate-200 text-sm whitespace-pre-wrap">{approvalDetail.expected_behavior || '—'}</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Must Include</div>
                        <ul className="space-y-1">
                          {(approvalDetail.must_include || []).length == 0 ? (
                            <li className="text-slate-500 text-sm">—</li>
                          ) : (
                            (approvalDetail.must_include || []).map((x, idx) => (
                              <li key={idx} className="text-slate-200 text-sm"><span className="text-slate-500">* </span>{x}</li>
                            ))
                          )}
                        </ul>
                      </div>

                      <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Must Not Say</div>
                        <ul className="space-y-1">
                          {(approvalDetail.must_not_say || []).length == 0 ? (
                            <li className="text-slate-500 text-sm">—</li>
                          ) : (
                            (approvalDetail.must_not_say || []).map((x, idx) => (
                              <li key={idx} className="text-slate-200 text-sm"><span className="text-slate-500">* </span>{x}</li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Ideal Response (Gold)</div>
                      <div className="text-slate-200 text-sm whitespace-pre-wrap">{approvalDetail.ideal_response || '—'}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Agent Output</div>
                      <div className="text-slate-200 text-sm whitespace-pre-wrap font-mono">{approvalDetail.agent_output || '—'}</div>
                    </div>

                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">AI Notes</div>
                      <div className="text-slate-200 text-sm whitespace-pre-wrap">{approvalDetail.ai_notes || '—'}</div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">AI Acc: <span className="text-white font-mono">{approvalDetail.ai_accuracy}</span></div>
                        <div className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">AI Comp: <span className="text-white font-mono">{approvalDetail.ai_compliance}</span></div>
                        <div className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">AI Clar: <span className="text-white font-mono">{approvalDetail.ai_clarity}</span></div>
                        <div className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-xs text-slate-300">AI Route: <span className="text-white font-mono">{approvalDetail.ai_routing}</span></div>
                      </div>
                    </div>

                    <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Human Scores (0-5)</div>

                      <div className="grid grid-cols-2 gap-4">
                        <label className="text-xs text-slate-400">
                          Accuracy
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={humanAccuracy}
                            onChange={(e) => setHumanAccuracy(clampScore(Number(e.target.value)))}
                            className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                          />
                        </label>

                        <label className="text-xs text-slate-400">
                          Compliance
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={humanCompliance}
                            onChange={(e) => setHumanCompliance(clampScore(Number(e.target.value)))}
                            className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                          />
                        </label>

                        <label className="text-xs text-slate-400">
                          Clarity
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={humanClarity}
                            onChange={(e) => setHumanClarity(clampScore(Number(e.target.value)))}
                            className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                          />
                        </label>

                        <label className="text-xs text-slate-400">
                          Routing
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={humanRouting}
                            onChange={(e) => setHumanRouting(clampScore(Number(e.target.value)))}
                            className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                          />
                        </label>
                      </div>

                      <label className="block text-xs text-slate-400 mt-4">
                        Human Notes
                        <textarea
                          value={humanNotes}
                          onChange={(e) => setHumanNotes(e.target.value)}
                          rows={4}
                          className="mt-2 w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-white"
                          placeholder="Add notes for prompt adjustments..."
                        />
                      </label>

                      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
                        <button
                          onClick={saveFeedbackOnly}
                          disabled={approveSaving}
                          className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          Save Feedback
                        </button>

                        <button
                          onClick={approveEvaluation}
                          disabled={approveSaving}
                          className="px-6 py-3 rounded-2xl bg-[#66FCF1] text-slate-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {approveSaving ? 'Approving...' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!approvalLoading && !approvalDetail && (
                <div className="text-slate-400 text-sm">No case loaded. Close and try again.</div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default NeuralFloor;
