import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { workflowAdvance, workflowTrigger } from '../services/workflowEngineApi';

type WorkflowInstanceRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  template_key: string;
  status: 'active' | 'completed' | 'paused';
  current_step: number;
  context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type WorkflowTemplateRow = {
  key: string;
  description: string | null;
  steps: unknown;
};

type WorkflowTaskRow = {
  tenant_id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed';
  due_date: string | null;
  workflow_step_number: number | null;
  workflow_step_key: string | null;
  updated_at: string | null;
};

type WorkflowEventRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type DisputePacketDoc = {
  id: string;
  bureau: string;
  status: string;
  final_doc_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

type FinalizedLetterDoc = {
  id: string;
  bureau: string;
  dispute_packet_id: string | null;
  final_pdf_path: string | null;
  created_at: string;
};

type WorkflowStep = {
  order: number;
  key: string;
  title: string;
  required_tier?: string;
  requires_ai_consent?: boolean;
};

function parseInstanceIdFromUrl(): string | null {
  const query = new URLSearchParams(window.location.search || '');
  const fromQuery = query.get('instance_id') || query.get('instance');
  if (fromQuery) {
    localStorage.setItem('nexus_workflow_instance_id', fromQuery);
    return fromQuery;
  }

  const hash = String(window.location.hash || '');
  const idx = hash.indexOf('?');
  if (idx >= 0) {
    const hashQuery = new URLSearchParams(hash.slice(idx + 1));
    const fromHash = hashQuery.get('instance_id') || hashQuery.get('instance');
    if (fromHash) {
      localStorage.setItem('nexus_workflow_instance_id', fromHash);
      return fromHash;
    }
  }

  const persisted = localStorage.getItem('nexus_workflow_instance_id');
  return persisted || null;
}

function parseSteps(input: unknown): WorkflowStep[] {
  if (!Array.isArray(input)) return [];
  const rows = input
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const key = String(row.key || `step_${idx + 1}`).trim();
      const title = String(row.title || key.replaceAll('_', ' ')).trim();
      const orderRaw = Number(row.order ?? idx + 1);
      const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : idx + 1;
      return {
        order,
        key,
        title,
        required_tier: String(row.required_tier || '').trim() || undefined,
        requires_ai_consent: Boolean(row.requires_ai_consent),
      } as WorkflowStep;
    })
    .filter((row): row is WorkflowStep => Boolean(row));

  return rows.sort((a, b) => a.order - b.order);
}

function parseStoragePath(path: string | null): { bucket: string; objectPath: string } | null {
  const raw = String(path || '').trim().replace(/^\/+/, '');
  if (!raw) return null;
  const slash = raw.indexOf('/');
  if (slash <= 0) return null;
  const bucket = raw.slice(0, slash);
  const objectPath = raw.slice(slash + 1);
  if (!bucket || !objectPath) return null;
  return { bucket, objectPath };
}

export default function WorkflowDetailPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [canManage, setCanManage] = useState(false);

  const [instance, setInstance] = useState<WorkflowInstanceRow | null>(null);
  const [template, setTemplate] = useState<WorkflowTemplateRow | null>(null);
  const [tasks, setTasks] = useState<WorkflowTaskRow[]>([]);
  const [events, setEvents] = useState<WorkflowEventRow[]>([]);
  const [disputeDocs, setDisputeDocs] = useState<DisputePacketDoc[]>([]);
  const [finalizedDocs, setFinalizedDocs] = useState<FinalizedLetterDoc[]>([]);

  const instanceId = useMemo(() => parseInstanceIdFromUrl(), []);
  const steps = useMemo(() => parseSteps(template?.steps), [template?.steps]);

  const totalSteps = Math.max(1, steps.length || 1);
  const currentStep = Math.min(Math.max(instance?.current_step || 1, 1), totalSteps);
  const progressPct = Math.round((currentStep / totalSteps) * 100);

  const currentPendingTask = useMemo(() => {
    if (!instance) return null;
    return tasks.find((task) => task.workflow_step_number === instance.current_step && task.status !== 'completed') || null;
  }, [tasks, instance]);

  async function loadWorkflow() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    if (!instanceId) {
      setError('Missing workflow instance id. Open /workflow-detail?instance_id=<uuid>.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const instanceRes = await supabase
        .from('workflow_instances')
        .select('id,tenant_id,user_id,template_key,status,current_step,context,created_at,updated_at')
        .eq('id', instanceId)
        .limit(1)
        .maybeSingle();

      if (instanceRes.error) {
        throw new Error(instanceRes.error.message || 'Unable to load workflow instance.');
      }

      if (!instanceRes.data) {
        throw new Error('Workflow instance not found.');
      }

      const nextInstance = instanceRes.data as WorkflowInstanceRow;
      setInstance(nextInstance);

      const [templateRes, taskRes, eventRes, manageRes, packetRes, finalizedRes] = await Promise.all([
        supabase
          .from('workflow_templates')
          .select('key,description,steps')
          .eq('key', nextInstance.template_key)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('client_tasks')
          .select('tenant_id,task_id,title,description,status,due_date,workflow_step_number,workflow_step_key,updated_at')
          .eq('workflow_instance_id', nextInstance.id)
          .order('workflow_step_number', { ascending: true })
          .order('due_date', { ascending: true }),
        supabase
          .from('workflow_events')
          .select('id,event_type,payload,created_at')
          .eq('instance_id', nextInstance.id)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase.rpc('nexus_workflow_can_manage_tenant', { p_tenant_id: nextInstance.tenant_id }),
        supabase
          .from('dispute_packets')
          .select('id,bureau,status,final_doc_storage_path,created_at,updated_at')
          .eq('user_id', nextInstance.user_id)
          .order('updated_at', { ascending: false })
          .limit(20),
        supabase
          .from('finalized_letters')
          .select('id,bureau,dispute_packet_id,final_pdf_path,created_at')
          .eq('user_id', nextInstance.user_id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (templateRes.error) throw new Error(templateRes.error.message || 'Unable to load workflow template.');
      if (taskRes.error) throw new Error(taskRes.error.message || 'Unable to load workflow tasks.');
      if (eventRes.error) throw new Error(eventRes.error.message || 'Unable to load workflow events.');

      setTemplate((templateRes.data || null) as WorkflowTemplateRow | null);
      setTasks((taskRes.data || []) as WorkflowTaskRow[]);
      setEvents((eventRes.data || []) as WorkflowEventRow[]);
      setCanManage((!manageRes.error && Boolean(manageRes.data)) || user.role === 'admin');

      if (packetRes.error) {
        setDisputeDocs([]);
      } else {
        setDisputeDocs((packetRes.data || []) as DisputePacketDoc[]);
      }

      if (finalizedRes.error) {
        setFinalizedDocs([]);
      } else {
        setFinalizedDocs((finalizedRes.data || []) as FinalizedLetterDoc[]);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setInstance(null);
      setTemplate(null);
      setTasks([]);
      setEvents([]);
      setDisputeDocs([]);
      setFinalizedDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkflow();
  }, [user?.id, instanceId]);

  async function markCurrentStepCompleteAndAdvance() {
    if (!instance) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      if (currentPendingTask) {
        const taskUpdate = await supabase
          .from('client_tasks')
          .update({ status: 'completed' })
          .eq('tenant_id', currentPendingTask.tenant_id)
          .eq('task_id', currentPendingTask.task_id);

        if (taskUpdate.error) {
          throw new Error(taskUpdate.error.message || 'Unable to mark current task complete.');
        }
      }

      await workflowTrigger('task.completed', {
        instance_id: instance.id,
        task_id: currentPendingTask?.task_id || null,
      });

      setSuccess('Workflow advanced to the next valid step.');
      await loadWorkflow();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function completeTaskAndMaybeAdvance(task: WorkflowTaskRow) {
    if (!instance) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const taskUpdate = await supabase
        .from('client_tasks')
        .update({ status: 'completed' })
        .eq('tenant_id', task.tenant_id)
        .eq('task_id', task.task_id);

      if (taskUpdate.error) {
        throw new Error(taskUpdate.error.message || 'Unable to complete task.');
      }

      const shouldAdvance = instance.status === 'active' && task.workflow_step_number === instance.current_step;
      if (shouldAdvance) {
        await workflowTrigger('task.completed', {
          instance_id: instance.id,
          task_id: task.task_id,
        });
        setSuccess('Task completed and workflow advanced.');
      } else {
        setSuccess('Task completed.');
      }

      await loadWorkflow();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function advanceWithoutTaskToggle() {
    if (!instance) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await workflowAdvance(instance.id, false);
      setSuccess('Workflow advance executed.');
      await loadWorkflow();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function setPauseState(nextPaused: boolean) {
    if (!instance) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await workflowTrigger(nextPaused ? 'workflow.pause' : 'workflow.resume', {
        instance_id: instance.id,
      });
      setSuccess(nextPaused ? 'Workflow paused.' : 'Workflow resumed.');
      await loadWorkflow();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function openStoragePath(path: string | null) {
    const parsed = parseStoragePath(path);
    if (!parsed) {
      setError('Document path is not available for preview.');
      return;
    }

    setError('');

    const signed = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.objectPath, 60 * 10);
    if (signed.error || !signed.data?.signedUrl) {
      setError(signed.error?.message || 'Unable to create signed URL.');
      return;
    }

    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading workflow...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Workflow Detail</h1>
          <p className="text-sm text-slate-400 mt-1">Educational workflow progress and required actions. Results vary and are not guaranteed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadWorkflow()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-200"
            disabled={busy}
          >
            Refresh
          </button>
          <button
            onClick={() => void markCurrentStepCompleteAndAdvance()}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            disabled={busy || !instance || instance.status !== 'active'}
          >
            {busy ? 'Working...' : 'Complete Step + Advance'}
          </button>
          <button
            onClick={() => void advanceWithoutTaskToggle()}
            className="rounded-lg border border-cyan-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200 disabled:opacity-50"
            disabled={busy || !instance || instance.status !== 'active'}
          >
            Advance Only
          </button>
          {canManage && instance ? (
            <button
              onClick={() => void setPauseState(instance.status === 'active')}
              className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-200 disabled:opacity-50"
              disabled={busy || instance.status === 'completed'}
            >
              {instance.status === 'active' ? 'Pause' : 'Resume'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {instance ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Instance</div>
              <div className="font-mono text-xs text-cyan-300">{instance.id}</div>
            </div>
            <div className="text-xs uppercase tracking-wider font-black text-cyan-300">{instance.status}</div>
          </div>

          <div className="text-xs text-slate-400">Template: <span className="font-semibold text-slate-200">{instance.template_key}</span></div>
          <div className="text-xs text-slate-400">Step {currentStep} of {totalSteps}</div>

          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-cyan-400" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="text-xs text-slate-400">Next task: <span className="font-semibold text-slate-200">{currentPendingTask?.title || 'No pending task at current step'}</span></div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">Steps</h2>
          <div className="mt-3 space-y-2">
            {steps.length === 0 ? (
              <div className="text-sm text-slate-400">No template steps found.</div>
            ) : steps.map((step) => {
              const isDone = instance ? step.order < instance.current_step || instance.status === 'completed' : false;
              const isCurrent = instance ? step.order === instance.current_step && instance.status !== 'completed' : false;
              const badge = isDone ? 'completed' : isCurrent ? 'current' : 'upcoming';
              const tone = isDone
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                : isCurrent
                  ? 'border-cyan-500/40 bg-cyan-950/20 text-cyan-200'
                  : 'border-slate-700 bg-slate-800/40 text-slate-300';

              return (
                <div key={step.key} className={`rounded-lg border px-3 py-2 ${tone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider">{step.order}. {step.title}</p>
                      <p className="text-[11px] opacity-85 mt-1">Key: {step.key}</p>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest font-black">{badge}</div>
                  </div>
                  <div className="mt-1 text-[11px] opacity-80">
                    Tier: {(step.required_tier || 'free').toUpperCase()}
                    {step.requires_ai_consent ? ' · AI consent required' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">Recent Events</h2>
          <div className="mt-3 space-y-2 max-h-[26rem] overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="text-sm text-slate-400">No events logged yet.</div>
            ) : events.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <div className="text-xs font-black text-slate-200">{event.event_type}</div>
                <div className="mt-1 text-[11px] text-slate-500">{new Date(event.created_at).toLocaleString()}</div>
                <pre className="mt-2 text-[10px] text-slate-400 whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(event.payload || {}, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">Workflow Tasks</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-2 py-2">Step</th>
                <th className="text-left px-2 py-2">Task</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-left px-2 py-2">Due</th>
                <th className="text-left px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.task_id} className="border-t border-slate-800">
                  <td className="px-2 py-2 text-xs text-slate-300">{task.workflow_step_number || '-'}</td>
                  <td className="px-2 py-2">
                    <div className="text-xs font-semibold text-slate-200">{task.title}</div>
                    {task.description ? <div className="text-[11px] text-slate-500 mt-1">{task.description}</div> : null}
                  </td>
                  <td className="px-2 py-2 text-xs uppercase tracking-wider text-cyan-300">{task.status}</td>
                  <td className="px-2 py-2 text-xs text-slate-400">{task.due_date || '-'}</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => void completeTaskAndMaybeAdvance(task)}
                      disabled={busy || task.status === 'completed'}
                      className="rounded-md bg-slate-800 border border-slate-600 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-200 disabled:opacity-50"
                    >
                      Complete Task
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-cyan-300">Associated Documents</h2>
        <p className="text-xs text-slate-500 mt-1">Documents linked to this client workflow. PII handling remains server-side only.</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Dispute Packets</div>
            <div className="mt-2 space-y-2">
              {disputeDocs.length === 0 ? (
                <div className="text-xs text-slate-500">No dispute packets found.</div>
              ) : disputeDocs.map((doc) => (
                <div key={doc.id} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
                  <div className="text-xs text-slate-200 font-semibold">{doc.bureau.toUpperCase()} · {doc.status}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{new Date(doc.updated_at).toLocaleString()}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-slate-500">{doc.id}</span>
                    <button
                      className="rounded-md border border-cyan-500/40 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200 disabled:opacity-40"
                      onClick={() => void openStoragePath(doc.final_doc_storage_path)}
                      disabled={!doc.final_doc_storage_path}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Finalized Letters</div>
            <div className="mt-2 space-y-2">
              {finalizedDocs.length === 0 ? (
                <div className="text-xs text-slate-500">No finalized letters found.</div>
              ) : finalizedDocs.map((doc) => (
                <div key={doc.id} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
                  <div className="text-xs text-slate-200 font-semibold">{doc.bureau.toUpperCase()} · Finalized</div>
                  <div className="text-[11px] text-slate-500 mt-1">{new Date(doc.created_at).toLocaleString()}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-slate-500">{doc.id}</span>
                    <button
                      className="rounded-md border border-cyan-500/40 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200 disabled:opacity-40"
                      onClick={() => void openStoragePath(doc.final_pdf_path)}
                      disabled={!doc.final_pdf_path}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
